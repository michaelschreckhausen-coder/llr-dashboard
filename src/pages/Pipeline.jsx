import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PIPELINE_KEY = 'llr_pipeline_cols'

const DEFAULT_COLS = [
  { id:'Lead', label:'Lead', color:'#475569', bg:'rgb(238,241,252)', border:'#CBD5E1', icon:'', desc:'Noch nicht qualifiziert' },
  { id:'LQL',  label:'LQL',  color:'rgb(49,90,231)', bg:'rgba(49,90,231,0.08)', border:'rgba(49,90,231,0.2)', icon:'', desc:'LinkedIn Qualified Lead' },
  { id:'MQN',  label:'MQN',  color:'#6D28D9', bg:'#F5F3FF', border:'#DDD6FE', icon:'', desc:'Marketing Qualified Network' },
  { id:'MQL',  label:'MQL',  color:'#B45309', bg:'#FFFBEB', border:'#FDE68A', icon:'', desc:'Marketing Qualified Lead' },
  { id:'SQL',  label:'SQL',  color:'#15803D', bg:'#F0FDF4', border:'#BBF7D0', icon:'', desc:'Sales Qualified Lead' },
]

function loadCols() {
  try {
    const s = JSON.parse(localStorage.getItem(PIPELINE_KEY) || 'null')
    if (!s) return DEFAULT_COLS
    return DEFAULT_COLS.map(d => { const o = s.find(p => p.id === d.id); return o ? { ...d, ...o } : d })
  } catch { return DEFAULT_COLS }
}
function saveCols(cols) { localStorage.setItem(PIPELINE_KEY, JSON.stringify(cols)) }

