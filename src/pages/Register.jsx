import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const NAVY       = '#003060'
const NAVY_DARK  = '#002040'
const SKY        = '#30A0D0'
const CREAM      = '#FBF7F0'

const inp = {
  width:'100%', padding:'12px 14px', border:'1.5px solid #D4D0CA',
  borderRadius:10, fontSize:15, fontFamily:'inherit',
  outline:'none', background:'#ffffff', boxSizing:'border-box',
  color:'#0F172A',
  transition:'border-color 0.15s, box-shadow 0.15s',
}

// Muss zur Login-Seite identisch sein — sonst können Duplikate mit anderer Groß/Kleinschreibung entstehen.
const normalizeEmail = (e) => (e || '').trim().toLowerCase()

// Passwort-Policy:
// - Mindestens 10 Zeichen
// - ODER 8+ Zeichen UND mindestens eine Ziffer UND mindestens ein Sonderzeichen
// Gibt {ok, reason} zurück.
function checkPasswordPolicy(pw) {
  if (!pw || pw.length < 8) return { ok:false, reason:'Passwort muss mindestens 8 Zeichen haben.' }
  if (pw.length >= 10) return { ok:true }
  const hasDigit   = /\d/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  if (hasDigit && hasSpecial) return { ok:true }
  return { ok:false, reason:'Passwort: mindestens 10 Zeichen – oder 8+ Zeichen mit Ziffer & Sonderzeichen.' }
}

