import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadSettingsByTenantId, saveWhiteLabelSettings, DEFAULT_WL, applyTheme } from '../lib/whitelabel'
import { useTenant } from '../context/TenantContext'

export default function WhiteLabel() {
  const { subdomain, reloadTheme, setWl: setContextWl } = useTenant()
  const [tenants, setTenants]   = useState([])
  const [selTenant, setSelTenant] = useState(null)
  const [wl, setWl]             = useState(DEFAULT_WL)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadTenants() }, [])

  async function loadTenants() {
    setLoading(true)
    const { data } = await supabase.from('tenants').select('*').order('created_at')
    setTenants(data || [])
    if (data?.length) selectTenant(data[0])
    setLoading(false)
  }

  async function selectTenant(t) {
    setSelTenant(t)
    setWl(DEFAULT_WL)   // Reset während Laden
    const settings = await loadSettingsByTenantId(t.id)
    setWl({ ...DEFAULT_WL, ...settings })
  }

  const s = k => v => setWl(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!selTenant) return
    setSaving(true)
    try {
      await saveWhiteLabelSettings(wl, selTenant.id)
      applyTheme(wl)
      // Wenn der aktive Tenant gespeichert wurde: Context sofort aktualisieren
      if (setContextWl) setContextWl(wl)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch(e) { alert('Fehler: ' + e.message) }
    setSaving(false)
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, outline:'none', background:'var(--surface)', boxSizing:'border-box' }
  const lbl = { display:'block', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
  const card = { background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)', padding:'18px 22px', marginBottom:16 }

  if (loading) return <div style={{ padding:48, textAlign:'center', color:'var(--text-muted)' }}>Lade…</div>

  return (
    <div style={{ maxWidth:780, display:'flex', flexDirection:'column', gap:0 }}>

      {/* Tenant auswählen */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:14 }}>🏢 Tenant auswählen</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {tenants.map(t => (
            <button key={t.id} onClick={() => selectTenant(t)}
              style={{ padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
                background: selTenant?.id === t.id ? 'var(--wl-primary, rgb(49,90,231))' : '#F8FAFC',
                color:      selTenant?.id === t.id ? '#fff' : '#475569',
                border:     selTenant?.id === t.id ? 'none' : '1px solid #E5E7EB',
              }}>
              {t.name}
              <span style={{ marginLeft:6, fontSize:10, opacity:0.7 }}>({t.subdomain || t.custom_domain || '?'})</span>
            </button>
          ))}
        </div>
        {selTenant && (
          <div style={{ marginTop:12, fontSize:12, color:'var(--text-muted)', display:'flex', gap:20 }}>
            <span>Plan: <strong>{selTenant.plan}</strong></span>
            <span>Max. Leads: <strong>{selTenant.max_leads}</strong></span>
            <span>Max. User: <strong>{selTenant.max_users}</strong></span>
            <span style={{ color: selTenant.is_active ? '#059669' : '#dc2626' }}>
              {selTenant.is_active ? '✓ Aktiv' : '✗ Inaktiv'}
            </span>
          </div>
        )}
      </div>

      {/* Live-Vorschau */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:14 }}>👁 Live-Vorschau</div>
        <div style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 18px', background:wl.sidebar_bg||'#fff', borderRadius:10, border:'1px solid var(--border)', width:'fit-content' }}>
          {wl.logo_url
            ? <img src={wl.logo_url} alt="Logo" style={{ height:36, maxWidth:120, objectFit:'contain', borderRadius:6 }} onError={e=>e.target.style.display='none'}/>
            : <div style={{ width:36, height:36, borderRadius:8, background:wl.primary_color||'var(--wl-primary, rgb(49,90,231))', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </div>
          }
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:wl.primary_color||'var(--wl-primary, rgb(49,90,231))', letterSpacing:'-0.01em' }}>{wl.app_name||'Leadesk'}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>Sales Intelligence</div>
          </div>
          <div style={{ display:'flex', gap:8, marginLeft:16 }}>
            {[[wl.primary_color,'Primär'],[wl.secondary_color,'Sekundär'],[wl.accent_color,'Akzent']].map(([c,l]) => (
              <div key={l} style={{ textAlign:'center' }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:c, margin:'0 auto 3px' }}/>
                <div style={{ fontSize:9, color:'var(--text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* App-Name & Logo */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:14 }}>🏷 App-Name & Assets</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <label style={lbl}>App-Name</label>
            <input value={wl.app_name||''} onChange={e=>s('app_name')(e.target.value)} style={inp} placeholder="Leadesk"/>
          </div>
          <div>
            <label style={lbl}>Schriftart</label>
            <select value={wl.font_family||'Inter'} onChange={e=>s('font_family')(e.target.value)} style={inp}>
              {['Inter','Roboto','Poppins','DM Sans','Outfit','Nunito','Manrope'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Logo-URL (PNG/SVG)</label>
            <input value={wl.logo_url||''} onChange={e=>s('logo_url')(e.target.value)} style={inp} placeholder="https://firma.de/logo.png"/>
          </div>
          <div>
            <label style={lbl}>Favicon-URL</label>
            <input value={wl.favicon_url||''} onChange={e=>s('favicon_url')(e.target.value)} style={inp} placeholder="https://firma.de/favicon.ico"/>
          </div>
        </div>
      </div>

      {/* Farben */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:14 }}>🎨 Farben</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {[
            ['primary_color',   'Primärfarbe',        'Buttons, NavLinks, aktive Elemente', 'var(--wl-primary, rgb(49,90,231))'],
            ['secondary_color', 'Sekundärfarbe',       'Erfolg-Badges, KPIs',               '#10B981'],
            ['accent_color',    'Akzentfarbe',         'KI-Features, Highlights',            '#8B5CF6'],
            ['sidebar_bg',      'Sidebar-Hintergrund', 'Hintergrund der Navigation',         '#FFFFFF'],
          ].map(([key, label, desc, def]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6 }}>{desc}</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="color" value={wl[key]||def} onChange={e=>s(key)(e.target.value)}
                  style={{ width:40, height:40, borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', padding:2, background:'var(--surface)', flexShrink:0 }}/>
                <input value={wl[key]||def} onChange={e=>s(key)(e.target.value)}
                  style={{ ...inp, width:110, fontFamily:'monospace', fontSize:12, flex:'none' }} maxLength={25}/>
                <button onClick={()=>s(key)(def)} style={{ fontSize:14, color:'#CBD5E1', background:'none', border:'none', cursor:'pointer' }}>↩</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Erweitert */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:14 }}>⚙ Erweitert</div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13 }}>
            <input type="checkbox" checked={wl.hide_branding||false} onChange={e=>s('hide_branding')(e.target.checked)}
              style={{ width:16, height:16, accentColor:'var(--wl-primary, rgb(49,90,231))', cursor:'pointer' }}/>
            <span style={{ color:'var(--text-strong)' }}>"Powered by Leadesk" ausblenden</span>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>(Enterprise-Plan)</span>
          </label>
          <div>
            <label style={lbl}>Custom CSS <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(wird in &lt;head&gt; injiziert)</span></label>
            <textarea value={wl.custom_css||''} onChange={e=>s('custom_css')(e.target.value)} rows={4}
              placeholder=".sidebar { border-right: 2px solid var(--wl-primary); }"
              style={{ ...inp, resize:'vertical', lineHeight:1.5, fontFamily:'monospace', fontSize:12 }}/>
          </div>
        </div>
      </div>

      {/* Subdomain-Info */}
      {selTenant && (
        <div style={{ ...card, background:'var(--surface-muted)', border:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:10 }}>🌐 Subdomain-Konfiguration</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.8 }}>
            <div>Subdomain: <code style={{ background:'#EEF2FF', color:'var(--wl-primary, rgb(49,90,231))', padding:'2px 6px', borderRadius:4 }}>
              {selTenant.subdomain ? `${selTenant.subdomain}.leadesk.de` : '(nicht gesetzt)'}
            </code></div>
            {selTenant.custom_domain && (
              <div>Custom Domain: <code style={{ background:'#F0FDF4', color:'#059669', padding:'2px 6px', borderRadius:4 }}>{selTenant.custom_domain}</code></div>
            )}
            <div style={{ marginTop:8, fontSize:11, color:'var(--text-muted)' }}>
              DNS: CNAME {selTenant.custom_domain || '—'} → cname.vercel-dns.com
            </div>
          </div>
        </div>
      )}

      {/* Speichern */}
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:14, paddingBottom:16 }}>
        {saved && <span style={{ color:'#059669', fontSize:13, fontWeight:600 }}>✅ Gespeichert!</span>}
        <button onClick={handleSave} disabled={saving||!selTenant}
          style={{ padding:'10px 28px', borderRadius:999, border:'none', background:selTenant?'var(--wl-primary, rgb(49,90,231))':'#E5E7EB', color:'#fff', fontSize:13, fontWeight:700, cursor:selTenant?'pointer':'default', opacity:saving?0.6:1 }}>
          {saving ? '⏳ Speichere…' : '💾 WhiteLabel speichern'}
        </button>
      </div>
    </div>
  )
}
