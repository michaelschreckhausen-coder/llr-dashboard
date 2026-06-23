// supabase/functions/affiliate-application-approve/index.ts
//
// Affiliate-System Phase 12 — Admin approved eine externe Bewerbung (D2-Bridge).
// POST { application_id, reason }  — Authorization: Bearer <Admin-JWT> + apikey
//   1. Admin-Check: getUser(JWT) → app_metadata.is_leadesk_admin
//   2. Application laden (muss status='pending', email bestätigt)
//   3. Auth-User anlegen (email_confirm) oder bestehenden finden
//   4. Setup-Link generieren (recovery → Passwort setzen, redirect affiliate.leadesk.de)
//   5. finalize_affiliate_application_approval-RPC (Affiliate-Row + Application schließen)
//   6. approved-Mail (affiliate_application_approved: name, code, setup_url)
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const AFFILIATE_APP_URL = 'https://affiliate.leadesk.de'

const admin = createClient(URL_, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  // Bevorzugt die vorhandene SECURITY-DEFINER-RPC (kein listUsers-Poison-Risiko, vgl. CLAUDE.md #16)
  const { data, error } = await admin.rpc('admin_lookup_user_by_email', { p_email: email })
  if (!error && data) return data as string
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    // ── 1. Admin-Check über das Caller-JWT ──────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'unauthenticated' }, 401)
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthenticated' }, 401)
    const isAdmin = !!(user.app_metadata && (user.app_metadata as Record<string, unknown>).is_leadesk_admin)
    if (!isAdmin) return json({ error: 'forbidden: is_leadesk_admin required' }, 403)

    const body = await req.json().catch(() => ({}))
    const applicationId = (body.application_id || '').toString()
    const reason = (body.reason || '').toString().trim()
    if (!applicationId) return json({ error: 'application_id required' }, 400)
    if (reason.length < 10) return json({ error: 'reason_too_short' }, 400)

    // ── 2. Application laden ─────────────────────────────────────────────────
    const { data: app, error: appErr } = await admin
      .from('affiliate_applications')
      .select('id, email, name, code_wish, status, email_verified_at')
      .eq('id', applicationId).maybeSingle()
    if (appErr) { console.error('[approve] select:', appErr.message); return json({ error: 'lookup_failed' }, 500) }
    if (!app) return json({ error: 'application_not_found' }, 404)
    if (app.status !== 'pending') return json({ error: `not_pending (${app.status})` }, 409)
    if (!app.email_verified_at) return json({ error: 'email_not_verified' }, 409)

    // Code-Kollision früh abfangen (freundlicher Fehler statt RPC-Exception)
    const { data: codeTaken } = await admin.from('affiliates').select('id').eq('code', app.code_wish).maybeSingle()
    if (codeTaken) return json({ error: 'code_taken' }, 409)

    // ── 3. Auth-User anlegen oder finden ─────────────────────────────────────
    let userId: string | null = null
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: app.email, email_confirm: true, user_metadata: { full_name: app.name },
    })
    if (created?.user) {
      userId = created.user.id
    } else {
      // existiert vermutlich schon → nachschlagen
      console.warn('[approve] createUser:', createErr?.message)
      userId = await findUserIdByEmail(app.email)
    }
    if (!userId) return json({ error: 'user_provision_failed' }, 500)

    // ── 4. Setup-Link (Passwort setzen) ──────────────────────────────────────
    let setupUrl = `${AFFILIATE_APP_URL}/login`
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery', email: app.email, options: { redirectTo: AFFILIATE_APP_URL },
    })
    if (link?.properties?.action_link) setupUrl = link.properties.action_link
    else console.warn('[approve] generateLink:', linkErr?.message)

    // ── 5. Finalisieren (Affiliate-Row + Application schließen) ───────────────
    const { data: fin, error: finErr } = await admin.rpc('finalize_affiliate_application_approval', {
      p_application_id: applicationId, p_user_id: userId, p_admin_id: user.id, p_reason: reason,
    })
    if (finErr) { console.error('[approve] finalize:', finErr.message); return json({ error: 'finalize_failed', detail: finErr.message }, 500) }

    // ── 6. approved-Mail ─────────────────────────────────────────────────────
    await admin.functions.invoke('send-templated-email', {
      body: {
        template_key: 'affiliate_application_approved', recipient_email: app.email, force: true,
        variables: { name: app.name, code: (fin as Record<string, unknown>)?.code, setup_url: setupUrl },
      },
    }).catch((e) => console.warn('[approve] approved-mail:', e?.message))

    return json({ success: true, affiliate_id: (fin as Record<string, unknown>)?.affiliate_id, code: (fin as Record<string, unknown>)?.code })
  } catch (e) {
    console.error('[affiliate-application-approve] error:', (e as Error).message)
    return json({ error: 'server_error' }, 500)
  }
})
