import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode]   = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw]       = useState('')
  const [pw2, setPw2]     = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]     = useState(null)

  const submit = async () => {
    setMsg(null)
    if (!email || !pw) return setMsg({ type:'err', text:'Bitte E-Mail und Passwort eingeben.' })
    setLoading(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
      if (error) setMsg({ type:'err', text: error.message })
    } else {
      if (pw !== pw2) { setLoading(false); return setMsg({ type:'err', text:'Passwörter stimmen nicht überein.' }) }
      if (pw.length < 8) { setLoading(false); return setMsg({ type:'err', text:'Passwort mind. 8 Zeichen.' }) }
      const { error } = await supabase.auth.signUp({ email, password: pw })
      if (error) setMsg({ type:'err', text: error.message })
      else setMsg({ type:'ok', text:'✅ Bestätigungs-E-Mail gesendet!' })
    }
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f4f8'}}>
      <div style={{background:'#fff',borderRadius:18,boxShadow:'0 8px 40px rgba(0,0,0,0.1)',overflow:'hidden',width:400,maxWidth:'95vw'}}>
        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#0a66c2,#0077b5)',padding:'28px 30px',color:'#fff',textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:8}}>✨</div>
          <div style={{fontSize:20,fontWeight:700}}>LinkedIn Lead Radar</div>
          <div style={{fontSize:13,opacity:0.85,marginTop:4}}>Deine persönliche LinkedIn Sales Suite</div>
        </div>

        {/* Form */}
        <div style={{padding:'28px 30px'}}>
          {msg && (
            <div style={{
              padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13,
              background: msg.type==='ok' ? '#e6f4ee' : '#fde8e8',
              color: msg.type==='ok' ? '#057642' : '#cc1016',
              border: `1px solid ${msg.type==='ok' ? '#b7dfc9' : '#f5b8b8'}`,
            }}>{msg.text}</div>
          )}

          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'#555',marginBottom:5}}>E-Mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="deine@email.de" style={{width:'100%'}}
              onKeyDown={e=>e.key==='Enter'&&submit()}/>
          </div>
          <div style={{marginBottom:mode==='register'?14:20}}>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'#555',marginBottom:5}}>Passwort</label>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)}
              placeholder="••••••••" style={{width:'100%'}}
              onKeyDown={e=>e.key==='Enter'&&submit()}/>
          </div>
          {mode==='register' && (
            <div style={{marginBottom:20}}>
              <label style={{display:'block',fontSize:12,fontWeight:600,color:'#555',marginBottom:5}}>Passwort wiederholen</label>
              <input type="password" value={pw2} onChange={e=>setPw2(e.target.value)}
                placeholder="••••••••" style={{width:'100%'}}/>
            </div>
          )}

          <button className="btn btn-primary" onClick={submit} disabled={loading}
            style={{width:'100%',justifyContent:'center',padding:'10px'}}>
            {loading ? '⏳ ...' : mode==='login' ? '🔐 Anmelden' : '✅ Konto erstellen'}
          </button>

          <div style={{textAlign:'center',marginTop:14,fontSize:12,color:'#888'}}>
            {mode==='login' ? (
              <>Noch kein Konto?{' '}
                <a onClick={()=>{setMode('register');setMsg(null)}} style={{cursor:'pointer',color:'#0a66c2',fontWeight:600}}>Registrieren →</a>
              </>
            ) : (
              <a onClick={()=>{setMode('login');setMsg(null)}} style={{cursor:'pointer',color:'#0a66c2',fontWeight:600}}>← Zurück zum Login</a>
            )}
          </div>
        </div>

        <div style={{padding:'0 30px 16px',textAlign:'center',fontSize:10,color:'#ccc'}}>
          Aktionen werden nie automatisch ausgeführt.{' '}
          <a href="https://www.linkedin-consulting.com/impressum" target="_blank" style={{color:'#ccc'}}>Impressum</a>
        </div>
      </div>
    </div>
  )
}
