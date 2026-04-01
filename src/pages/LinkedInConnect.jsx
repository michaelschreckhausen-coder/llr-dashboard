import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const P  = 'rgb(49,90,231)'
const PL = 'rgba(49,90,231,0.09)'

function IcCheck()  { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>) }
function IcUsers()  { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>) }
function IcMail()   { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>) }
function IcRocket() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>) }
function IcEye()    { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>) }
function IcEyeOff() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>) }
function IcRefresh(){ return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>) }

function StatusDot({ status }) {
  const cfg = {
    connected:    { color:'#10B981', label:'Verbunden', pulse:true },
    disconnected: { color:'#9CA3AF', label:'Getrennt', pulse:false },
    pending:      { color:'#F59E0B', label:'Verbinde...', pulse:true },
    logging_in:   { color:P,         label:'Anmelden bei LinkedIn...', pulse:true },
    error:        { color:'#EF4444', label:'Fehler', pulse:false },
  }[status] || { color:'#9CA3AF', label:'Unbekannt', pulse:false }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:cfg.color,
        boxShadow: cfg.pulse ? '0 0 0 3px '+cfg.color+'33' : 'none',
        animation: cfg.pulse ? 'llr-pulse 1.5s ease-in-out infinite' : 'none' }}/>
      <span style={{ fontSize:13, fontWeight:600, color:cfg.color }}>{cfg.label}</span>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:'white', borderRadius:14, border:'1px solid #E5E7EB', padding:'14px 16px', borderTop:'3px solid '+color }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>{sub}</div>
    </div>
  )
}

