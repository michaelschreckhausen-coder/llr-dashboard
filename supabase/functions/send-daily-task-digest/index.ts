// supabase/functions/send-daily-task-digest/index.ts
//
// Daily Task Digest — Tägliche 07:00-Berlin-Mail an alle User mit aktuellen Aufgaben.
//
// Trigger: pg_cron Job `0 5 * * *` UTC (= 07:00 Berlin Sommerzeit).
// Auth: service_role only.
//
// Templating: render-email macht nur Mustache-Light ({{key}}-Substitution,
// keine Loops/Conditionals). Daher werden Sektionen + Items server-side als
// MJML-Strings gebaut und als {{overdue_section}}/{{today_section}} ins
// Master-Template substituiert.
//
// Flow:
//   1. Loop über alle User aus auth.users mit email_confirmed_at + NOT banned
//   2. Pro User: get_user_daily_task_digest()-RPC
//   3. Wenn total_count == 0 → skip
//   4. Opt-Out-Check: opted_out_daily_digest === true → skip (ausser force)
//   5. Limitiere overdue/today auf je 10 Items + "und N weitere"-Hint
//   6. Render Sektionen als MJML-Strings server-side
//   7. send-templated-email mit template_key='daily_task_digest', variables
//   8. Aggregate-Result-Stats zurück
//
// INPUT (POST body):
//   {
//     dry_run?: boolean       // wenn true: kein send, nur logging
//     user_ids?: string[]     // wenn gesetzt: nur diese User (für Tests)
//     force?: boolean         // bypass Opt-Out-Check (für Notfall-Sends)
//   }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const MAX_ITEMS_PER_SECTION = 10

interface DigestTask {
  task_id: string
  title: string
  source: string
  source_label: string
  lead_name: string | null
  lead_company: string | null
  due_date: string
  due_label: string
}

interface DigestResult {
  user_id: string
  tz: string
  date: string
  date_label: string
  overdue_count: number
  today_count: number
  total_count: number
  total_count_singular: boolean
  overdue: DigestTask[]
  today: DigestTask[]
}

// HTML-Escape für Strings die ins MJML eingebettet werden
function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Item-Rendering für eine einzelne Task
function renderTaskMjml(t: DigestTask, isOverdue: boolean): string {
  const accentColor = isOverdue ? '#DC2626' : '#6B7280'
  const meta: string[] = []
  meta.push(esc(t.source_label))
  if (isOverdue) meta.push(`überfällig seit ${esc(t.due_label)}`)
  const leadLine = t.lead_name
    ? `<br /><span style="color:#6B7280;font-size:12px;">${esc(t.lead_name)}${t.lead_company ? ' · ' + esc(t.lead_company) : ''}</span>`
    : ''
  return `
    <mj-text padding="10px 0" border-bottom="1px solid #F3F4F6" font-size="14px">
      <strong>${esc(t.title)}</strong>
      ${leadLine}
      <br /><span style="color:${accentColor};font-size:11px;font-weight:600;">${meta.join(' · ')}</span>
    </mj-text>
  `
}

