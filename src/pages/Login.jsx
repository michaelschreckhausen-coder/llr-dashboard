import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── LinkedIn brand colors ── */
const LI_BLUE = '#0a66c2'
const LI_HOVER = '#004182'

export default function Login() {
  const [mode,    setMode]    = useState('login')
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [pw2,     setPw2]     = useState('')
  const [loading, setLoading] = useState(false)
  const [liLoading, setLiLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)

  /* ── LinkedIn OAuth via Supabase ── */
  const loginWithLinkedIn = async () => {
    setLiLoading(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: {
        redirectTo: window.location.origin,
        scopes: 'openid profile email',
      },
    })
    if (error) {
      setMsg({ type: 'err', text: error.message })
      setLiLoading(false)
    }
    // On success: browser redirects to LinkedIn — no further action needed
  }

  /* ── E-Mail / Password ── */
  const submit = async () => {
    setMsg(null)
    if (!email || !pw) return setMsg({ type: 'err', text: 'Bitte E-Mail und Passwort eingeben.' })
    setLoading(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
      if (error) setMsg({ type: 'err', text: error.message })
    } else {
      if (pw !== pw2)   { setLoading(false); return setMsg({ type: 'err', text: 'Passwörter stimmen nicht überein.' }) }
      if (pw.length < 8){ setLoading(false); return setMsg({ type: 'err', text: 'Passwort mind. 8 Zeichen.' }) }
      const { error } = await supabase.auth.signUp({ email, password: pw })
      if (error) setMsg({ type: 'err', text: error.message })
      else       setMsg({ type: 'ok',  text: '✅ Bestätigungs-E-Mail gesendet! Bitte prüfe dein Postfach.' })
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f8' }}>
      <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 8px 40px rgba(0,0,0,0.1)', overflow: 'hidden', width: 420, maxWidth: '95vw' }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #0a66c2, #0077b5)', padding: '30px 32px 24px', color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 21, fontWeight: 700 }}>LinkedIn Lead Radar</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Deine persönliche LinkedIn Sales Suite</div>
        </div>

        <div style={{ padding: '28px 32px 20px' }}>

          {/* ── Status message ── */}
          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 18, fontSize: 13,
              background: msg.type === 'ok' ? '#e6f4ee' : '#fde8e8',
              color:      msg.type === 'ok' ? '#057642'  : '#cc1016',
              border:     `1px solid ${msg.type === 'ok' ? '#b7dfc9' : '#f5b8b8'}`,
            }}>{msg.text}</div>
          )}

          {/* ── LinkedIn OAuth Button ── */}
          <button
            onClick={loginWithLinkedIn}
            disabled={liLoading || loading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '11px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: LI_BLUE, color: '#fff', fontSize: 15, fontWeight: 700,
              transition: 'background 0.2s', marginBottom: 6,
              opacity: liLoading || loading ? 0.7 : 1,
            }}
            onMouseOver={e => e.currentTarget.style.background = LI_HOVER}
            onMouseOut={e => e.currentTarget.style.background = LI_BLUE}
          >
            {/* LinkedIn "in" logo SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" rx="4" fill="white" fillOpacity="0.2"/>
              <path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.48H3V21h4V8.48ZM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z"/>
            </svg>
            {liLoading ? 'Weiterleitung…' : 'Mit LinkedIn anmelden'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 11, color: '#ccc', marginBottom: 18 }}>
            Neu bei Lead Radar? Konto wird automatisch erstellt.
          </div>

          {/* ── Divider ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
            <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>oder mit E-Mail</span>
            <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
          </div>

          {/* ── E-Mail field ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 5 }}>E-Mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="deine@email.de" style={{ width: '100%' }}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>

          {/* ── Password field ── */}
          <div style={{ marginBottom: mode === 'register' ? 14 : 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 5 }}>Passwort</label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="••••••••" style={{ width: '100%' }}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>

          {/* ── Confirm password (register only) ── */}
          {mode === 'register' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 5 }}>Passwort wiederholen</label>
              <input
                type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                placeholder="••••••••" style={{ width: '100%' }}
              />
            </div>
          )}

          {/* ── Submit ── */}
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={loading || liLoading}
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
          >
            {loading ? '⏳ ...' : mode === 'login' ? '🔐 Anmelden' : '✅ Konto erstellen'}
          </button>

          {/* ── Mode toggle ── */}
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: '#888' }}>
            {mode === 'login' ? (
              <>Noch kein Konto?{' '}
                <a onClick={() => { setMode('register'); setMsg(null) }}
                  style={{ cursor: 'pointer', color: LI_BLUE, fontWeight: 600 }}>
                  Registrieren →
                </a>
              </>
            ) : (
              <a onClick={() => { setMode('login'); setMsg(null) }}
                style={{ cursor: 'pointer', color: LI_BLUE, fontWeight: 600 }}>
                ← Zurück zum Login
              </a>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '0 32px 18px', textAlign: 'center', fontSize: 10, color: '#ccc' }}>
          Aktionen werden nie automatisch ausgeführt.{' '}
          <a href="https://www.linkedin-consulting.com/impressum" target="_blank" style={{ color: '#ccc' }}>Impressum</a>
        </div>
      </div>
    </div>
  )
}
