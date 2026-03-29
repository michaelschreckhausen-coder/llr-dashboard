import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || fullName(l) || 'Unbekannt'

const STATUS_OPTIONS = ['Lead', 'LQL', 'MQN', 'MQL', 'SQL']
const STATUS_LABELS = { Lead:'Lead', LQL:'LQL', MQN:'MQN', MQL:'MQL', SQL:'SQL' }
const STATUS_STYLE = {
  Lead: { bg:'#F1F5F9', color:'#475569', border:'#CBD5E1' },
  LQL:  { bg:'#EFF6FF', color:'#1D4ED8', border:'#BFDBFE' },
  MQN:  { bg:'#F5F3FF', color:'#6D28D9', border:'#DDD6FE' },
  MQL:  { bg:'#FFFBEB', color:'#B45309', border:'#FDE68A' },
  SQL:  { bg:'#F0FDF4', color:'#15803D', border:'#BBF7D0' },
}
const LIST_COLORS = ['#0A66C2','#10B981','#F59E0B','#EF4444','#8B5CF6','#0891B2','#EC4899','#374151']

const PlusIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const FilterIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
const SearchIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const ChevronDown = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
const XIcon      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const LiIcon     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
const MailIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>
const PhoneIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const NoteIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
const TagIcon    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
const ListIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>

/* ââ Helpers ââ */
function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)
}

function Avatar({ name, avatar_url, size = 40, fontSize = 15 }) {
  const colors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2','#EF4444','#374151']
  const idx = (name || '').charCodeAt(0) % colors.length
  const bg  = colors[idx]
  if (avatar_url) return (
    <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  )
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'linear-gradient(135deg,'+bg+','+bg+'CC)', display:'flex', alignItems:'center', justifyContent:'center', fontSize, fontWeight:800, color:'#fff', flexShrink:0, letterSpacing:'-0.5px' }}>
      {initials(name)}
    </div>
  )
}

/* ââ Status Badge ââ */
function StatusBadge({ status, small }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.new
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:small?'2px 8px':'4px 12px', borderRadius:999, fontSize:small?10:11, fontWeight:700, background:s.bg, color:s.color, border:'1px solid '+s.border, whiteSpace:'nowrap' }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

/* ââ Modal wrapper ââ */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'#0F172A' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:6 }}>
            <XIcon/>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ââââââââââââââââââââââââââââââââââââââââââ
   LEAD PROFILE PANEL (Waalaxy-style)
