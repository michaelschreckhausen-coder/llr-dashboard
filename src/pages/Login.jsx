import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const NAVY       = '#003060'
const NAVY_DARK  = '#002040'
const SKY        = '#30A0D0'
const CREAM      = '#FBF7F0'
const TEXT_DARK  = '#0F172A'
const TEXT_MID   = '#6B7280'

const LI_BLUE = '#0a66c2'
const LI_HOVER = '#004182'
const inp = {
  width:'100%', padding:'12px 14px', borderRadius:10,
  border:'1.5px solid #D4D0CA', fontSize:15,
  outline:'none', boxSizing:'border-box', fontFamily:'inherit',
  background:'#ffffff', color: TEXT_DARK
}

export default function Login() {
  const [mode, setMode] = useState('login') // login | register | forgot
  const [step, setStep] = useState(0)

  // Login
  const [email, setEmail] = useState('')
  const [pw,    setPw]    = useState('')

  // Register
  const [regEmail,     setRegEmail]     = useState('')
  const [regPw,        setRegPw]        = useState('')
  const [regPw2,       setRegPw2]       = useState('')
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName,  setRegLastName]  = useState('')
  const [regCompany,   setRegCompany]   = useState('')

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ error }) => { if (error) supabase.auth.signOut() })
  }, [])

  const switchMode = (m) => { setMode(m); setStep(0); setMsg(null) }

  const loginWithLinkedIn = async () => {
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo: window.location.origin, scopes: 'openid profile email' },
    })
    if (error) { setMsg({ type:'err', text:error.message }); setLoading(false) }
  }

  const demoLogin = async () => {
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email:'demo@leadesk.de', password:'Demo1234!' })
    if (error) {
      setMsg({ type:'err', text:'Demo-Login fehlgeschlagen. Bitte versuche es erneut.' })
    } else {
      localStorage.setItem('llr_onboarding_done', '1')
    }
    setLoading(false)
  }

  const doLogin = async () => {
    if (!email || !pw) return setMsg({ type:'err', text:'Bitte E-Mail und Passwort eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setMsg({ type:'err', text:error.message })
    setLoading(false)
  }

  const regStep1 = () => {
    if (!regEmail || !regPw || !regPw2) return setMsg({ type:'err', text:'Bitte alle Felder ausfüllen.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) return setMsg({ type:'err', text:'Ungültige E-Mail-Adresse.' })
    if (regPw.length < 8) return setMsg({ type:'err', text:'Passwort mind. 8 Zeichen.' })
    if (regPw !== regPw2) return setMsg({ type:'err', text:'Passwörter stimmen nicht überein.' })
    setMsg(null); setStep(1)
  }

  const doRegister = async () => {
    if (!regFirstName || !regLastName) return setMsg({ type:'err', text:'Bitte Vor- und Nachname eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signUp({
      email: regEmail, password: regPw,
      options: { data: { full_name:`${regFirstName} ${regLastName}`.trim(), first_name:regFirstName, last_name:regLastName, company:regCompany } }
    })
    if (error) { setMsg({ type:'err', text:error.message }); setLoading(false); return }
    // Profil direkt befüllen
    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) await supabase.from('profiles').update({ full_name:`${regFirstName} ${regLastName}`.trim(), company:regCompany }).eq('id', session.user.id)
    }, 1000)
    setStep(2); setLoading(false)
  }

  const doForgot = async () => {
    if (!forgotEmail) return setMsg({ type:'err', text:'Bitte E-Mail eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo: window.location.origin })
    if (error) setMsg({ type:'err', text:error.message })
    else setMsg({ type:'ok', text:'✅ Reset-Link gesendet! Bitte prüfe dein Postfach.' })
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: CREAM, padding:'40px 20px' }}>
      <div style={{ background:'#fff', borderRadius:20, boxShadow:'0 20px 60px rgba(0,48,96,0.12)', overflow:'hidden', width:460, maxWidth:'95vw' }}>

        {/* Hero-Header */}
        <div style={{ background:`linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DARK} 100%)`, padding:'32px 36px 26px', color:'#fff', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background: SKY, opacity:0.18 }}/>
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ fontFamily:'"Caveat",cursive', fontSize:22, color: SKY, marginBottom:2 }}>
              {mode==='login'?'Willkommen zurück':mode==='register'?'Neu hier':'Passwort vergessen'}
            </div>
            <div style={{ fontSize:34, fontWeight:800, letterSpacing:'-0.02em', lineHeight:1.1 }}>Leadesk</div>
            <div style={{ fontSize:12, marginTop:10, opacity:0.85 }}>
              {mode==='login'?'Melde dich mit E-Mail oder LinkedIn an':mode==='register'?'Neues Konto in unter 60 Sekunden':'Wir senden dir einen Reset-Link per Mail'}
            </div>
          </div>
        </div>

        <div style={{ padding:'22px 32px 18px' }}>

          {msg && (
            <div style={{ padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13,
              background:msg.type==='ok'?'#e6f4ee':'#fde8e8', color:msg.type==='ok'?'#057642':'#cc1016',
              border:`1px solid ${msg.type==='ok'?'#b7dfc9':'#f5b8b8'}` }}>{msg.text}</div>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (<>
            <button onClick={loginWithLinkedIn} disabled={loading}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'11px', borderRadius:8, border:'none', cursor:'pointer', background:LI_BLUE, color:'#fff', fontSize:14, fontWeight:700, marginBottom:6, opacity:loading?0.7:1 }}
              onMouseOver={e=>e.currentTarget.style.background=LI_HOVER} onMouseOut={e=>e.currentTarget.style.background=LI_BLUE}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect width="24" height="24" rx="4" fillOpacity="0.2"/><path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.48H3V21h4V8.48ZM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z"/></svg>
              Mit LinkedIn anmelden
            </button>
            <div style={{ textAlign:'center', fontSize:11, color:'#aaa', marginBottom:14 }}>Konto wird automatisch erstellt</div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ flex:1, height:1, background:'#E5E7EB' }}/>
              <span style={{ fontSize:12, color:'#9CA3AF' }}>oder mit E-Mail</span>
              <div style={{ flex:1, height:1, background:'#E5E7EB' }}/>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>E-Mail</label>
              <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="deine@email.de" onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
            </div>
            <div style={{ marginBottom:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK }}>Passwort</label>
                <a onClick={()=>switchMode('forgot')} style={{ fontSize:11, color:SKY, cursor:'pointer', fontWeight:700 }}>Vergessen?</a>
              </div>
              <input style={inp} type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
            </div>
            <button onClick={doLogin} disabled={loading}
              style={{ width:'100%', padding:'11px', borderRadius:8, border:'none', background: NAVY, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:14, opacity:loading?0.7:1 }}>
              {loading?'⏳ Anmelden…':'🔐 Anmelden'}
            </button>
            {/* Demo Login */}
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #F1F5F9' }}>
              <button onClick={demoLogin} disabled={loading}
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px dashed #C7D2FE', background: CREAM, color: NAVY, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ fontSize:16 }}>🎬</span>
                Demo anschauen (kein Account nötig)
              </button>
              <div style={{ textAlign:'center', marginTop:8, fontSize:11, color: TEXT_MID }}>
                Volle Software-Demo mit Beispieldaten
              </div>
            </div>
            <div style={{ textAlign:'center', marginTop:10, fontSize:12, color: TEXT_MID }}>
              Noch kein Konto?{' '}<a onClick={()=>switchMode('register')} style={{ color:SKY, fontWeight:700, cursor:'pointer' }}>Jetzt registrieren →</a>
            </div>
          </>)}

          {/* ── REGISTER ── */}
          {mode === 'register' && (<>

            {step < 2 && (
              <div style={{ display:'flex', alignItems:'center', marginBottom:18 }}>
                {['Zugangsdaten','Profil'].map((s,i) => (
                  <React.Fragment key={i}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                      <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11,
                        background:i<=step?NAVY:'#E5E7EB', color:i<=step?'#fff':'#9CA3AF' }}>
                        {i<step?'✓':i+1}
                      </div>
                      <div style={{ fontSize:10, fontWeight:600, color:i<=step?NAVY:'#9CA3AF', marginTop:3 }}>{s}</div>
                    </div>
                    {i<1&&<div style={{ flex:1, height:2, background:step>i?NAVY:'#E5E7EB', margin:'0 4px 14px' }}/>}
                  </React.Fragment>
                ))}
              </div>
            )}

            {step === 0 && (<>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>E-Mail *</label>
                <input style={inp} type="email" value={regEmail} onChange={e=>setRegEmail(e.target.value)} placeholder="deine@email.de"/>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>Passwort * <span style={{ fontWeight:400, color:'#9CA3AF' }}>(mind. 8 Zeichen)</span></label>
                <input style={inp} type="password" value={regPw} onChange={e=>setRegPw(e.target.value)} placeholder="••••••••"/>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>Passwort wiederholen *</label>
                <input style={inp} type="password" value={regPw2} onChange={e=>setRegPw2(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&regStep1()}/>
              </div>
              <button onClick={regStep1} style={{ width:'100%', padding:'11px', borderRadius:8, border:'none', background: NAVY, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Weiter →
              </button>
            </>)}

            {step === 1 && (<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>Vorname *</label>
                  <input style={inp} value={regFirstName} onChange={e=>setRegFirstName(e.target.value)} placeholder="Max"/>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>Nachname *</label>
                  <input style={inp} value={regLastName} onChange={e=>setRegLastName(e.target.value)} placeholder="Mustermann"/>
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>Unternehmen <span style={{ fontWeight:400, color:'#9CA3AF' }}>(optional)</span></label>
                <input style={inp} value={regCompany} onChange={e=>setRegCompany(e.target.value)} placeholder="Meine GmbH" onKeyDown={e=>e.key==='Enter'&&doRegister()}/>
              </div>
              <div style={{ background:'#F0F9FF', borderRadius:10, padding:'10px 12px', marginBottom:14, border:'1px solid #BAE6FD' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#0369A1', marginBottom:2 }}>ℹ️ Free-Plan</div>
                <div style={{ fontSize:11, color:'#0369A1', lineHeight:1.5 }}>Du startest mit dem Free-Plan (50 Leads). Eine Lizenz kann von deinem Administrator vergeben werden.</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{setStep(0);setMsg(null)}}
                  style={{ flex:1, padding:'11px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#ffffff', color: TEXT_DARK, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                  ← Zurück
                </button>
                <button onClick={doRegister} disabled={loading}
                  style={{ flex:2, padding:'11px', borderRadius:8, border:'none', background: NAVY, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading?0.7:1 }}>
                  {loading?'⏳ Erstelle Konto…':'✅ Konto erstellen'}
                </button>
              </div>
            </>)}

            {step === 2 && (
              <div style={{ textAlign:'center', padding:'12px 0 6px' }}>
                <div style={{ fontSize:48, marginBottom:10 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:800, color: TEXT_DARK, marginBottom:8 }}>Konto erstellt!</div>
                <div style={{ fontSize:13, color:'#475569', lineHeight:1.7, marginBottom:18 }}>
                  Herzlich willkommen bei Leadesk.<br/>
                  Bitte bestätige deine E-Mail über den Link im Postfach.<br/><br/>
                  <strong>Nächster Schritt:</strong> Wende dich an deinen Administrator für eine Lizenz.
                </div>
                <button onClick={()=>switchMode('login')}
                  style={{ padding:'10px 28px', borderRadius:8, border:'none', background: NAVY, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  Zum Login
                </button>
              </div>
            )}

            {step < 2 && (
              <div style={{ textAlign:'center', marginTop:12, fontSize:12, color: TEXT_MID }}>
                Bereits ein Konto?{' '}<a onClick={()=>switchMode('login')} style={{ color:SKY, fontWeight:700, cursor:'pointer' }}>Anmelden</a>
              </div>
            )}
          </>)}

          {/* ── FORGOT ── */}
          {mode === 'forgot' && (<>
            <div style={{ fontSize:13, color:'#475569', marginBottom:14, lineHeight:1.6 }}>
              Gib deine E-Mail ein. Wir senden dir einen Link zum Zurücksetzen des Passworts.
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>E-Mail</label>
              <input style={inp} type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} placeholder="deine@email.de" onKeyDown={e=>e.key==='Enter'&&doForgot()}/>
            </div>
            <button onClick={doForgot} disabled={loading}
              style={{ width:'100%', padding:'11px', borderRadius:8, border:'none', background: NAVY, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading?0.7:1 }}>
              {loading?'⏳ Sende…':'📧 Reset-Link senden'}
            </button>
            <div style={{ textAlign:'center', marginTop:12, fontSize:12, color: TEXT_MID }}>
              <a onClick={()=>switchMode('login')} style={{ color:SKY, fontWeight:700, cursor:'pointer' }}>← Zurück zum Login</a>
            </div>
          </>)}

        </div>
        <div style={{ padding:'0 32px 14px', textAlign:'center', fontSize:10, color:'#9CA3AF' }}>
          Aktionen werden nie automatisch ausgeführt.{' '}
          <a href="https://app.leadesk.de/impressum" target="_blank" rel="noreferrer" style={{ color:'#9CA3AF' }}>Impressum</a>
        </div>
      </div>
    </div>
  )
}
