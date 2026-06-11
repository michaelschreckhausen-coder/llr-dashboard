import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/*
 * Login — Split-Screen-Redesign (2026-05-17)
 * ------------------------------------------
 * Linke Hälfte (Form): weißer Canvas, Brand-Logo top-left, kompakte Card.
 * Rechte Hälfte (Brand): tinted Canvas mit großem Logo, Claim, Feature-Bullets.
 * Mobile (<=820px): single-column, Brand-Panel collapsed zu kompaktem Header.
 *
 * Farben: ausschließlich CSS-Tokens (var(--primary), var(--surface), ...).
 * Whitelabel: --wl-primary überschreibt --primary automatisch.
 * Theme: Hellmodus-only (Auth respektiert data-theme="dark" bewusst NICHT,
 *        damit Tenant-Brand-Color immer prominent ist).
 */

const LI_BLUE  = '#0a66c2'
const LI_HOVER = '#004182'

const inp = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--border)',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: '#FFFFFF',
  color: 'var(--text-primary)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-primary)',
  display: 'block',
  marginBottom: 6,
}

const normalizeEmail = (e) => (e || '').trim().toLowerCase()

function humanizeAuthError(message = '') {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials'))            return 'E-Mail oder Passwort ist falsch.'
  if (m.includes('email not confirmed'))                  return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Versuche. Bitte warte kurz und probiere es erneut.'
  if (m.includes('user not found'))                       return 'Zu dieser E-Mail existiert kein Konto.'
  return message || 'Unbekannter Fehler. Bitte erneut versuchen.'
}

