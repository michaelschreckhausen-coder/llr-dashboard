import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

/* Ã¢ÂÂÃ¢ÂÂ Spalten-Konfiguration Ã¢ÂÂÃ¢ÂÂ */
const PIPELINE_KEY = 'llr_pipeline_cols'
const DEFAULT_COLS = [
  { id:'Lead', label:'Lead', color:'#475569', bg:'#F1F5F9', border:'#CBD5E1', icon:'', desc:'Noch nicht qualifiziert' },
  { id:'LQL',  label:'LQL',  color:'#1D4ED8', bg:'#EFF6FF', border:'#BFDBFE', icon:'', desc:'LinkedIn Qualified Lead' },
  { id:'MQN',  label:'MQN',  color:'#6D28D9', bg:'#F5F3FF', border:'#DDD6FE', icon:'', desc:'Marketing Qualified Network' },
  { id:'MQL',  label:'MQL',  color:'#B45309', bg:'#FFFBEB', border:'#FDE68A', icon:'', desc:'Marketing Qualified Lead' },
  { id:'SQL',  label:'SQL',  color:'#15803D', bg:'#F0FDF4', border:'#BBF7D0', icon:'', desc:'Sales Qualified Lead' },
]
function loadCols(){try{const s=JSON.parse(localStorage.getItem(PIPELINE_KEY)||'null');if(!s)return DEFAULT_COLS;return DEFAULT_COLS.map(d=>{const o=s.find(p=>p.id===d.id);return o?{...d,...o}:d})}catch{return DEFAULT_COLS}}
function saveCols(cols){localStorage.setItem(PIPELINE_KEY,JSON.stringify(cols))}

/* Ã¢ÂÂÃ¢ÂÂ Icons Ã¢ÂÂÃ¢ÂÂ */
const PlusIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const XIcon     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const LiIcon    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
const MailIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>
const GripIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
const ChevronIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>

/* Ã¢ÂÂÃ¢ÂÂ Avatar Ã¢ÂÂÃ¢ÂÂ */
function Avatar({ name, avatar_url, size = 32 }) {
  const colors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2','#EF4444']
  const bg = colors[(name||'?').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  const initials = (name||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2)
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'linear-gradient(135deg,'+bg+','+bg+'BB)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.35, fontWeight:800, color:'#fff', flexShrink:0 }}>
      {initials}
    </div>
  )
}

