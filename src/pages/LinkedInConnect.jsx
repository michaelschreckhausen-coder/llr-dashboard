import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const P  = 'rgb(49,90,231)'
const PL = 'rgba(49,90,231,0.09)'

function IcCheck()  { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>) }
function IcUsers()  { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>) }
function IcMail()   { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>) }
function IcRocket() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>) }
function IcRefresh(){ return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>) }
function IcDown()   { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>) }

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
  const [conn,       setConn]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [syncing,    setSyncing]    = useState(false)
  const [syncLog,    setSyncLog]    = useState([])
  const [jobs,       setJobs]       = useState([])
  const [stats,      setStats]      = useState({ leads:0, messages:0, pending:0 })
  const [flash,      setFlash]      = useState(null)
  const pollRef = useRef(null)

  const addLog = (msg, type) => setSyncLog(l => [...l.slice(-19), { msg, type:type||'info', ts:new Date().toLocaleTimeString('de-DE') }])
  const showFlash = (msg, type) => { setFlash({msg,type:type||'success'}); setTimeout(()=>setFlash(null),4000) }

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [{ data:c }, { data:j }, { data:ld }, { data:ms }] = await Promise.all([
      supabase.from('linkedin_connections').select('*').eq('user_id',uid).maybeSingle(),
      supabase.from('scrape_jobs').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(10),
      supabase.from('leads').select('id').eq('user_id',uid),
      supabase.from('linkedin_messages').select('id').eq('user_id',uid),
    ])
    setConn(c)
    setJobs(j||[])
    setStats({ leads:ld?.length||0, messages:ms?.length||0, pending:(j||[]).filter(x=>x.status==='pending').length })
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // Polling: wenn Extension verbindet, sehen wir es sofort
  useEffect(() => {
    if (conn?.status === 'connected') { if (pollRef.current) clearInterval(pollRef.current); return }
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('linkedin_connections').select('*').eq('user_id',session.user.id).maybeSingle()
      if (data?.status === 'connected') {
        setConn(data)
        showFlash('LinkedIn verbunden als ' + (data.li_name||''))
        addLog('Verbunden als: ' + (data.li_name||''), 'success')
        clearInterval(pollRef.current)
        load()
      }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [conn, session, load])

  async function addSyncJob(type, url) {
    if (!conn || conn.status !== 'connected') { showFlash('Zuerst Extension installieren und anmelden', 'warn'); return }
    setSyncing(true)
    addLog('Sync-Job erstellt: '+type)
    await supabase.from('scrape_jobs').insert({ user_id:session.user.id, type, status:'pending', url, params:{} })
    window.open(url, '_blank', 'width=1100,height=700')
    addLog('LinkedIn-Seite geoeffnet — Extension importiert...')
    setTimeout(() => { setSyncing(false); load() }, 5000)
  }

  async function handleDisconnect() {
    if (!confirm('Verbindung trennen?')) return
    await supabase.from('linkedin_connections').update({ status:'disconnected' }).eq('user_id',session.user.id)
    showFlash('Getrennt.')
    load()
  }

  const isConnected = conn?.status === 'connected'

  return (
    <div style={{ maxWidth:940 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      {flash && (
        <div style={{ marginBottom:16, padding:'11px 16px', borderRadius:12, fontSize:13, fontWeight:600,
          background:flash.type==='warn'?'#FFFBEB':flash.type==='error'?'#FEF2F2':'#F0FDF4',
          color:flash.type==='warn'?'#92400E':flash.type==='error'?'#991B1B':'#065F46',
          border:'1px solid '+(flash.type==='warn'?'#FDE68A':flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, margin:0, letterSpacing:'-0.03em', color:'rgb(20,20,43)' }}>LinkedIn Cloud</h1>
          <p style={{ color:'#6B7280', fontSize:13, margin:'4px 0 0' }}>Verbinde LinkedIn automatisch und synchronisiere alle Daten.</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {isConnected && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:'#10B981', boxShadow:'0 0 0 3px rgba(16,185,129,0.2)' }}/>
              <span style={{ fontSize:13, fontWeight:700, color:'#10B981' }}>Verbunden</span>
            </div>
          )}
          {!isConnected && conn?.status === 'pending' && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:'#F59E0B', animation:'pulse 1.5s ease-in-out infinite' }}/>
              <span style={{ fontSize:13, fontWeight:700, color:'#F59E0B' }}>Warte auf Extension...</span>
            </div>
          )}
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:9, border:'1px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:12, cursor:'pointer' }}><IcRefresh/> Aktualisieren</button>
          {isConnected && <button onClick={handleDisconnect} style={{ padding:'7px 12px', borderRadius:9, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer' }}>Trennen</button>}
        </div>
      </div>

      {/* Verbundenes Profil — wie Waalaxy oben rechts */}
      {isConnected && conn.li_name && (
        <div style={{ background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', borderRadius:18, padding:'20px 24px', color:'white', marginBottom:20, display:'flex', alignItems:'center', gap:18 }}>
          {conn.li_avatar_url
            ? <img src={conn.li_avatar_url} alt="" style={{ width:60, height:60, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.4)', objectFit:'cover', flexShrink:0 }}/>
            : <div style={{ width:60, height:60, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:900, flexShrink:0 }}>{(conn.li_name||'L').charAt(0)}</div>
          }
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:900, letterSpacing:'-0.02em' }}>{conn.li_name}</div>
            {conn.li_headline && <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>{conn.li_headline}</div>}
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:5 }}>
              Verbunden seit {new Date(conn.connected_at||Date.now()).toLocaleDateString('de-DE')} · Letzter Sync {new Date(conn.last_active||Date.now()).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, textAlign:'center' }}>
            {[['Leads', stats.leads, '#A5B4FC'], ['Nachrichten', stats.messages, '#C4B5FD'], ['Pending', stats.pending, '#FDE68A']].map(([l,v,c]) => (
              <div key={l}>
                <div style={{ fontSize:22, fontWeight:900, color:c }}>{v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nicht verbunden — Anleitung */}
      {!isConnected && (
        <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', padding:'24px', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:PL, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={P} strokeWidth="2" strokeLinecap="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)' }}>Automatisch mit LinkedIn verbinden</div>
              <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>Wie Waalaxy — einmal einrichten, alles laeuft automatisch</div>
            </div>
            <a href="https://github.com/michaelschreckhausen-coder/llr-dashboard/tree/main/chrome-extension"
              target="_blank" rel="noreferrer"
              style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10, background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', color:'white', textDecoration:'none', fontSize:13, fontWeight:700, flexShrink:0 }}>
              <IcDown/> Extension herunterladen
            </a>
          </div>
          <div style={{ background:'rgb(238,241,252)', borderRadius:12, padding:'16px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>So funktioniert es</div>
            {[
              ['1', 'Extension herunterladen und in Chrome installieren (Entwicklermodus)'],
              ['2', 'Extension-Popup oeffnen → E-Mail + Passwort eingeben → Anmelden'],
              ['3', 'LinkedIn wird automatisch verbunden — Profilbild erscheint sofort'],
              ['4', 'Dashboard zeigt Verbindungsstatus in Echtzeit'],
            ].map(([n,t]) => (
              <div key={n} style={{ display:'flex', gap:12, marginBottom:10, alignItems:'flex-start' }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:P, color:'white', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{n}</div>
                <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.5, paddingTop:2 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync-Buttons — nur wenn verbunden */}
      {isConnected && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', marginBottom:10 }}>Daten synchronisieren</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              { label:'Verbindungen importieren', desc:'Alle LinkedIn-Kontakte holen', type:'connections', url:'https://www.linkedin.com/mynetwork/invite-connect/connections/', icon:<IcUsers/>, color:'#10B981' },
              { label:'Nachrichten synchronisieren', desc:'Alle Konversationen archivieren', type:'profile', url:'https://www.linkedin.com/messaging/', icon:<IcMail/>, color:'#8B5CF6' },
              { label:'Angenommene Anfragen', desc:'Wer hat meine Anfragen angenommen', type:'connections', url:'https://www.linkedin.com/mynetwork/invitation-manager/sent/', icon:<IcRocket/>, color:'#F59E0B' },
            ].map((item,i) => (
              <button key={i} onClick={()=>addSyncJob(item.type,item.url)} disabled={syncing}
                style={{ display:'flex', flexDirection:'column', gap:6, padding:'14px', borderRadius:12, border:'1px solid #E5E7EB', background:'white', cursor:syncing?'wait':'pointer', textAlign:'left', transition:'all 0.15s' }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=item.color; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)' }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E5E7EB'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, color:item.color }}>{item.icon}<span style={{ fontSize:12, fontWeight:700, color:'rgb(20,20,43)' }}>{item.label}</span></div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>{item.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Job Queue */}
      {jobs.length > 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16 }}>
          <div style={{ padding:'13px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)' }}>Sync-Queue</div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>{jobs.length} Jobs</div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ background:'#F9FAFB' }}>
                {['Typ','Status','URL','Zeit'].map(h => (
                  <th key={h} style={{ padding:'7px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {jobs.slice(0,8).map(j => (
                  <tr key={j.id} style={{ borderBottom:'1px solid #F9FAFB' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'rgb(20,20,43)' }}>{j.type}</td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:700,
                        background:j.status==='done'?'#ECFDF5':j.status==='pending'?PL:j.status==='error'?'#FEF2F2':'#FFFBEB',
                        color:j.status==='done'?'#065F46':j.status==='pending'?P:j.status==='error'?'#DC2626':'#92400E' }}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ padding:'9px 14px', color:'#6B7280', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.url||'-'}</td>
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
        <div style={{ background:'rgb(20,20,43)', borderRadius:14, padding:'15px 18px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Activity Log</div>
          <div style={{ fontFamily:'monospace', fontSize:11, maxHeight:150, overflowY:'auto' }}>
            {[...syncLog].reverse().map((l,i) => (
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
