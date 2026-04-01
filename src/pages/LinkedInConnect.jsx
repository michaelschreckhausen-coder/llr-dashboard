import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const P  = 'rgb(49,90,231)'
const PL = 'rgba(49,90,231,0.09)'
const BG = 'rgb(238,241,252)'

export default function LinkedInConnect({ session }) {
  const [conn,    setConn]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [jobs,    setJobs]    = useState([])
  const [flash,   setFlash]   = useState(null)
  const pollRef = useRef(null)

  const showFlash = (msg, type) => { setFlash({msg,type:type||'success'}); setTimeout(()=>setFlash(null),4000) }

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [{ data:c }, { data:j }] = await Promise.all([
      supabase.from('linkedin_connections').select('*').eq('user_id',uid).maybeSingle(),
      supabase.from('scrape_jobs').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(8),
    ])
    setConn(c)
    setJobs(j||[])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // Echtzeit-Polling — sobald Extension verbindet sehen wir es sofort
  useEffect(() => {
    if (conn && conn.status === 'connected') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('linkedin_connections').select('*')
        .eq('user_id', session.user.id).maybeSingle()
      if (data && data.status === 'connected') {
        setConn(data)
        showFlash('LinkedIn verbunden als ' + (data.profile_name || ''))
        clearInterval(pollRef.current)
        load()
      }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [conn, session, load])

  async function addSyncJob(type, url) {
    if (!conn || conn.status !== 'connected') {
      showFlash('Zuerst Extension installieren und anmelden', 'warn')
      return
    }
    setSyncing(true)
    await supabase.from('scrape_jobs').insert({
      user_id: session.user.id, type, status:'pending', url, params:{}
    })
    window.open(url, '_blank', 'width=1100,height=700')
    setTimeout(() => { setSyncing(false); load() }, 4000)
  }

  async function handleDisconnect() {
    if (!confirm('LinkedIn-Verbindung trennen?')) return
    await supabase.from('linkedin_connections')
      .update({ status:'disconnected' })
      .eq('user_id', session.user.id)
    showFlash('Verbindung getrennt.')
    load()
  }

  const isConnected = conn && conn.status === 'connected'

  return (
    <div style={{ maxWidth:860 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadein { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Flash */}
      {flash && (
        <div style={{ marginBottom:16, padding:'11px 16px', borderRadius:12, fontSize:13, fontWeight:700,
          background: flash.type==='warn'?'#FFFBEB':flash.type==='error'?'#FEF2F2':'#F0FDF4',
          color: flash.type==='warn'?'#92400E':flash.type==='error'?'#991B1B':'#065F46',
          border:'1px solid '+(flash.type==='warn'?'#FDE68A':flash.type==='error'?'#FCA5A5':'#A7F3D0'),
          animation:'fadein 0.2s ease' }}>
          {flash.msg}
        </div>
      )}

      {/* Titel */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:26, fontWeight:900, margin:0, letterSpacing:'-0.03em', color:'rgb(20,20,43)' }}>LinkedIn Cloud</h1>
        <p style={{ color:'#6B7280', fontSize:13, margin:'4px 0 0' }}>Verbinde dein LinkedIn-Konto automatisch — wie Waalaxy.</p>
      </div>

      {/* ══ KARTE 1: LinkedIn-Anmeldeinformationen (Waalaxy-Stil) ══ */}
      <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', marginBottom:16, overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'18px 22px', borderBottom:'1px solid #F3F4F6' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>LinkedIn-Anmeldeinformationen</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Verwalte deine LinkedIn-Verbindung</div>
          </div>
        </div>

        {/* Profil-Zeile — genau wie Waalaxy */}
        <div style={{ padding:'18px 22px', display:'flex', alignItems:'center', gap:14 }}>
          {/* Avatar */}
          {isConnected ? (
            conn.profile_image ? (
              <img src={conn.profile_image} alt="" style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', border:'2px solid #E5E7EB', flexShrink:0 }}/>
            ) : (
              <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:900, color:'white', flexShrink:0 }}>
                {(conn.profile_name||'?').charAt(0).toUpperCase()}
              </div>
            )
          ) : (
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          )}

          {/* Name / Status */}
          <div style={{ flex:1 }}>
            {isConnected ? (
              <>
                <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>{conn.profile_name || 'LinkedIn Konto'}</div>
                {conn.headline && <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{conn.headline}</div>}
              </>
            ) : (
              <>
                <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>Kein LinkedIn-Konto verbunden</div>
                <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Installiere die Extension und melde dich an</div>
              </>
            )}
          </div>

          {/* Badge oder Button */}
          {isConnected ? (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, background:'#F0FDF4', border:'1px solid #A7F3D0', borderRadius:20, padding:'6px 14px' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#10B981' }}/>
                <span style={{ fontSize:13, fontWeight:700, color:'#065F46' }}>Connected</span>
              </div>
              <button onClick={handleDisconnect} style={{ padding:'7px 14px', borderRadius:10, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer' }}>Trennen</button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:7, background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:20, padding:'6px 14px' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#9CA3AF' }}/>
              <span style={{ fontSize:13, fontWeight:700, color:'#6B7280' }}>Not connected</span>
            </div>
          )}
        </div>

        {/* Letzter Sync wenn verbunden */}
        {isConnected && conn.last_active && (
          <div style={{ padding:'0 22px 16px', fontSize:11, color:'#9CA3AF' }}>
            Letzter Sync: {new Date(conn.last_active).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
          </div>
        )}
      </div>

      {/* ══ KARTE 2: Anleitung / Sync-Buttons ══ */}
      <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
        {/* Header mit Download-Link */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'18px 22px', borderBottom:'1px solid #F3F4F6' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#059669,#10B981)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>
              {isConnected ? 'Daten synchronisieren' : 'Automatisch mit LinkedIn verbinden'}
            </div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>
              {isConnected ? 'Importiere Verbindungen, Nachrichten und Anfragen' : 'Wie Waalaxy — einmal einrichten, alles laeuft automatisch'}
            </div>
          </div>
          <a href="https://github.com/michaelschreckhausen-coder/llr-dashboard/tree/main/chrome-extension"
            target="_blank" rel="noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10,
              background:P, color:'white', textDecoration:'none', fontSize:13, fontWeight:700, flexShrink:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Extension herunterladen
          </a>
        </div>

        <div style={{ padding:'22px' }}>
          {/* Wenn NICHT verbunden: 4-Schritt Anleitung */}
          {!isConnected && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                {[
                  { n:'1', title:'Extension installieren', desc:'ZIP herunterladen, entpacken. In Chrome: chrome://extensions → Entwicklermodus → Entpackt laden → ext4 Ordner waehlen.', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
                  { n:'2', title:'Im Popup anmelden', desc:'Klicke das Lead Radar Icon in der Chrome-Symbolleiste. E-Mail und Passwort deines Dashboards eingeben und anmelden.', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P} strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> },
                  { n:'3', title:'Profilbild erscheint sofort', desc:'Nach dem Login verbindet sich die Extension automatisch mit LinkedIn. Dein Profilbild erscheint sofort im Popup — ohne weiteren Klick.', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                  { n:'4', title:'Dashboard zeigt "Connected"', desc:'Diese Seite aktualisiert sich automatisch in Echtzeit. Du siehst deinen Namen, dein Profilbild und den grünen "Connected" Badge.', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
                ].map(step => (
                  <div key={step.n} style={{ background:BG, borderRadius:14, padding:'16px 18px', border:'1px solid rgba(49,90,231,0.1)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:P, color:'white', fontSize:13, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{step.n}</div>
                      <div style={{ width:32, height:32, borderRadius:8, background:'white', border:'1px solid rgba(49,90,231,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>{step.icon}</div>
                      <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)' }}>{step.title}</div>
                    </div>
                    <div style={{ fontSize:12, color:'#6B7280', lineHeight:1.6, paddingLeft:38 }}>{step.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:'rgba(49,90,231,0.05)', border:'1px solid rgba(49,90,231,0.12)', borderRadius:12, padding:'12px 16px', fontSize:12, color:'rgb(49,90,231)', lineHeight:1.7 }}>
                <strong>Warte auf Verbindung...</strong> Diese Seite prueft alle 2 Sekunden automatisch ob du verbunden bist. Du musst nicht manuell aktualisieren.
              </div>
            </div>
          )}

          {/* Wenn VERBUNDEN: Sync-Buttons */}
          {isConnected && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                {[
                  { label:'Verbindungen importieren', desc:'Alle bestehenden LinkedIn-Kontakte holen', type:'connections', url:'https://www.linkedin.com/mynetwork/invite-connect/connections/', color:'#10B981' },
                  { label:'Nachrichten synchronisieren', desc:'Alle Konversationen archivieren', type:'profile', url:'https://www.linkedin.com/messaging/', color:'#8B5CF6' },
                  { label:'Angenommene Anfragen', desc:'Wer hat deine Anfragen angenommen', type:'connections', url:'https://www.linkedin.com/mynetwork/invitation-manager/sent/', color:'#F59E0B' },
                ].map((item,i) => (
                  <button key={i} onClick={()=>addSyncJob(item.type,item.url)} disabled={syncing}
                    style={{ display:'flex', flexDirection:'column', gap:8, padding:'16px', borderRadius:14, border:'1px solid #E5E7EB', background:'white', cursor:syncing?'wait':'pointer', textAlign:'left', transition:'all 0.15s', borderTop:'3px solid '+item.color }}>
                    <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)' }}>{item.label}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Job Queue */}
      {jobs.length > 0 && (
        <div style={{ background:'white', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', marginTop:16 }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)' }}>Sync-Queue</div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>{jobs.length} Jobs</div>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'#F9FAFB' }}>
              {['Typ','Status','URL','Zeit'].map(h=>(
                <th key={h} style={{ padding:'7px 16px', textAlign:'left', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {jobs.slice(0,6).map(j=>(
                <tr key={j.id} style={{ borderBottom:'1px solid #F9FAFB' }}>
                  <td style={{ padding:'9px 16px', fontWeight:600, color:'rgb(20,20,43)' }}>{j.type}</td>
                  <td style={{ padding:'9px 16px' }}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:700,
                      background:j.status==='done'?'#ECFDF5':j.status==='pending'?PL:j.status==='error'?'#FEF2F2':'#FFFBEB',
                      color:j.status==='done'?'#065F46':j.status==='pending'?P:j.status==='error'?'#DC2626':'#92400E' }}>
                      {j.status}
                    </span>
                  </td>
                  <td style={{ padding:'9px 16px', color:'#6B7280', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.url||'-'}</td>
                  <td style={{ padding:'9px 16px', color:'#9CA3AF', whiteSpace:'nowrap' }}>{new Date(j.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