/* Ã¢ÂÂÃ¢ÂÂ Lead Karte Ã¢ÂÂÃ¢ÂÂ */
function LeadCard({ lead, col, onMove, onOpen, dragging, onDragStart, onDragEnd, allCols=[] }) {
  const [hov, setHov] = useState(false)

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('leadId', lead.id); e.dataTransfer.setData('fromCol', col.id); onDragStart(lead.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: dragging ? '#F1F5F9' : '#fff',
        borderRadius: 10,
        border: '1px solid ' + (hov ? col.border : '#E2E8F0'),
        padding: '12px 14px',
        cursor: 'grab',
        transition: 'all 0.15s',
        boxShadow: hov ? '0 4px 12px rgba(15,23,42,0.08)' : '0 1px 3px rgba(15,23,42,0.04)',
        transform: hov ? 'translateY(-1px)' : 'none',
        opacity: dragging ? 0.5 : 1,
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Grip handle */}
      <div style={{ position:'absolute', top:10, right:10, color:'#CBD5E1', opacity: hov ? 1 : 0, transition:'opacity 0.15s' }}>
        <GripIcon/>
      </div>

      {/* Header */}
      <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
        <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={34}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(lead)}</div>
          {lead.headline && <div style={{ fontSize:11, color:'#64748B', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.headline}</div>}
          {lead.company && <div style={{ fontSize:11, color: col.color, fontWeight:600, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.company}</div>}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
        {lead.email && (
          <a href={'mailto:'+lead.email} onClick={e=>e.stopPropagation()}
            style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:600, background:col.bg, color:col.color, border:'1px solid '+col.border, textDecoration:'none' }}>
            <MailIcon/> E-Mail
          </a>
        )}
        {(lead.linkedin_url || lead.profile_url) && (
          <a href={lead.linkedin_url || lead.profile_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
            style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:600, background:'#EFF6FF', color:'#0A66C2', border:'1px solid #BFDBFE', textDecoration:'none' }}>
            <LiIcon/> LinkedIn
          </a>
        )}
        {lead.location && (
          <span style={{ fontSize:10, color:'#94A3B8', display:'flex', alignItems:'center', gap:2 }}>
            Ã°ÂÂÂ {lead.location}
          </span>
        )}
      </div>

      {/* Notes preview */}
      {lead.notes && (
        <div style={{ marginTop:8, fontSize:11, color:'#64748B', background:'#F8FAFC', borderRadius:6, padding:'5px 8px', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
          {lead.notes}
        </div>
      )}

      {/* Move buttons Ã¢ÂÂ shown on hover */}
      {hov && (
        <div style={{ display:'flex', gap:4, marginTop:8, justifyContent:'flex-end' }}>
          {allCols.filter(c => c.id !== col.id).map(target => (
            <button key={target.id} onClick={(e) => { e.stopPropagation(); onMove(lead.id, target.id); }}
              style={{ padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700, border:'1px solid '+target.border, background:target.bg, color:target.color, cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap' }}>
              Ã¢ÂÂ {target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* Ã¢ÂÂÃ¢ÂÂ Spalte Ã¢ÂÂÃ¢ÂÂ */
function Column({ col, leads, onMove, onOpen, dragOverCol, onDragOver, onDrop, draggingId, onEdit, allCols=[] }) {
  const isDragOver = dragOverCol === col.id

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(col.id); }}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); const from = e.dataTransfer.getData('fromCol'); if (from !== col.id) onMove(id, col.id); }}
      style={{
        flex: 1,
        minWidth: 260,
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        background: isDragOver ? col.bg : '#F8FAFC',
        borderRadius: 14,
        border: '2px solid ' + (isDragOver ? col.color : '#E2E8F0'),
        transition: 'all 0.15s',
        minHeight: 200,
      }}
    >
      {/* Column Header */}
      <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid '+(isDragOver ? col.border : '#E2E8F0') }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {col.icon && <span style={{ fontSize:16 }}>{col.icon}</span>}
            <div>
              <div style={{ fontWeight:800, fontSize:13, color:'#0F172A' }} title={col.label + ' — ' + col.desc}>{col.label}</div>
              <div style={{ fontSize:10, color:'#94A3B8', marginTop:2, lineHeight:1.35, whiteSpace:'normal' }} title={col.id + ' — ' + col.desc}>{col.desc}</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:800, padding:'2px 10px', borderRadius:999, background:col.bg, color:col.color, border:'1px solid '+col.border }}>
              {leads.length}
            </span>
            {onEdit && (
              <button onClick={() => onEdit(col)} title="Phase anpassen" style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:3, borderRadius:6, display:'flex', alignItems:'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Summenzeile */}
        {leads.length > 0 && (
          <div style={{ marginTop:8, fontSize:10, color:'#94A3B8', display:'flex', gap:10 }}>
            {leads.filter(l=>l.company).length > 0 && (
              <span>{leads.filter(l=>l.company).length} Unternehmen</span>
            )}
            {leads.filter(l=>l.email).length > 0 && (
              <span>Ã¢ÂÂÃ¯Â¸Â {leads.filter(l=>l.email).length}</span>
            )}
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{ padding:'10px 10px', display:'flex', flexDirection:'column', gap:8, flex:1, overflowY:'auto', minHeight:100 }}>
        {leads.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 12px', color:'#CBD5E1', fontSize:12, gap:6, opacity:isDragOver?0.4:1, transition:'opacity 0.15s' }}>
            <div style={{ fontSize:28 }}>{col.icon}</div>
            <div>Hierher ziehen</div>
          </div>
        )}
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} col={col} onMove={onMove} onOpen={onOpen}
            dragging={draggingId === lead.id}
            onDragStart={(id) => {}}
            onDragEnd={() => {}}
            allCols={allCols}
          />
        ))}
      </div>
    </div>
  )
}

