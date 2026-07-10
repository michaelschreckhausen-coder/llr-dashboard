// MfaChallenge — Login-Schritt 2 (TOTP-Code abfragen)
// ---------------------------------------------------------------------------
// Wird von App.jsx als Vollbild-Gate gerendert, wenn eine Session existiert,
// aber das Assurance-Level noch aal1 ist und der User einen verifizierten
// TOTP-Factor hat (nextLevel === 'aal2'). Nach erfolgreicher Verifikation
// ruft es onVerified(), woraufhin App.jsx das AAL neu prüft und die App zeigt.

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

export default function MfaChallenge({ onVerified }) {
  const [mode, setMode] = useState('totp') // totp | backup
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState(null)
  const [factorId, setFactorId] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = (data?.totp || []).find(f => f.status === 'verified')
      if (verified) setFactorId(verified.id)
    })
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  async function verify() {
    if (mode === 'backup') return verifyBackup()
    const c = code.replace(/\s/g, '')
    if (c.length !== 6) { setErr('Bitte den 6-stelligen Code eingeben.'); return }
    if (!factorId) { setErr('Kein 2FA-Faktor gefunden.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c })
    if (error) {
      setErr(/invalid/i.test(error.message) ? 'Der Code ist falsch oder abgelaufen. Bitte erneut versuchen.' : error.message)
      setBusy(false)
      setCode('')
      inputRef.current?.focus()
      return
    }
    onVerified?.()
  }

  // Backup-Code einlösen: Edge Function prüft den Code, verbraucht ihn und entfernt
  // den TOTP-Faktor → danach ist die Session (aal1) ausreichend, das Gate fällt weg.
  async function verifyBackup() {
    const c = code.trim()
    if (c.replace(/[^A-Za-z0-9]/g, '').length < 8) { setErr('Bitte einen gültigen Backup-Code eingeben.'); return }
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('mfa-recovery', { body: { mode: 'consume', code: c } })
      if (error || !data?.success) {
        setErr('Backup-Code ungültig oder bereits verwendet.')
        setBusy(false); setCode(''); inputRef.current?.focus()
        return
      }
      onVerified?.()
    } catch (e) {
      setErr('Etwas ist schiefgelaufen. Bitte erneut versuchen.')
      setBusy(false)
    }
  }

  function switchMode(m) { setMode(m); setCode(''); setErr(null); setTimeout(() => inputRef.current?.focus(), 50) }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface, #fff)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height: 34, marginBottom: 28 }} />
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--primary-soft, #EAF6FC)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: 'var(--text-primary)' }}>Zwei-Faktor-Bestätigung</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
          {mode === 'totp'
            ? 'Gib den 6-stelligen Code aus deiner Authenticator-App ein.'
            : 'Gib einen deiner Backup-Codes ein. Jeder Code funktioniert nur einmal — danach ist 2FA deaktiviert und du kannst sie neu einrichten.'}
        </p>

        {err && (
          <div style={{ padding: '11px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, background: 'var(--danger-soft, #fde8e8)', color: 'var(--danger-text, #cc1016)', border: '1px solid var(--danger, #f5b8b8)' }}>
            {err}
          </div>
        )}

        <input
          ref={inputRef}
          value={code}
          inputMode={mode === 'totp' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          maxLength={mode === 'totp' ? 6 : 9}
          placeholder={mode === 'totp' ? '000000' : 'XXXX-XXXX'}
          onChange={e => setCode(mode === 'totp' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && verify()}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: mode === 'totp' ? 26 : 20, letterSpacing: mode === 'totp' ? '0.4em' : '0.15em', textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: 16 }}
        />

        <button className="lk-btn lk-btn-primary" onClick={verify} disabled={busy}
          style={{ width: '100%', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Prüfe…' : 'Bestätigen'}
        </button>

        <button onClick={() => switchMode(mode === 'totp' ? 'backup' : 'totp')}
          style={{ marginTop: 16, background: 'none', border: 'none', color: PRIMARY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {mode === 'totp' ? 'Kein Zugriff auf die App? Backup-Code verwenden' : '← Zurück zum App-Code'}
        </button>

        <div>
          <button onClick={() => supabase.auth.signOut()}
            style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Abmelden
          </button>
        </div>
      </div>
    </div>
  )
}
