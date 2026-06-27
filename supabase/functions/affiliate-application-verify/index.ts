// supabase/functions/affiliate-application-verify/index.ts
//
// Affiliate-System Phase 12 — E-Mail-Verify für externe Bewerbungen (KEIN Auth).
// Wird vom Bestätigungslink in der Verify-Mail im Browser geöffnet (GET ?token=).
//   1. Application via email_verify_token finden
//   2. Idempotent: schon bestätigt → freundliche Hinweis-Seite
//   3. Sonst: email_verified_at=now(), status pending_email_verify → pending
//   4. "Bewerbung eingegangen"-Mail (affiliate_application_received)
//   5. HTML-Bestätigungsseite zurückgeben
//
// Auto-Approve (audience ≥10k) ist BEWUSST nicht hier — die "Bewerbung→Affiliate"-
// Logik inkl. Auth-User-Anlage lebt im Admin-Approve-Pfad (einmal, getestet) und
// kann später hier wiederverwendet werden.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const SITE = 'https://www.leadesk.de'

function htmlPage(title: string, heading: string, body: string, emoji: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} — Leadesk</title>
<style>
  :root{--primary:rgb(0,48,96);--accent:rgb(48,160,208);--ink:#0E1633;--muted:#6A6D7A;--border:#E4E5EB;}
  *{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8F9FB;color:var(--ink);
    display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
  .card{background:#fff;border:1px solid var(--border);border-radius:16px;max-width:460px;width:100%;
    padding:48px 36px;text-align:center;box-shadow:0 8px 30px rgba(14,22,51,.06);}
  .emoji{font-size:52px;line-height:1;margin-bottom:18px;}
  h1{font-size:23px;margin:0 0 12px;color:var(--primary);}
  p{font-size:15px;line-height:1.6;color:var(--muted);margin:0 0 24px;}
  a.btn{display:inline-block;background:var(--primary);color:#fff;text-decoration:none;font-weight:600;
    font-size:15px;padding:12px 24px;border-radius:10px;}
</style></head><body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a class="btn" href="${SITE}">Zur Leadesk-Startseite</a>
  </div>
</body></html>`
}

function respond(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = (url.searchParams.get('token') || '').trim()

    if (!token) {
      return respond(htmlPage('Ungültiger Link', 'Link unvollständig',
        'Dieser Bestätigungslink ist unvollständig. Bitte nutze den Link aus deiner E-Mail.', '⚠️'), 400)
    }

    const { data: app, error: selErr } = await admin
      .from('affiliate_applications')
      .select('id, name, email, status, email_verified_at')
      .eq('email_verify_token', token)
      .maybeSingle()

    if (selErr) console.error('[verify] select:', selErr.message)

    if (!app) {
      return respond(htmlPage('Ungültiger Link', 'Link nicht gefunden',
        'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet. Falls du dich noch nicht beworben hast, starte gern eine neue Bewerbung.', '🔍'), 404)
    }

    // Idempotent: bereits bestätigt
    if (app.email_verified_at) {
      return respond(htmlPage('Bereits bestätigt', 'E-Mail bereits bestätigt',
        'Deine E-Mail-Adresse ist bereits bestätigt. Wir prüfen deine Bewerbung und melden uns innerhalb von 48 Stunden.', '✅'))
    }

    // Bestätigen: nur aus pending_email_verify in pending überführen
    const { error: updErr } = await admin
      .from('affiliate_applications')
      .update({ email_verified_at: new Date().toISOString(), status: 'pending' })
      .eq('id', app.id)
      .eq('status', 'pending_email_verify')

    if (updErr) {
      console.error('[verify] update:', updErr.message)
      return respond(htmlPage('Fehler', 'Etwas ist schiefgelaufen',
        'Wir konnten deine Bestätigung gerade nicht verarbeiten. Bitte versuche es in ein paar Minuten erneut.', '⚠️'), 500)
    }

    // "Bewerbung eingegangen"-Mail (force: Bewerber ist noch kein User)
    await admin.functions.invoke('send-templated-email', {
      body: {
        template_key: 'affiliate_application_received',
        recipient_email: app.email,
        force: true,
        variables: { name: app.name },
      },
    }).catch((e) => console.warn('[verify] received-mail:', e?.message))

    return respond(htmlPage('Bestätigt', 'E-Mail bestätigt 🎉',
        'Danke! Deine Bewerbung ist jetzt vollständig. Wir prüfen sie und melden uns innerhalb von 48 Stunden bei dir.', '📬'))
  } catch (e) {
    console.error('[affiliate-application-verify] error:', (e as Error).message)
    return respond(htmlPage('Fehler', 'Etwas ist schiefgelaufen',
      'Bitte versuche es später erneut.', '⚠️'), 500)
  }
})