// Einfacher Strength-Indikator (0..4) — rein visuell, die eigentliche Policy oben entscheidet.
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
  const [step,     setStep]     = useState(1) // 1=Daten, 2=Passwort, 3=Fertig
  const [form,     setForm]     = useState({
    first_name:'', last_name:'', email:'', company:'',
    password:'', password2:'',
    accept_terms:false,
  })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [showPw,   setShowPw]   = useState(false)

  const set = k => e => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setForm(f => ({ ...f, [k]: v }))
  }

  const strength = useMemo(() => passwordStrength(form.password), [form.password])
  const strengthLabel = ['Zu kurz','Schwach','Okay','Gut','Stark'][strength] || 'Schwach'
  const strengthColor = ['#E5E7EB','#EF4444','#F59E0B','#3B82F6','#10B981'][strength] || '#E5E7EB'

  async function submit() {
    setError(null)
    const first = form.first_name.trim()
    const last  = form.last_name.trim()
    const email = normalizeEmail(form.email)
    const company = form.company.trim()

    if (!first || !last)    return setError('Bitte Vor- und Nachname eingeben.')
    if (!email)             return setError('Bitte E-Mail eingeben.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Bitte gültige E-Mail-Adresse eingeben.')

    const policy = checkPasswordPolicy(form.password)
    if (!policy.ok)                         return setError(policy.reason)
    if (form.password !== form.password2)   return setError('Passwörter stimmen nicht überein.')
    if (!form.accept_terms)                 return setError('Bitte AGB und Datenschutzerklärung akzeptieren, um fortzufahren.')

    const full_name = `${first} ${last}`.trim()

    setLoading(true)
    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: { full_name, first_name:first, last_name:last, company },
        emailRedirectTo: `${window.location.origin}/`,
      }
    })
    setLoading(false)

    if (signUpErr) {
      setError(humanizeAuthError(signUpErr.message))
      return
    }
    setStep(3)
  }

  // Step 3 = Erfolg
  if (step === 3) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: CREAM, padding:'40px 20px' }}>
      <div style={{ background:'#fff', borderRadius:20, boxShadow:'0 20px 60px rgba(0,48,96,0.12)', width:520, maxWidth:'95vw', padding:'48px 40px', textAlign:'center' }}>
        <div style={{ fontSize:64, marginBottom:20, lineHeight:1 }}>📬</div>
        <div style={{ fontFamily:'"Caveat",cursive', fontSize:20, color:SKY, marginBottom:8 }}>Fast fertig!</div>
        <h1 style={{ fontSize:28, fontWeight:800, color:NAVY, marginBottom:14, letterSpacing:'-0.02em' }}>
          Bestätige deine E-Mail.
        </h1>
        <p style={{ fontSize:15, color:'#555', lineHeight:1.55, marginBottom:24 }}>
          Wir haben dir einen Link an <b style={{ color:NAVY }}>{normalizeEmail(form.email)}</b> geschickt. Klicke darauf, um loszulegen.
        </p>
        <div style={{ background: CREAM, border:'1px solid #E8DFCF', borderRadius:12, padding:'14px 16px', fontSize:13, color:'#555' }}>
          ✨ <b>Dein 7-Tage-Basic-Trial ist aktiv</b><br/>
          Keine Kreditkarte nötig. Keine automatische Verlängerung.
        </div>
        <Link to="/login" style={{ display:'inline-block', marginTop:28, color:NAVY, textDecoration:'none', fontSize:14, fontWeight:600 }}>
          ← Zurück zum Login
        </Link>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: CREAM, padding:'40px 20px' }}>
      <div style={{ background:'#fff', borderRadius:20, boxShadow:'0 20px 60px rgba(0,48,96,0.12)', width:520, maxWidth:'95vw', overflow:'hidden' }}>

        {/* Hero-Header */}
        <div style={{ background:`linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DARK} 100%)`, padding:'32px 36px 26px', color:'#fff', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-30, right:-30, width:160, height:160, borderRadius:'50%', background:'rgba(48,160,208,0.15)' }}/>
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ fontFamily:'"Caveat",cursive', fontSize:22, color:SKY, marginBottom:4, lineHeight:1 }}>
              Willkommen bei
            </div>
            <div style={{ fontSize:32, fontWeight:900, letterSpacing:'-0.03em', lineHeight:1 }}>Leadesk</div>
            <div style={{ marginTop:14, display:'inline-flex', alignItems:'center', gap:8, padding:'6px 12px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:99, fontSize:12, fontWeight:600 }}>
              ✨ 7 Tage kostenlos testen · ohne Kreditkarte
            </div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ padding:'18px 36px 0' }}>
          <div style={{ display:'flex', gap:6, marginBottom:6 }}>
            {[1,2].map(s => (
              <div key={s} style={{ flex:1, height:3, borderRadius:99, background: step >= s ? NAVY : '#E5E7EB', transition:'background 0.3s' }}/>
            ))}
          </div>
          <div style={{ display:'flex', gap:6, fontSize:11, fontWeight:600, color:'var(--text-muted)' }}>
            {['Meine Daten','Passwort'].map((l,i) => (
              <div key={l} style={{ flex:1, textAlign:'center', color: step >= i+1 ? NAVY : '#94A3B8' }}>{l}</div>
            ))}
          </div>
        </div>

        <div style={{ padding:'20px 36px 32px', display:'flex', flexDirection:'column', gap:14 }}>

          {error && (
            <div style={{ padding:'10px 14px', borderRadius:8, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5', fontSize:13 }}>
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Vorname *</label>
                  <input type="text" value={form.first_name} onChange={set('first_name')} placeholder="Max" style={inp} autoFocus autoComplete="given-name"/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Nachname *</label>
                  <input type="text" value={form.last_name} onChange={set('last_name')} placeholder="Mustermann" style={inp} autoComplete="family-name"/>
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>E-Mail *</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="du@firma.de" style={inp} autoComplete="email"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Unternehmen</label>
                <input type="text" value={form.company} onChange={set('company')} placeholder="Firma GmbH (optional)" style={inp} autoComplete="organization"/>
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
                style={{ marginTop:6, padding:'13px 20px', border:'none', borderRadius:10, background: NAVY, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', letterSpacing:'-0.01em' }}>
                Weiter →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Passwort *</label>
                <div style={{ position:'relative' }}>
                  <input type={showPw?'text':'password'} value={form.password} onChange={set('password')} placeholder="Mindestens 10 Zeichen" style={{ ...inp, paddingRight:72 }} autoFocus autoComplete="new-password"/>
                  <button type="button" onClick={() => setShowPw(s=>!s)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', fontSize:12, color: NAVY, cursor:'pointer', fontWeight:600 }}>
                    {showPw?'Verstecken':'Anzeigen'}
                  </button>
                </div>

                {/* Strength-Meter */}
                {form.password && (
                  <div style={{ marginTop:8 }}>
                    <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{
                          flex:1, height:4, borderRadius:2,
                          background: strength >= i ? strengthColor : '#E5E7EB',
                          transition:'background 0.2s'
                        }}/>
                      ))}
                    </div>
                    <div style={{ fontSize:11, color: strengthColor, fontWeight:600 }}>
                      {strengthLabel}
                    </div>
                  </div>
                )}
                <div style={{ fontSize:11, color:'#6B7280', marginTop:6, lineHeight:1.4 }}>
                  Mind. 10 Zeichen — oder 8+ Zeichen mit Ziffer &amp; Sonderzeichen.
                </div>
              </div>

              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Passwort wiederholen *</label>
                <input type={showPw?'text':'password'} value={form.password2} onChange={set('password2')} placeholder="••••••••" style={inp} autoComplete="new-password"/>
                {form.password2 && form.password !== form.password2 && (
                  <div style={{ fontSize:11, color:'#EF4444', marginTop:6 }}>Passwörter stimmen nicht überein.</div>
                )}
              </div>

              {/* AGB / Datenschutz Pflicht-Checkbox */}
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:13, color:'#475569', lineHeight:1.55, cursor:'pointer', marginTop:4 }}>
                <input
                  type="checkbox"
                  checked={form.accept_terms}
                  onChange={set('accept_terms')}
                  style={{ marginTop:3, width:16, height:16, accentColor: NAVY, cursor:'pointer', flexShrink:0 }}
                />
                <span>
                  Ich akzeptiere die{' '}
                  <a href="https://leadesk.de/agb.html" target="_blank" rel="noreferrer" style={{ color:NAVY, fontWeight:600 }}>AGB</a>
                  {' '}und die{' '}
                  <a href="https://leadesk.de/datenschutz.html" target="_blank" rel="noreferrer" style={{ color:NAVY, fontWeight:600 }}>Datenschutzerklärung</a>.
                  <span style={{ color:'#DC2626' }}> *</span>
                </span>
              </label>

              <div style={{ display:'flex', gap:10, marginTop:6 }}>
                <button onClick={() => { setStep(1); setError(null) }} disabled={loading} style={{ flex:'0 0 auto', padding:'13px 20px', border:'1.5px solid #D4D0CA', borderRadius:10, background:'transparent', color: NAVY, fontSize:15, fontWeight:700, cursor: loading?'default':'pointer' }}>
                  ← Zurück
                </button>
                <button onClick={submit} disabled={loading} style={{ flex:1, padding:'13px 20px', border:'none', borderRadius:10, background: loading ? '#888' : NAVY, color:'#fff', fontSize:15, fontWeight:700, cursor: loading?'default':'pointer' }}>
                  {loading ? 'Wird erstellt…' : 'Konto erstellen →'}
                </button>
              </div>
            </>
          )}

          <div style={{ textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:10, borderTop:'1px solid var(--border)', paddingTop:16 }}>
            Bereits ein Konto? <Link to="/login" style={{ color:NAVY, fontWeight:700, textDecoration:'none' }}>Anmelden →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