/* Ã¢ÂÂÃ¢ÂÂ Lead Detail Modal Ã¢ÂÂÃ¢ÂÂ */
function LeadDetailModal({ lead, onClose, onMove, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (lead) setForm({
      name: fullName(lead) || '',
      headline: lead.headline || '',
      company: lead.company || '',
      email: lead.email || '',
      phone: lead.phone || '',
      linkedin_url: lead.linkedin_url || lead.profile_url || '',
      location: lead.location || '',
      notes: lead.notes || '',
    })
  }, [lead])

  if (!lead) return null

  const col = allCols.find(c => c.id === lead.status) || allCols[0]

  async function save() {
    setSaving(true)
    await supabase.from('leads').update(form).eq('id', lead.id)
    setSaving(false)
    setEditing(false)
    onUpdate({ ...lead, ...form })
  }

  const inp = { width:'100%', padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:7, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#FAFAFA', boxSizing:'border-box' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width:480, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,'+col.color+','+col.color+'99)', padding:'20px 20px 16px', borderRadius:'16px 16px 0 0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ border:'2px solid rgba(255,255,255,0.5)', borderRadius:'50%' }}>
                <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={52}/>
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:17, color:'#fff' }}>{fullName(lead)}</div>
                {lead.headline && <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)', marginTop:2 }}>{lead.headline}</div>}
                {lead.company && <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', fontWeight:600, marginTop:1 }}>{lead.company}</div>}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <XIcon/>
            </button>
          </div>
          {/* Status pills */}
          <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap' }}>
            {allCols.map(c => (
              <button key={c.id} onClick={() => onMove(lead.id, c.id)}
                style={{ padding:'3px 10px', borderRadius:999, fontSize:10, fontWeight:700, border:'1.5px solid '+(lead.status===c.id?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.3)'), background:lead.status===c.id?'rgba(255,255,255,0.25)':'transparent', color:'#fff', cursor:'pointer', transition:'all 0.12s' }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px' }}>
          {editing ? (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>Name</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp}/></div>
                <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>Unternehmen</label><input value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))} style={inp}/></div>
              </div>
              <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>Position</label><input value={form.headline} onChange={e=>setForm(f=>({...f,headline:e.target.value}))} style={inp}/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>E-Mail</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={inp}/></div>
                <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>Telefon</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={inp}/></div>
              </div>
              <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>LinkedIn</label><input value={form.linkedin_url} onChange={e=>setForm(f=>({...f,linkedin_url:e.target.value}))} style={inp}/></div>
              <div><label style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>Notizen</label><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={4} style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/></div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Kontakt */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[['E-Mail', lead.email, 'mailto:'+lead.email], ['Telefon', lead.phone, 'tel:'+lead.phone], ['LinkedIn', lead.linkedin_url||lead.profile_url, lead.linkedin_url||lead.profile_url], ['Standort', lead.location, null]].map(([lbl, val, href]) => val ? (
                  <div key={lbl}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{lbl}</div>
                    {href ? <a href={href} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#0A66C2', textDecoration:'none', wordBreak:'break-all' }}>{val}</a>
                           : <div style={{ fontSize:13, color:'#0F172A' }}>{val}</div>}
                  </div>
                ) : null)}
              </div>
              {lead.notes && (
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Notizen</div>
                  <div style={{ fontSize:13, color:'#475569', lineHeight:1.65, background:'#F8FAFC', borderRadius:8, padding:'10px 12px', whiteSpace:'pre-wrap' }}>{lead.notes}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'space-between', borderTop:'1px solid #F1F5F9' }}>
          <div style={{ display:'flex', gap:6 }}>
            {(lead.linkedin_url||lead.profile_url) && <a href={lead.linkedin_url||lead.profile_url} target="_blank" rel="noreferrer" style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#0A66C2', fontSize:12, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}><LiIcon/> LinkedIn</a>}
            {lead.email && <a href={'mailto:'+lead.email} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:12, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}><MailIcon/> E-Mail</a>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {editing
              ? <><button onClick={()=>setEditing(false)} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                  <button onClick={save} disabled={saving} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?0.6:1 }}>{saving?'Ã¢ÂÂ³':'Ã¢ÂÂ Speichern'}</button></>
              : <button onClick={()=>setEditing(true)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>Bearbeiten</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
   PIPELINE HAUPTSEITE
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */
const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

export default function Pipeline({ session }) {
  const [leads,      setLeads]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [openLead,   setOpenLead]   = useState(null)
  const [dragOver,   setDragOver]   = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [search,     setSearch]     = useState('')
  const [flash,      setFlash]      = useState(null)
  const [cols,setCols]=useState(()=>loadCols())
  const [editCol,setEditCol]=useState(null)

  useEffect(() => { loadLeads() }, [])

  async function loadLeads() {
    setLoading(true)
    const { data } = await supabase
      .from('leads')
      .select('id,user_id,name,first_name,last_name,job_title,headline,company,location,linkedin_url,avatar_url,email,phone,status,lead_score,icp_match,connection_status,connected_at,deal_value,created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }

  function showFlash(msg) { setFlash(msg); setTimeout(()=>setFlash(null), 2500) }

  function handleSaveCol(u){const next=cols.map(col=>col.id===u.id?{...col,...u}:col);setCols(next);saveCols(next);setEditCol(null)}
  function handleResetCols(){localStorage.removeItem(PIPELINE_KEY);setCols(DEFAULT_COLS);setEditCol(null)}
  async function handleMove(leadId, newStatus) {
    const prev = leads.find(l => l.id === leadId)
    if (prev?.status === newStatus) return

    // Optimistic update
    setLeads(ls => ls.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
    if (openLead?.id === leadId) setOpenLead(ol => ({ ...ol, status: newStatus }))

    const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', leadId)
    if (error) {
      setLeads(ls => ls.map(l => l.id === leadId ? prev : l))
      showFlash('Fehler beim Verschieben')
    } else {
      const col = cols.find(c => c.id === newStatus)
      showFlash(prev.name + ' Ã¢ÂÂ ' + col?.label)
    }
    setDragOver(null)
    setDraggingId(null)
  }

  function handleUpdate(updated) {
    setLeads(ls => ls.map(l => l.id === updated.id ? updated : l))
    if (openLead?.id === updated.id) setOpenLead(updated)
  }

  const filtered = search
    ? leads.filter(l => (l.name||'').toLowerCase().includes(search.toLowerCase()) || (l.company||'').toLowerCase().includes(search.toLowerCase()))
    : leads

  const byStatus = {}
  cols.forEach(c => { byStatus[c.id] = filtered.filter(l => l.status === c.id) })

  const totalValue = leads.length
  const convRate = leads.length ? Math.round((byStatus.converted?.length || 0) / leads.length * 100) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Ã¢ÂÂÃ¢ÂÂ Top Bar Ã¢ÂÂÃ¢ÂÂ */}
      <div style={{ padding:'14px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', gap:16, alignItems:'center', background:'#fff', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Pipeline</h1>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:1 }}>Drag & Drop um Leads zu verschieben</div>
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:16, marginLeft:16 }}>
          {[
            { label:'Gesamt', value:leads.length, color:'#475569' },
            { label:'Konvertiert', value:byStatus.converted?.length||0, color:'#5B21B6' },
            { label:'Konversionrate', value:convRate+'%', color:'#0A66C2' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', padding:'6px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0' }}>
              <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:10, color:'#94A3B8', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ flex:1, maxWidth:300, marginLeft:'auto' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Suchen...'
            style={{ width:'100%', padding:'7px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#FAFAFA' }}/>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0F172A', color:'#fff', padding:'8px 20px', borderRadius:999, fontSize:13, fontWeight:600, zIndex:999, boxShadow:'0 4px 16px rgba(15,23,42,0.2)', animation:'fadeIn 0.2s' }}>
          Ã¢ÂÂ {flash}
        </div>
      )}

      {/* Ã¢ÂÂÃ¢ÂÂ Kanban Board Ã¢ÂÂÃ¢ÂÂ */}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'#94A3B8', fontSize:14 }}>
          <div>Ã¢ÂÂ³ Lade PipelineÃ¢ÂÂ¦</div>
        </div>
      ) : (
        <div
          onDragOver={e => e.preventDefault()}
          style={{ display:'flex', gap:14, padding:'16px 20px', flex:1, overflowX:'auto', overflowY:'hidden', alignItems:'flex-start' }}
        >
          {cols.map(col => (
            <Column
              key={col.id}
              col={col}
              leads={byStatus[col.id] || []}
              onMove={handleMove}
              onOpen={setOpenLead}
              dragOverCol={dragOver}
              onDragOver={setDragOver}
              onDrop={(id, from) => { if (from !== col.id) handleMove(id, col.id) }}
              draggingId={draggingId}
              onEdit={setEditCol} allCols={cols}/>
          ))}
        </div>
      )}

      {/* Ã¢ÂÂÃ¢ÂÂ Lead Detail Modal Ã¢ÂÂÃ¢ÂÂ */}
      {editCol && (
        <EditColModal col={editCol} onSave={handleSaveCol} onClose={() => setEditCol(null)} onReset={handleResetCols} />
      )}
      {openLead && (
        <LeadDetailModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onMove={handleMove}
          onUpdate={handleUpdate}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
      `}</style>
    </div>
  )
}

function EditColModal({ col, onSave, onClose, onReset }) {
  const COLORS = [
    { color:'#475569', bg:'#F1F5F9', border:'#CBD5E1', name:'Grau' },
    { color:'#1D4ED8', bg:'#EFF6FF', border:'#BFDBFE', name:'Blau' },
    { color:'#6D28D9', bg:'#F5F3FF', border:'#DDD6FE', name:'Lila' },
    { color:'#B45309', bg:'#FFFBEB', border:'#FDE68A', name:'Gelb' },
    { color:'#15803D', bg:'#F0FDF4', border:'#BBF7D0', name:'Gruen' },
    { color:'#B91C1C', bg:'#FEF2F2', border:'#FECACA', name:'Rot' },
    { color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC', name:'Cyan' },
    { color:'#9D174D', bg:'#FDF2F8', border:'#FBCFE8', name:'Pink' },
  ]
  const [lbl, setLbl] = React.useState(col.label)
  const [dsc, setDsc] = React.useState(col.desc)
  const [clr, setClr] = React.useState(COLORS.find(o => o.color === col.color) || COLORS[0])
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:420, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(15,23,42,0.18)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>Phase anpassen</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:4, borderRadius:6, fontSize:18, lineHeight:1 }}>x</button>
        </div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto' }}>
          <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Name</label><input value={lbl} onChange={e => setLbl(e.target.value)} style={inp} placeholder="Phase benennen..." maxLength={20}/></div>
          <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Beschreibung</label><input value={dsc} onChange={e => setDsc(e.target.value)} style={inp} placeholder="Kurze Beschreibung..." maxLength={50}/></div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Farbe</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {COLORS.map(o => (
                <button key={o.color} onClick={() => setClr(o)} title={o.name} style={{ width:30, height:30, borderRadius:8, background:o.bg, border:'2px solid '+(clr.color===o.color?o.color:o.border), cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ width:14, height:14, borderRadius:4, background:o.color }}/>
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, border:'1px solid #E2E8F0' }}>
            <div style={{ fontWeight:800, fontSize:14, color:clr.color, background:clr.bg, padding:'4px 10px', borderRadius:6 }}>{lbl||'Name'}</div>
            <span style={{ fontSize:11, color:'#94A3B8' }}>{dsc||'Beschreibung'}</span>
          </div>
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <button onClick={onReset} style={{ fontSize:11, color:'#94A3B8', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Alle zuruecksetzen</button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={() => onSave({ id:col.id, label:lbl.trim()||col.label, desc:dsc.trim(), ...clr })} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Speichern</button>
          </div>
        </div>
      </div>
    </div>
  )
}
