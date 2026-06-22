import React, { useEffect, useMemo, useState } from 'react'
import { getStoredAffiliateCode, getStoredClickId } from '../lib/affiliateTracking'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/*
 * Register — Split-Screen-Redesign (2026-05-17)
 * ---------------------------------------------
 * Linke Hälfte: Form (2-Step + Success-Screen + Strength-Meter + AGB-Checkbox)
 * Rechte Hälfte: Brand-Panel mit Logo + Claim + Trial-Benefits
 * Funktional 1:1 zur alten Version (Felder, Validierung, Supabase-signUp, Step-3-Success-Screen).
 * Theme: Hellmodus-only, alle Farben via var(--*).
 */

const inp = {
  width: '100%',
  padding: '12px 14px',
  border: '1.5px solid var(--border)',
  borderRadius: 10,
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#FFFFFF',
  boxSizing: 'border-box',
  color: 'var(--text-primary)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: 6,
}

const normalizeEmail = (e) => (e || '').trim().toLowerCase()

function checkPasswordPolicy(pw) {
  if (!pw || pw.length < 8) return { ok: false, reason: 'Passwort muss mindestens 8 Zeichen haben.' }
  if (pw.length >= 10) return { ok: true }
  const hasDigit   = /\d/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  if (hasDigit && hasSpecial) return { ok: true }
  return { ok: false, reason: 'Passwort: mindestens 10 Zeichen – oder 8+ Zeichen mit Ziffer & Sonderzeichen.' }
}

function passwordStrength(pw) {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

function humanizeAuthError(message = '') {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))
    return 'Diese E-Mail ist bereits registriert. Bitte melde dich an oder setze dein Passwort zurück.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Zu viele Versuche. Bitte warte kurz und probiere es erneut.'
  if (m.includes('invalid email'))
    return 'Die E-Mail-Adresse ist ungültig.'
  if (m.includes('password') && m.includes('short'))
    return 'Das Passwort ist zu kurz.'
  return message || 'Unbekannter Fehler. Bitte erneut versuchen.'
}

