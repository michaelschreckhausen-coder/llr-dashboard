// ImpersonationBanner — nicht wegklickbarer Support-Modus-Banner (Schritt 4). Erkennt die Impersonation
// am is_impersonation-Claim des aktuellen JWT. Zeigt Ziel-Kunde + Restlaufzeit-Countdown + Beenden + Verlängern.
// Verlängern/Beenden rufen die staff-impersonate-EF mit dem Impersonation-Token selbst (Support-Tab-Pfad).
// Verlängern schreibt das neue Token DIREKT in den storageKey (wie der Handoff — kein setSession/_getUser) + reload.
// Graceful Expiry: abgelaufen → sauber beenden, NICHT in einen verwirrenden Kunden-Login bouncen.
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { decodeJwt, persistImpersonationSession, clearImpersonationSession } from '../lib/impersonation'

function fmt(s) { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}` }

export default function ImpersonationBanner({ session }) {
  const [info, setInfo] = useState(null)   // { sessionId, exp, email }
  const [left, setLeft] = useState(0)
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const tok = session?.access_token
    const c = tok ? decodeJwt(tok) : null
    if (!c?.app_metadata?.is_impersonation) { setInfo(null); return }
    let meta = {}
    try { meta = JSON.parse(sessionStorage.getItem('lk-impersonation-meta') || '{}') } catch { /* noop */ }
    setInfo({ sessionId: meta.session_id || null, exp: c.exp, email: c.email })
    setExpired(false)
  }, [session?.access_token])

  useEffect(() => {
    if (!info?.exp) return
    const tick = () => { const r = info.exp - Math.floor(Date.now() / 1000); setLeft(r); if (r <= 0) setExpired(true) }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [info?.exp])

  const cleanup = useCallback(async () => {
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* noop */ }   // local: kein GoTrue /logout-Round-Trip
    clearImpersonationSession()   // Support-Slot (sessionStorage) sicher räumen, auch falls signOut nichts tat
    try { window.close() } catch { /* noop */ }   // Support-Tab schließen, wenn vom Browser erlaubt
    window.location.replace('/login')
  }, [])

  const end = useCallback(async () => {
    setBusy(true)
    try { if (info?.sessionId) await supabase.functions.invoke('staff-impersonate', { body: { action: 'end', session_id: info.sessionId } }) } catch { /* best effort */ }
    await cleanup()
  }, [info, cleanup])

  const renew = useCallback(async () => {
    if (!info?.sessionId) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('staff-impersonate', { body: { action: 'renew', session_id: info.sessionId } })
      if (!error && data?.access_token && persistImpersonationSession(data.access_token)) {
        // Neues Token direkt im storageKey → Voll-Reload, damit der Client es lädt (kein setSession/_getUser).
        window.location.reload()
      } else { setBusy(false) }
    } catch { setBusy(false) }
  }, [info])

  if (!info) return null

  const bar = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
    background: expired ? '#7f1d1d' : '#B45309', color: '#fff', padding: '8px 16px',
    display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, fontWeight: 600,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)', fontFamily: 'system-ui',
  }
  const btn = {
    background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.55)',
    borderRadius: 6, padding: '4px 12px', cursor: busy ? 'default' : 'pointer', fontSize: 12, fontWeight: 700,
    opacity: busy ? 0.6 : 1,
  }

  return (
    <div style={bar}>
      <span>🛟 Support-Modus — eingeloggt als <b>{info.email || 'Kunde'}</b></span>
      {expired ? <span>· Session abgelaufen</span> : <span>· läuft in <b>{fmt(left)}</b> ab</span>}
      <span style={{ flex: 1 }} />
      {!expired && <button style={btn} disabled={busy} onClick={renew}>Verlängern</button>}
      <button style={btn} disabled={busy} onClick={end}>{expired ? 'Schließen' : 'Support-Modus beenden'}</button>
    </div>
  )
}
