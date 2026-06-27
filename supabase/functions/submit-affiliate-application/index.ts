// supabase/functions/submit-affiliate-application/index.ts
//
// Affiliate-System Phase 12 — Public Bewerbungs-Endpoint (KEIN Auth).
// POST { email, name, company_or_channel?, reach_channels[], audience_size,
//        motivation, code_wish, recaptcha_token }
//   1. reCAPTCHA-v3-Verify (RECAPTCHA_SECRET; skip wenn ENV unset = Dev)
//   2. Validierung + UNIQUE-Check (email pending / code_wish frei)
//   3. INSERT affiliate_applications (status='pending_email_verify')
//   4. Verify-Mail (template affiliate_application_email_verify)
//   5. { success: true }
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RECAPTCHA_SECRET (optional).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const ALLOWED = new Set(['https://leadesk.de', 'https://www.leadesk.de', 'http://localhost:5173'])
function cors(o: string) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.has(o) ? o : 'https://www.leadesk.de',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
  }
}
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', SVC, { auth: { persistSession: false, autoRefreshToken: false } })
const RECAPTCHA_SECRET = Deno.env.get('RECAPTCHA_SECRET') ?? ''
const AUDIENCE = new Set(['<1k', '1-10k', '10-100k', '100k+'])

async function verifyRecaptcha(token: string, ip: string | null): Promise<number | null> {
  if (!RECAPTCHA_SECRET) return null  // Dev: skip (kein Secret gesetzt)
  try {
    const body = new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token || '' })
    if (ip) body.set('remoteip', ip)
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body })
    const d = await r.json()
    return d.success ? (d.score ?? 0) : 0
  } catch { return 0 }
}

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const headers = { ...cors(origin), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers })

  try {
    const b = await req.json().catch(() => ({}))
    const email = (b.email || '').toString().trim().toLowerCase()
    const name = (b.name || '').toString().trim()
    const audience = (b.audience_size || '').toString()
    const motivation = (b.motivation || '').toString().trim()
    const code = (b.code_wish || '').toString().trim().toLowerCase()

    // Validierung
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers })
    if (!name) return new Response(JSON.stringify({ error: 'name_required' }), { status: 400, headers })
    if (!AUDIENCE.has(audience)) return new Response(JSON.stringify({ error: 'invalid_audience' }), { status: 400, headers })
    if (motivation.length < 200 || motivation.length > 1000) return new Response(JSON.stringify({ error: 'motivation_length' }), { status: 400, headers })
    if (!/^[a-z0-9][a-z0-9-]{3,29}$/.test(code)) return new Response(JSON.stringify({ error: 'invalid_code' }), { status: 400, headers })

    // reCAPTCHA
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
    const score = await verifyRecaptcha(b.recaptcha_token, ip)
    if (score !== null && score < 0.5) return new Response(JSON.stringify({ error: 'recaptcha_failed' }), { status: 400, headers })

    // UNIQUE: code frei (affiliates + offene applications), email nicht schon offen
    const [{ data: affCode }, { data: appCode }, { data: appEmail }] = await Promise.all([
      admin.from('affiliates').select('id').eq('code', code).maybeSingle(),
      admin.from('affiliate_applications').select('id').eq('code_wish', code).not('status', 'in', '(rejected)').maybeSingle(),
      admin.from('affiliate_applications').select('id').eq('email', email).in('status', ['pending_email_verify', 'pending', 'auto_approved', 'approved']).maybeSingle(),
    ])
    if (affCode || appCode) return new Response(JSON.stringify({ error: 'code_taken' }), { status: 409, headers })
    if (appEmail) return new Response(JSON.stringify({ error: 'email_already_applied' }), { status: 409, headers })

    const token = crypto.randomUUID()
    const { error: insErr } = await admin.from('affiliate_applications').insert({
      email, name, company_or_channel: b.company_or_channel || null,
      reach_channels: Array.isArray(b.reach_channels) ? b.reach_channels : null,
      audience_size: audience, motivation, code_wish: code,
      recaptcha_score: score, email_verify_token: token, status: 'pending_email_verify',
    })
    if (insErr) { console.error('[submit-application] insert:', insErr.message); return new Response(JSON.stringify({ error: 'insert_failed' }), { status: 500, headers }) }

    // Verify-Mail (force: keine Opt-Out-Prüfung, da Bewerber noch kein User)
    const verifyUrl = `https://supabase.leadesk.de/functions/v1/affiliate-application-verify?token=${token}`
    await admin.functions.invoke('send-templated-email', {
      body: { template_key: 'affiliate_application_email_verify', recipient_email: email, force: true,
        variables: { name, verify_url: verifyUrl } },
    }).catch((e) => console.warn('[submit-application] verify-mail:', e?.message))

    return new Response(JSON.stringify({ success: true }), { headers })
  } catch (e) {
    console.error('[submit-affiliate-application] error:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers })
  }
})
