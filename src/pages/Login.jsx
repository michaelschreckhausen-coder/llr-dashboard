import React, { useState } from 'react'
import { Link } from 'react-router-dom'
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

// Einheitliche Normalisierung — identisch zur Register-Seite, damit kein Duplikat-Konto
// mit anderer Groß/Kleinschreibung entstehen kann.
const normalizeEmail = (e) => (e || '').trim().toLowerCase()

// Sprechende Übersetzung typischer Supabase-Auth-Fehler für deutsche UX.
function humanizeAuthError(message = '') {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials'))              return 'E-Mail oder Passwort ist falsch.'
  if (m.includes('email not confirmed'))                    return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.'
  if (m.includes('rate limit') || m.includes('too many'))   return 'Zu viele Versuche. Bitte warte kurz und probiere es erneut.'
  if (m.includes('user not found'))                         return 'Zu dieser E-Mail existiert kein Konto.'
  return message || 'Unbekannter Fehler. Bitte erneut versuchen.'
}

export default function Login() {
  const [mode, setMode] = useState('login') // login | forgot

  // Login
  const [email, setEmail] = useState('')
  const [pw,    setPw]    = useState('')

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ error }) => { if (error) supabase.auth.signOut() })
  }, [])

  const switchMode = (m) => { setMode(m); setMsg(null) }

  const loginWithLinkedIn = async () => {
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo: window.location.origin, scopes: 'openid profile email' },
    })
    if (error) { setMsg({ type:'err', text: humanizeAuthError(error.message) }); setLoading(false) }
  }

  const doLogin = async () => {
    const e = normalizeEmail(email)
    if (!e || !pw) return setMsg({ type:'err', text:'Bitte E-Mail und Passwort eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: pw })
    if (error) setMsg({ type:'err', text: humanizeAuthError(error.message) })
    setLoading(false)
  }

  const doForgot = async () => {
    const e = normalizeEmail(forgotEmail)
    if (!e) return setMsg({ type:'err', text:'Bitte E-Mail eingeben.' })
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: window.location.origin })
    if (error) setMsg({ type:'err', text: humanizeAuthError(error.message) })
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
              {mode==='login'?'Willkommen zurück':'Passwort vergessen'}
            </div>
            <div style={{ fontSize:34, fontWeight:800, letterSpacing:'-0.02em', lineHeight:1.1 }}>Leadesk</div>
            <div style={{ fontSize:12, marginTop:10, opacity:0.85 }}>
              {mode==='login'?'Melde dich mit E-Mail oder LinkedIn an':'Wir senden dir einen Reset-Link per Mail'}
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
              <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="deine@email.de" onKeyDown={e=>e.key==='Enter'&&doLogin()} autoComplete="email"/>
            </div>
            <div style={{ marginBottom:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK }}>Passwort</label>
                <a onClick={()=>switchMode('forgot')} style={{ fontSize:11, color:SKY, cursor:'pointer', fontWeight:700 }}>Vergessen?</a>
              </div>
              <input style={inp} type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&doLogin()} autoComplete="current-password"/>
            </div>
            <button onClick={doLogin} disabled={loading}
              style={{ width:'100%', padding:'11px', borderRadius:8, border:'none', background: NAVY, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:14, opacity:loading?0.7:1 }}>
              {loading?'⏳ Anmelden…':'🔐 Anmelden'}
            </button>

            <div style={{ textAlign:'center', marginTop:14, fontSize:12, color: TEXT_MID }}>
              Noch kein Konto?{' '}
              <Link to="/register" style={{ color:SKY, fontWeight:700, textDecoration:'none' }}>
                Jetzt registrieren →
              </Link>
            </div>
          </>)}

          {/* ── FORGOT ── */}
          {mode === 'forgot' && (<>
            <div style={{ fontSize:13, color:'#475569', marginBottom:14, lineHeight:1.6 }}>
              Gib deine E-Mail ein. Wir senden dir einen Link zum Zurücksetzen des Passworts.
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color: TEXT_DARK, display:'block', marginBottom:4 }}>E-Mail</label>
              <input style={inp} type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} placeholder="deine@email.de" onKeyDown={e=>e.key==='Enter'&&doForgot()} autoComplete="email"/>
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