export default function LinkedInConnect({ session }) {
  const [conn,     setConn]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [jobs,     setJobs]     = useState([])
  const [stats,    setStats]    = useState({ leads:0, messages:0, pending:0 })
  const [flash,    setFlash]    = useState(null)
  const [syncLog,  setSyncLog]  = useState([])

  // Login form state
  const [liEmail,  setLiEmail]  = useState('')
  const [liPass,   setLiPass]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [logging,  setLogging]  = useState(false)

  const pollRef = useRef(null)

  const addLog = (msg, type) => setSyncLog(l => [...l.slice(-19), { msg, type:type||'info', ts:new Date().toLocaleTimeString('de-DE') }])
  const showFlash = (msg, type) => { setFlash({msg,type:type||'success'}); setTimeout(()=>setFlash(null),5000) }

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [{ data:c }, { data:j }, { data:ld }, { data:ms }] = await Promise.all([
      supabase.from('linkedin_connections').select('*').eq('user_id',uid).maybeSingle(),
      supabase.from('scrape_jobs').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(15),
      supabase.from('leads').select('id').eq('user_id',uid),
      supabase.from('linkedin_messages').select('id').eq('user_id',uid),
    ])
    setConn(c)
    setJobs(j||[])
    setStats({ leads:ld?.length||0, messages:ms?.length||0, pending:(j||[]).filter(x=>x.status==='pending').length })
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // Polling wenn pending/logging_in
  useEffect(() => {
    const status = conn?.status
    if (status !== 'pending' && status !== 'logging_in' && !logging) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('linkedin_connections').select('*').eq('user_id', session.user.id).maybeSingle()
      if (data?.status === 'connected') {
        setConn(data)
        setLogging(false)
        clearInterval(pollRef.current)
        showFlash('LinkedIn erfolgreich verbunden als ' + (data.li_name||''))
        addLog('Verbunden als: ' + (data.li_name||'LinkedIn User'), 'success')
        load()
      } else if (data?.status === 'error') {
        setLogging(false)
        clearInterval(pollRef.current)
        showFlash('Verbindung fehlgeschlagen. Bitte pruefen Sie E-Mail und Passwort.', 'error')
        addLog('Verbindungsfehler', 'error')
      }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [conn?.status, logging, session, load])

  // LinkedIn Login via Extension (Waalaxy-Style)
  async function handleLinkedInLogin(e) {
    e.preventDefault()
    if (!liEmail.trim() || !liPass.trim()) { showFlash('Bitte E-Mail und Passwort eingeben', 'warn'); return }

    setLogging(true)
    addLog('LinkedIn-Anmeldung gestartet...')

    // Credentials verschluesselt in Supabase als Job speichern
    // Extension pollt diesen Job und fuehrt den Login aus
    const { error } = await supabase.from('scrape_jobs').insert({
      user_id: session.user.id,
      type: 'profile',
      status: 'pending',
      url: 'https://www.linkedin.com/login',
      priority: 1,
      params: {
        action: 'login',
        email: liEmail.trim(),
        // Passwort wird nur temporaer gespeichert bis Extension es verarbeitet
        pass: btoa(liPass), // base64 — kein echtes Encryption, nur Obfuskation
      }
    })

    if (error) {
      setLogging(false)
      showFlash('Fehler: ' + error.message, 'error')
      return
    }

    // Status auf "pending" setzen
    await supabase.from('linkedin_connections').upsert({
      user_id: session.user.id,
      status: 'pending',
      last_active: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    addLog('Job erstellt — Extension oeffnet LinkedIn und meldet sich an...')
    showFlash('Extension uebernimmt den Login... (LinkedIn-Fenster oeffnet sich)', 'info')
    setLiPass('') // Passwort sofort aus State loeschen
  }

  async function addSyncJob(type, url) {
    if (!conn || conn.status !== 'connected') { showFlash('Zuerst LinkedIn verbinden', 'warn'); return }
    addLog('Sync-Job erstellt: '+type)
    await supabase.from('scrape_jobs').insert({ user_id:session.user.id, type, status:'pending', url, params:{} })
    window.open(url, '_blank', 'width=1100,height=700')
    setTimeout(() => load(), 3000)
  }

  async function handleDisconnect() {
    if (!confirm('Verbindung trennen?')) return
    await supabase.from('linkedin_connections').update({ status:'disconnected' }).eq('user_id', session.user.id)
    setLogging(false)
    showFlash('Getrennt.')
    load()
  }

  const isConnected = conn?.status === 'connected'
  const isPending   = conn?.status === 'pending' || conn?.status === 'logging_in' || logging

  return (
    <div style={{ maxWidth:960 }}>
      <style>{`.llr-pulse{animation:llr-pulse 1.5s ease-in-out infinite} @keyframes llr-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {flash && (
        <div style={{ marginBottom:16, padding:'12px 18px', borderRadius:12, fontSize:13, fontWeight:600,
          background:flash.type==='warn'||flash.type==='info'?'#FFFBEB':flash.type==='error'?'#FEF2F2':'#F0FDF4',
          color:flash.type==='warn'||flash.type==='info'?'#92400E':flash.type==='error'?'#991B1B':'#065F46',
          border:'1px solid '+(flash.type==='warn'||flash.type==='info'?'#FDE68A':flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, margin:0, letterSpacing:'-0.03em', color:'rgb(20,20,43)' }}>LinkedIn Cloud</h1>
          <p style={{ color:'#6B7280', fontSize:13, margin:'4px 0 0' }}>Verbinde dein LinkedIn-Konto direkt im Dashboard.</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {(isConnected||isPending) && <StatusDot status={isPending?'pending':conn?.status}/>}
          {isConnected && <button onClick={handleDisconnect} style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer' }}>Trennen</button>}
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 12px', borderRadius:10, border:'1px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:12, cursor:'pointer' }}><IcRefresh/> Aktualisieren</button>
        </div>
      </div>

      {/* Stats wenn verbunden */}
      {isConnected && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
          <StatCard label="Leads importiert" value={stats.leads} sub="in Datenbank" color={P}/>
          <StatCard label="Nachrichten" value={stats.messages} sub="archiviert" color="#8B5CF6"/>
          <StatCard label="Jobs ausstehend" value={stats.pending} sub="in Queue" color="#F59E0B"/>
        </div>
      )}

      {/* Profil-Card wenn verbunden */}
      {conn?.li_name && isConnected && (
        <div style={{ background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', borderRadius:16, padding:'18px 22px', color:'white', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
          {conn.li_avatar_url && <img src={conn.li_avatar_url} alt="" style={{ width:52, height:52, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.4)', objectFit:'cover' }}/>}
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>{conn.li_name}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:4 }}>Verbunden seit {new Date(conn.connected_at).toLocaleDateString('de-DE')} · LinkedIn Account aktiv</div>
          </div>
          <div style={{ marginLeft:'auto' }}>
            <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700 }}>Connected</div>
          </div>
        </div>
      )}

      {/* HAUPTBEREICH: Login-Form ODER Sync-Buttons */}
      {!isConnected ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          {/* Linke Seite: LinkedIn Login Form (wie Waalaxy!) */}
          <div style={{ background:'white', borderRadius:20, border:'1px solid #E5E7EB', padding:'28px', boxShadow:'0 4px 20px rgba(49,90,231,0.08)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'#0A66C2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Mit LinkedIn verbinden</div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>Gib deine LinkedIn-Zugangsdaten ein</div>
              </div>
            </div>

            <form onSubmit={handleLinkedInLogin}>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>E-Mail</label>
                <input type="email" value={liEmail} onChange={e=>setLiEmail(e.target.value)} placeholder="deine@email.com" required
                  style={{ width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', fontFamily:'inherit', background:'rgb(238,241,252)', color:'rgb(20,20,43)' }}
                  onFocus={e=>e.target.style.borderColor=P} onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Passwort</label>
                <div style={{ position:'relative' }}>
                  <input type={showPass?'text':'password'} value={liPass} onChange={e=>setLiPass(e.target.value)} placeholder="LinkedIn Passwort" required
                    style={{ width:'100%', padding:'10px 40px 10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', fontFamily:'inherit', background:'rgb(238,241,252)', color:'rgb(20,20,43)' }}
                    onFocus={e=>e.target.style.borderColor=P} onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
                  <button type="button" onClick={()=>setShowPass(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'#9CA3AF', padding:0 }}>
                    {showPass ? <IcEyeOff/> : <IcEye/>}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={logging}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', cursor:logging?'wait':'pointer',
                  background:logging?'#9CA3AF':'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))',
                  color:'white', fontSize:14, fontWeight:800, boxShadow:logging?'none':'0 4px 14px rgba(49,90,231,0.35)',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {logging ? (
                  <><span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'llr-spin 0.8s linear infinite' }}/>  Verbinde...</>
                ) : (
                  <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg> Jetzt verbinden</>
                )}
              </button>
            </form>

            {isPending && (
              <div style={{ marginTop:14, padding:'10px 14px', background:PL, borderRadius:10, fontSize:12, color:P, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:P, animation:'llr-pulse 1.5s ease-in-out infinite' }}/>
                Extension loggt sich bei LinkedIn ein...
              </div>
            )}
          </div>

          {/* Rechte Seite: Info + Extension Download */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', padding:'20px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)', marginBottom:10 }}>Wie funktioniert es?</div>
              {[
                { n:1, t:'Credentials eingeben', d:'Gib deine LinkedIn E-Mail und Passwort links ein.' },
                { n:2, t:'Extension uebernimmt', d:'Die Chrome Extension meldet sich automatisch bei LinkedIn an.' },
                { n:3, t:'Verbindung besteht', d:'Alle Daten werden automatisch synchronisiert.' },
              ].map(item => (
                <div key={item.n} style={{ display:'flex', gap:12, marginBottom:12, alignItems:'flex-start' }}>
                  <div style={{ width:24, height:24, borderRadius:'50%', background:P, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0 }}>{item.n}</div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:'rgb(20,20,43)' }}>{item.t}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{item.d}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:'rgb(238,241,252)', borderRadius:16, border:'1px solid rgba(49,90,231,0.15)', padding:'16px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:P, marginBottom:8 }}>Extension benoetigt?</div>
              <div style={{ fontSize:11, color:'#6B7280', lineHeight:1.6, marginBottom:10 }}>
                Die Chrome Extension muss installiert sein damit der automatische Login funktioniert. Einmalige Installation, danach laeuft alles im Hintergrund.
              </div>
              <a href="https://github.com/michaelschreckhausen-coder/llr-dashboard/tree/main/chrome-extension"
                target="_blank" rel="noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, background:'white', border:'1px solid rgba(49,90,231,0.2)', color:P, fontSize:12, fontWeight:700, textDecoration:'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Extension herunterladen
              </a>
            </div>
          </div>
        </div>
      ) : (
        /* Sync-Buttons wenn verbunden */
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', marginBottom:12 }}>Daten synchronisieren</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Verbindungen importieren', desc:'Alle LinkedIn-Kontakte', type:'connections', url:'https://www.linkedin.com/mynetwork/invite-connect/connections/', icon:<IcUsers/>, color:'#10B981' },
              { label:'Nachrichten synchronisieren', desc:'Alle Konversationen archivieren', type:'profile', url:'https://www.linkedin.com/messaging/', icon:<IcMail/>, color:'#8B5CF6' },
              { label:'Angenommene Anfragen', desc:'Wer hat deine Anfrage angenommen', type:'connections', url:'https://www.linkedin.com/mynetwork/invitation-manager/sent/', icon:<IcRocket/>, color:'#F59E0B' },
            ].map((item,i) => (
              <button key={i} onClick={()=>addSyncJob(item.type, item.url)}
                style={{ display:'flex', flexDirection:'column', gap:8, padding:'16px', borderRadius:14, border:'1px solid #E5E7EB', background:'white', cursor:'pointer', textAlign:'left', transition:'all 0.15s', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=item.color; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)' }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E5E7EB'; e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:item.color+'15', display:'flex', alignItems:'center', justifyContent:'center', color:item.color }}>{item.icon}</div>
                  <span style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>{item.label}</span>
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>{item.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Job Queue */}
      {jobs.length > 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden', marginTop:8 }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)' }}>Sync-Queue</div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>{jobs.length} Jobs</div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ background:'#F9FAFB' }}>
                {['Typ','Status','URL','Zeit'].map(h=>(
                  <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {jobs.slice(0,6).map(j=>(
                  <tr key={j.id} style={{ borderBottom:'1px solid #F9FAFB' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'rgb(20,20,43)' }}>{j.params?.action==='login'?'linkedin-login':j.type}</td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:700,
                        background:j.status==='done'?'#ECFDF5':j.status==='pending'?PL:j.status==='error'?'#FEF2F2':'#FFFBEB',
                        color:j.status==='done'?'#065F46':j.status==='pending'?P:j.status==='error'?'#DC2626':'#92400E' }}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ padding:'9px 14px', color:'#6B7280', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.url||'-'}</td>
                    <td style={{ padding:'9px 14px', color:'#9CA3AF' }}>{new Date(j.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity Log */}
      {syncLog.length > 0 && (
        <div style={{ background:'rgb(20,20,43)', borderRadius:14, padding:'14px 18px', marginTop:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Activity Log</div>
          <div style={{ fontFamily:'monospace', fontSize:11, maxHeight:120, overflowY:'auto' }}>
            {[...syncLog].reverse().map((l,i)=>(
              <div key={i} style={{ padding:'2px 0', color:l.type==='error'?'#FCA5A5':l.type==='success'?'#6EE7B7':l.type==='warn'?'#FCD34D':'rgba(255,255,255,0.7)' }}>
                <span style={{ color:'rgba(255,255,255,0.3)', marginRight:8 }}>{l.ts}</span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes llr-spin{to{transform:rotate(360deg)}} @keyframes llr-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  )
                                     }
