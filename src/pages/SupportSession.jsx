// /support-session — Impersonation-Handoff-Ziel (Schritt 4). Der Admin öffnet diesen Tab via
// window.open(url + '#access_token=…&session_id=…&exp=…', 'lk-support'). Der 'lk-support'-Fenstername
// aktiviert den isolierten storageKey (siehe lib/supabase.js) → echte Kundensession bleibt unberührt.
// Token wird SOFORT aus URL+History entfernt (Leak-Schutz), nie geloggt, nie als normale Query.
// Session wird DIREKT in den storageKey geschrieben (nicht via setSession → das würde GoTrue /user rufen und
// das self-signed Token ablehnen), danach Voll-Reload, damit supabase-js sie aus dem Storage lädt.
import { useEffect, useRef, useState } from 'react'
import { IS_SUPPORT_TAB } from '../lib/supabase'
import { persistImpersonationSession } from '../lib/impersonation'

export default function SupportSession() {
  const [err, setErr] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!IS_SUPPORT_TAB) { setErr('Support-Session kann nur über die Admin-App gestartet werden.'); return }
    const p = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
    const access_token = p.get('access_token')
    const session_id = p.get('session_id')
    const session_expires_at = p.get('exp')
    // Token SOFORT aus URL + History entfernen — vor jedem Render/Log. (Hash ist oben schon ausgelesen.)
    try { window.history.replaceState(null, '', '/support-session') } catch { /* noop */ }
    if (!access_token) { setErr('Kein Token übergeben.'); return }
    const claims = persistImpersonationSession(access_token)
    if (!claims) { setErr('Session konnte nicht gesetzt werden (ungültiges Token).'); return }
    try { sessionStorage.setItem('lk-impersonation-meta', JSON.stringify({ session_id, session_expires_at })) } catch { /* noop */ }
    // Voll-Reload (kein react-router-nav): supabase-js initialisiert aus dem storageKey (echter user → kein _getUser).
    window.location.replace('/dashboard')
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh', flexDirection: 'column', gap: 12, fontFamily: 'system-ui' }}>
      {err
        ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>Support-Session-Fehler: {err}</div>
        : <div style={{ color: '#374151' }}>Support-Modus wird gestartet…</div>}
    </div>
  )
}