// ─── LeadCard ───────────────────────────────────────────────────────────────
function LeadCard({ lead, col, cols, onMove, onOpen }) {
  const [showMove, setShowMove] = useState(false)
  const otherCols = (cols || []).filter(c => c.id !== col.id)

  return (
    <div
      onClick={() => onOpen(lead)}
      style={{ background:'white', borderRadius:14, border:'1px solid #E5E7EB', padding:'12px 14px', cursor:'pointer', transition:'box-shadow 0.15s', position:'relative' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(15,23,42,0.10)'}
      onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; setShowMove(false) }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        {lead.profile_image_url
          ? <img src={lead.profile_image_url} alt="" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
          : <div style={{ width:34, height:34, borderRadius:'50%', background:col.color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:13, flexShrink:0 }}>
              {(lead.name||'?').charAt(0).toUpperCase()}
            </div>
        }
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lead.name||'Unbekannt'}</div>
          <div style={{ fontSize:11, color:'#64748B', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lead.headline||lead.position||''}</div>
        </div>
      </div>
      {lead.company && <div style={{ fontSize:11, fontWeight:600, color:col.color, marginBottom:4 }}>{lead.company}</div>}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
        {lead.linkedin_url && (
          <a href={lead.linkedin_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
            style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, color:'rgb(49,90,231)', background:'rgba(49,90,231,0.08)', padding:'2px 7px', borderRadius:5, textDecoration:'none', fontWeight:600 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            LinkedIn
          </a>
        )}
        {lead.email && (
          <a href={'mailto:'+lead.email} onClick={e=>e.stopPropagation()}
            style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, color:'#B45309', background:'#FFFBEB', padding:'2px 7px', borderRadius:5, textDecoration:'none', fontWeight:600 }}>
            E-Mail
          </a>
        )}
        {lead.location && <span style={{ fontSize:10, color:'#94A3B8' }}>{lead.location}</span>}
      </div>
      {otherCols.length > 0 && (
        <div style={{ marginTop:8, display:'flex', gap:4, flexWrap:'wrap' }} onClick={e=>e.stopPropagation()}>
          {otherCols.map(target => (
            <button key={target.id} onClick={() => onMove(lead, target.id)}
              style={{ fontSize:10, padding:'3px 9px', borderRadius:7, border:'1px solid '+target.border, background:target.bg, color:target.color, cursor:'pointer', fontWeight:700, letterSpacing:'0.02em' }}>
              {'→'} {target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Column ──────────────────────────────────────────────────────────────────
function Column({ col, cols, leads, onMove, onOpen, onEdit, dragOver, onDragOver, onDrop }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
      onDrop={e => { e.preventDefault(); onDrop(col.id) }}
      style={{ minWidth:260, width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:0 }}
    >
      <div style={{ background:col.bg, border:'1px solid '+col.border, borderRadius:16, padding:'12px 14px', marginBottom:8, boxShadow: dragOver ? '0 0 0 2px '+col.color : 'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {col.icon && <span style={{ fontSize:16 }}>{col.icon}</span>}
            <span style={{ fontWeight:800, fontSize:15, color:col.color }}>{col.label}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, fontWeight:800, padding:'2px 10px', borderRadius:999, background:col.bg, color:col.color, border:'1px solid '+col.border }}>{leads.length}</span>
            <button onClick={() => onEdit(col)} title="Phase anpassen"
              style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:3, borderRadius:6, display:'flex', alignItems:'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>
        <div style={{ fontSize:11, color:col.color, opacity:0.75 }}>{col.desc}</div>
        {leads.filter(l => l.company).length > 0 && (
          <div style={{ fontSize:10, color:'#94A3B8', marginTop:4 }}>
            {leads.filter(l => l.company).length} Unternehmen
          </div>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} col={col} cols={cols} onMove={onMove} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

// ─── EditColModal ────────────────────────────────────────────────────────────
function EditColModal({ col, onSave, onClose, onReset }) {
  const COLORS = [
    { color:'#475569', bg:'rgb(238,241,252)', border:'#CBD5E1', name:'Grau' },
    { color:'rgb(49,90,231)', bg:'rgba(49,90,231,0.08)', border:'rgba(49,90,231,0.2)', name:'Blau' },
    { color:'#6D28D9', bg:'#F5F3FF', border:'#DDD6FE', name:'Lila' },
    { color:'#B45309', bg:'#FFFBEB', border:'#FDE68A', name:'Gelb' },
    { color:'#15803D', bg:'#F0FDF4', border:'#BBF7D0', name:'Gruen' },
    { color:'#B91C1C', bg:'#FEF2F2', border:'#FECACA', name:'Rot' },
    { color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC', name:'Cyan' },
    { color:'#9D174D', bg:'#FDF2F8', border:'#FBCFE8', name:'Pink' },
  ]
  const [lbl, setLbl] = useState(col.label)
  const [dsc, setDsc] = useState(col.desc)
  const [clr, setClr] = useState(COLORS.find(o => o.color === col.color) || COLORS[0])
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'Inter,sans-serif' }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:420, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(15,23,42,0.18)', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Phase anpassen</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:18, lineHeight:1, padding:4 }}>x</button>
        </div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Name</label>
            <input value={lbl} onChange={e => setLbl(e.target.value)} style={inp} placeholder="Phase benennen..." maxLength={20}/>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Beschreibung</label>
            <input value={dsc} onChange={e => setDsc(e.target.value)} style={inp} placeholder="Kurze Beschreibung..." maxLength={50}/>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Farbe</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {COLORS.map(o => (
                <button key={o.color} onClick={() => setClr(o)} title={o.name}
                  style={{ width:30, height:30, borderRadius:8, background:o.bg, border:'2px solid '+(clr.color===o.color?o.color:o.border), cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ width:14, height:14, borderRadius:4, background:o.color }}/>
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:'rgb(238,241,252)', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, border:'1px solid #E2E8F0' }}>
            <div style={{ fontWeight:800, fontSize:14, color:clr.color, background:clr.bg, padding:'4px 10px', borderRadius:6 }}>{lbl||'Name'}</div>
            <span style={{ fontSize:11, color:'#94A3B8' }}>{dsc||'Beschreibung'}</span>
          </div>
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={onReset} style={{ fontSize:11, color:'#94A3B8', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Alle zuruecksetzen</button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={() => onSave({ id:col.id, label:lbl.trim()||col.label, desc:dsc.trim(), ...clr })}
              style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,rgb(49,90,231),rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── LeadModal ───────────────────────────────────────────────────────────────
function LeadModal({ lead, cols, onClose, onMove }) {
  const col = (cols || []).find(c => c.id === lead.status) || (cols||[])[0] || {}
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:520, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(15,23,42,0.18)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'#fff' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {lead.profile_image_url
              ? <img src={lead.profile_image_url} alt="" style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover' }}/>
              : <div style={{ width:40, height:40, borderRadius:'50%', background:col.color||'#475569', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:16 }}>{(lead.name||'?').charAt(0)}</div>
            }
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:'rgb(20,20,43)' }}>{lead.name}</div>
              <div style={{ fontSize:12, color:'#64748B' }}>{lead.headline||lead.position}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:20, lineHeight:1, padding:4 }}>x</button>
        </div>
        <div style={{ padding:'20px' }}>
          {lead.company && <div style={{ marginBottom:12 }}><span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>Unternehmen</span><div style={{ fontSize:14, color:'rgb(20,20,43)', fontWeight:600, marginTop:2 }}>{lead.company}</div></div>}
          {lead.email && <div style={{ marginBottom:12 }}><span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>E-Mail</span><div style={{ marginTop:2 }}><a href={'mailto:'+lead.email} style={{ fontSize:14, color:'rgb(49,90,231)' }}>{lead.email}</a></div></div>}
          {lead.location && <div style={{ marginBottom:12 }}><span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>Ort</span><div style={{ fontSize:14, color:'rgb(20,20,43)', marginTop:2 }}>{lead.location}</div></div>}
          {lead.linkedin_url && <div style={{ marginBottom:16 }}><a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:13, color:'rgb(49,90,231)', fontWeight:600, textDecoration:'none', padding:'6px 14px', background:'rgba(49,90,231,0.08)', borderRadius:8 }}>LinkedIn Profil ansehen</a></div>}
          <div>
            <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>Phase verschieben</span>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
              {(cols||[]).map(c => (
                <button key={c.id} onClick={() => { onMove(lead, c.id); onClose() }}
                  style={{ padding:'6px 14px', borderRadius:8, border:'1px solid '+c.border, background:c.id===lead.status?c.color:c.bg, color:c.id===lead.status?'#fff':c.color, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Pipeline (Main) ─────────────────────────────────────────────────────────
export default function Pipeline({ session }) {
  const [leads,     setLeads]    = useState([])
  const [loading,   setLoading]  = useState(true)
  const [cols,      setCols]     = useState(() => loadCols())
  const [editCol,   setEditCol]  = useState(null)
  const [openLead,  setOpenLead] = useState(null)
  const [search,    setSearch]   = useState('')
  const [dragOver,  setDragOver] = useState(null)
  const dragId = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending:false })
    setLeads(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  async function handleMove(lead, newStatus) {
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l))
    await supabase.from('crm_leads').update({ status: newStatus }).eq('id', lead.id)
  }

  function handleSaveCol(updated) {
    const next = cols.map(c => c.id === updated.id ? { ...c, ...updated } : c)
    setCols(next)
    saveCols(next)
    setEditCol(null)
  }

  function handleResetCols() {
    localStorage.removeItem(PIPELINE_KEY)
    setCols(DEFAULT_COLS)
    setEditCol(null)
  }

  const filtered = leads.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (l.name||'').toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q) || (l.headline||'').toLowerCase().includes(q)
  })

  const total = leads.length
  const converted = leads.filter(l => l.status === 'SQL').length
  const rate = total > 0 ? Math.round((converted/total)*100) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', padding:'16px 22px', marginBottom:16, display:'flex', alignItems:'center', gap:20, flexWrap:'wrap', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>

        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {[['Gesamt', total, 'rgb(20,20,43)'], ['Konvertiert', converted, '#15803D'], ['Konversionsrate', rate+'%', 'rgb(49,90,231)']].map(([lbl,val,clr]) => (
            <div key={lbl} style={{ textAlign:'center', padding:'6px 16px', background:'rgb(238,241,252)', borderRadius:10, border:'1px solid #E2E8F0' }}>
              <div style={{ fontSize:20, fontWeight:800, color:clr }}>{val}</div>
              <div style={{ fontSize:10, color:'#94A3B8', fontWeight:600 }}>{lbl}</div>
            </div>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Suchen..." style={{ marginLeft:'auto', padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', width:220, fontFamily:'Inter,sans-serif' }}/>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:64, color:'#94A3B8' }}>Lade Pipeline...</div>
      ) : (
        <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:16, flex:1, minHeight:0, alignItems:'flex-start' }}>
          {cols.map(col => (
            <Column
              key={col.id}
              col={col}
              cols={cols}
              leads={filtered.filter(l => l.status === col.id)}
              onMove={handleMove}
              onOpen={setOpenLead}
              onEdit={setEditCol}
              dragOver={dragOver === col.id}
              onDragOver={setDragOver}
              onDrop={() => { if (dragId.current) handleMove({ id: dragId.current }, col.id); setDragOver(null) }}
            />
          ))}
        </div>
      )}

      {editCol && (
        <EditColModal col={editCol} onSave={handleSaveCol} onClose={() => setEditCol(null)} onReset={handleResetCols}/>
      )}
      {openLead && (
        <LeadModal lead={openLead} cols={cols} onClose={() => setOpenLead(null)} onMove={handleMove}/>
      )}
    </div>
  )
}
