import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TYPE_CFG = {
  feature: { label:'✨ Feature',  bg:'#EFF6FF', color:'#1d4ed8', border:'#BFDBFE' },
  update:  { label:'🔄 Update',   bg:'#F0FDF4', color:'#15803d', border:'#BBF7D0' },
  bugfix:  { label:'🐛 Bugfix',   bg:'#FEF2F2', color:'#dc2626', border:'#FECACA' },
  hotfix:  { label:'🚨 Hotfix',   bg:'#FFF7ED', color:'#c2410c', border:'#FED7AA' },
}

const AREA_COLORS = {
  'Pipeline':       '#8b5cf6',
  'Reports':        '#0891b2',
  'Interessenten':  '#059669',
  'Dashboard':      '#3b82f6',
  'Lead-Profil':    '#f59e0b',
  'Lead Intelligence': '#ec4899',
  'Vernetzungen':   '#14b8a6',
  'Datenbank':      '#6366f1',
  'Layout':         '#64748b',
  'Header':         '#64748b',
  'Listen':         '#84cc16',
}

export default function AdminLogs() {
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState({ type:'feature', title:'', description:'', version:'', affected:'', commit_sha:'', is_breaking:false })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('changelog')
      .select('*')
      .order('created_at', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = logs.filter(l => {
    if (filter !== 'all' && l.type !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return l.title?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q) || l.affected?.some(a => a.toLowerCase().includes(q))
    }
    return true
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      affected: form.affected ? form.affected.split(',').map(s => s.trim()).filter(Boolean) : [],
      commit_sha: form.commit_sha || null,
      version: form.version || null,
    }
    delete payload.affected  // wird separat gesetzt
    const { error } = await supabase.from('changelog').insert({
      type: form.type,
      title: form.title,
      description: form.description || null,
      version: form.version || null,
      author: 'Admin',
      affected: form.affected ? form.affected.split(',').map(s => s.trim()).filter(Boolean) : [],
      commit_sha: form.commit_sha || null,
      is_breaking: form.is_breaking,
    })
    setSaving(false)
    if (!error) {
      setShowForm(false)
      setForm({ type:'feature', title:'', description:'', version:'', affected:'', commit_sha:'', is_breaking:false })
      load()
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Eintrag löschen?')) return
    await supabase.from('changelog').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const counts = logs.reduce((acc, l) => { acc[l.type] = (acc[l.type]||0)+1; return acc }, {})

  return (
    <div style={{ maxWidth:900, margin:'0 auto', paddingBottom:60 }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e3a8a,#3b82f6)', borderRadius:20, padding:'24px 28px', marginBottom:24, color:'#fff' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>ADMIN · SYSTEM</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:4 }}>📋 Changelog & Logs</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>
          Alle Updates, Features und Bug-Fixes — sichtbar für alle Admins
        </div>
        {/* Stats */}
        <div style={{ display:'flex', gap:12, marginTop:16, flexWrap:'wrap' }}>
          {[
            { label:'Gesamt',   val:logs.length,              color:'#fff' },
            { label:'Features', val:counts.feature||0,        color:'#93c5fd' },
            { label:'Bugfixes', val:counts.bugfix||0,         color:'#fca5a5' },
            { label:'Updates',  val:(counts.update||0)+(counts.hotfix||0), color:'#86efac' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background:'rgba(255,255,255,0.12)', borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color }}>{val}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{label}</div>
            </div>
          ))}
          <button onClick={() => setShowForm(true)}
            style={{ marginLeft:'auto', padding:'10px 20px', borderRadius:10, border:'none', background:'rgba(255,255,255,0.2)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', alignSelf:'center' }}>
            + Eintrag hinzufügen
          </button>
        </div>
      </div>

      {/* Filter + Suche */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Suche in Changelog…"
          style={{ flex:1, minWidth:200, padding:'9px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', fontFamily:'inherit' }}/>
        {['all','feature','bugfix','update','hotfix'].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid '+(filter===t?'#3b82f6':'#E2E8F0'), background:filter===t?'#EFF6FF':'#fff', color:filter===t?'#1d4ed8':'#64748B', fontSize:12, fontWeight:filter===t?700:400, cursor:'pointer' }}>
            {t === 'all' ? `Alle (${logs.length})` : t === 'feature' ? `✨ Features (${counts.feature||0})` : t === 'bugfix' ? `🐛 Bugfixes (${counts.bugfix||0})` : t === 'update' ? `🔄 Updates` : '🚨 Hotfixes'}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ background:'#fff', borderRadius:16, border:'1.5px solid #E2E8F0', padding:'20px 24px', marginBottom:20, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:16, color:'#0F172A' }}>Neuer Changelog-Eintrag</div>
          <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>TYP *</label>
                <select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit' }}>
                  <option value="feature">✨ Feature</option>
                  <option value="bugfix">🐛 Bugfix</option>
                  <option value="update">🔄 Update</option>
                  <option value="hotfix">🚨 Hotfix</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>VERSION</label>
                <input value={form.version} onChange={e => setForm(f=>({...f,version:e.target.value}))}
                  placeholder="v1.5.1" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>COMMIT SHA</label>
                <input value={form.commit_sha} onChange={e => setForm(f=>({...f,commit_sha:e.target.value}))}
                  placeholder="abc1234" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', boxSizing:'border-box' }}/>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>TITEL *</label>
              <input value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} required
                placeholder="z.B. Pipeline: Drag & Drop Kanban" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', boxSizing:'border-box' }}/>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>BESCHREIBUNG</label>
              <textarea value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} rows={3}
                placeholder="Detaillierte Beschreibung des Updates…"
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'end' }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>BEREICHE (kommagetrennt)</label>
                <input value={form.affected} onChange={e => setForm(f=>({...f,affected:e.target.value}))}
                  placeholder="Pipeline, Reports, Dashboard" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', boxSizing:'border-box' }}/>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#374151', cursor:'pointer', paddingBottom:2 }}>
                <input type="checkbox" checked={form.is_breaking} onChange={e => setForm(f=>({...f,is_breaking:e.target.checked}))}/>
                Breaking Change
              </label>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
              <button type="button" onClick={() => setShowForm(false)}
                style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button type="submit" disabled={saving}
                style={{ padding:'8px 24px', borderRadius:8, border:'none', background:saving?'#94A3B8':'#3b82f6', color:'#fff', fontSize:13, fontWeight:700, cursor:saving?'default':'pointer' }}>
                {saving ? 'Speichern…' : '✓ Speichern'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Log Entries */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#94A3B8' }}>Lädt…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:'#94A3B8', fontSize:13 }}>Keine Einträge gefunden</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map((log, idx) => {
            const cfg = TYPE_CFG[log.type] || TYPE_CFG.update
            const isFirst = idx === 0 || filtered[idx-1]?.created_at?.substring(0,10) !== log.created_at?.substring(0,10)
            const dateStr = new Date(log.created_at).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
            const isFirstVersion = log.version && (idx === 0 || filtered[idx-1]?.version !== log.version)
            const versionCount = log.version ? filtered.filter(l => l.version === log.version).length : 0
            return (
              <React.Fragment key={log.id}>
                {isFirstVersion && log.version && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'12px 0 4px', padding:'10px 16px', background:'linear-gradient(135deg,#1e3a8a18,#3b82f618)', borderRadius:12, border:'1px solid #3b82f630' }}>
                    <span style={{ fontSize:16, fontWeight:900, color:'#1e3a8a' }}>v{log.version}</span>
                    <span style={{ fontSize:12, color:'#64748B', fontWeight:600 }}>{versionCount} {versionCount===1?'Eintrag':'Einträge'}</span>
                    <div style={{ flex:1, height:1, background:'#3b82f620' }}/>
                    <span style={{ fontSize:11, color:'#3b82f6', fontWeight:700, background:'#EFF6FF', padding:'2px 8px', borderRadius:6 }}>
                      {filtered.filter(l=>l.version===log.version&&l.type==='feature').length} Features · {filtered.filter(l=>l.version===log.version&&l.type==='fix').length} Fixes
                    </span>
                  </div>
                )}
                {isFirst && (
                  <div style={{ display:'flex', alignItems:'center', gap:12, margin:'8px 0 4px' }}>
                    <div style={{ height:1, background:'#E5E7EB', flex:1 }}/>
                    <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{dateStr}</span>
                    <div style={{ height:1, background:'#E5E7EB', flex:1 }}/>
                  </div>
                )}
                <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', transition:'box-shadow 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)'}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                    {/* Type Badge */}
                    <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, border:'1px solid '+cfg.border, flexShrink:0, whiteSpace:'nowrap', marginTop:2 }}>
                      {cfg.label}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:14, fontWeight:800, color:'#0F172A' }}>{log.title}</span>
                        {log.is_breaking && (
                          <span style={{ padding:'1px 8px', borderRadius:99, fontSize:10, fontWeight:800, background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA' }}>BREAKING</span>
                        )}
                        {log.version && (
                          <span style={{ padding:'1px 8px', borderRadius:99, fontSize:10, fontWeight:700, background:'#F8FAFC', color:'#64748B', border:'1px solid #E2E8F0' }}>{log.version}</span>
                        )}
                      </div>
                      {log.description && (
                        <div style={{ fontSize:13, color:'#475569', lineHeight:1.6, marginBottom:8 }}>{log.description}</div>
                      )}
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                        {(log.affected||[]).map(area => (
                          <span key={area} style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background:(AREA_COLORS[area]||'#64748B')+'18', color:AREA_COLORS[area]||'#64748B', border:'1px solid '+(AREA_COLORS[area]||'#64748B')+'30' }}>
                            {area}
                          </span>
                        ))}
                        {log.commit_sha && (
                          <a href={`https://github.com/michaelschreckhausen-coder/llr-dashboard/commit/${log.commit_sha}`}
                            target="_blank" rel="noreferrer"
                            style={{ fontSize:11, color:'#94A3B8', fontFamily:'monospace', textDecoration:'none' }}
                            onMouseEnter={e => e.currentTarget.style.color='#3b82f6'}
                            onMouseLeave={e => e.currentTarget.style.color='#94A3B8'}>
                            #{log.commit_sha.substring(0,7)}
                          </a>
                        )}
                        <span style={{ fontSize:11, color:'#CBD5E1', marginLeft:'auto' }}>
                          {new Date(log.created_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })} · {log.author||'System'}
                        </span>
                        <button onClick={() => handleDelete(log.id)}
                          title="Löschen"
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:14, padding:'0 2px', lineHeight:1 }}
                          onMouseEnter={e => e.currentTarget.style.color='#EF4444'}
                          onMouseLeave={e => e.currentTarget.style.color='#CBD5E1'}>
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
