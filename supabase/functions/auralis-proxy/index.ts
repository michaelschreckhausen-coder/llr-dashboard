// supabase/functions/auralis-proxy/index.ts
//
// Server-seitiger Proxy für die Auralis Public-API v1 (KI-Sichtbarkeit).
// Marketplace-Add-on 'auralis' im Branding-Bereich.
//
// WARUM ein Proxy:
//   - Der zentrale Auralis-ENTERPRISE-Key (aur_sk_…) darf NIE ins Frontend.
//     Er lebt ausschließlich als EF-Secret AURALIS_API_KEY.
//   - Multi-Tenant-Mapping: pro Leadesk-Team ein Auralis-SUB-ACCOUNT. Alle
//     Daten-Calls laufen über den zentralen Key + ?sub_account_id=<mapping>,
//     sodass jeder Kunde nur SEINE eigene KI-Sichtbarkeit sieht.
//   - Addon-Gate: nur Teams mit aktiver 'auralis'-Subscription (oder Leadesk-
//     Admins zum Testen) dürfen die API nutzen.
//
// RESPONSE-CONTRACT: immer HTTP 200 mit Envelope { ok:true, data } ODER
// { ok:false, error, code } für App-Ebene (addon_inactive, not_provisioned,
// no_report, Validierung, Auralis-Upstream-Fehler). Nur Infrastruktur-Fehler
// (fehlende Auth, unerwartete Exceptions) geben Non-200 zurück.
//
// Mapping-Persistenz: public.integrations, provider='auralis', team-scoped.
//   settings = { sub_account_id, topic_id, full_name, topic_query, language,
//                auralis_email, provisioned_at }
//   (api_key bleibt NULL — der zentrale Key ist server-seitig.)
//
// Auralis-Lebenszyklus (siehe Doku):
//   POST /sub-accounts → POST /topics?sub_account_id=… → POST /analyze/{topicId}?…
//   → GET /scores/latest?sub_account_id=…
//
// Body: { action, team_id?, ...params }
// Actions: status | provision | scores_latest | scores_history | analyze_self |
//          competitors_list | competitor_create | competitor_delete |
//          competitor_analyze | competitor_gaps
//
// ENV (docker-compose functions-Block, kein env_file):
//   AURALIS_API_KEY            zentraler Enterprise-Key (aur_sk_…)
//   AURALIS_API_BASE           optional, default https://auralis-plum.vercel.app/api/v1
//   AURALIS_SUBACCOUNT_EMAIL_DOMAIN  optional, default 'leadesk.de'
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Defensive Konvention (Top-Fallstrick #12): error-Field von supabase-js IMMER
// auslesen + mit [CTX]-Prefix loggen.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const API_BASE = (Deno.env.get('AURALIS_API_BASE') || 'https://auralis-plum.vercel.app/api/v1').replace(/\/+$/, '')
const EMAIL_DOMAIN = Deno.env.get('AURALIS_SUBACCOUNT_EMAIL_DOMAIN') || 'leadesk.de'
const ADDON_SLUG = 'auralis'

function envelope(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
const ok = (data: unknown) => envelope({ ok: true, data })
const fail = (error: string, code = 'ERROR', httpStatus = 200) =>
  envelope({ ok: false, error, code }, httpStatus)

// ── Auralis-API-Call-Helper ────────────────────────────────────────────────
// Hängt ?sub_account_id an. Gibt { ok, status, data } zurück.
// apiKey = zentraler Enterprise-Key (aus DB via get_addon_secret, .env-Fallback).
async function auralisFetch(
  path: string,
  opts: { method?: string; body?: unknown; subAccountId?: string | null; apiKey?: string } = {},
) {
  const key = opts.apiKey || ''
  if (!key) return { ok: false, status: 500, data: { error: 'Auralis-Key nicht konfiguriert (Admin → Marketplace).', code: 'NO_KEY' } }

  const url = new URL(`${API_BASE}${path}`)
  if (opts.subAccountId) url.searchParams.set('sub_account_id', opts.subAccountId)

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  let bodyStr: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    bodyStr = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: bodyStr })
  } catch (e) {
    console.error('[auralis-proxy] upstream fetch failed:', (e as Error).message)
    return { ok: false, status: 502, data: { error: 'Auralis nicht erreichbar', code: 'UPSTREAM_UNREACHABLE' } }
  }

  let data: any = null
  try { data = await res.json() } catch { /* leerer Body möglich */ }
  return { ok: res.ok, status: res.status, data }
}

