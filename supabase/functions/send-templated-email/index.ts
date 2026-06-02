// supabase/functions/send-templated-email/index.ts
//
// Sprint K.1 C — Email-Send-Wrapper mit Opt-Out + Frequency-Cap
//
// Single Entry-Point für alle template-basierten Email-Versendungen. Delegiert:
//   1. Opt-Out-Check (user_email_preferences, Kategorie-aware)
//   2. Frequency-Cap-Check (max 5 emails/Tag/Recipient — sonst skip/queue)
//   3. render-email (MJML → HTML + Variables + Branding + Unsubscribe-Footer)
//   4. send-email (Postmark)
//   5. email_send_log INSERT mit Status
//
// Auth: service_role only.
//
// INPUT (POST body):
//   {
//     template_key: string         // required
//     locale?:      'de' | 'en'    // default 'de', fallback wenn user_email_preferences.locale gesetzt
//     user_id?:     string         // für Opt-Out-Check + Unsubscribe-Token
//     recipient_email: string      // required
//     account_id?:  string         // für tenant-branding
//     variables?:   Record<string, any>
//     tag?:         string         // optionales Postmark-Tag (Default = template_key)
//     metadata?:    Record<string, any>  // optionales JSON für audit-log
//     force?:       boolean        // bypass Frequency-Cap (für transactional/auth/billing — Default false)
//   }
//
// OUTPUT:
//   200 { success: true, status: 'sent' | 'opted_out' | 'rate_limited' | 'no_template', log_id?, postmark_message_id? }
//   400 { error }
//   500 { error, detail }

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

const FREQUENCY_CAP_PER_DAY = 5  // max 5 transactional+lifecycle+marketing-Mails pro recipient/Tag