ââââââââââââââââââââââââââââââââââââââââââ */
function LeadPanel({ lead, lists, onClose, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  useEffect(() => {
    if (lead) setForm({
      name: fullName(lead) || '',
      job_title: lead.job_title || '',
      company: lead.company || '',
      email: lead.email || '',
      phone: lead.phone || '',
      linkedin_url: lead.linkedin_url || lead.profile_url || '',
      location: lead.location || '',
      notes: lead.notes || '',
      status: lead.status || 'Lead',
      source: lead.source || '',
      tags: lead.tags ? (Array.isArray(lead.tags) ? lead.tags.join(', ') : lead.tags) : '',
    })
  }, [lead])

  if (!lead) return null

  const lbg = (fullName(lead)||'?').charCodeAt(0) % LIST_COLORS.length
  const headerColor = LIST_COLORS[lbg]

  async function saveChanges() {
    setSaving(true)
    await supabase.from('leads').update(form).eq('id', lead.id)
    setSaving(false)
    setEditing(false)
    onUpdate({ ...lead, ...form })
  }

  const field = (label, key, icon, type='text') => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4, display:'flex', alignItems:'center', gap:5 }}>
        {icon} {label}
      </div>
      {editing ? (
        type === 'textarea'
          ? <textarea value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} rows={3}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', resize:'vertical', outline:'none', background:'#FAFAFA' }}/>
          : <input type={type} value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#FAFAFA' }}/>
      ) : (
        <div style={{ fontSize:13, color: form[key] ? '#0F172A' : '#CBD5E1', fontStyle: form[key] ? 'normal' : 'italic', wordBreak:'break-word' }}>
          {key === 'linkedin_url' && form[key]
            ? <a href={form[key]} target="_blank" rel="noreferrer" style={{ color:'#0A66C2', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}><LiIcon/>{form[key]}</a>
            : form[key] || 'Nicht angegeben'}
        </div>
      )}
    </div>
  )

  const leadLists = lists.filter(l => l.lead_list_members?.some(m => m.lead_id === lead.id))

  const tabs = [
    { id:'info',     label:'Profil' },
    { id:'activity', label:'AktivitÃ¤t' },
    { id:'notes',    label:'Notizen' },
  ]

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:420, background:'#fff', boxShadow:'-4px 0 32px rgba(15,23,42,0.12)', zIndex:500, display:'flex', flexDirection:'column', animation:'slideInRight 0.2s ease-out' }}>
      <style>{'.lead-panel-tab:hover{background:#F1F5F9!important} @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}'}</style>

      {/* Header Banner */}
      <div style={{ background:'linear-gradient(135deg,'+headerColor+','+headerColor+'99)', padding:'24px 20px 16px', position:'relative', flexShrink:0 }}>
        <button onClick={onClose} style={{ position:'absolute', top:14, right:14, background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <XIcon/>
        </button>

        <div style={{ display:'flex', alignItems:'flex-end', gap:14 }}>
          <div style={{ border:'3px solid rgba(255,255,255,0.6)', borderRadius:'50%' }}>
            <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={64} fontSize={22}/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:800, fontSize:17, color:'#fff', letterSpacing:'-0.02em', textShadow:'0 1px 2px rgba(0,0,0,0.15)' }}>{fullName(lead) || 'Unbekannt'}</div>
            {lead.job_title && <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.job_title}</div>}
            {lead.company && <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:1, fontWeight:600 }}>{lead.company}</div>}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
          <StatusBadge status={lead.status} small/>
          {lead.linkedin_url && (
            <a href={lead.linkedin_url} target="_blank" rel="noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 10px', borderRadius:999, fontSize:10, fontWeight:700, background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', textDecoration:'none' }}>
              <LiIcon/> LinkedIn
            </a>
          )}
          {lead.email && (
            <a href={'mailto:'+lead.email}
              style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 10px', borderRadius:999, fontSize:10, fontWeight:700, background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', textDecoration:'none' }}>
              <MailIcon/> E-Mail
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0', flexShrink:0 }}>
        {tabs.map(tab => (
          <button key={tab.id} className="lead-panel-tab" onClick={() => setActiveTab(tab.id)}
            style={{ flex:1, padding:'10px 4px', border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:activeTab===tab.id?700:500, color:activeTab===tab.id?'#0A66C2':'#64748B', borderBottom:activeTab===tab.id?'2px solid #0A66C2':'2px solid transparent', transition:'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:20 }}>

        {activeTab === 'info' && (
          <>
            {/* Status changer */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Status</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {STATUS_OPTIONS.map(s => {
                  const st = STATUS_STYLE[s]
                  const active = (editing ? form.status : lead.status) === s
                  return (
                    <button key={s} onClick={() => { if(editing) setForm(f=>({...f,status:s})); else { supabase.from('leads').update({status:s}).eq('id',lead.id); onUpdate({...lead,status:s}); }}}
                      style={{ padding:'4px 12px', borderRadius:999, fontSize:11, fontWeight:700, cursor:'pointer', background:active?st.bg:'#F8FAFC', color:active?st.color:'#94A3B8', border:'1.5px solid '+(active?st.border:'#E2E8F0'), transition:'all 0.15s' }}>
                      {STATUS_LABELS[s]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Contact Fields */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Kontakt</div>
              {field('E-Mail', 'email', <MailIcon/>, 'email')}
              {field('Telefon', 'phone', <PhoneIcon/>, 'tel')}
              {field('LinkedIn', 'linkedin_url', <LiIcon/>)}
            </div>

            {/* Profile Fields */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Profil</div>
              {field('Vorname', 'first_name', null)}
              {field('Nachname', 'last_name', null)}
              {field('Job-Titel', 'job_title', null)}
              {field('Unternehmen', 'company', null)}
              {field('Firmenadresse', 'company_address', null)}
              {field('Standort', 'location', null)}
              {field('E-Mail', 'email', null)}
              {field('Telefon', 'phone', null)}
              {field('ICP Match %', 'icp_match', 'number')}
            </div>

            {/* Tags */}
            {lead.tags && lead.tags.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                  <TagIcon/> Tags
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {(Array.isArray(lead.tags) ? lead.tags : [lead.tags]).map((tag, i) => (
                    <span key={i} style={{ padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:600, background:'#F1F5F9', color:'#475569', border:'1px solid #E2E8F0' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lead Score */}
            {lead.lead_score > 0 && (
              <div style={{ marginBottom:16, padding:'10px 14px', background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)', borderRadius:10, border:'1px solid #BFDBFE' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Lead Score</div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ flex:1, height:6, background:'#E2E8F0', borderRadius:999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width: Math.min(lead.lead_score,100) + '%', background:'linear-gradient(90deg,#0A66C2,#8B5CF6)', borderRadius:999, transition:'width 0.5s ease' }}/>
                  </div>
                  <span style={{ fontSize:14, fontWeight:800, color:'#0A66C2' }}>{lead.lead_score}</span>
                </div>
              </div>
            )}

            {/* Lists */}
            {leadLists.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                  <ListIcon/> Listen
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {leadLists.map(l => (
                    <span key={l.id} style={{ padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:600, background:l.color+'22', color:l.color, border:'1px solid '+l.color+'44' }}>
                      {fullName(l)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'notes' && (
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
              <NoteIcon/> Notizen
            </div>
            {editing ? (
              <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={10} placeholder="PersÃ¶nliche Notizen zu diesem Leadâ¦"
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:10, fontSize:13, fontFamily:'Inter,sans-serif', resize:'vertical', outline:'none', background:'#FAFAFA', lineHeight:1.6 }}/>
            ) : (
              <div style={{ fontSize:13, color: lead.notes ? '#0F172A' : '#CBD5E1', fontStyle: lead.notes ? 'normal' : 'italic', lineHeight:1.7, whiteSpace:'pre-wrap', background:'#F8FAFC', borderRadius:10, padding:'12px 14px', minHeight:80 }}>
                {lead.notes || 'Keine Notizen vorhanden. Klicke auf "Bearbeiten" um Notizen hinzuzufÃ¼gen.'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>AktivitÃ¤tsverlauf</div>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                { icon:'ð', label:'Lead hinzugefÃ¼gt', date: lead.created_at, color:'#0A66C2' },
                { icon:'ð', label:'Status: '+STATUS_LABELS[lead.status], date: lead.updated_at || lead.created_at, color: STATUS_STYLE[lead.status]?.color },
              ].map((ev, i) => (
                <div key={i} style={{ display:'flex', gap:12, paddingBottom:16, position:'relative' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{ev.icon}</div>
                    {i < 1 && <div style={{ width:2, flex:1, background:'#E2E8F0', marginTop:4 }}/>}
                  </div>
                  <div style={{ paddingTop:6 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{ev.label}</div>
                    <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{ev.date ? new Date(ev.date).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}) : 'â'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div style={{ padding:'12px 20px', borderTop:'1px solid #E2E8F0', display:'flex', gap:8, justifyContent:'space-between', alignItems:'center', flexShrink:0, background:'#FAFAFA' }}>
        <button onClick={() => { if(window.confirm('Lead wirklich lÃ¶schen?')) { supabase.from('leads').delete().eq('id',lead.id); onDelete(lead.id); onClose(); }}}
          style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          <TrashIcon/> LÃ¶schen
        </button>
        <div style={{ display:'flex', gap:8 }}>
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button onClick={saveChanges} disabled={saving} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?0.6:1 }}>
                {saving ? 'â³' : 'â Speichern'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <EditIcon/> Bearbeiten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ââââââââââââââââââââââââââââââââââââââââââ
   MAIN LEADS PAGE
ââââââââââââââââââââââââââââââââââââââââââ */
export default function Leads({ session }) {
  const [leads,       setLeads]       = useState([])
  const [filtered,    setFiltered]    = useState([])
  const [lists,       setLists]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState('date')
  const [listFilter,  setListFilter]  = useState('all')
  const [selectedLead, setSelectedLead] = useState(null)
  const [modal,       setModal]       = useState(null)   // 'add' | 'list'
  const [form,        setForm]        = useState({})
  const [listForm,    setListForm]    = useState({})
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const uid = session.user.id
    const [{ data:ld }, { data:ls }] = await Promise.all([
      supabase.from('leads').select('*, lead_list_members(list_id, lead_id),first_name,last_name,job_title,company_address,icp_match').eq('user_id', uid).order('created_at', { ascending:false }),
      supabase.from('lead_lists').select('*, lead_list_members(lead_id),first_name,last_name,job_title,company_address,icp_match').eq('user_id', uid).order('created_at', { ascending:true }),
    ])
    setLeads(ld || [])
    applyFilter(ld || [], search, listFilter, sortBy)
    setLists(ls || [])
    setLoading(false)
  }

  function applyFilter(src, q, lf, sb) {
    let res = src
    if (q) {
      const ql = q.toLowerCase()
      res = res.filter(l => (fullName(l)||'').toLowerCase().includes(ql) || (l.company||'').toLowerCase().includes(ql) || (l.job_title||'').toLowerCase().includes(ql))
    }
    if (lf !== 'all') res = res.filter(l => l.lead_list_members?.some(m => m.list_id === lf))
    if (sb === 'name') res = [...res].sort((a,b) => (a.name||'').localeCompare(b.name||''))
    if (sb === 'status') res = [...res].sort((a,b) => STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status))
    setFiltered(res)
  }

  function handleSearch(v) { setSearch(v); applyFilter(leads, v, listFilter, sortBy) }
  function handleFilter(v) { setListFilter(v); applyFilter(leads, search, v, sortBy) }
  function handleSort(v)   { setSortBy(v); applyFilter(leads, search, listFilter, v) }

  function showFlash(msg, type='success') { setFlash({msg,type}); setTimeout(()=>setFlash(null),3000) }

  async function handleAddLead(e) {
    e.preventDefault()
    if (!(form.first_name||"") + " " + (form.last_name||"")) return showFlash('Name ist Pflicht', 'error')
    setSaving(true)
    const { data, error } = await supabase.from('leads').insert({ ...form, user_id: session.user.id, status: form.status||'Lead' }).select().single()
    setSaving(false)
    if (error) return showFlash(error.message, 'error')
    const updated = [data, ...leads]
    setLeads(updated)
    applyFilter(updated, search, listFilter, sortBy)
    setModal(null); setForm({})
    showFlash('Lead erfolgreich hinzugefÃ¼gt!')
  }

  async function handleAddList(e) {
    e.preventDefault()
    if (!listForm.name) return
    setSaving(true)
    const { data } = await supabase.from('lead_lists').insert({ name:listForm.name, color:listForm.color||LIST_COLORS[lists.length%LIST_COLORS.length], user_id:session.user.id }).select().single()
    setSaving(false)
    if (data) { setLists(l=>[...l,data]); setModal(null); setListForm({}) }
  }

  function handleLeadUpdate(updated) {
    const next = leads.map(l => l.id===updated.id ? updated : l)
    setLeads(next)
    applyFilter(next, search, listFilter, sortBy)
    if (selectedLead?.id === updated.id) setSelectedLead(updated)
  }

  function handleLeadDelete(id) {
    const next = leads.filter(l => l.id !== id)
    setLeads(next)
    applyFilter(next, search, listFilter, sortBy)
    if (selectedLead?.id === id) setSelectedLead(null)
  }

  const inp = { padding:'8px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff', width:'100%' }
  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 0px)', overflow:'hidden', position:'relative' }}>

      {/* ââ Left: Lists sidebar ââ */}
      <div style={{ width:240, borderRight:'1px solid #E2E8F0', display:'flex', flexDirection:'column', background:'#FAFAFA', flexShrink:0 }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>Listen</span>
          <button onClick={() => { setModal('list'); setListForm({}) }} style={{ width:26, height:26, borderRadius:7, border:'1px solid #E2E8F0', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B' }}>
            <PlusIcon/>
          </button>
        </div>
        <div style={{ overflowY:'auto', flex:1, padding:'6px 8px' }}>
          {[{ id:'all', name:'Alle Leads', count:leads.length, color:'#0A66C2' }, ...lists.map(l=>({...l, count:l.lead_list_members?.length||0}))].map(l => (
            <button key={l.id} onClick={()=>handleFilter(l.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:'none', background:listFilter===l.id?l.color+'18':'transparent', cursor:'pointer', marginBottom:2, textAlign:'left', transition:'all 0.12s' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:l.color, flexShrink:0 }}/>
              <span style={{ flex:1, fontSize:13, fontWeight:listFilter===l.id?700:500, color:listFilter===l.id?l.color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(l)}</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#94A3B8', background:'#F1F5F9', padding:'1px 7px', borderRadius:999 }}>{l.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ââ Center: Lead list ââ */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, transition:'all 0.2s' }}>

        {/* Toolbar */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', gap:10, alignItems:'center', background:'#fff', flexShrink:0 }}>
          <div style={{ flex:1, position:'relative' }}>
            <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94A3B8', pointerEvents:'none' }}><SearchIcon/></div>
            <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Name, Unternehmen oder Stichwortâ¦"
              style={{ ...inp, paddingLeft:34, width:'100%' }}/>
          </div>
          <select value={sortBy} onChange={e=>handleSort(e.target.value)} style={{ ...inp, width:'auto', color:'#475569', cursor:'pointer' }}>
            <option value="date">Neueste zuerst</option>
            <option value="name">Name AâZ</option>
            <option value="status">Status</option>
          </select>
          <button onClick={() => { setModal('add'); setForm({ status:'Lead' }) }}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0, boxShadow:'0 1px 4px rgba(10,102,194,0.3)', whiteSpace:'nowrap' }}>
            <PlusIcon/> Lead hinzufÃ¼gen
          </button>
        </div>

        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:'48px 1fr 140px 120px 90px', alignItems:'center', padding:'0 16px', height:38, background:'#F8FAFC', borderBottom:'1px solid #E2E8F0', flexShrink:0 }}>
          {['', 'Name & Position', 'Liste', 'Status', 'Datum'].map((h,i) => (
            <div key={i} style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
          ))}
        </div>

        {/* Flash */}
        {flash && (
          <div style={{ margin:'8px 16px', padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:600, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
            {flash.msg}
          </div>
        )}

        {/* Lead rows */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ padding:56, textAlign:'center', color:'#94A3B8', fontSize:14 }}>â³ Lade Leadsâ¦</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:56, textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>ð¯</div>
              <div style={{ fontWeight:700, fontSize:15, color:'#475569' }}>Keine Leads gefunden</div>
              <div style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>FÃ¼ge deinen ersten Lead hinzu</div>
            </div>
          ) : filtered.map((lead, idx) => {
            const isSelected = selectedLead?.id === lead.id
            const leadLists = lists.filter(l => l.lead_list_members?.some(m => m.lead_id === lead.id))
            return (
              <div key={lead.id}
                onClick={() => setSelectedLead(isSelected ? null : lead)}
                style={{ display:'grid', gridTemplateColumns:'48px 1fr 140px 120px 90px', alignItems:'center', padding:'0 16px', minHeight:64, borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:isSelected?'#EFF6FF':'#fff', borderLeft:isSelected?'3px solid #0A66C2':'3px solid transparent', transition:'all 0.12s' }}
                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background='#F8FAFC' }}
                onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background='#fff' }}>

                {/* Avatar */}
                <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={38} fontSize={14}/>

                {/* Name + Job-Titel */}
                <div style={{ minWidth:0, paddingRight:8 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(lead) || 'â'}</div>
                  {lead.job_title && <div style={{ fontSize:12, color:'#64748B', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.job_title}</div>}
                  {lead.company && <div style={{ fontSize:11, color:'#0A66C2', fontWeight:600, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.company}</div>}
                </div>

                {/* Lists */}
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {leadLists.slice(0,2).map(l => (
                    <span key={l.id} style={{ padding:'2px 7px', borderRadius:999, fontSize:10, fontWeight:600, background:l.color+'22', color:l.color, border:'1px solid '+l.color+'44', whiteSpace:'nowrap' }}>{fullName(l)}</span>
                  ))}
                  {leadLists.length > 2 && <span style={{ fontSize:10, color:'#94A3B8', padding:'2px 4px' }}>+{leadLists.length-2}</span>}
                </div>

                {/* Status */}
                <StatusBadge status={lead.status} small/>

                {/* Date */}
                <div style={{ fontSize:11, color:'#94A3B8', fontWeight:500 }}>
                  {new Date(lead.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short' })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer count */}
        <div style={{ padding:'8px 20px', borderTop:'1px solid #E2E8F0', fontSize:12, color:'#94A3B8', background:'#FAFAFA', flexShrink:0 }}>
          {filtered.length} von {leads.length} Leads
        </div>
      </div>

      {/* ââ Right: Lead Profile Panel ââ */}
      {selectedLead && (
        <LeadPanel
          lead={selectedLead}
          lists={lists}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
        />
      )}

      {/* ââ MODAL: Add Lead ââ */}
      {modal === 'add' && (
        <Modal title="Lead hinzufÃ¼gen" onClose={() => setModal(null)}>
          <form onSubmit={handleAddLead}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Name *</label>
                  <input value={(form.first_name||"") + " " + (form.last_name||"")||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp} placeholder="Max Mustermann" required/>
                </div>
                <div>
                  <label style={lbl}>Unternehmen</label>
                  <input value={form.company||''} onChange={e=>setForm(f=>({...f,company:e.target.value}))} style={inp} placeholder="ACME GmbH"/>
                </div>
              </div>
              <div>
                <label style={lbl}>Position / Headline</label>
                <input value={form.job_title||''} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} style={inp} placeholder="CEO | Founder"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>E-Mail</label>
                  <input type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={inp} placeholder="max@firma.de"/>
                </div>
                <div>
                  <label style={lbl}>Telefon</label>
                  <input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={inp} placeholder="+49 ..."/>
                </div>
              </div>
              <div>
                <label style={lbl}>LinkedIn URL</label>
                <input value={form.linkedin_url||''} onChange={e=>setForm(f=>({...f,linkedin_url:e.target.value}))} style={inp} placeholder="https://linkedin.com/in/..."/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Standort</label>
                  <input value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={inp} placeholder="Berlin, Deutschland"/>
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status||'Lead'} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Notizen</label>
                <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical', lineHeight:1.5 }} placeholder="PersÃ¶nliche Notizenâ¦"/>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.5:1 }}>
                {saving ? 'â³' : '+ Lead hinzufÃ¼gen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ââ MODAL: Add List ââ */}
      {modal === 'list' && (
        <Modal title="Neue Liste" onClose={() => setModal(null)} width={380}>
          <form onSubmit={handleAddList}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={lbl}>Listenname *</label>
                <input value={listForm.name||''} onChange={e=>setListForm(f=>({...f,name:e.target.value}))} style={inp} placeholder="z.B. Potenzielle Kunden Q2" required/>
              </div>
              <div>
                <label style={lbl}>Farbe</label>
                <div style={{ display:'flex', gap:8, marginTop:4 }}>
                  {LIST_COLORS.map(c => (
                    <button key={c} type="button" onClick={()=>setListForm(f=>({...f,color:c}))}
                      style={{ width:28, height:28, borderRadius:'50%', background:c, border:listForm.color===c?'3px solid #0F172A':'2px solid transparent', cursor:'pointer', transition:'all 0.15s' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Erstellen
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