export default function Login() {
  const [mode, setMode] = useState('login') // login | forgot

  const [email, setEmail] = useState('')
  const [pw,    setPw]    = useState('')
  const [forgotEmail, setForgotEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)
  const [pwFocus, setPwFocus] = useState(null) // 'email' | 'pw' | 'forgot' | null

  React.useEffect(() => {
    supabase.auth.getSession().then(({ error }) => { if (error) supabase.auth.signOut() })
  }, [])

  const switchMode = (m) => { setMode(m); setMsg(null) }

  const loginWithLinkedIn = async () => {
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}`, scopes: 'openid profile email' },
    })
    if (error) { setMsg({ type: 'err', text: humanizeAuthError(error.message) }); setLoading(false) }
  }

  const doLogin = async () => {
    const e = normalizeEmail(email)
    if (!e || !pw) return setMsg({ type: 'err', text: 'Bitte E-Mail und Passwort eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: pw })
    if (error) setMsg({ type: 'err', text: humanizeAuthError(error.message) })
    setLoading(false)
  }

  const doForgot = async () => {
    const e = normalizeEmail(forgotEmail)
    if (!e) return setMsg({ type: 'err', text: 'Bitte E-Mail eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: window.location.origin })
    if (error) setMsg({ type: 'err', text: humanizeAuthError(error.message) })
    else setMsg({ type: 'ok', text: 'Reset-Link gesendet! Bitte prüfe dein Postfach.' })
    setLoading(false)
  }

  // Fokus-Style für Inputs (kein :focus-Selector mit Inline-Styles möglich → onFocus/onBlur)
  const focusedInp = (key) => pwFocus === key
    ? { ...inp, borderColor: 'var(--primary)', boxShadow: 'var(--shadow-focus)' }
    : inp

  return (
    <div style={pageStyle} data-auth-page="true">

      {/* ── LINKE HÄLFTE: Form ─────────────────────────────────── */}
      <div style={formSideStyle} data-auth-form-side="true">
        <div style={formInnerStyle}>

          {/* Mobile-Logo (nur sichtbar wenn Brand-Panel collapsed) */}
          <div style={mobileLogoStyle} data-auth-mobile-logo="true">
            <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height: 32, width: 'auto' }} />
          </div>

          {/* Header */}
          <h1 style={headlineStyle}>
            {mode === 'login' ? 'Willkommen zurück' : 'Passwort vergessen?'}
          </h1>
          <p style={subheadStyle}>
            {mode === 'login'
              ? 'Melde dich an, um zu deinem Workspace zurückzukehren.'
              : 'Wir senden dir einen Link zum Zurücksetzen.'}
          </p>

          {/* Message */}
          {msg && (
            <div style={{
              padding: '11px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
              background: msg.type === 'ok' ? 'var(--success-soft)' : 'var(--danger-soft)',
              color:      msg.type === 'ok' ? 'var(--success-text)' : 'var(--danger-text)',
              border:    `1px solid ${msg.type === 'ok' ? 'var(--success)' : 'var(--danger)'}`,
              lineHeight: 1.5,
            }}>
              {msg.text}
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <button
                onClick={loginWithLinkedIn}
                disabled={loading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: LI_BLUE, color: '#fff', fontSize: 14, fontWeight: 700,
                  opacity: loading ? 0.7 : 1, transition: 'background 0.15s',
                  boxShadow: '0 1px 2px rgba(10,102,194,0.2)',
                }}
                onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = LI_HOVER }}
                onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = LI_BLUE  }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 1 1 8.3 6.5a1.78 1.78 0 0 1-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0 0 13 14.19a.66.66 0 0 0 0 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 0 1 2.7-1.4c1.55 0 3.36.86 3.36 3.66z"/>
                </svg>
                Mit LinkedIn anmelden
              </button>
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-soft)', marginTop: 8, marginBottom: 18 }}>
                Konto wird bei erstmaliger Nutzung automatisch erstellt
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  oder mit E-Mail
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>E-Mail</label>
                <input
                  style={focusedInp('email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="du@firma.de"
                  onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                  onFocus={() => setPwFocus('email')}
                  onBlur={() => setPwFocus(null)}
                  autoComplete="email"
                />
              </div>
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Passwort</label>
                  <a
                    onClick={() => switchMode('forgot')}
                    style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Vergessen?
                  </a>
                </div>
                <input
                  style={focusedInp('pw')}
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                  onFocus={() => setPwFocus('pw')}
                  onBlur={() => setPwFocus(null)}
                  autoComplete="current-password"
                />
              </div>

              <button
                onClick={doLogin}
                disabled={loading}
                style={primaryBtnStyle(loading)}
                onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = 'var(--primary-hover)' }}
                onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = 'var(--primary)' }}
              >
                {loading ? 'Anmelden…' : 'Anmelden'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                Noch kein Konto?{' '}
                <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
                  Jetzt registrieren →
                </Link>
              </div>
            </>
          )}

          {/* ── FORGOT ── */}
          {mode === 'forgot' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>E-Mail</label>
                <input
                  style={focusedInp('forgot')}
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="du@firma.de"
                  onKeyDown={(e) => e.key === 'Enter' && doForgot()}
                  onFocus={() => setPwFocus('forgot')}
                  onBlur={() => setPwFocus(null)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <button
                onClick={doForgot}
                disabled={loading}
                style={primaryBtnStyle(loading)}
                onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = 'var(--primary-hover)' }}
                onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = 'var(--primary)' }}
              >
                {loading ? 'Sende…' : 'Reset-Link senden'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-muted)' }}>
                <a
                  onClick={() => switchMode('login')}
                  style={{ color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}
                >
                  ← Zurück zum Login
                </a>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={footerStyle}>
            <a href="https://app.leadesk.de/impressum" target="_blank" rel="noreferrer" style={footerLinkStyle}>Impressum</a>
            <span style={{ color: 'var(--text-soft)' }}>·</span>
            <a href="https://leadesk.de/datenschutz.html" target="_blank" rel="noreferrer" style={footerLinkStyle}>Datenschutz</a>
            <span style={{ color: 'var(--text-soft)' }}>·</span>
            <a href="https://leadesk.de/agb.html" target="_blank" rel="noreferrer" style={footerLinkStyle}>AGB</a>
          </div>
        </div>
      </div>

      {/* ── RECHTE HÄLFTE: Brand-Panel ─────────────────────────── */}
      <div style={brandSideStyle} data-auth-brand-side="true">
        <div style={brandInnerStyle}>
          <img src="/Leadesk_Logo.png" alt="Leadesk" style={brandLogoStyle} />
          <div style={brandTaglineStyle}>
            Die LinkedIn-Suite<br />für B2B-Vertrieb.
          </div>
          <ul style={brandBulletsStyle}>
            {[
              'CRM, Pipeline & Deal-Management',
              'KI-gestütztes Outreach & Personalisierung',
              'Multi-Account-Inbox & Automatisierung',
              'Whitelabel-fähig für Agenturen',
            ].map((b) => (
              <li key={b} style={brandBulletItemStyle}>
                <BulletIcon />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Inline-styled components ──────────────────────────────────

function BulletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2, color: 'var(--primary)' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// ── Styles ────────────────────────────────────────────────────

const pageStyle = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  background: 'var(--surface)',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: 'var(--text-primary)',
}

const formSideStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 24px',
  background: 'var(--surface)',
  minHeight: '100vh',
  boxSizing: 'border-box',
}

const formInnerStyle = {
  width: '100%',
  maxWidth: 400,
  display: 'flex',
  flexDirection: 'column',
}

const mobileLogoStyle = {
  display: 'none', // wird via Media-Query unten überschrieben
  marginBottom: 32,
  justifyContent: 'flex-start',
}

const headlineStyle = {
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  margin: '0 0 6px',
  color: 'var(--text-primary)',
  lineHeight: 1.15,
}

const subheadStyle = {
  fontSize: 15,
  color: 'var(--text-muted)',
  margin: '0 0 28px',
  lineHeight: 1.5,
}

const primaryBtnStyle = (loading) => ({
  width: '100%',
  padding: '13px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--primary)',
  color: 'var(--text-on-brand)',
  fontSize: 15,
  fontWeight: 700,
  cursor: loading ? 'default' : 'pointer',
  marginTop: 18,
  opacity: loading ? 0.7 : 1,
  transition: 'background 0.15s, transform 0.05s',
  letterSpacing: '-0.01em',
  boxShadow: '0 1px 2px rgba(0,48,96,0.15)',
})

const footerStyle = {
  marginTop: 36,
  display: 'flex',
  gap: 10,
  fontSize: 12,
  color: 'var(--text-soft)',
  justifyContent: 'flex-start',
  flexWrap: 'wrap',
}

const footerLinkStyle = {
  color: 'var(--text-muted)',
  textDecoration: 'none',
}

const brandSideStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px',
  position: 'relative',
  overflow: 'hidden',
  background: `
    radial-gradient(ellipse 90% 70% at 20% 10%, var(--primary-soft) 0%, transparent 55%),
    radial-gradient(ellipse 70% 60% at 85% 80%, rgba(48,160,208,0.10) 0%, transparent 55%),
    linear-gradient(180deg, var(--surface-tint) 0%, var(--surface-muted) 100%)
  `,
  borderLeft: '1px solid var(--border-soft)',
  minHeight: '100vh',
  boxSizing: 'border-box',
}

const brandInnerStyle = {
  width: '100%',
  maxWidth: 460,
  position: 'relative',
  zIndex: 1,
}

const brandLogoStyle = {
  width: '100%',
  maxWidth: 380,
  height: 'auto',
  marginBottom: 32,
  display: 'block',
}

const brandTaglineStyle = {
  fontSize: 32,
  fontWeight: 800,
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
  marginBottom: 28,
}

const brandBulletsStyle = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const brandBulletItemStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  fontSize: 15,
  color: 'var(--text-primary)',
  lineHeight: 1.5,
  fontWeight: 500,
}

// Mobile-Responsive: Brand-Panel ausblenden, Mobile-Logo zeigen.
// Inline-Styles können kein @media — daher Style-Tag per Modul-Load injiziert.
// data-auth-* Attribute werden direkt an den JSX-Elementen gesetzt (siehe oben).
if (typeof document !== 'undefined' && !document.getElementById('leadesk-auth-responsive')) {
  const style = document.createElement('style')
  style.id = 'leadesk-auth-responsive'
  style.textContent = `
    @media (max-width: 820px) {
      [data-auth-page] { grid-template-columns: 1fr !important; min-height: auto !important; }
      [data-auth-brand-side] { display: none !important; }
      [data-auth-mobile-logo] { display: flex !important; }
      [data-auth-form-side] { padding: 28px 20px !important; min-height: 100vh !important; }
    }
  `
  document.head.appendChild(style)
}