// Kategorien die NIE opt-out-bar sind (legal required)
const NON_OPT_OUTABLE_CATEGORIES = ['transactional', 'billing', 'auth']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: {
    template_key?: string
    locale?: 'de' | 'en'
    user_id?: string
    recipient_email?: string
    account_id?: string
    variables?: Record<string, any>
    tag?: string
    metadata?: Record<string, any>
    force?: boolean
  } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const templateKey = (body.template_key || '').trim()
  const recipientEmail = (body.recipient_email || '').trim().toLowerCase()

  if (!templateKey) return json({ error: 'invalid_input', detail: 'template_key required' }, 400)
  if (!recipientEmail) return json({ error: 'invalid_input', detail: 'recipient_email required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Template-Category-Lookup für Opt-Out-Decision (lokal, damit wir vor Render schon skippen können)
  //    Wir lookuppen wahlweise locale='de' oder die requested locale — kategorie ist (sollte!) konsistent.
  const requestedLocale: 'de' | 'en' = body.locale === 'en' ? 'en' : 'de'

  const { data: tplMeta } = await supabase
    .from('email_templates')
    .select('id, category, status, locale')
    .eq('template_key', templateKey)
    .in('locale', ['de', 'en'])  // egal welche, nur Category-Info gewünscht
    .eq('status', 'published')
    .limit(1)
    .maybeSingle()

  if (!tplMeta) {
    return json({ success: true, status: 'no_template', template_key: templateKey }, 200)
  }

  const category = tplMeta.category as string

  // 2. User-Email-Preferences-Lookup + Opt-Out-Check + Locale-Override
  let preferLocale = requestedLocale
  let optedOut = false

  if (body.user_id) {
    const { data: pref } = await supabase
      .from('user_email_preferences')
      .select('opted_out_lifecycle, opted_out_marketing, locale')
      .eq('user_id', body.user_id)
      .maybeSingle()

    if (pref) {
      if (pref.locale === 'en' || pref.locale === 'de') {
        // User-Pref überschreibt request-locale wenn keine explicit locale im body
        if (!body.locale) preferLocale = pref.locale as 'de' | 'en'
      }
      if (category === 'lifecycle' && pref.opted_out_lifecycle) optedOut = true
      if (category === 'marketing' && pref.opted_out_marketing) optedOut = true
      // transactional/billing/auth sind nie opt-out-bar (auch wenn opted_out_* gesetzt sein sollten)
      if (NON_OPT_OUTABLE_CATEGORIES.includes(category)) optedOut = false
    }
  }

  if (optedOut) {
    // Audit-Log-Eintrag mit status='opted_out' (kein Send)
    await supabase.from('email_send_log').insert({
      recipient: recipientEmail,
      sender: 'noreply@leadesk.de',
      subject: '(skipped — opted out)',
      template_key: templateKey,
      template_locale: preferLocale,
      template_variables: body.variables || {},
      status: 'opted_out',
      tag: body.tag || templateKey,
      metadata: body.metadata || {},
    })
    return json({ success: true, status: 'opted_out', template_key: templateKey })
  }

  // 3. Frequency-Cap-Check (sofern nicht force=true und nicht NON_OPT_OUTABLE_CATEGORIES)
  //    Transactional/Billing/Auth bypassen den Cap (Receipts, Password-Reset etc. müssen durch)
  const bypassCap = body.force === true || NON_OPT_OUTABLE_CATEGORIES.includes(category)

  if (!bypassCap) {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('email_send_log')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', recipientEmail)
      .eq('status', 'sent')
      .gte('created_at', today.toISOString())

    if ((count || 0) >= FREQUENCY_CAP_PER_DAY) {
      // Audit-Log mit status='rate_limited'
      await supabase.from('email_send_log').insert({
        recipient: recipientEmail,
        sender: 'noreply@leadesk.de',
        subject: '(skipped — daily cap reached)',
        template_key: templateKey,
        template_locale: preferLocale,
        template_variables: body.variables || {},
        status: 'rate_limited',
        failed_reason: `daily_cap_${FREQUENCY_CAP_PER_DAY}_reached`,
        tag: body.tag || templateKey,
        metadata: body.metadata || {},
      })
      return json({
        success: true,
        status: 'rate_limited',
        template_key: templateKey,
        cap: FREQUENCY_CAP_PER_DAY,
      })
    }
  }

  // 4. Pre-INSERT email_send_log row mit status='pending' (damit log_id im render/send-Fail-Pfad referenzierbar)
  const { data: logRow, error: logErr } = await supabase
    .from('email_send_log')
    .insert({
      recipient: recipientEmail,
      sender: 'noreply@leadesk.de',
      subject: '(pending)',
      template_key: templateKey,
      template_locale: preferLocale,
      template_variables: body.variables || {},
      status: 'pending',
      tag: body.tag || templateKey,
      metadata: body.metadata || {},
    })
    .select('id')
    .single()

  if (logErr) {
    console.error('[send-templated-email] pre-log insert failed:', logErr.message)
    return json({ error: 'log_insert_failed', detail: logErr.message }, 500)
  }
  const logId = logRow?.id

  // 5. render-email-EF aufrufen
  let renderResult: any = null
  try {
    const { data, error: renderErr } = await supabase.functions.invoke('render-email', {
      body: {
        template_key: templateKey,
        locale: preferLocale,
        account_id: body.account_id || null,
        user_id: body.user_id || null,
        variables: body.variables || {},
      },
    })
    if (renderErr) throw new Error(renderErr.message || 'render_invoke_error')
    if (data?.error) throw new Error(data.error)
    renderResult = data
  } catch (e) {
    await supabase.from('email_send_log').update({
      status: 'failed',
      failed_reason: 'render_failed: ' + (e as Error).message,
      subject: '(render failed)',
    }).eq('id', logId)
    return json({ error: 'render_failed', detail: (e as Error).message, log_id: logId }, 500)
  }

  // 6. send-email-EF aufrufen (Postmark-Send)
  let sendResult: any = null
  try {
    const { data, error: sendErr } = await supabase.functions.invoke('send-email', {
      body: {
        to: recipientEmail,
        subject: renderResult.subject,
        html_body: renderResult.html_body,
        tag: body.tag || templateKey,
        metadata: {
          ...(body.metadata || {}),
          template_key: templateKey,
          template_locale: renderResult.template_locale,
          category: renderResult.category,
        },
        log_id: logId,
      },
    })
    if (sendErr) throw new Error(sendErr.message || 'send_invoke_error')
    sendResult = data
  } catch (e) {
    await supabase.from('email_send_log').update({
      status: 'failed',
      failed_reason: 'postmark_failed: ' + (e as Error).message,
      subject: renderResult.subject || '(unknown)',
    }).eq('id', logId)
    return json({ error: 'send_failed', detail: (e as Error).message, log_id: logId }, 500)
  }

  // send-email-EF aktualisiert email_send_log selbst per RPC (siehe send-email.index.ts) — wir
  // updaten hier nur den subject + status falls send-email das nicht macht. Defensiv:
  await supabase.from('email_send_log').update({
    subject: renderResult.subject || '(unknown)',
  }).eq('id', logId)

  return json({
    success: true,
    status: 'sent',
    template_key: templateKey,
    template_locale: renderResult.template_locale,
    log_id: logId,
    postmark_message_id: sendResult?.message_id || null,
  })
})
