import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const P = 'rgb(49,90,231)'

function IcLinkedIn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function IcShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
    </svg>
  )
}

export default function LinkedInConnect({ session }) {
  const [conn,       setConn]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [syncing,    setSyncing]    = useState(false)
  const [jobs,       setJobs]       = useState([])
  const [flash,      setFlash]      = useState(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef(null)

  const showFlash = (msg, type) => {
    setFlash({ msg, type: type || 'success' })
    setTimeout(() => setFlash(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [{ data: c }, { data: j }] = await Promise.all([
      supabase.from('linkedin_connections').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('scrape_jobs').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(10),
    ])
    setConn(c)
    setJobs(j || [])
    if (c && c.status === 'connected') setConnecting(false)
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // Poll wenn Verbindung ausstehend
  useEffect(() => {
    if (!connecting) { if (pollRef.current) clearInterval(pollRef.current); return }
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('linkedin_connections').select('*')
        .eq('user_id', session.user.id).maybeSingle()
      if (data && data.status === 'connected' && data.li_name) {
        setConn(data)
        setConnecting(false)
        clearInterval(pollRef.current)
        showFlash('Erfolgreich verbunden als ' + data.li_name + '!')
      }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [connecting, session])

  async function handleConnect() {
    setConnecting(true)
    // Status auf pending setzen — Extension erkennt das
    await supabase.from('linkedin_connections').upsert({
      user_id: session.user.id,
      status: 'pending',
      connected_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    // Scrape-Job als Trigger
    await supabase.from('scrape_jobs').insert({
      user_id: session.user.id,
      type: 'profile',
      status: 'pending',
      url: 'https://www.linkedin.com/feed/',
      params: { action: 'connect' },
      priority: 1,
    })
    // LinkedIn oeffnen
    window.open('https://www.linkedin.com/feed/', '_blank')
    showFlash('LinkedIn geoeffnet — Extension verbindet automatisch...', 'info')
  }

  async function handleDisconnect() {
    if (!confirm('LinkedIn-Verbindung wirklich trennen?')) return
    await supabase.from('linkedin_connections')
      .update({ status: 'disconnected', li_name: null, li_avatar_url: null })
      .eq('user_id', session.user.id)
    setConn(null)
    showFlash('Verbindung getrennt.')
  }

  async function handleSync(type, url) {
    if (!conn || conn.status !== 'connected') { showFlash('Zuerst LinkedIn verbinden', 'warn'); return }
    setSyncing(true)
    await supabase.from('scrape_jobs').insert({
      user_id: session.user.id, type, status: 'pending', url, params: {}
    })
    window.open(url, '_blank')
    setTimeout(() => { setSyncing(false); load() }, 4000)
  }

  const isConnected = conn?.status === 'connected'
  const isPending   = connecting || conn?.status === 'pending'

  return (
    <div style={{ maxWidth:900 }}>
      {flash && (
        <div style={{
          marginBottom:20, padding:'12px 18px', borderRadius:12, fontSize:13, fontWeight:600,
          background: flash.type==='warn'?'#FFFBEB':flash.type==='error'?'#FEF2F2':flash.type==='info'?'#EFF6FF':'#F0FDF4',
          color: flash.type==='warn'?'#92400E':flash.type==='error'?'#991B1B':flash.type==='info'?'#1E40AF':'#065F46',
          border: '1px solid '+(flash.type==='warn'?'#FDE68A':flash.type==='error'?'#FCA5A5':flash.type==='info'?'#BFDBFE':'#A7F3D0')
        }}>{flash.msg}</div>
      )}

      {/* Seitentitel */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:26, fontWeight:900, margin:0, letterSpacing:'-0.03em', color:'rgb(20,20,43)' }}>LinkedIn Account</h1>
      </div>

      {/* CARD 1: LinkedIn-Anmeldeinformationen (wie Waalaxy) */}
      <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
        {/* Card Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <IcLinkedIn/>
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)' }}>LinkedIn-Anmeldeinformationen</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Verwalte deine LinkedIn-Verbindung</div>
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding:'20px 24px' }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', gap:14, padding:'8px 0' }}>
              <div style={{ width:44, height:44, borderRadius:'50%', background:'#F3F4F6', flexShrink:0 }}/>
              <div style={{ height:14, background:'#F3F4F6', borderRadius:7, width:140 }}/>
            </div>
          ) : isConnected ? (
            /* Verbunden — Profilbild + Name + Connected Badge */
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                {conn.li_avatar_url ? (
                  <img src={conn.li_avatar_url} alt="" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', border:'2px solid #E5E7EB', flexShrink:0 }}/>
                ) : (
                  <div style={{ width:48, height:48, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:18, fontWeight:900, flexShrink:0 }}>
                    {(conn.li_name||'L').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'rgb(20,20,43)' }}>{conn.li_name}</div>
                  {conn.li_headline && <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{conn.li_headline}</div>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ padding:'5px 14px', borderRadius:20, background:'#ECFDF5', color:'#065F46', fontSize:12, fontWeight:700, border:'1px solid #A7F3D0' }}>
                  Connected
                </span>
                <button onClick={handleDisconnect}
                  style={{ padding:'6px 14px', borderRadius:9, border:'1px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  Trennen
                </button>
              </div>
            </div>
          ) : isPending ? (
            /* Verbindung läuft */
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:'linear-gradient(135deg,#F3F4F6,#E5E7EB)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#9CA3AF' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>Verbinde mit LinkedIn...</div>
                <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Extension wird Profil automatisch lesen</div>
              </div>
              <span style={{ marginLeft:'auto', padding:'5px 14px', borderRadius:20, background:'#FFFBEB', color:'#92400E', fontSize:12, fontWeight:700, border:'1px solid #FDE68A' }}>
                Warte...
              </span>
            </div>
          ) : (
            /* Nicht verbunden */
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>Kein LinkedIn-Konto verbunden</div>
                  <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Installiere die Extension und melde dich an</div>
                </div>
              </div>
              <button onClick={handleConnect}
                style={{ padding:'10px 20px', borderRadius:12, border:'none', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', color:'white', fontSize:13, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 12px rgba(49,90,231,0.3)', flexShrink:0 }}>
                Verbinden
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CARD 2: Cloud Automation Info (wie Waalaxy) */}
      <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#059669,#34D399)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <IcShield/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)' }}>Automatisch mit LinkedIn verbinden</div>
          </div>
          <a href="https://github.com/michaelschreckhausen-coder/llr-dashboard/tree/main/chrome-extension"
            target="_blank" rel="noreferrer"
            style={{ fontSize:13, color:P, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Extension herunterladen
          </a>
        </div>
        <div style={{ padding:'20px 24px' }}>
          <p style={{ fontSize:13, color:'#374151', lineHeight:1.7, marginBottom:12 }}>
            Lead Radar verbindet sich ueber eine Chrome Extension mit deinem LinkedIn-Konto. Nach der Installation laeuft alles automatisch — ohne dass LinkedIn geoeffnet bleiben muss.
          </p>
          <div style={{ background:'rgb(238,241,252)', borderRadius:12, padding:'14px 18px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:P, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.07em' }}>So funktioniert es</div>
            {[
              ['1', 'Extension herunterladen und in Chrome installieren (Entwicklermodus)'],
              ['2', 'Extension-Popup öffnen → E-Mail + Passwort eingeben → Anmelden'],
              ['3', 'LinkedIn wird automatisch verbunden — Profilbild erscheint sofort'],
              ['4', 'Dashboard zeigt Verbindungsstatus in Echtzeit'],
            ].map(([n, t]) => (
              <div key={n} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:P, color:'white', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>{n}</div>
                <div style={{ fontSize:13, color:'#374151', lineHeight:1.5 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CARD 3: Daten synchronisieren (nur wenn verbunden) */}
      {isConnected && (
        <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ padding:'20px 24px', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)' }}>Daten synchronisieren</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Importiere Verbindungen, Nachrichten und angenommene Anfragen</div>
          </div>
          <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { label:'Verbindungen', desc:'Alle LinkedIn-Kontakte importieren', color:'#10B981', bg:'#ECFDF5', border:'#A7F3D0', url:'https://www.linkedin.com/mynetwork/invite-connect/connections/', type:'connections' },
              { label:'Nachrichten', desc:'Konversationen archivieren', color:'#8B5CF6', bg:'#F5F3FF', border:'#DDD6FE', url:'https://www.linkedin.com/messaging/', type:'profile' },
              { label:'Angenommene Anfragen', desc:'Wer hat angenommen', color:'#F59E0B', bg:'#FFFBEB', border:'#FDE68A', url:'https://www.linkedin.com/mynetwork/invitation-manager/sent/', type:'connections' },
            ].map((item, i) => (
              <button key={i} onClick={() => handleSync(item.type, item.url)} disabled={syncing}
                style={{ padding:'16px', borderRadius:14, border:'1px solid '+item.border, background:item.bg, cursor:syncing?'wait':'pointer', textAlign:'left', transition:'all 0.15s' }}>
                <div style={{ fontSize:13, fontWeight:800, color:item.color, marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:11, color:'#6B7280' }}>{item.desc}</div>
              </button>
            ))}
          </div>

          {/* Job Queue */}
          {jobs.length > 0 && (
            <div style={{ borderTop:'1px solid #F3F4F6', padding:'16px 24px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Sync Queue</div>
              {jobs.slice(0,5).map(j => (
                <div key={j.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F9FAFB', fontSize:12 }}>
                  <span style={{ fontWeight:600, color:'rgb(20,20,43)' }}>{j.type}</span>
                  <span style={{ padding:'2px 8px', borderRadius:6, fontWeight:700, fontSize:11,
                    background:j.status==='done'?'#ECFDF5':j.status==='pending'?'rgba(49,90,231,0.08)':j.status==='error'?'#FEF2F2':'#FFFBEB',
                    color:j.status==='done'?'#065F46':j.status==='pending'?P:j.status==='error'?'#DC2626':'#92400E' }}>
                    {j.status}
                  </span>
                  <span style={{ color:'#9CA3AF' }}>{new Date(j.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
