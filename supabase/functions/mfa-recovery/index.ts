// supabase/functions/mfa-recovery/index.ts
//
// 2FA-Wiederherstellung. Zwei Modi:
//
//   { mode: 'consume', code }           — Self-Service: der eingeloggte User (aal1)
//                                          löst einen Backup-Code ein. Gültig →
//                                          Code wird verbraucht + TOTP-Faktor entfernt,
//                                          danach kommt der User mit Passwort allein rein.
//
//   { mode: 'admin_reset', user_id }    — Leadesk-Admin entfernt die 2FA eines Users
//                                          (Faktoren + Backup-Codes). Nur mit
//                                          is_leadesk_admin-Claim.
//
// Nur SHA-256-Hashes werden verglichen; Klartext-Codes liegen nie serverseitig.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// normalisiert Codes: Groß, ohne Leer-/Bindestriche
const norm = (c: string) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ success: false, reason: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ success: false, reason: 'no_auth' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ success: false, reason: 'invalid_json' }, 400) }
  const mode = body?.mode

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Aufrufer aus dem JWT bestimmen
  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (userErr || !userData?.user) return json({ success: false, reason: 'invalid_session' }, 401)
  const caller = userData.user

  try {
    if (mode === 'consume') {
      const code = norm(body?.code)
      if (code.length < 8) return json({ success: false, reason: 'invalid_code' }, 400)
      const hash = await sha256hex(code)
      const { data: rows } = await admin
        .from('mfa_backup_codes')
        .select('id, used_at')
        .eq('user_id', caller.id)
        .eq('code_hash', hash)
        .is('used_at', null)
        .limit(1)
      if (!rows || rows.length === 0) return json({ success: false, reason: 'code_not_valid' }, 400)
      await admin.from('mfa_backup_codes').update({ used_at: new Date().toISOString() }).eq('id', rows[0].id)
      await admin.rpc('admin_delete_mfa', { p_user: caller.id })
      return json({ success: true, mode: 'consume' })
    }

    if (mode === 'admin_reset') {
      // Admin-Berechtigung aus dem Claim prüfen
      const isAdmin = caller.app_metadata?.is_leadesk_admin === true
        || (caller as any)?.is_leadesk_admin === true
      if (!isAdmin) return json({ success: false, reason: 'forbidden' }, 403)
      const target = (body?.user_id || '').trim()
      if (!target) return json({ success: false, reason: 'no_target' }, 400)
      await admin.rpc('admin_delete_mfa', { p_user: target })
      return json({ success: true, mode: 'admin_reset', user_id: target })
    }

    return json({ success: false, reason: 'unknown_mode' }, 400)
  } catch (e) {
    return json({ success: false, reason: 'server_error', detail: String(e?.message || e) }, 500)
  }
})
