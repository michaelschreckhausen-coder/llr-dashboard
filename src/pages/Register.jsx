import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const LI_BLUE = '#0a66c2'
const inp = {
  width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, fontFamily: 'Inter,sans-serif',
  outline: 'none', background: '#fff', boxSizing: 'border-box'
}

export default function Register() {
  const [step,      setStep]     = useState(1) // 1=Daten, 2=Passwort, 3=Fertig
  const [form,      setForm]     = useState({ full_name:'', email:'', company:'', password:'', password2:'' })
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState(null)
  const [showPw,    setShowPw]   = useState(false)

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

    // Profil mit company updaten
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('profiles').update({
        full_name: form.full_name.trim(),
        company: form.company.trim(),
        account_status: 'pending'
      }).eq('id', session.user.id)
    }

    setStep(3)
  }

  if (step === 3) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f8' }}>
        <div style={{ background:'#fff', borderRadius:18, boxShadow:'0 8px 40px rgba(0,0,0,0.1)', width:440, maxWidth:'95vw', padding:'40px 36px', textAlign:'center' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:10 }}>Konto erstellt!</div>
          <div style={{ fontSize:14, color:'#64748B', lineHeight:1.7, marginBottom:28 }}>
            Dein Konto wurde angelegt und wartet auf Freigabe.<br/>
            Ein <strong>Admin</strong> oder <strong>Team-Admin</strong> muss dir eine Lizenz zuweisen, bevor du loslegen kannst.<br/><br/>
            Du erhältst eine E-Mail sobald dein Konto freigeschaltet wurde.
          </div>
          <div style={{ background:'#EFF6FF', borderRadius:12, padding:'14px 18px', marginBottom:24, border:'1px solid #BFDBFE' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1D4ED8', marginBottom:4 }}>📋 Nächste Schritte</div>
            <div style={{ fontSize:12, color:'#1D4ED8', textAlign:'left', lineHeight:1.8 }}>
              1. Admin kontaktieren für Lizenz-Freigabe<br/>
              2. Nach Freigabe: <a href="/login" style={{ color:LI_BLUE, fontWeight:700 }}>Einloggen</a><br/>
              3. Leadesk nutzen 🚀
            </div>
          </div>
          <a href="/login" style={{ display:'block', padding:'11px', borderRadius:10, background:LI_BLUE, color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none' }}>
            → Zum Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f8' }}>
      <div style={{ background:'#fff', borderRadius:18, boxShadow:'0 8px 40px rgba(0,0,0,0.1)', width:460, maxWidth:'95vw', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0a66c2,#0077b5)', padding:'28px 32px 22px', color:'#fff', textAlign:'center' }}>
          <div style={{ fontSize:30, marginBottom:6 }}>✨</div>
          <div style={{ fontSize:20, fontWeight:700 }}>Leadesk</div>
          <div style={{ fontSize:12, opacity:0.85, marginTop:3 }}>Konto erstellen</div>
        </div>

        {/* Progress */}
        <div style={{ display:'flex', padding:'16px 32px 0', gap:6 }}>
          {[1,2].map(s => (
            <div key={s} style={{ flex:1, height:3, borderRadius:99, background: step >= s ? LI_BLUE : '#E2E8F0', transition:'background 0.3s' }}/>
          ))}
        </div>
        <div style={{ display:'flex', padding:'4px 32px 0', gap:6 }}>
          {['Meine Daten','Passwort'].map((l,i) => (
            <div key={l} style={{ flex:1, fontSize:10, fontWeight:600, color: step >= i+1 ? LI_BLUE : '#94A3B8', textAlign:'center' }}>{l}</div>
          ))}
        </div>

        <div style={{ padding:'22px 32px 24px', display:'flex', flexDirection:'column', gap:14 }}>

          {error && (
            <div style={{ padding:'10px 14px', borderRadius:8, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5', fontSize:13 }}>
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Vollständiger Name *</label>
                <input value={form.full_name} onChange={set('full_name')} style={inp} placeholder="Max Mustermann" onKeyDown={e => e.key==='Enter' && form.full_name && form.email && setStep(2)}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>E-Mail *</label>
                <input type="email" value={form.email} onChange={set('email')} style={inp} placeholder="deine@email.de" onKeyDown={e => e.key==='Enter' && form.full_name && form.email && setStep(2)}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Unternehmen</label>
                <input value={form.company} onChange={set('company')} style={inp} placeholder="Firma GmbH (optional)" onKeyDown={e => e.key==='Enter' && form.full_name && form.email && setStep(2)}/>
              </div>
              <button onClick={() => {
                if (!form.full_name.trim()) return setError('Bitte Namen eingeben.')
                if (!form.email.trim()) return setError('Bitte E-Mail eingeben.')
                setError(null); setStep(2)
              }} style={{ padding:'11px', borderRadius:10, background:LI_BLUE, color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:4 }}>
                Weiter →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#475569', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>👤 {form.full_name} · {form.email}</span>
                <button onClick={() => { setStep(1); setError(null) }} style={{ background:'none', border:'none', color:LI_BLUE, fontSize:12, fontWeight:700, cursor:'pointer' }}>Ändern</button>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Passwort *</label>
                <div style={{ position:'relative' }}>
                  <input type={showPw?'text':'password'} value={form.password} onChange={set('password')} style={{...inp, paddingRight:40}} placeholder="Mind. 8 Zeichen"/>
                  <button onClick={() => setShowPw(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
                {form.password && (
                  <div style={{ display:'flex', gap:4, alignItems:'center', marginTop:5 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex:1, height:3, borderRadius:99, background:
                        form.password.length < 8 ? (i<=1?'#EF4444':'#E2E8F0') :
                        form.password.length < 12 ? (i<=2?'#F59E0B':'#E2E8F0') :
                        form.password.length < 16 ? (i<=3?'#3B82F6':'#E2E8F0') : '#22c55e'
                      }}/>
                    ))}
                    <span style={{ fontSize:10, color:'#94A3B8' }}>
                      {form.password.length < 8 ? 'Zu kurz' : form.password.length < 12 ? 'Schwach' : form.password.length < 16 ? 'Mittel' : 'Stark'}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Passwort wiederholen *</label>
                <input type="password" value={form.password2} onChange={set('password2')} style={inp} placeholder="••••••••" onKeyDown={e => e.key==='Enter' && submit()}/>
              </div>
              <div style={{ background:'#F0FDF4', borderRadius:8, padding:'10px 14px', border:'1px solid #A7F3D0', fontSize:12, color:'#065F46' }}>
                ℹ️ Nach der Registrierung muss ein Admin dein Konto freischalten.
              </div>
              <button onClick={submit} disabled={loading} style={{ padding:'11px', borderRadius:10, background:LI_BLUE, color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading?0.7:1 }}>
                {loading ? '⏳ Konto wird erstellt…' : '✅ Konto erstellen'}
              </button>
            </>
          )}

          <div style={{ textAlign:'center', fontSize:12, color:'#94A3B8', marginTop:4 }}>
            Bereits ein Konto? <a href="/login" style={{ color:LI_BLUE, fontWeight:700 }}>Anmelden →</a>
          </div>
        </div>
      </div>
    </div>
  )
}
