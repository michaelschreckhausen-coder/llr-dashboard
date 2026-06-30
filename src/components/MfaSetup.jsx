// MfaSetup — Zwei-Faktor-Authentifizierung (TOTP / Authenticator-App)
// ---------------------------------------------------------------------------
// Opt-in pro User. Nutzt die native Supabase/GoTrue-MFA-API:
//   enroll({factorType:'totp'}) → QR + Secret  →  challengeAndVerify({factorId,code})
// Bereits verifizierte Factors werden gelistet; Deaktivieren via unenroll().
//
// Inline-Styles + deutsche UI, konsistent zum restlichen Settings-Bereich.

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

const card = { background: 'var(--surface)', borderRadius: 14, border: '1px solid #E4E7EC', marginBottom: 16 }
const hdr  = { padding: '14px 20px', borderBottom: '1px solid #EEF1F5', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }
const bdy  = { padding: '18px 20px' }
const codeInput = { width: 180, padding: '12px 14px', border: '1.5px solid #dde3ea', borderRadius: 8, fontSize: 22, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box' }
const btnPrimary = { padding: '10px 20px', borderRadius: 10, background: PRIMARY, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost   = { padding: '9px 16px', borderRadius: 10, background: 'transparent', color: 'var(--text-muted)', border: '1.5px solid #E4E7EC', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

export default function MfaSetup() {
  const [status, setStatus]   = useState('loading') // loading | none | enrolling | active
  const [factorId, setFactorId] = useState(null)    // aktiver/zu verifizierender Factor
  const [qr, setQr]           = useState(null)       // SVG-data-URL
  const [secret, setSecret]   = useState(null)
  const [code, setCode]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState(null)       // {type, text}

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setMsg(null)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) { setStatus('none'); return }
    const verified = (data?.totp || []).find(f => f.status === 'verified')
    if (verified) { setFactorId(verified.id); setStatus('active') }
    else { setStatus('none') }
  }

  // Vor einem neuen Enroll alle unverifizierten TOTP-Factors aufräumen
  // (sonst „factor already exists"-Fehler bei abgebrochenen Versuchen).
  async function cleanUnverified() {
    const { data } = await supabase.auth.mfa.listFactors()
    const stale = (data?.all || data?.totp || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified')
    for (const f of stale) { try { await supabase.auth.mfa.unenroll({ factorId: f.id }) } catch {} }
  }

  async function startEnroll() {
    setBusy(true); setMsg(null)
    try {
      await cleanUnverified()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Leadesk ' + new Date().toISOString().slice(0,10) })
      if (error) throw error
      setFactorId(data.id)
      setQr(data.totp?.qr_code || null)
      setSecret(data.totp?.secret || null)
      setCode('')
      setStatus('enrolling')
    } catch (e) {
      setMsg({ type: 'err', text: mfaError(e?.message) })
    } finally { setBusy(false) }
  }

  async function confirmEnroll() {
    const c = code.replace(/\s/g, '')
    if (c.length !== 6) { setMsg({ type: 'err', text: 'Bitte den 6-stelligen Code aus deiner App eingeben.' }); return }
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c })
      if (error) throw error
      setQr(null); setSecret(null); setCode('')
      setStatus('active')
      setMsg({ type: 'ok', text: 'Zwei-Faktor-Authentifizierung ist jetzt aktiv.' })
    } catch (e) {
      setMsg({ type: 'err', text: mfaError(e?.message) })
    } finally { setBusy(false) }
  }

  async function cancelEnroll() {
    setBusy(true)
    try { if (factorId) await supabase.auth.mfa.unenroll({ factorId }) } catch {}
    setQr(null); setSecret(null); setCode(''); setFactorId(null); setStatus('none'); setBusy(false); setMsg(null)
  }

  async function disable() {
    if (!window.confirm('Zwei-Faktor-Authentifizierung wirklich deaktivieren? Dein Konto ist dann nur noch mit dem Passwort geschützt.')) return
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      setFactorId(null); setStatus('none')
      setMsg({ type: 'ok', text: 'Zwei-Faktor-Authentifizierung wurde deaktiviert.' })
    } catch (e) {
      setMsg({ type: 'err', text: mfaError(e?.message) })
    } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <div style={hdr}>
        <ShieldCheck size={16} strokeWidth={2} color={status === 'active' ? '#16a34a' : 'var(--text-muted)'} />
        Zwei-Faktor-Authentifizierung
        {status === 'active' && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#065F46', background: '#ECFDF5', padding: '3px 10px', borderRadius: 99 }}>Aktiv</span>
        )}
      </div>
      <div style={bdy}>
        {msg && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.type === 'ok' ? '#e6f4ee' : '#fde8e8', color: msg.type === 'ok' ? '#057642' : '#cc1016', border: `1px solid ${msg.type === 'ok' ? '#b7dfcb' : '#f5b8b8'}` }}>
            {msg.text}
          </div>
        )}

        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 size={15} className="spin" /> Lädt…
          </div>
        )}

        {status === 'none' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.6, margin: '0 0 14px' }}>
              Schütze dein Konto mit einem zusätzlichen Einmalcode aus einer Authenticator-App
              (z.&nbsp;B. Google Authenticator, Microsoft Authenticator oder Authy). Beim Login wirst du
              dann nach dem 6-stelligen Code gefragt.
            </p>
            <button style={btnPrimary} disabled={busy} onClick={startEnroll}>{busy ? 'Moment…' : 'Aktivieren'}</button>
          </>
        )}

        {status === 'enrolling' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.6, margin: '0 0 14px' }}>
              <b>1.</b> Scanne den QR-Code mit deiner Authenticator-App — oder gib den Schlüssel manuell ein.
            </p>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
              {qr && <div style={{ background: '#fff', padding: 10, border: '1px solid #E4E7EC', borderRadius: 10 }} dangerouslySetInnerHTML={{ __html: qrInline(qr) }} />}
              {secret && (
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Schlüssel (manuell)</div>
                  <code style={{ display: 'inline-block', wordBreak: 'break-all', fontSize: 13, background: '#F8FAFC', border: '1px solid #E4E7EC', borderRadius: 8, padding: '8px 10px', fontFamily: 'monospace' }}>{secret}</code>
                </div>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.6, margin: '0 0 10px' }}>
              <b>2.</b> Gib den aktuellen 6-stelligen Code aus der App ein:
            </p>
            <input style={codeInput} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              placeholder="000000"
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && confirmEnroll()} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={btnPrimary} disabled={busy} onClick={confirmEnroll}>{busy ? 'Prüfe…' : 'Bestätigen & aktivieren'}</button>
              <button style={btnGhost} disabled={busy} onClick={cancelEnroll}>Abbrechen</button>
            </div>
          </div>
        )}

        {status === 'active' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.6, margin: '0 0 14px' }}>
              Dein Konto ist mit einer Authenticator-App geschützt. Beim Login wirst du nach dem
              Einmalcode gefragt.
            </p>
            <button style={{ ...btnGhost, color: '#B91C1C', borderColor: '#FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={busy} onClick={disable}>
              <ShieldOff size={14} /> {busy ? 'Moment…' : 'Deaktivieren'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// GoTrue liefert qr_code teils als data-URL (<img>) und teils als rohes SVG.
// Beides auf inline-SVG/<img> normalisieren.
function qrInline(qr) {
  if (!qr) return ''
  if (qr.startsWith('data:image')) return `<img src="${qr}" alt="QR" width="160" height="160" style="display:block" />`
  if (qr.trim().startsWith('<svg')) return qr
  return `<img src="${qr}" alt="QR" width="160" height="160" style="display:block" />`
}

function mfaError(message = '') {
  const m = (message || '').toLowerCase()
  if (m.includes('invalid') && m.includes('code'))     return 'Der Code ist falsch oder abgelaufen. Bitte den aktuellen Code aus der App eingeben.'
  if (m.includes('mfa') && m.includes('disabled'))     return 'MFA ist serverseitig noch nicht aktiviert. Bitte den Administrator informieren.'
  if (m.includes('not enabled') || m.includes('disabled')) return 'MFA ist serverseitig noch nicht aktiviert. Bitte den Administrator informieren.'
  return message || 'Etwas ist schiefgelaufen. Bitte erneut versuchen.'
}