export default function Register() {
  const [step,    setStep]    = useState(1) // 1=Daten, 2=Passwort, 3=Fertig
  const [form,    setForm]    = useState({
    first_name: '', last_name: '', email: '', company: '',
    password: '', password2: '',
    accept_terms: false,
    affiliate_code: '',
  })

  // Affiliate-Code pre-fillen: ?ref-URL-Param hat Vorrang, sonst der gespeicherte
  // Cookie (Last-Touch aus captureRefFromUrl). Leer = kein Tracking.
  useEffect(() => {
    const urlRef = new URLSearchParams(window.location.search).get('ref')
    const prefill = (urlRef || getStoredAffiliateCode() || '').trim()
    if (prefill) setForm((f) => (f.affiliate_code ? f : { ...f, affiliate_code: prefill }))
  }, [])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [showPw,  setShowPw]  = useState(false)
  const [focused, setFocused] = useState(null)

  const set = (k) => (e) => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setForm((f) => ({ ...f, [k]: v }))
  }

  const strength      = useMemo(() => passwordStrength(form.password), [form.password])
  const strengthLabel = ['Zu kurz', 'Schwach', 'Okay', 'Gut', 'Stark'][strength] || 'Schwach'
  const strengthColor = ['var(--border)', 'var(--danger)', 'var(--warm)', 'var(--info)', 'var(--success)'][strength] || 'var(--border)'

  const focusedInp = (key) => focused === key
    ? { ...inp, borderColor: 'var(--primary)', boxShadow: 'var(--shadow-focus)' }
    : inp

  async function submit() {
    setError(null)
    const first   = form.first_name.trim()
    const last    = form.last_name.trim()
    const email   = normalizeEmail(form.email)
    const company = form.company.trim()

    if (!first || !last) return setError('Bitte Vor- und Nachname eingeben.')
    if (!email)          return setError('Bitte E-Mail eingeben.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Bitte gültige E-Mail-Adresse eingeben.')

    const policy = checkPasswordPolicy(form.password)
    if (!policy.ok)                       return setError(policy.reason)
    if (form.password !== form.password2) return setError('Passwörter stimmen nicht überein.')
    if (!form.accept_terms)               return setError('Bitte AGB und Datenschutzerklärung akzeptieren, um fortzufahren.')

    const full_name = `${first} ${last}`.trim()

    setLoading(true)
    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: {
          full_name, first_name: first, last_name: last, company,
          affiliate_code: form.affiliate_code.trim() || null,
          affiliate_click_id: getStoredClickId() || null,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    setLoading(false)

    if (signUpErr) {
      setError(humanizeAuthError(signUpErr.message))
      return
    }
    setStep(3)
  }

  /* ── STEP 3: Success ─────────────────────────────────────── */
  if (step === 3) return (
    <div style={pageStyle} data-auth-page="true">
      <div style={{ ...formSideStyle, gridColumn: '1 / -1' }} data-auth-form-side="true">
        <div style={{ ...formInnerStyle, maxWidth: 480, textAlign: 'center' }}>

          <div style={successIconWrapStyle}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>

          <h1 style={{ ...headlineStyle, marginBottom: 12 }}>Bestätige deine E-Mail</h1>
          <p style={{ ...subheadStyle, marginBottom: 24, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
            Wir haben dir einen Bestätigungs-Link an <b style={{ color: 'var(--text-primary)' }}>{normalizeEmail(form.email)}</b> geschickt.
            Klicke darauf, um loszulegen.
          </p>

          <div style={{
            background: 'var(--primary-soft)',
            border: '1px solid var(--primary)',
            borderRadius: 12, padding: '14px 18px',
            fontSize: 13, color: 'var(--text-primary)',
            lineHeight: 1.55, textAlign: 'left',
            display: 'flex', gap: 12, alignItems: 'flex-start',
            maxWidth: 380, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Dein 7-Tage-Trial ist aktiv</div>
              <div style={{ color: 'var(--text-muted)' }}>Keine Kreditkarte. Keine automatische Verlängerung.</div>
            </div>
          </div>

          <Link to="/login" style={{
            display: 'inline-block', marginTop: 28,
            color: 'var(--primary)', textDecoration: 'none',
            fontSize: 14, fontWeight: 600,
          }}>
            ← Zurück zum Login
          </Link>
        </div>
      </div>
    </div>
  )

  /* ── STEPS 1 + 2 ─────────────────────────────────────────── */
  return (
    <div style={pageStyle} data-auth-page="true">

      {/* ── LINKE HÄLFTE: Form ─────────────────────────────────── */}
      <div style={formSideStyle} data-auth-form-side="true">
        <div style={formInnerStyle}>

          <div style={mobileLogoStyle} data-auth-mobile-logo="true">
            <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height: 32, width: 'auto' }} />
          </div>

          <h1 style={headlineStyle}>Konto erstellen</h1>
          <p style={subheadStyle}>
            7 Tage kostenlos testen — keine Kreditkarte nötig.
          </p>

          {/* Step-Indikator */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[1, 2].map((s) => (
                <div key={s} style={{
                  flex: 1, height: 4, borderRadius: 99,
                  background: step >= s ? 'var(--primary)' : 'var(--border)',
                  transition: 'background 0.3s',
                }}/>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 11, fontWeight: 600 }}>
              {['Deine Daten', 'Passwort'].map((l, i) => (
                <div key={l} style={{
                  flex: 1, textAlign: 'center',
                  color: step >= i + 1 ? 'var(--primary)' : 'var(--text-soft)',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>{l}</div>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              padding: '11px 14px', borderRadius: 10, marginBottom: 16,
              background: 'var(--danger-soft)', color: 'var(--danger-text)',
              border: '1px solid var(--danger)', fontSize: 13, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Vorname *</label>
                  <input
                    type="text" value={form.first_name} onChange={set('first_name')}
                    placeholder="Max" style={focusedInp('first_name')} autoFocus autoComplete="given-name"
                    onFocus={() => setFocused('first_name')} onBlur={() => setFocused(null)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Nachname *</label>
                  <input
                    type="text" value={form.last_name} onChange={set('last_name')}
                    placeholder="Mustermann" style={focusedInp('last_name')} autoComplete="family-name"
                    onFocus={() => setFocused('last_name')} onBlur={() => setFocused(null)}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>E-Mail *</label>
                <input
                  type="email" value={form.email} onChange={set('email')}
                  placeholder="du@firma.de" style={focusedInp('email')} autoComplete="email"
                  onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                />
              </div>
              <div>
                <label style={labelStyle}>Unternehmen</label>
                <input
                  type="text" value={form.company} onChange={set('company')}
                  placeholder="Firma GmbH (optional)" style={focusedInp('company')} autoComplete="organization"
                  onFocus={() => setFocused('company')} onBlur={() => setFocused(null)}
                />
              </div>
              <div>
                <label style={labelStyle}>Affiliate-Code (optional)</label>
                <input
                  type="text" value={form.affiliate_code} onChange={set('affiliate_code')}
                  placeholder="z.B. leadesk-12abc" style={focusedInp('affiliate_code')} autoComplete="off"
                  onFocus={() => setFocused('affiliate_code')} onBlur={() => setFocused(null)}
                />
              </div>
              <button
                onClick={() => {
                  setError(null)
                  const first = form.first_name.trim()
                  const last  = form.last_name.trim()
                  const email = normalizeEmail(form.email)
                  if (!first || !last) return setError('Bitte Vor- und Nachname eingeben.')
                  if (!email)          return setError('Bitte E-Mail eingeben.')
                  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Bitte gültige E-Mail-Adresse eingeben.')
                  setStep(2)
                }}
                style={primaryBtnStyle(false)}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
                onMouseOut={(e)  => e.currentTarget.style.background = 'var(--primary)'}
              >
                Weiter →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Passwort *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
                    placeholder="Mindestens 10 Zeichen"
                    style={{ ...focusedInp('password'), paddingRight: 84 }}
                    autoFocus autoComplete="new-password"
                    onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  />
                  <button
                    type="button" onClick={() => setShowPw((s) => !s)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      border: 'none', background: 'transparent',
                      fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    {showPw ? 'Verstecken' : 'Anzeigen'}
                  </button>
                </div>

                {form.password && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: strength >= i ? strengthColor : 'var(--border)',
                          transition: 'background 0.2s',
                        }}/>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>
                      {strengthLabel}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                  Mind. 10 Zeichen — oder 8+ Zeichen mit Ziffer &amp; Sonderzeichen.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Passwort wiederholen *</label>
                <input
                  type={showPw ? 'text' : 'password'} value={form.password2} onChange={set('password2')}
                  placeholder="••••••••" style={focusedInp('password2')} autoComplete="new-password"
                  onFocus={() => setFocused('password2')} onBlur={() => setFocused(null)}
                />
                {form.password2 && form.password !== form.password2 && (
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>
                    Passwörter stimmen nicht überein.
                  </div>
                )}
              </div>

              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55,
                cursor: 'pointer', marginTop: 4,
              }}>
                <input
                  type="checkbox" checked={form.accept_terms} onChange={set('accept_terms')}
                  style={{
                    marginTop: 3, width: 16, height: 16,
                    accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0,
                  }}
                />
                <span>
                  Ich akzeptiere die{' '}
                  <a href="https://leadesk.de/agb.html" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>AGB</a>
                  {' '}und die{' '}
                  <a href="https://leadesk.de/datenschutz.html" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>Datenschutzerklärung</a>.
                  <span style={{ color: 'var(--danger)' }}> *</span>
                </span>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => { setStep(1); setError(null) }}
                  disabled={loading}
                  style={{
                    flex: '0 0 auto', padding: '13px 20px',
                    border: '1.5px solid var(--border-strong)', borderRadius: 10,
                    background: 'transparent', color: 'var(--text-primary)',
                    fontSize: 15, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = 'var(--surface-hover)' }}
                  onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = 'transparent' }}
                >
                  ← Zurück
                </button>
                <button
                  onClick={submit} disabled={loading}
                  style={{ ...primaryBtnStyle(loading), flex: 1, marginTop: 0 }}
                  onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = 'var(--primary-hover)' }}
                  onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = 'var(--primary)' }}
                >
                  {loading ? 'Wird erstellt…' : 'Konto erstellen →'}
                </button>
              </div>
            </div>
          )}

          <div style={{
            textAlign: 'center', fontSize: 13, color: 'var(--text-muted)',
            marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 16,
          }}>
            Bereits ein Konto?{' '}
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
              Anmelden →
            </Link>
          </div>
        </div>
      </div>

      {/* ── RECHTE HÄLFTE: Brand-Panel ─────────────────────────── */}
      <div style={brandSideStyle} data-auth-brand-side="true">
        <div style={brandInnerStyle}>
          <img src="/Leadesk_Logo.png" alt="Leadesk" style={brandLogoStyle} />
          <div style={brandTaglineStyle}>
            Starte heute<br />mit Leadesk.
          </div>

          {/* Trial-Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: 'var(--surface)', border: '1px solid var(--primary)',
            borderRadius: 99, fontSize: 13, fontWeight: 700,
            color: 'var(--primary)', marginBottom: 28,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            7 Tage kostenlos · ohne Kreditkarte
          </div>

          <ul style={brandBulletsStyle}>
            {[
              { t: 'Voller Funktionsumfang', d: 'Alle Module während des Trials freigeschaltet' },
              { t: 'Keine automatische Verlängerung', d: 'Endet automatisch nach 7 Tagen — kein Risiko' },
              { t: 'DSGVO-konform aus der EU', d: 'Hosting in Deutschland · Hetzner Frankfurt' },
            ].map((b) => (
              <li key={b.t} style={brandBulletItemStyle}>
                <BulletIcon />
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{b.t}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>{b.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Komponenten ───────────────────────────────────────────────

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
  maxWidth: 440,
  display: 'flex',
  flexDirection: 'column',
}

const mobileLogoStyle = {
  display: 'none',
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
  margin: '0 0 24px',
  lineHeight: 1.5,
}

const primaryBtnStyle = (loading) => ({
  width: '100%',
  padding: '13px 20px',
  border: 'none',
  borderRadius: 10,
  background: 'var(--primary)',
  color: 'var(--text-on-brand)',
  fontSize: 15,
  fontWeight: 700,
  cursor: loading ? 'default' : 'pointer',
  marginTop: 6,
  opacity: loading ? 0.7 : 1,
  letterSpacing: '-0.01em',
  transition: 'background 0.15s',
  boxShadow: '0 1px 2px rgba(0,48,96,0.15)',
})

const successIconWrapStyle = {
  width: 72, height: 72,
  borderRadius: '50%',
  background: 'var(--primary-soft)',
  display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 24px',
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
  marginBottom: 20,
}

const brandBulletsStyle = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const brandBulletItemStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  fontSize: 15,
  color: 'var(--text-primary)',
  lineHeight: 1.45,
}

// Mobile-Responsive: Brand-Panel ausblenden, Mobile-Logo zeigen.
// Style-Tag wird einmal pro App-Lifetime injiziert (von Login.jsx ODER Register.jsx — der erste gewinnt).
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