// Sektion-Rendering: Header + Items + optional "und N weitere"-Hint
function renderSectionMjml(opts: {
  label: string
  color: string
  count: number
  items: DigestTask[]
  isOverdue: boolean
  moreCount: number
}): string {
  if (opts.count === 0) return ''
  const itemsHtml = opts.items.map(t => renderTaskMjml(t, opts.isOverdue)).join('\n')
  const moreHint = opts.moreCount > 0
    ? `<mj-text padding="8px 0 4px 0" font-size="12px" color="#6B7280" font-style="italic">… und ${opts.moreCount} weitere${opts.moreCount === 1 ? '' : ''}</mj-text>`
    : ''
  return `
    <mj-section background-color="#FFFFFF" padding="16px 24px 8px">
      <mj-column>
        <mj-text font-size="12px" font-weight="700" color="${opts.color}" text-transform="uppercase" letter-spacing="0.06em" padding-bottom="8px">
          ${esc(opts.label)} · ${opts.count}
        </mj-text>
        ${itemsHtml}
        ${moreHint}
      </mj-column>
    </mj-section>
  `
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { dry_run?: boolean; user_ids?: string[]; force?: boolean } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const dryRun = !!body.dry_run
  const force = !!body.force
  const userFilter = Array.isArray(body.user_ids) ? body.user_ids : null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const appUrl = Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de'

  // ─── 1. Aktive User ────────────────────────────────────────────────────
  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
    page: 1, perPage: 1000,
  })
  if (usersErr) return json({ error: 'listUsers_failed', detail: usersErr.message }, 500)

  const allUsers = (usersData?.users || []).filter(u =>
    u.email
    && u.email_confirmed_at
    && !u.banned_until
    && (!userFilter || userFilter.includes(u.id))
  )

  // ─── 2. Prefs + Profiles vorab batchweise laden ────────────────────────
  const userIds = allUsers.map(u => u.id)

  const { data: prefs } = await supabase
    .from('user_email_preferences')
    .select('user_id, opted_out_daily_digest, opted_out_lifecycle, locale')
    .in('user_id', userIds)
  const prefsByUser = new Map<string, { opted_out_daily_digest: boolean; opted_out_lifecycle: boolean; locale: string }>()
  for (const p of (prefs || [])) prefsByUser.set(p.user_id, {
    opted_out_daily_digest: !!p.opted_out_daily_digest,
    opted_out_lifecycle: !!p.opted_out_lifecycle,
    locale: p.locale || 'de',
  })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, full_name')
    .in('id', userIds)
  const profileByUser = new Map<string, { first_name: string | null; full_name: string | null }>()
  for (const p of (profiles || [])) profileByUser.set(p.id, {
    first_name: p.first_name || null,
    full_name: p.full_name || null,
  })

  // ─── 3. Loop ───────────────────────────────────────────────────────────
  const stats = { processed: 0, sent: 0, skipped_empty: 0, skipped_optout: 0, dry_run_count: 0 }
  const errors: Array<{ user_id: string; error: string }> = []

  for (const user of allUsers) {
    stats.processed++

    const userPrefs = prefsByUser.get(user.id)
    if (!force && userPrefs?.opted_out_daily_digest) {
      stats.skipped_optout++
      continue
    }

    const { data: digestData, error: digestErr } = await supabase
      .rpc('get_user_daily_task_digest', { p_user_id: user.id, p_tz: 'Europe/Berlin' })
    if (digestErr) {
      errors.push({ user_id: user.id, error: 'rpc_failed: ' + digestErr.message })
      continue
    }
    const digest = digestData as DigestResult
    if (!digest || digest.total_count === 0) {
      stats.skipped_empty++
      continue
    }

    // Items limitieren
    const overdueLimited = digest.overdue.slice(0, MAX_ITEMS_PER_SECTION)
    const todayLimited   = digest.today.slice(0, MAX_ITEMS_PER_SECTION)
    const overdueMore = Math.max(0, digest.overdue_count - MAX_ITEMS_PER_SECTION)
    const todayMore   = Math.max(0, digest.today_count - MAX_ITEMS_PER_SECTION)

    // Sektionen server-side rendern (kein Handlebars im render-email)
    const overdueSection = renderSectionMjml({
      label: '⚠ Überfällig',
      color: '#DC2626',
      count: digest.overdue_count,
      items: overdueLimited,
      isOverdue: true,
      moreCount: overdueMore,
    })

    const todaySection = renderSectionMjml({
      label: '⚡ Heute fällig',
      color: '#D97706',
      count: digest.today_count,
      items: todayLimited,
      isOverdue: false,
      moreCount: todayMore,
    })

    // Profile-Name
    const profile = profileByUser.get(user.id)
    const firstName = profile?.first_name
      || (profile?.full_name?.split(' ')[0] || '')
      || ''
    const greeting = firstName
      ? `Guten Morgen, ${esc(firstName)}.`
      : 'Guten Morgen.'

    // Subtitle mit Singular/Plural
    const subtitle = digest.total_count === 1
      ? `Heute, ${esc(digest.date_label)} · 1 Aufgabe auf deinem Tisch`
      : `Heute, ${esc(digest.date_label)} · ${digest.total_count} Aufgaben auf deinem Tisch`

    const variables = {
      greeting,
      subtitle,
      overdue_section: overdueSection,
      today_section: todaySection,
      total_count: digest.total_count,
      overdue_count: digest.overdue_count,
      today_count: digest.today_count,
      app_url: appUrl,
    }

    if (dryRun) {
      stats.dry_run_count++
      console.log(`[daily-digest] DRY-RUN ${user.email}: ${digest.total_count} tasks`)
      continue
    }

    const { error: sendErr } = await supabase.functions.invoke('send-templated-email', {
      body: {
        template_key: 'daily_task_digest',
        locale: userPrefs?.locale || 'de',
        user_id: user.id,
        recipient_email: user.email,
        variables,
        tag: 'daily_task_digest',
        metadata: {
          source: 'daily-digest-cron',
          digest_date: digest.date,
          total_count: digest.total_count,
        },
      },
    })

    if (sendErr) {
      errors.push({ user_id: user.id, error: 'send_failed: ' + sendErr.message })
      continue
    }
    stats.sent++
  }

  return json({
    success: true,
    ...stats,
    error_count: errors.length,
    errors: errors.slice(0, 50),
  })
})
