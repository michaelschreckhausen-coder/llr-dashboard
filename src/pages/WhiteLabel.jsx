import React, { useEffect, useState } from 'react'
import { loadWhiteLabelSettings, saveWhiteLabelSettings, DEFAULT_WL } from '../lib/whitelabel'

export default function WhiteLabel() {
  const [wl, setWl] = useState(DEFAULT_WL)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWhiteLabelSettings().then(data => { setWl(data); setLoading(false) })
  }, [])

  const s = k => v => setWl(f => ({...f, [k]: v}))

  async function handleSave() {
    setSaving(true)
    try {
      await saveWhiteLabelSettings(wl)
      setSaved(true)
      setTimeout(() => { setSaved(false); window.location.reload() }, 1500)
    } catch(e) { alert('Fehler: ' + e.message) }
    setSaving(false)
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff', boxSizing:'border-box' }
  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'#94A3B8', gap:10, fontSize:14 }}>
      ⏳ Lade WhiteLabel-Einstellungen…
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, maxWidth:760 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.025em', marginBottom:4 }}>WhiteLabel</h1>
        <div style={{ fontSize:14, color:'#64748B' }}>Passe App-Name, Logo und Farben für deine Kunden an</div>
      </div>

      {/* Live-Vorschau */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'20px 24px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:14, display:'flex', alignItems:'center', gap:7 }}>
          <span>👁</span> Live-Vorschau
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px', background:wl.sidebar_bg||'#FFFFFF', borderRadius:10, border:'1px solid #E2E8F0', width:'fit-content' }}>
          {wl.logo_url
            ? <img src={wl.logo_url} alt="Logo" style={{ width:40, height:40, borderRadius:8, objectFit:'contain', flexShrink:0 }} onError={e => { e.target.style.display='none' }}/>
            : <div style={{ width:40, height:40, borderRadius:8, background:'linear-gradient(135deg,'+(wl.primary_color||'#0A66C2')+','+(wl.primary_color||'#0A66C2')+'88)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </div>
          }
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:wl.primary_color||'#0A66C2', letterSpacing:'-0.02em', lineHeight:1.2 }}>{wl.app_name||'Lead Radar'}</div>
            <div style={{ fontSize:10, color:'#94A3B8', fontWeight:500, marginTop:2 }}>Sales Intelligence</div>
          </div>
          <div style={{ marginLeft:20, display:'flex', gap:8, alignItems:'center' }}>
            {[
              [wl.primary_color||'#0A66C2', 'Primär'],
              [wl.secondary_color||'#10B981', 'Sekundär'],
              [wl.accent_color||'#8B5CF6', 'Akzent'],
            ].map(([c, label]) => (
              <div key={label} style={{ textAlign:'center' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:c, margin:'0 auto 4px', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                <div style={{ fontSize:9, color:'#94A3B8', fontWeight:600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* App-Name & Logo */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'20px 24px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:16, display:'flex', alignItems:'center', gap:7 }}>
          <span>🏷</span> App-Name & Logo
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={lbl}>App-Name</label>
            <input value={wl.app_name||''} onChange={e => s('app_name')(e.target.value)} style={inp} placeholder="Lead Radar"/>
          </div>
          <div>
            <label style={lbl}>Logo-URL <span style={{ fontWeight:400, color:'#94A3B8', textTransform:'none', letterSpacing:0 }}>(PNG/SVG empfohlen, mind. 200×200px)</span></label>
            <input value={wl.logo_url||''} onChange={e => s('logo_url')(e.target.value)} style={inp} placeholder="https://meine-firma.de/logo.png"/>
            {wl.logo_url && (
              <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
                <img src={wl.logo_url} alt="Vorschau" style={{ height:48, maxWidth:140, objectFit:'contain', borderRadius:8, border:'1px solid #E2E8F0', padding:6 }} onError={e => { e.target.style.display='none' }}/>
                <button onClick={() => s('logo_url')('')} style={{ fontSize:12, color:'#EF4444', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>✕ Logo entfernen</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Farben */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'20px 24px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:16, display:'flex', alignItems:'center', gap:7 }}>
          <span>🎨</span> Farben
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {[
            ['primary_color',   'Primärfarbe',        'NavLinks, Buttons, aktive Elemente', '#0A66C2'],
            ['secondary_color', 'Sekundärfarbe',       'Erfolg-Badges, KPIs',               '#10B981'],
            ['accent_color',    'Akzentfarbe',         'KI-Features, Brand Voice',           '#8B5CF6'],
            ['sidebar_bg',      'Sidebar-Hintergrund', 'Hintergrund der Navigation',         '#FFFFFF'],
          ].map(([key, label, desc, def]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <div style={{ fontSize:11, color:'#94A3B8', marginBottom:8 }}>{desc}</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input
                  type="color"
                  value={wl[key]||def}
                  onChange={e => s(key)(e.target.value)}
                  style={{ width:46, height:46, borderRadius:9, border:'1.5px solid #E2E8F0', cursor:'pointer', padding:3, background:'#fff', flexShrink:0 }}
                />
                <input
                  value={wl[key]||def}
                  onChange={e => s(key)(e.target.value)}
                  style={{ ...inp, width:120, fontFamily:'monospace', fontSize:13, flex:'none' }}
                  placeholder={def}
                  maxLength={7}
                />
                <button
                  onClick={() => s(key)(def)}
                  title="Zurücksetzen"
                  style={{ fontSize:16, color:'#CBD5E1', background:'none', border:'none', cursor:'pointer', padding:'0 4px', flexShrink:0 }}
                >↩</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Speichern */}
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:14, paddingBottom:8 }}>
        {saved && (
          <span style={{ color:'#065F46', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
            ✅ Gespeichert! Seite lädt neu…
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding:'11px 32px', borderRadius:999, border:'none', background:'linear-gradient(135deg,#0A66C2,#0077B5)', color:'#fff', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1, display:'flex', alignItems:'center', gap:9, boxShadow:'0 2px 10px rgba(10,102,194,0.3)' }}
        >
          {saving ? '⏳ Speichere…' : '💾 WhiteLabel speichern'}
        </button>
      </div>

    </div>
  )
}
