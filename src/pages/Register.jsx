import React, { useState } from 'react'
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

export default function Register() {
  const [step,     setStep]     = useState(1) // 1=Daten, 2=Passwort, 3=Fertig
  const [form,     setForm]     = useState({ full_name:'', email:'', company:'', password:'', password2:'' })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [showPw,   setShowPw]   = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit() {
    setError(null)
    if (!form.full_name.trim()) return setError('Bitte vollständigen Namen eingeben.')
    if (!form.email.trim())     return setError('Bitte E-Mail eingeben.')
    if (form.password.length < 8) return setError('Passwort muss mindestens 8 Zeichen haben.')
    if (form.password !== form.password2) return setError('Passwörter stimmen nicht überein.')

    setLoading(true)
    const { error: signUpErr } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), company: form.company.trim() }
      }
    })
    setLoading(false)

    if (signUpErr) {
      if (signUpErr.message.includes('already registered') || signUpErr.message.includes('already exists')) {
        setError('Diese E-Mail ist bereits registriert. Bitte melde dich an.')
      } else {
        setError(signUpErr.message)
      }
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
          Wir haben dir einen Link an <b style={{ color:NAVY }}>{form.email}</b> geschickt. Klicke darauf, um loszulegen.
        </p>
        <div style={{ background: CREAM, border:'1px solid #E8DFCF', borderRadius:12, padding:'14px 16px', fontSize:13, color:'#555' }}>
          ✨ <b>Dein 7-Tage-Basic-Trial ist aktiv</b><br/>
          Keine Kreditkarte nötig. Keine automatische Verlängerung.
        </div>
        <a href="https://leadesk.de" style={{ display:'inline-block', marginTop:28, color:NAVY, textDecoration:'none', fontSize:14, fontWeight:600 }}>
          ← Zurück zu leadesk.de
        </a>
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
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Vollständiger Name *</label>
                <input type="text" value={form.full_name} onChange={set('full_name')} placeholder="Max Mustermann" style={inp} autoFocus/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>E-Mail *</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="du@firma.de" style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Unternehmen</label>
                <input type="text" value={form.company} onChange={set('company')} placeholder="Firma GmbH (optional)" style={inp}/>
              </div>
              <button
                onClick={() => {
                  setError(null)
                  if (!form.full_name.trim()) return setError('Bitte vollständigen Namen eingeben.')
                  if (!form.email.trim())     return setError('Bitte E-Mail eingeben.')
                  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError('Bitte gültige E-Mail-Adresse eingeben.')
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
                  <input type={showPw?'text':'password'} value={form.password} onChange={set('password')} placeholder="Mindestens 8 Zeichen" style={{ ...inp, paddingRight:64 }} autoFocus/>
                  <button type="button" onClick={() => setShowPw(s=>!s)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', fontSize:12, color: NAVY, cursor:'pointer', fontWeight:600 }}>
                    {showPw?'Verstecken':'Anzeigen'}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Passwort wiederholen *</label>
                <input type={showPw?'text':'password'} value={form.password2} onChange={set('password2')} placeholder="••••••••" style={inp}/>
              </div>

              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5, marginTop:4 }}>
                Mit Registrierung akzeptierst du die <a href="https://leadesk.de/agb.html" style={{ color:NAVY, fontWeight:600 }}>AGB</a> und <a href="https://leadesk.de/datenschutz.html" style={{ color:NAVY, fontWeight:600 }}>Datenschutzerklärung</a>.
              </div>

              <div style={{ display:'flex', gap:10, marginTop:6 }}>
                <button onClick={() => setStep(1)} disabled={loading} style={{ flex:'0 0 auto', padding:'13px 20px', border:'1.5px solid #D4D0CA', borderRadius:10, background:'transparent', color: NAVY, fontSize:15, fontWeight:700, cursor: loading?'default':'pointer' }}>
                  ← Zurück
                </button>
                <button onClick={submit} disabled={loading} style={{ flex:1, padding:'13px 20px', border:'none', borderRadius:10, background: loading ? '#888' : NAVY, color:'#fff', fontSize:15, fontWeight:700, cursor: loading?'default':'pointer' }}>
                  {loading ? 'Wird erstellt…' : 'Konto erstellen →'}
                </button>
              </div>
            </>
          )}

          <div style={{ textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:10, borderTop:'1px solid var(--border)', paddingTop:16 }}>
            Bereits ein Konto? <a href="/login" style={{ color:NAVY, fontWeight:700, textDecoration:'none' }}>Anmelden →</a>
          </div>
        </div>
      </div>
    </div>
  )
}
