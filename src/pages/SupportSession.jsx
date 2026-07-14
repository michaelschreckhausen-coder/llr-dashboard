// /support-session — Impersonation-Handoff-Ziel (Schritt 4). Der Admin öffnet diesen Tab via
// window.open(url + '#access_token=…&session_id=…&exp=…', 'lk-support'). Der 'lk-support'-Fenstername
// aktiviert den isolierten storageKey (siehe lib/supabase.js) → echte Kundensession bleibt unberührt.
// Token wird SOFORT aus URL+History entfernt (Leak-Schutz), nie geloggt, nie als normale Query.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, IS_SUPPORT_TAB } from '../lib/supabase'

export default function SupportSession() {
  const nav = useNavigate()
  const [err, setErr] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    ;(async () => {
      if (!IS_SUPPORT_TAB) { setErr('Support-Session kann nur über die Admin-App gestartet werden.'); return }
      const p = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
      const access_token = p.get('access_token')
      const session_id = p.get('session_id')
      const session_expires_at = p.get('exp')
      // Token SOFORT aus URL + History entfernen — vor jedem Render/Log.
      try { window.history.replaceState(null, '', '/support-session') } catch { /* noop */ }
      if (!access_token) { setErr('Kein Token übergeben.'); return }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token: '' })
      if (error) { setErr('Session konnte nicht gesetzt werden: ' + error.message); return }
      try { sessionStorage.setItem('lk-impersonation-meta', JSON.stringify({ session_id, session_expires_at })) } catch { /* noop */ }
      nav('/dashboard', { replace: true })
    })()
  }, [nav])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh', flexDirection: 'column', gap: 12, fontFamily: 'system-ui' }}>
      {err
        ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>Support-Session-Fehler: {err}</div>
        : <div style={{ color: '#374151' }}>Support-Modus wird gestartet…</div>}
    </div>
  )
}
