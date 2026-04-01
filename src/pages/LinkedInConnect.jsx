import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const P  = 'rgb(49,90,231)'
const PL = 'rgba(49,90,231,0.09)'

function IcCheck()  { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>) }
function IcUsers()  { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>) }
function IcMail()   { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>) }
function IcLink()   { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>) }
function IcRocket() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>) }
function IcRefresh(){ return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>) }

function StatusDot({ status }) {
  const cfg = {
    connected:    { color:'#10B981', label:'Verbunden' },
    disconnected: { color:'#9CA3AF', label:'Getrennt' },
    pending:      { color:'#F59E0B', label:'Warte auf Extension...' },
    error:        { color:'#EF4444', label:'Fehler' },
  }[status] || { color:'#9CA3AF', label:'Unbekannt' }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:cfg.color,
        boxShadow: (status==='connected'||status==='pending') ? '0 0 0 3px '+cfg.color+'33' : 'none',
        animation: status==='pending' ? 'pulse 1.5s ease-in-out infinite' : 'none' }}/>
      <span style={{ fontSize:13, fontWeight:600, color:cfg.color }}>{cfg.label}</span>
    </div>
  )
}

function StepCard({ num, title, desc, done, active, children }) {
  return (
    <div style={{ background:'white', borderRadius:16, border:'1px solid '+(active ? P : done ? '#10B981' : '#E5E7EB'), padding:'20px 22px', marginBottom:12, boxShadow: active ? '0 4px 20px rgba(49,90,231,0.1)' : 'none' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
        <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, background: done ? '#10B981' : active ? P : '#F3F4F6', color: (done||active) ? 'white' : '#9CA3AF' }}>
          {done ? <IcCheck/> : num}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:800, color: active ? P : done ? '#065F46' : 'rgb(20,20,43)', marginBottom:3 }}>{title}</div>
          <div style={{ fontSize:12, color:'#6B7280', lineHeight:1.5 }}>{desc}</div>
          {active && children && <div style={{ marginTop:14 }}>{children}</div>}
        </div>
      </div>
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
  const [conn,    setConn]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState([])
  const [jobs,    setJobs]    = useState([])
  const [stats,   setStats]   = useState({ leads:0, messages:0, pending:0 })
  const [flash,   setFlash]   = useState(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef(null)

  const log = (msg, type) => setSyncLog(l => [...l.slice(-19), { msg, type:type||'info', ts:new Date().toLocaleTimeString('de-DE') }])
  const showFlash = (msg, type) => { setFlash({msg,type:type||'success'}); setTimeout(()=>setFlash(null),4000) }

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

  // Poll fuer Verbindungsstatus wenn "pending"
  useEffect(() => {
    if (!connecting) { if (pollRef.current) clearInterval(pollRef.current); return }
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('linkedin_connections').select('*').eq('user_id', session.user.id).maybeSingle()
      if (data && data.status === 'connected') {
        setConn(data)
        setConnecting(false)
        showFlash('LinkedIn erfolgreich verbunden als ' + (data.li_name||''))
        log('Verbunden als: ' + (data.li_name||'Unbekannt'), 'success')
        clearInterval(pollRef.current)
      }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [connecting, session])

  async function handleConnect() {
    setConnecting(true)
    log('Verbindungsauftrag erstellt — bitte LinkedIn oeffnen...')

    // 1. Eintrag in DB erstellen (Extension pollt das)
    await supabase.from('linkedin_connections').upsert({
      user_id: session.user.id,
      status: 'pending',
      connected_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // 2. Einen scrape_job als Trigger erstellen
    await supabase.from('scrape_jobs').insert({
      user_id: session.user.id,
      type: 'profile',
      status: 'pending',
      url: 'https://www.linkedin.com/feed/',
      params: { action: 'connect' },
      priority: 1,
    })

    // 3. LinkedIn oeffnen — Extension laeuft dort und sieht den Job
    window.open('https://www.linkedin.com/feed/', '_blank', 'width=1100,height=700')
    log('LinkedIn geoeffnet — Extension sollte sich jetzt verbinden...')
    showFlash('LinkedIn-Fenster geoeffnet. Warte auf Verbindung...', 'info')
  }

  async function addSyncJob(type, url) {
    if (!conn || conn.status !== 'connected') { showFlash('Zuerst LinkedIn verbinden', 'warn'); return }
    setSyncing(true)
    log('Sync-Job erstellt: '+type)
    await supabase.from('scrape_jobs').insert({ user_id:session.user.id, type, status:'pending', url, params:{} })
    window.open(url, '_blank', 'width=1100,height=700')
    log('LinkedIn-Seite geoeffnet — Extension importiert Daten...')
    setTimeout(() => { setSyncing(false); load() }, 5000)
  }

  async function handleDisconnect() {
    if (!confirm('Verbindung trennen?')) return
    await supabase.from('linkedin_connections').update({ status:'disconnected' }).eq('user_id', session.user.id)
    setConnecting(false)
    showFlash('Getrennt.')
    load()
  }

  const isConnected = conn?.status === 'connected'
  const isPending   = conn?.status === 'pending' || connecting
  const step = isConnected ? 3 : 2

  return (
    <div style={{ maxWidth:960 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {flash && (
        <div style={{ marginBottom:16, padding:'12px 18px', borderRadius:12, fontSize:13, fontWeight:600,
          background: flash.type==='warn'||flash.type==='info'?'#FFFBEB':flash.type==='error'?'#FEF2F2':'#F0FDF4',
          color: flash.type==='warn'||flash.type==='info'?'#92400E':flash.type==='error'?'#991B1B':'#065F46',
          border:'1px solid '+(flash.type==='warn'||flash.type==='info'?'#FDE68A':flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, margin:0, letterSpacing:'-0.03em', color:'rgb(20,20,43)' }}>LinkedIn Cloud</h1>
          <p style={{ color:'#6B7280', fontSize:13, margin:'4px 0 0' }}>Verbinde LinkedIn und synchronisiere alle Daten automatisch.</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {(isConnected||isPending) && <StatusDot status={isPending?'pending':'connected'}/>}
          {isConnected && <button onClick={handleDisconnect} style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer' }}>Trennen</button>}
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 12px', borderRadius:10, border:'1px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:12, cursor:'pointer' }}><IcRefresh/> Aktualisieren</button>
        </div>
      </div>

      {isConnected && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
          <StatCard label="Leads importiert" value={stats.leads} sub="in Datenbank" color={P}/>
          <StatCard label="Nachrichten" value={stats.messages} sub="archiviert" color="#8B5CF6"/>
          <StatCard label="Jobs ausstehend" value={stats.pending} sub="in Queue" color="#F59E0B"/>
        </div>
      )}

      {conn?.li_name && isConnected && (
        <div style={{ background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', borderRadius:16, padding:'18px 22px', color:'white', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
          {conn.li_avatar_url && <img src={conn.li_avatar_url} alt="" style={{ width:52, height:52, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.4)', objectFit:'cover' }}/>}
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>{conn.li_name}</div>
            {conn.li_email && <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>{conn.li_email}</div>}
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:4 }}>Verbunden seit {new Date(conn.connected_at).toLocaleDateString('de-DE')}</div>
          </div>
        </div>
      )}

      <StepCard num="1" title="Chrome Extension installieren" desc="Lade die Extension herunter (ZIP) und installiere sie in Chrome: chrome://extensions → Entwicklermodus → Entpackt laden." done={true} active={false}>
        {null}
      </StepCard>

      <StepCard num="2" title="Im Extension-Popup anmelden" desc="Klicke auf das Lead Radar Icon in Chrome → melde dich mit deinen Dashboard-Zugangsdaten an." done={isConnected} active={step===2}>
        {!isConnected && (
          <div>
            <div style={{ background:'rgb(238,241,252)', borderRadius:12, padding:'14px 16px', marginBottom:14, fontSize:12, color:'rgb(20,20,43)', lineHeight:1.7 }}>
              <strong style={{ display:'block', marginBottom:6, color:P }}>Anleitung:</strong>
              1. Klicke das Lead Radar Blitz-Icon in der Chrome-Symbolleiste<br/>
              2. Melde dich mit deiner E-Mail und deinem Passwort an<br/>
              3. Klicke im Popup auf <strong>"LinkedIn verbinden"</strong><br/>
              4. LinkedIn oeffnet sich — die Extension verbindet automatisch
            </div>
            <button onClick={handleConnect} disabled={isPending}
              style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 22px', borderRadius:12, border:'none',
                background: isPending ? '#9CA3AF' : 'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))',
                color:'white', fontSize:14, fontWeight:800, cursor: isPending ? 'wait' : 'pointer',
                boxShadow: isPending ? 'none' : '0 4px 14px rgba(49,90,231,0.35)' }}>
              <IcLink/>
              {isPending ? 'Warte auf Extension...' : 'Verbindung jetzt starten'}
            </button>
            {isPending && (
              <div style={{ marginTop:10, fontSize:12, color:'#F59E0B', fontWeight:600 }}>
                LinkedIn-Fenster geoeffnet — Extension verbindet sich automatisch...
              </div>
            )}
          </div>
        )}
      </StepCard>

      <StepCard num="3" title="Daten synchronisieren" desc="Importiere deine Verbindungen, Nachrichten und angenommene Anfragen direkt aus LinkedIn." done={false} active={step===3}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { label:'Verbindungen importieren', desc:'Alle LinkedIn-Kontakte', type:'connections', url:'https://www.linkedin.com/mynetwork/invite-connect/connections/', icon:<IcUsers/>, color:'#10B981' },
            { label:'Nachrichten synchronisieren', desc:'Alle Konversationen', type:'profile', url:'https://www.linkedin.com/messaging/', icon:<IcMail/>, color:'#8B5CF6' },
            { label:'Angenommene Anfragen', desc:'Wer hat angenommen', type:'connections', url:'https://www.linkedin.com/mynetwork/invitation-manager/sent/', icon:<IcRocket/>, color:'#F59E0B' },
          ].map((item,i) => (
            <button key={i} onClick={()=>addSyncJob(item.type, item.url)} disabled={syncing}
              style={{ display:'flex', flexDirection:'column', gap:6, padding:'14px', borderRadius:12, border:'1px solid #E5E7EB', background:'white', cursor:syncing?'wait':'pointer', textAlign:'left', transition:'all 0.15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=item.color }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E5E7EB' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, color:item.color }}>{item.icon}<span style={{ fontSize:12, fontWeight:700, color:'rgb(20,20,43)' }}>{item.label}</span></div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>{item.desc}</div>
            </button>
          ))}
        </div>
      </StepCard>

      {jobs.length > 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden', marginTop:8 }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'rgb(20,20,43)' }}>Sync-Queue</div>
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
                {jobs.slice(0,8).map(j=>(
                  <tr key={j.id} style={{ borderBottom:'1px solid #F9FAFB' }}>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:'rgb(20,20,43)' }}>{j.type}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:700,
                        background:j.status==='done'?'#ECFDF5':j.status==='pending'?PL:j.status==='error'?'#FEF2F2':'#FFFBEB',
                        color:j.status==='done'?'#065F46':j.status==='pending'?P:j.status==='error'?'#DC2626':'#92400E' }}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px', color:'#6B7280', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.url||'-'}</td>
                    <td style={{ padding:'10px 14px', color:'#9CA3AF' }}>{new Date(j.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {syncLog.length > 0 && (
        <div style={{ background:'rgb(20,20,43)', borderRadius:14, padding:'16px 18px', marginTop:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Activity Log</div>
          <div style={{ fontFamily:'monospace', fontSize:11, maxHeight:160, overflowY:'auto' }}>
            {[...syncLog].reverse().map((l,i)=>(
              <div key={i} style={{ padding:'2px 0', color:l.type==='error'?'#FCA5A5':l.type==='success'?'#6EE7B7':l.type==='warn'?'#FCD34D':'rgba(255,255,255,0.7)' }}>
                <span style={{ color:'rgba(255,255,255,0.3)', marginRight:8 }}>{l.ts}</span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