// Auralis-Result → Envelope nach unten reichen.
function relay(r: { ok: boolean; status: number; data: any }) {
  if (r.ok) return ok(r.data)
  return fail(r.data?.error || 'Auralis-Fehler', r.data?.code || 'UPSTREAM')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return fail('method not allowed', 'METHOD', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail('missing auth', 'NO_AUTH', 401)
  const jwt = authHeader.replace(/^Bearer\s+/, '')

  let body: any = {}
  try { body = await req.json() } catch { return fail('invalid json', 'BAD_JSON', 400) }
  const action: string = (body.action || '').trim()
  if (!action) return fail('action required', 'INVALID_INPUT', 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1) JWT → User
  const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userRes?.user) {
    console.warn('[auralis-proxy] auth failed:', userErr?.message)
    return fail('unauthorized', 'UNAUTHORIZED', 401)
  }
  const userId = userRes.user.id
  const isLeadeskAdmin = Boolean((userRes.user.app_metadata as any)?.is_leadesk_admin)

  // 2) Team-Kontext auflösen (body.team_id verifizieren, sonst erstes Team)
  let teamQuery = supabase
    .from('team_members')
    .select('team_id, teams(account_id)')
    .eq('user_id', userId)
  if (body.team_id) teamQuery = teamQuery.eq('team_id', body.team_id)
  const { data: teamRow, error: teamErr } = await teamQuery.limit(1).maybeSingle()
  if (teamErr) {
    console.error('[auralis-proxy] team lookup error:', teamErr.message)
    return fail('team lookup failed', 'INTERNAL', 500)
  }
  const teamId: string | null = teamRow?.team_id || null
  const accountId: string | null = (teamRow as any)?.teams?.account_id || null
  if (!teamId || !accountId) return fail('Kein Team-/Account-Kontext gefunden.', 'NO_ACCOUNT_CONTEXT')

  // 3) Addon-Gate (Leadesk-Admins dürfen zum Testen bypassen)
  if (!isLeadeskAdmin) {
    const { data: addonRows, error: addonErr } = await supabase
      .from('account_addons')
      .select('status, addons!inner(slug)')
      .eq('account_id', accountId)
      .eq('status', 'active')
      .eq('addons.slug', ADDON_SLUG)
      .limit(1)
    if (addonErr) {
      console.error('[auralis-proxy] addon gate query error:', addonErr.message)
      return fail('addon gate failed', 'INTERNAL', 500)
    }
    if (!addonRows || addonRows.length === 0) {
      return fail('Das KI-Sichtbarkeits-Add-on ist für dieses Konto nicht aktiv.', 'ADDON_INACTIVE')
    }
  }

  // 4) Mapping (integrations provider='auralis', team-scoped) laden
  const { data: integ, error: integErr } = await supabase
    .from('integrations')
    .select('id, settings, is_active')
    .eq('team_id', teamId)
    .eq('provider', 'auralis')
    .maybeSingle()
  if (integErr) {
    console.error('[auralis-proxy] integrations lookup error:', integErr.message)
    return fail('mapping lookup failed', 'INTERNAL', 500)
  }
  const mapping = (integ?.settings as any) || null
  const subAccountId: string | null = mapping?.sub_account_id || null
  const topicId: string | null = mapping?.topic_id || null

  // 5) Zentralen Auralis-Key auflösen: DB (admin-verwaltet) → .env-Fallback.
  const { data: secretData, error: secretErr } = await supabase.rpc('get_addon_secret', { p_slug: ADDON_SLUG })
  if (secretErr) console.warn('[auralis-proxy] get_addon_secret error:', secretErr.message)
  const centralKey: string = (secretData as string) || Deno.env.get('AURALIS_API_KEY') || ''

  // Bequemer Wrapper, der den Key in jeden Auralis-Call durchschleift.
  const af = (path: string, opts: { method?: string; body?: unknown; subAccountId?: string | null } = {}) =>
    auralisFetch(path, { ...opts, apiKey: centralKey })

  try {
    // ── status: Mapping + Addon-Status ─────────────────────────────────────
    if (action === 'status') {
      return ok({
        provisioned: Boolean(subAccountId && topicId),
        sub_account_id: subAccountId,
        full_name: mapping?.full_name || null,
        topic_query: mapping?.topic_query || null,
        language: mapping?.language || 'de',
        provisioned_at: mapping?.provisioned_at || null,
        addon_active: true, // Gate oben bestanden (oder Admin-Bypass)
      })
    }

    // ── provision: Sub-Account + Topic anlegen ─────────────────────────────
    if (action === 'provision') {
      const fullName = (body.full_name || '').trim()
      const topicQuery = (body.topic_query || '').trim()
      const language = (body.language || 'de').trim()
      if (!fullName) return fail('Bitte einen Namen angeben.', 'INVALID_INPUT')
      if (!topicQuery) return fail('Bitte ein Thema angeben.', 'INVALID_INPUT')

      const email = `auralis+team-${teamId}@${EMAIL_DOMAIN}`

      // 4a) Sub-Account anlegen (oder bestehenden wiederverwenden)
      let subId = subAccountId
      if (!subId) {
        const sub = await af('/sub-accounts', {
          method: 'POST',
          body: { full_name: fullName, email, language },
        })
        if (sub.ok) {
          subId = sub.data?.sub_account?.id || null
        } else if (sub.data?.code === 'EMAIL_EXISTS') {
          // Mapping verloren, Sub-Account existiert noch → per Liste finden
          const list = await af('/sub-accounts', { method: 'GET' })
          if (list.ok) {
            const found = (list.data?.sub_accounts || []).find((s: any) => s.email === email)
            subId = found?.id || null
          }
          if (!subId) return relay(sub)
        } else {
          return relay(sub)
        }
      }
      if (!subId) return fail('Sub-Account konnte nicht angelegt werden.', 'INTERNAL', 502)

      // 4b) Topic anlegen (oder bestehendes wiederverwenden)
      let tId = topicId
      if (!tId) {
        const topic = await af('/topics', {
          method: 'POST',
          body: { query: topicQuery, name: topicQuery, frequency: 'weekly', language },
          subAccountId: subId,
        })
        if (topic.ok) tId = topic.data?.topic?.id || null
        else return relay(topic)
      }
      if (!tId) return fail('Thema konnte nicht angelegt werden.', 'INTERNAL', 502)

      // 4c) Mapping persistieren (upsert auf integrations)
      const newSettings = {
        sub_account_id: subId,
        topic_id: tId,
        full_name: fullName,
        topic_query: topicQuery,
        language,
        auralis_email: email,
        provisioned_at: new Date().toISOString(),
      }
      const payload = {
        user_id: userId,
        team_id: teamId,
        provider: 'auralis',
        api_key: null,
        is_active: true,
        settings: newSettings,
        updated_at: new Date().toISOString(),
      }
      const upsert = integ
        ? await supabase.from('integrations').update(payload).eq('id', integ.id)
        : await supabase.from('integrations').insert(payload)
      if (upsert.error) {
        console.error('[auralis-proxy] mapping persist error:', upsert.error.message)
        return fail('mapping persist failed', 'INTERNAL', 500)
      }

      return ok({ provisioned: true, ...newSettings })
    }

    // ── Ab hier: Provisioning Pflicht ──────────────────────────────────────
    if (!subAccountId) return fail('Noch nicht eingerichtet.', 'NOT_PROVISIONED')

    switch (action) {
      case 'scores_latest':
        return relay(await af('/scores/latest', { subAccountId }))

      case 'scores_history': {
        const days = Math.max(1, Math.min(365, Number(body.days) || 30))
        return relay(await af(`/scores/history?days=${days}`, { subAccountId }))
      }

      case 'analyze_self': {
        if (!topicId) return fail('Kein Thema hinterlegt.', 'NOT_PROVISIONED')
        return relay(await af(`/analyze/${topicId}`, { method: 'POST', subAccountId }))
      }

      case 'competitors_list':
        return relay(await af('/competitors', { subAccountId }))

      case 'competitor_create': {
        const name = (body.name || '').trim()
        if (!name) return fail('Bitte einen Namen angeben.', 'INVALID_INPUT')
        const topics = body.topics ?? []
        const language = (body.language || mapping?.language || 'de').trim()
        return relay(await af('/competitors', {
          method: 'POST',
          body: { name, topics, language },
          subAccountId,
        }))
      }

      case 'competitor_delete': {
        const id = (body.competitor_id || '').trim()
        if (!id) return fail('competitor_id fehlt.', 'INVALID_INPUT')
        return relay(await af(`/competitors/${id}`, { method: 'DELETE', subAccountId }))
      }

      case 'competitor_analyze': {
        const id = (body.competitor_id || '').trim()
        if (!id) return fail('competitor_id fehlt.', 'INVALID_INPUT')
        return relay(await af(`/competitors/${id}/analyze`, { method: 'POST', subAccountId }))
      }

      case 'competitor_gaps': {
        const id = (body.competitor_id || '').trim()
        if (!id) return fail('competitor_id fehlt.', 'INVALID_INPUT')
        return relay(await af(`/competitors/${id}/gaps`, { subAccountId }))
      }

      default:
        return fail(`unknown action: ${action}`, 'INVALID_INPUT', 400)
    }
  } catch (e) {
    console.error('[auralis-proxy] handler error:', (e as Error).message)
    return fail('internal error', 'INTERNAL', 500)
  }
})
