import { useResponsive } from '../hooks/useResponsive'
import { useTeam } from '../context/TeamContext'
import LeadTasks from '../components/LeadTasks'
import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ── Helpers ─────────────────────────────────────────── */
const fullName = l => ((l?.first_name||'') + ' ' + (l?.last_name||'')).trim() || l?.name || 'Unbekannt'

const STAGE_CFG = {
  kein_deal:   { label:'Kein Deal',       color:'#94A3B8', bg:'#F8FAFC', border:'#E2E8F0' },
  prospect:    { label:'Kontaktiert',     color:'#3B82F6', bg:'#EFF6FF', border:'#BFDBFE' },
  opportunity: { label:'Gespräch',        color:'#8B5CF6', bg:'#F5F3FF', border:'#DDD6FE' },
  angebot:     { label:'Qualifiziert',    color:'#F59E0B', bg:'#FFFBEB', border:'#FDE68A' },
  verhandlung: { label:'Angebot',         color:'#F97316', bg:'#FFF7ED', border:'#FDBA74' },
  gewonnen:    { label:'Gewonnen ✓',      color:'#22C55E', bg:'#F0FDF4', border:'#86EFAC' },
  verloren:    { label:'Verloren ✗',      color:'#94A3B8', bg:'#F8FAFC', border:'#E2E8F0' },
}
const STAGE_ORDER = ['kein_deal','prospect','opportunity','angebot','verhandlung','gewonnen','verloren']

const CONN_CFG = {
  verbunden:       { label:'Vernetzt',      color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7', dot:'#10B981' },
  nicht_verbunden: { label:'Kein Kontakt',  color:'#475569', bg:'#F8FAFC', border:'#E2E8F0', dot:'#94A3B8' },
  pending:         { label:'Ausstehend',    color:'#92400E', bg:'#FFFBEB', border:'#FDE68A', dot:'#F59E0B' },
  abgelehnt:       { label:'Abgelehnt',     color:'#991B1B', bg:'#FEF2F2', border:'#FECACA', dot:'#EF4444' },
}

const ACT_ICONS = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', linkedin_connection:'🔗', task:'✅', other:'📌' }
const ACT_COLORS = { call:'#3B82F6', email:'#8B5CF6', linkedin_message:'#0A66C2', meeting:'#10B981', note:'#F59E0B', other:'#94A3B8' }

const LIFECYCLE_LABELS = { lead:'Lead', marketing_qualified:'MQL', sales_qualified:'SQL', opportunity:'Opportunity', customer:'Kunde', evangelist:'Evangelist' }
const LIFECYCLE_ORDER  = ['lead','marketing_qualified','sales_qualified','opportunity','customer']

function Avatar({ name, avatar_url, size = 80 }) {
  const colors = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#0891B2','#EC4899']
  const bg = colors[(name||'?').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'3px solid #fff', boxShadow:'0 2px 12px rgba(0,0,0,0.12)' }}/>
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:size*0.36, flexShrink:0, border:'3px solid #fff', boxShadow:'0 2px 12px rgba(0,0,0,0.12)', letterSpacing:'-0.02em' }}>
      {(name||'?').substring(0,2).toUpperCase()}
    </div>

  )
}

function ScoreRing({ score, size = 64 }) {
  const pct   = Math.min(score||0, 100)
  const r     = (size - 8) / 2
  const circ  = 2 * Math.PI * r
  const dash  = (pct / 100) * circ
  const color = pct >= 70 ? '#EF4444' : pct >= 40 ? '#F59E0B' : '#3B82F6'
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition:'stroke-dasharray 0.8s ease' }}/>
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:size*0.24, fontWeight:900, color, lineHeight:1 }}>{score||0}</span>
        <span style={{ fontSize:size*0.13, color:'#94A3B8', fontWeight:600 }}>Score</span>
      </div>
    </div>

  )
}

function InfoRow({ label, value, link, mono }) {
  if (!value) return null
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F1F5F9', gap:12, minHeight:36 }}>
      <span style={{ fontSize:12, color:'#94A3B8', fontWeight:600, flexShrink:0 }}>{label}</span>
      {link
        ? <a href={link} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:600, color:'#3B82F6', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{value}</a>
        : <span style={{ fontSize:12, fontWeight:600, color:'#0F172A', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220, fontFamily:mono?'monospace':undefined }}>{value}</span>
      }
    </div>

  )
}

function SectionCard({ title, icon, children, action }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>{icon}</span>
          <span style={{ fontSize:13, fontWeight:800, color:'#0F172A' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding:'16px 20px' }}>{children}</div>
    </div>

  )
}

function Tag({ children, color='#3B82F6' }) {
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:color+'15', color, border:`1px solid ${color}30` }}>{children}</span>
}

/* ── HAUPTKOMPONENTE ─────────────────────────────────── */
export default function LeadProfile({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isMobile } = useResponsive()
  const { team, members, shareLeadWithTeam, unshareLeadFromTeam } = useTeam()

  const [lead, setLead]                 = useState(null)
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState('uebersicht')
  const [activities, setActivities]     = useState([])
  const [notes, setNotes]               = useState([])
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState(null)

  // Inline-Edit State
  const [editField, setEditField]       = useState(null) // welches Feld gerade editiert wird
  const [editValue, setEditValue]       = useState('')

  // Neue Aktivität / Notiz
  const [toast, setToast]               = useState(null) // { msg, type }
  const [pitchModal, setPitchModal]     = useState(false)
  const [pitchText, setPitchText]       = useState('')
  const [pitchLoading, setPitchLoading] = useState(false)
  const [msgText, setMsgText]           = useState('')
  const [msgType, setMsgType]           = useState('connection')
  const [msgLoading, setMsgLoading]     = useState(false)
  const [newAct, setNewAct]             = useState({ type:'note', subject:'' })
  const [newNote, setNewNote]           = useState('')
  const [addingAct, setAddingAct]       = useState(false)
  const [addingNote, setAddingNote]     = useState(false)
  const [editVals, setEditVals]         = useState({})
  const [editingNote, setEditingNote]   = useState(null)
  const [form, setForm]                 = useState({ deal_value:'', deal_expected_close:'', deal_probability:0, ai_need_detected:'', notes:'' })
  const [formDirty, setFormDirty]       = useState(false)

  useEffect(() => { loadLead() }, [id])

  function showToast(msg, type='success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadLead() {
    setLoading(true)
    const { data, error } = await supabase.from('leads').select('*').eq('id', id).single()
    if (error || !data) { navigate('/leads'); return }
    setLead(data)
    setLoading(false)
    setForm({
      deal_value: data.deal_value||'',
      deal_expected_close: data.deal_expected_close||'',
      deal_probability: data.deal_probability||0,
      ai_need_detected: data.ai_need_detected||'',
      notes: data.notes||'',
    })
    setFormDirty(false)
    setEditVals({
      first_name: data.first_name||'', last_name: data.last_name||'',
      job_title: data.job_title||'', company: data.company||'',
      industry: data.industry||'', email: data.email||'',
      phone: data.phone||'', linkedin_url: data.linkedin_url||data.profile_url||'',
      company_website: data.company_website||'', city: data.city||'',
      country: data.country||'', company_size: data.company_size||'',
      notes: data.notes||'',
    })
    loadActivities(data)
    loadNotes(data)
  }

  async function loadActivities(l) {
    // Lade alle Aktivitäten für diesen Lead (eigene + Team-Mitglieder)
    const { data } = await supabase
      .from('activities')
      .select('*, profiles:user_id(full_name, email)')
      .eq('lead_id', l.id)
      .order('occurred_at', { ascending:false })
      .limit(50)
    setActivities(data || [])
  }

  async function loadNotes(l) {
    const { data } = await supabase.from('contact_notes').select('*').eq('lead_id', l.id).order('created_at', { ascending:false }).limit(50)
    setNotes(data || [])
  }

  async function updateLeadSafe(leadId, updates) {
    const { error, data } = await supabase.from('leads').update(updates).eq('id', leadId).select()
    if (error) throw error
    return data
  }

  function setField(k, v) { setForm(f => ({...f,[k]:v})); setFormDirty(true) }

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      await updateLeadSafe(lead.id, {
        deal_value: form.deal_value || null,
        deal_expected_close: form.deal_expected_close || null,
        deal_probability: form.deal_probability || 0,
        ai_need_detected: form.ai_need_detected || null,
        notes: form.notes || null,
      })
      setLead(l => ({...l, ...form}))
      setFormDirty(false)
      showToast('Deal gespeichert ✓')
    } catch(e) { setSaveError(e.message) }
    setSaving(false)
  }

  async function saveField(field, value) {
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('leads').update({ [field]: value || null }).eq('id', lead.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setLead(l => ({ ...l, [field]: value }))
    setEditField(null)
  }

  async function saveDealStage(stage) {
    setSaveError(null)
    setLead(l => ({ ...l, deal_stage: stage }))
    const { error } = await supabase.from('leads').update({ deal_stage: stage, deal_stage_changed_at: new Date().toISOString() }).eq('id', lead.id)
    if (error) { setSaveError(error.message); setLead(l => ({ ...l, deal_stage: lead.deal_stage })) }
  }

  async function saveLifecycle(lc) {
    setSaveError(null)
    setLead(l => ({ ...l, lifecycle_stage: lc }))
    const { error } = await supabase.from('leads').update({ lifecycle_stage: lc }).eq('id', lead.id)
    if (error) { setSaveError(error.message); setLead(l => ({ ...l, lifecycle_stage: lead.lifecycle_stage })) }
  }

  async function saveConnection(status) {
    setSaveError(null)
    setLead(l => ({ ...l, li_connection_status: status }))
    const upd = { li_connection_status: status }
    if (status === 'verbunden' && lead.li_connection_status !== 'verbunden') upd.li_connected_at = new Date().toISOString()
    const { error } = await supabase.from('leads').update(upd).eq('id', lead.id)
    if (error) { setSaveError(error.message); setLead(l => ({ ...l, li_connection_status: lead.li_connection_status })) }
  }

  const addAct = async () => logActivity()

  async function logActivity() {
    if (!newAct.subject.trim()) return
    setAddingAct(true); setSaveError(null)
    try {
      const user = session.user
      const { data, error } = await supabase.from('activities').insert({ lead_id:lead.id, user_id:user.id, type:newAct.type, subject:newAct.subject, direction:'outbound', occurred_at:new Date().toISOString() }).select().single()
      if (!error) showToast('Aktivität gespeichert ✓')
      if (error) throw error
      setActivities(a => [data, ...a])
      setNewAct({ type:'note', subject:'' })
    } catch(e) { setSaveError(e.message) }
    setAddingAct(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true); setSaveError(null)
    try {
      const user = session.user
      const { data, error } = await supabase.from('contact_notes').insert({ lead_id:lead.id, user_id:user.id, content:newNote.trim(), is_pinned:false, is_private:false }).select().single()
      if (!error) showToast('Notiz gespeichert ✓')
      if (error) throw error
      setNotes(n => [data, ...n])
      setNewNote('')
    } catch(e) { setSaveError(e.message) }
    setAddingNote(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, border:'3px solid #E5E7EB', borderTopColor:'#3B82F6', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ color:'#94A3B8', fontSize:14 }}>Lead wird geladen…</span>
    </div>
  )
  if (!lead) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#94A3B8', fontSize:14 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🔍</div>
        <div>Lead wird geladen…</div>
      </div>
    </div>
  )

  const name     = fullName(lead)
  const conn     = CONN_CFG[lead.li_connection_status || 'nicht_verbunden']
  const stageCfg = STAGE_CFG[lead.deal_stage || 'kein_deal']
  const score    = lead.hs_score || 0
  const scoreTrend = null  // Zukünftig: aus lead_field_history berechnen

  const inp = { padding:'7px 10px', border:'1.5px solid #3B82F6', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }

  const TABS = [
    { id:'uebersicht', label:'Übersicht' },
    { id:'crm',        label:'CRM / Deal' },
    { id:'timeline',   label: activities.length > 0 ? `Timeline (${activities.length})` : 'Timeline' },
    { id:'notizen',    label: notes.length > 0 ? `Notizen (${notes.length})` : 'Notizen' },
    { id:'nachricht',  label:'💬 Nachricht' },
    { id:'details',    label:'✏ Bearbeiten' },
  ]

  return (
    <>
    <div style={{ maxWidth:1200, margin:'0 auto' }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .lp-anim { animation: fadeIn 0.3s ease-out both; }
        .lp-hover:hover { background:#F8FAFC !important; }
        .lp-tab { cursor:pointer; padding:10px 20px; border:none; background:transparent; font-size:13px; font-weight:600; color:#64748B; border-bottom:2.5px solid transparent; transition:all 0.15s; font-family:inherit; }
        .lp-tab.active { color:#3B82F6; border-bottom-color:#3B82F6; }
        .lp-tab:hover:not(.active) { color:#0F172A; }
        .lp-stage-btn { padding:6px 12px; border-radius:99px; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.15s; border:1.5px solid; }
        .lp-stage-btn:hover { opacity:0.8; transform:scale(1.03); }
        .lp-inp { padding:8px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; font-family:inherit; outline:none; width:100%; box-sizing:border-box; }
        .lp-inp:focus { border-color:#3B82F6; }
        .lp-btn-primary { padding:8px 18px; border-radius:10px; border:none; background:#3B82F6; color:#fff; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; }
        .lp-btn-primary:hover { background:#2563EB; }
        .lp-btn-primary:disabled { background:#CBD5E1; cursor:not-allowed; }
        .lp-btn-ghost { padding:7px 14px; border-radius:10px; border:1px solid #E5E7EB; background:#fff; color:#374151; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .lp-btn-ghost:hover { border-color:#3B82F6; color:#3B82F6; }
        .act-item:hover { background:#F8FAFC !important; }
      `}</style>

      {/* ── BACK BUTTON ── */}
      <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => navigate(-1)} className="lp-btn-ghost" style={{ display:'flex', alignItems:'center', gap:6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          ← Zurück
        </button>
        <span style={{ color:'#E5E7EB' }}>·</span>
        <span style={{ fontSize:12, color:'#94A3B8' }}>{name}</span>
        {/* Prev/Next Navigation */}
        {(() => {
          try {
            const navIds = JSON.parse(sessionStorage.getItem('llr_lead_nav') || '[]')
            const idx = navIds.indexOf(id)
            if (navIds.length < 2 || idx === -1) return null
            return (
              <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:11, color:'#94A3B8' }}>{idx+1} / {navIds.length}</span>
                <button onClick={() => navigate(`/leads/${navIds[idx-1]}`)} disabled={idx===0}
                  style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #E2E8F0', background: idx===0?'#F8FAFC':'#fff', color:idx===0?'#CBD5E1':'#374151', fontSize:12, fontWeight:700, cursor:idx===0?'not-allowed':'pointer' }}>
                  ‹ Vorheriger
                </button>
                <button onClick={() => navigate(`/leads/${navIds[idx+1]}`)} disabled={idx===navIds.length-1}
                  style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #E2E8F0', background:idx===navIds.length-1?'#F8FAFC':'#fff', color:idx===navIds.length-1?'#CBD5E1':'#374151', fontSize:12, fontWeight:700, cursor:idx===navIds.length-1?'not-allowed':'pointer' }}>
                  Nächster ›
                </button>
              </div>
            )
          } catch { return null }
        })()}
      </div>

      {/* ── NEUER HEADER: flach, weiß, professionell ── */}
      <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:12, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
          <Avatar name={name} avatar_url={lead.avatar_url} size={56}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:4 }}>
              <h1 style={{ fontSize:20, fontWeight:700, color:'#101828', margin:0, letterSpacing:'-0.3px' }}>{name}</h1>
              {lead.ai_buying_intent === 'hoch' && <span style={{ fontSize:10, fontWeight:700, background:'#FEF2F2', color:'#B91C1C', padding:'2px 8px', borderRadius:4 }}>🔥 Hot</span>}
            </div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:2 }}>{lead.job_title || lead.headline || '—'}</div>
            {lead.company && <div style={{ fontSize:12, color:'#9CA3AF' }}>{lead.company}{lead.city ? ` · ${lead.city}` : ''}</div>}
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:4, background:conn.bg, color:conn.color, border:`1px solid ${conn.border}` }}>
                {conn.label}
              </span>
              <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:4, background:stageCfg.bg, color:stageCfg.color, border:`1px solid ${stageCfg.border}` }}>
                {stageCfg.label}
              </span>
              {lead.lifecycle_stage && <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:4, background:'#F3F4F6', color:'#374151' }}>
                {LIFECYCLE_LABELS[lead.lifecycle_stage] || lead.lifecycle_stage}
              </span>}
              {lead.deal_value > 0 && <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:4, background:'#F0FDF4', color:'#166534', border:'1px solid #BBF7D0' }}>
                €{Number(lead.deal_value).toLocaleString('de-DE')}
              </span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {lead.email && <a href={`mailto:${lead.email}`} style={{ height:32, padding:'0 12px', borderRadius:6, border:'1px solid #E4E7EC', background:'#fff', fontSize:12, fontWeight:500, color:'#374151', textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>✉ Email</a>}
            {(lead.profile_url||lead.linkedin_url) && <a href={lead.profile_url||lead.linkedin_url} target="_blank" rel="noreferrer" style={{ height:32, padding:'0 12px', borderRadius:6, border:'1px solid #E4E7EC', background:'#fff', fontSize:12, fontWeight:500, color:'#0A66C2', textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>in LinkedIn</a>}
            {lead.phone && <a href={`tel:${lead.phone}`} style={{ height:32, padding:'0 12px', borderRadius:6, border:'1px solid #E4E7EC', background:'#fff', fontSize:12, fontWeight:500, color:'#374151', textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>📞 {lead.phone}</a>}
          </div>
        </div>
      </div>

      {/* ── STAGE-PICKER ── */}
      <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:12, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', flexShrink:0, marginRight:4 }}>Stage</span>
        {STAGE_ORDER.filter(s => s !== 'verloren').map(s => {
          const c = STAGE_CFG[s]; const active = (lead.deal_stage||'kein_deal')===s
          return (
            <button key={s} onClick={async () => {
              const prev = lead.deal_stage
              setLead(l => ({...l, deal_stage:s}))
              const { error } = await supabase.from('leads').update({ deal_stage:s }).eq('id', lead.id)
              if (error) setLead(l => ({...l, deal_stage:prev}))
            }}
              style={{ height:28, padding:'0 12px', borderRadius:6, fontSize:12, fontWeight:active?600:400, cursor:'pointer', border:`1px solid ${active?c.border:'#E4E7EC'}`, background:active?c.bg:'transparent', color:active?c.color:'#6B7280', transition:'all 0.1s' }}>
              {c.label}
            </button>
          )
        })}
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', gap:6 }}>
          {[{type:'call',icon:'📞',label:'Anruf'},{type:'email',icon:'📧',label:'Email'},{type:'linkedin_message',icon:'💬',label:'LinkedIn'},{type:'meeting',icon:'🤝',label:'Meeting'}].map(({type,icon,label}) => (
            <button key={type} onClick={async () => {
              const subj = `${label} mit ${name}`
              await supabase.from('activities').insert({lead_id:lead.id,user_id:user.id,type,subject:subj,occurred_at:new Date().toISOString()})
              setActivities(prev => [{id:Date.now(),type,subject:subj,occurred_at:new Date().toISOString()},...prev])
              showToast(`${icon} ${label} geloggt ✓`)
            }} style={{ height:28, padding:'0 10px', borderRadius:6, border:'1px solid #E4E7EC', background:'#F9FAFB', fontSize:12, fontWeight:500, color:'#374151', cursor:'pointer' }}>
              {icon} {label}
            </button>
          ))}
          <button onClick={async () => {
            setPitchModal(true); setPitchLoading(true); setPitchText('')
            try {
              const res = await fetch('https://api.anthropic.com/v1/messages', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:500, messages:[{ role:'user', content:`Erstelle einen kurzen, personalisierten Elevator Pitch (3-4 Sätze) für:
Name: ${name}
Firma: ${lead.company||'unbekannt'}
Position: ${lead.job_title||lead.headline||'unbekannt'}
Auf Deutsch, kein Einleitung.` }]})
              })
              const d = await res.json(); setPitchText(d.content?.[0]?.text||'Fehler')
            } catch(e) { setPitchText('⚠️ Fehler') }
            setPitchLoading(false)
          }} style={{ height:28, padding:'0 10px', borderRadius:6, border:'1px solid #E4E7EC', background:'#F9FAFB', fontSize:12, fontWeight:500, color:'#7C3AED', cursor:'pointer' }}>
            🤖 Pitch
          </button>
        </div>
      </div>

      {/* ── ZWEISPALTIGES LAYOUT ── */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap:16, alignItems:'start' }}>

        {/* ── LINKE SPALTE: Kontaktinfos ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Score */}
          <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:12, padding:'16px 18px' }}>
            <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Leadesk Score</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <ScoreRing score={score} size={52}/>
              <div>
                <div style={{ fontSize:24, fontWeight:700, color: score>=70?'#DC2626':score>=40?'#D97706':'#2563EB', letterSpacing:'-0.5px' }}>{score}</div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>von 100 Punkten</div>
              </div>
            </div>
          </div>

          {/* Kontakt */}
          <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:12, padding:'16px 18px' }}>
            <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>Kontakt</div>
            {[
              { icon:'✉', label:'E-Mail', val:lead.email, href:`mailto:${lead.email}` },
              { icon:'📞', label:'Telefon', val:lead.phone, href:`tel:${lead.phone}` },
              { icon:'in', label:'LinkedIn', val:lead.profile_url||lead.linkedin_url ? 'Profil öffnen' : null, href:lead.profile_url||lead.linkedin_url },
              { icon:'🌐', label:'Website', val:lead.company_website, href:lead.company_website },
            ].map(({ icon, label, val, href }) => val ? (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:8, marginBottom:8, borderBottom:'1px solid #F3F4F6' }}>
                <span style={{ fontSize:13, width:18, textAlign:'center', flexShrink:0 }}>{icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:500 }}>{label}</div>
                  {href ? <a href={href} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#2563EB', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{val}</a>
                    : <span style={{ fontSize:12, color:'#374151' }}>{val}</span>}
                </div>
              </div>
            ) : null)}
            {!lead.email && !lead.phone && !lead.profile_url && !lead.linkedin_url && (
              <div style={{ fontSize:12, color:'#D1D5DB', fontStyle:'italic' }}>Keine Kontaktdaten — im Tab "Bearbeiten" ergänzen</div>
            )}
          </div>

          {/* Unternehmen */}
          {(lead.company || lead.industry || lead.city) && (
            <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:12, padding:'16px 18px' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>Unternehmen</div>
              {[
                { label:'Firma', val:lead.company },
                { label:'Branche', val:lead.industry },
                { label:'Größe', val:lead.company_size },
                { label:'Stadt', val:lead.city ? `${lead.city}${lead.country?', '+lead.country:''}` : lead.country },
              ].map(({ label, val }) => val ? (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:6, marginBottom:6, borderBottom:'1px solid #F3F4F6' }}>
                  <span style={{ fontSize:11, color:'#9CA3AF' }}>{label}</span>
                  <span style={{ fontSize:12, color:'#374151', fontWeight:500, maxWidth:140, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</span>
                </div>
              ) : null)}
            </div>
          )}

          {/* AI-Erkenntnisse */}
          {(lead.ai_buying_intent || lead.ai_need_detected || (lead.ai_pain_points?.length > 0)) && (
            <div style={{ background:'#FAFAFA', border:'1px solid #E4E7EC', borderRadius:12, padding:'16px 18px' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>KI-Analyse</div>
              {lead.ai_buying_intent && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:2 }}>Kaufinteresse</div>
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:4, background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F3F4F6', color:lead.ai_buying_intent==='hoch'?'#B91C1C':lead.ai_buying_intent==='mittel'?'#92400E':'#374151' }}>
                    {lead.ai_buying_intent}
                  </span>
                </div>
              )}
              {lead.ai_need_detected && <div style={{ fontSize:12, color:'#374151', marginBottom:6 }}><span style={{ color:'#9CA3AF', fontSize:11 }}>Bedarf: </span>{lead.ai_need_detected}</div>}
              {lead.ai_pain_points?.length > 0 && <div style={{ fontSize:12, color:'#374151' }}><span style={{ color:'#9CA3AF', fontSize:11 }}>Pain Points: </span>{lead.ai_pain_points.join(', ')}</div>}
            </div>
          )}
        </div>

        {/* ── RECHTE SPALTE: Tabs ── */}
        <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:12, overflow:'hidden' }}>

          {/* Tab-Navigation */}
          <div style={{ display:'flex', borderBottom:'1px solid #E4E7EC', background:'#fff', overflowX:'auto', scrollbarWidth:'none' }}>
            {[
              { id:'timeline', label:'Aktivitäten', count:activities.length },
              { id:'notizen',  label:'Notizen',     count:notes.length },
              { id:'crm',     label:'CRM / Deal' },
              { id:'aufgaben',label:'☑ Aufgaben' },
              { id:'details', label:'✏ Bearbeiten' },
              { id:'nachricht', label:'Nachricht' },
            ].map(({ id, label, count }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{ padding:'12px 16px', border:'none', background:'transparent', fontSize:13, fontWeight:activeTab===id?600:400, color:activeTab===id?'#101828':'#6B7280', borderBottom:`2px solid ${activeTab===id?'#2563EB':'transparent'}`, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', flexShrink:0 }}>
                {label}{count > 0 ? ` (${count})` : ''}
              </button>
            ))}
          </div>

          {/* Tab-Inhalt */}
          <div style={{ padding:'20px' }}>

            {/* AKTIVITÄTEN */}
            {activeTab === 'timeline' && (
              <div>
                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  <select value={newAct.type} onChange={e => setNewAct(a => ({...a,type:e.target.value}))}
                    style={{ height:34, padding:'0 10px', border:'1px solid #E4E7EC', borderRadius:6, fontSize:12, color:'#374151', background:'#fff', fontFamily:'inherit', outline:'none' }}>
                    {[['call','📞 Anruf'],['email','📧 Email'],['meeting','🤝 Meeting'],['linkedin_message','💬 LinkedIn'],['note','📝 Notiz']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input value={newAct.subject} onChange={e => setNewAct(a => ({...a,subject:e.target.value}))}
                    placeholder="Betreff / Notiz…" className="lp-inp"
                    style={{ flex:1, height:34, padding:'0 10px', fontSize:12 }}
                    onKeyDown={e => { if(e.key==='Enter' && newAct.subject.trim()) addAct() }}/>
                  <button onClick={addAct} disabled={!newAct.subject.trim()}
                    style={{ height:34, padding:'0 16px', borderRadius:6, border:'none', background:newAct.subject.trim()?'#2563EB':'#E4E7EC', color:newAct.subject.trim()?'#fff':'#9CA3AF', fontSize:12, fontWeight:600, cursor:newAct.subject.trim()?'pointer':'default', fontFamily:'inherit' }}>
                    + Hinzufügen
                  </button>
                </div>
                {activities.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', color:'#D1D5DB', fontSize:13 }}>Noch keine Aktivitäten</div>
                ) : activities.map(act => (
                  <div key={act.id} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid #F3F4F6', alignItems:'flex-start' }}>
                    <div style={{ width:32, height:32, borderRadius:6, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{ACT_ICONS[act.type]||'📌'}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'#101828' }}>{act.subject||act.type}</div>
                      {act.body && <div style={{ fontSize:12, color:'#6B7280', marginTop:2, lineHeight:1.5 }}>{act.body}</div>}
                      <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>{act.occurred_at ? new Date(act.occurred_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</div>
                    </div>
                    <button onClick={async () => {
                      await supabase.from('activities').delete().eq('id', act.id)
                      setActivities(prev => prev.filter(a => a.id !== act.id))
                    }} style={{ background:'none', border:'none', color:'#D1D5DB', cursor:'pointer', fontSize:16, padding:'0 4px', flexShrink:0 }} title="Löschen">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* NOTIZEN */}
            {activeTab === 'notizen' && (
              <div>
                <div style={{ marginBottom:16 }}>
                  <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3}
                    placeholder="Neue Notiz schreiben…"
                    className="lp-inp" style={{ resize:'vertical', lineHeight:1.6, marginBottom:8 }}/>
                  <button onClick={addNote} disabled={!newNote.trim()}
                    style={{ height:32, padding:'0 16px', borderRadius:6, border:'none', background:newNote.trim()?'#2563EB':'#E4E7EC', color:newNote.trim()?'#fff':'#9CA3AF', fontSize:12, fontWeight:600, cursor:newNote.trim()?'pointer':'default', fontFamily:'inherit' }}>
                    Notiz speichern
                  </button>
                </div>
                {notes.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', color:'#D1D5DB', fontSize:13 }}>Noch keine Notizen</div>
                ) : notes.map(n => (
                  <div key={n.id} style={{ padding:'12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, marginBottom:8, position:'relative' }}>
                    {editingNote?.id === n.id ? (
                      <div>
                        <textarea value={editingNote.content} onChange={e => setEditingNote(prev => ({...prev,content:e.target.value}))}
                          rows={3} className="lp-inp" style={{ resize:'vertical', lineHeight:1.6, marginBottom:8 }}/>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={async () => {
                            await supabase.from('contact_notes').update({content:editingNote.content}).eq('id',n.id)
                            setNotes(prev => prev.map(x => x.id===n.id ? {...x,content:editingNote.content} : x))
                            setEditingNote(null)
                          }} style={{ height:28, padding:'0 12px', borderRadius:5, border:'none', background:'#2563EB', color:'#fff', fontSize:12, cursor:'pointer' }}>Speichern</button>
                          <button onClick={() => setEditingNote(null)} style={{ height:28, padding:'0 12px', borderRadius:5, border:'1px solid #E4E7EC', background:'#fff', color:'#374151', fontSize:12, cursor:'pointer' }}>Abbrechen</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:13, color:'#374151', lineHeight:1.6, whiteSpace:'pre-wrap', marginBottom:6 }}>{n.content}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF' }}>{new Date(n.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
                        <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:4 }}>
                          <button onClick={() => setEditingNote({id:n.id,content:n.content})} style={{ background:'none', border:'none', color:'#9CA3AF', cursor:'pointer', fontSize:13 }}>✏</button>
                          <button onClick={async () => { await supabase.from('contact_notes').delete().eq('id',n.id); setNotes(prev => prev.filter(x=>x.id!==n.id)) }}
                            style={{ background:'none', border:'none', color:'#D1D5DB', cursor:'pointer', fontSize:16 }}>×</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* CRM / DEAL */}
            {activeTab === 'crm' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {saveError && <div style={{ padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, fontSize:12, color:'#991B1B' }}>⚠ {saveError}</div>}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Deal-Wert (€)</label>
                    <input type="number" value={form.deal_value} onChange={e => setField('deal_value',e.target.value)} placeholder="z.B. 4800" className="lp-inp"/></div>
                  <div><label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Wahrscheinlichkeit (%)</label>
                    <input type="number" min="0" max="100" value={form.deal_probability} onChange={e => setField('deal_probability',e.target.value)} className="lp-inp"/></div>
                  <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Abschluss geplant</label>
                    <input type="date" value={form.deal_expected_close} onChange={e => setField('deal_expected_close',e.target.value)} className="lp-inp"/></div>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Notizen / Erkannter Bedarf</label>
                  <textarea value={form.ai_need_detected} onChange={e => setField('ai_need_detected',e.target.value)} rows={3} className="lp-inp" style={{ resize:'vertical', lineHeight:1.6 }} placeholder="Was braucht dieser Lead?"/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Interne Deal-Notiz</label>
                  <textarea value={form.notes} onChange={e => setField('notes',e.target.value)} rows={3} className="lp-inp" style={{ resize:'vertical', lineHeight:1.6 }} placeholder="Deal-Notizen…"/>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={save} disabled={saving||!formDirty}
                    style={{ flex:1, padding:'9px', borderRadius:7, border:'none', background:formDirty?'#2563EB':'#E4E7EC', color:formDirty?'#fff':'#9CA3AF', fontSize:13, fontWeight:600, cursor:formDirty?'pointer':'default' }}>
                    {saving?'⏳ Speichere…':formDirty?'💾 Speichern':'Keine Änderungen'}
                  </button>
                </div>
              </div>
            )}

            {/* BEARBEITEN */}
            {activeTab === 'aufgaben' && (
              <div style={{ padding:'20px 0' }}>
                <LeadTasks
                  leadId={lead.id}
                  teamId={team?.id}
                  session={session}
                  members={members}
                />
              </div>
            )}

            {activeTab === 'details' && (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {saveError && (
                  <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:13, color:'#991B1B' }}>
                    ⚠ {saveError}
                    <button onClick={()=>setSaveError(null)} style={{ float:'right', background:'none', border:'none', cursor:'pointer', color:'#991B1B', fontSize:16 }}>×</button>
                  </div>
                )}

                {/* PERSON */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12, paddingBottom:6, borderBottom:'1px solid #F3F4F6' }}>Person</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                      { key:'first_name', label:'Vorname',    col:1 },
                      { key:'last_name',  label:'Nachname',   col:1 },
                      { key:'job_title',  label:'Position',   col:2 },
                    ].map(({ key, label, col }) => (
                      <div key={key} style={{ gridColumn:col===2?'1/-1':'auto' }}>
                        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{label}</label>
                        <input className="lp-inp"
                          value={editVals[key] ?? ''}
                          onChange={e => setEditVals(v => ({...v, [key]: e.target.value}))}
                          placeholder={label + '…'}
                          onFocus={e => e.target.style.borderColor='#2563EB'}
                          onBlur={e => e.target.style.borderColor='#E4E7EC'}/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* KONTAKT */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12, paddingBottom:6, borderBottom:'1px solid #F3F4F6' }}>Kontakt</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                      { key:'email',       label:'E-Mail',      type:'email', col:1 },
                      { key:'phone',       label:'Telefon',     type:'tel',   col:1 },
                      { key:'linkedin_url',label:'LinkedIn URL',type:'url',   col:2 },
                    ].map(({ key, label, type, col }) => (
                      <div key={key} style={{ gridColumn:col===2?'1/-1':'auto' }}>
                        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{label}</label>
                        <input type={type||'text'} className="lp-inp"
                          value={editVals[key] ?? ''}
                          onChange={e => setEditVals(v => ({...v, [key]: e.target.value}))}
                          placeholder={label + '…'}
                          onFocus={e => e.target.style.borderColor='#2563EB'}
                          onBlur={e => e.target.style.borderColor='#E4E7EC'}/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* UNTERNEHMEN */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12, paddingBottom:6, borderBottom:'1px solid #F3F4F6' }}>Unternehmen</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                      { key:'company',          label:'Firma',       col:2 },
                      { key:'industry',         label:'Branche',     col:1 },
                      { key:'company_website',  label:'Website',     col:2, type:'url' },
                      { key:'city',             label:'Stadt',       col:1 },
                      { key:'country',          label:'Land',        col:1 },
                    ].map(({ key, label, col, type }) => (
                      <div key={key} style={{ gridColumn:col===2?'1/-1':'auto' }}>
                        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{label}</label>
                        <input type={type||'text'} className="lp-inp"
                          value={editVals[key] ?? ''}
                          onChange={e => setEditVals(v => ({...v, [key]: e.target.value}))}
                          placeholder={label + '…'}
                          onFocus={e => e.target.style.borderColor='#2563EB'}
                          onBlur={e => e.target.style.borderColor='#E4E7EC'}/>
                      </div>
                    ))}
                  </div>
                  {/* Mitarbeiter-Größe als ENUM-Dropdown */}
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Mitarbeiter</label>
                    <select className="lp-inp"
                      value={editVals.company_size !== undefined ? editVals.company_size : (lead.company_size||'')}
                      onChange={e => setEditVals(v => ({...v, company_size: e.target.value}))}>
                      <option value="">— bitte wählen —</option>
                      {['1','2-10','11-50','51-200','201-500','501-1000','1001-5000','5001-10000','10001+'].map(v => (
                        <option key={v} value={v}>{v} Mitarbeiter</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* NOTIZEN */}
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:8 }}>Interne Notizen</label>
                  <textarea className="lp-inp"
                    value={editVals.notes ?? ''}
                    rows={4}
                    placeholder="Notizen zu diesem Lead…"
                    style={{ resize:'vertical', lineHeight:1.6 }}
                    onChange={e => setEditVals(v => ({...v, notes: e.target.value}))}
                    onFocus={e => e.target.style.borderColor='#2563EB'}
                    onBlur={e => e.target.style.borderColor='#E4E7EC'}/>
                </div>

                {/* SPEICHERN */}
                <button disabled={saving}
                  onClick={async () => {
                    setSaving(true); setSaveError(null)
                    try {
                      const updates = {
                        first_name:       editVals.first_name       ?? lead.first_name,
                        last_name:        editVals.last_name        ?? lead.last_name,
                        job_title:        editVals.job_title        ?? lead.job_title,
                        email:            editVals.email            ?? lead.email,
                        phone:            editVals.phone            ?? lead.phone,
                        linkedin_url:     editVals.linkedin_url     ?? lead.linkedin_url ?? lead.profile_url,
                        company:          editVals.company          ?? lead.company,
                        industry:         editVals.industry         ?? lead.industry,
                        company_website:  editVals.company_website  ?? lead.company_website,
                        ...((() => { const v = editVals.company_size ?? lead.company_size; return ['1','2-10','11-50','51-200','201-500','501-1000','1001-5000','5001-10000','10001+'].includes(v) ? {company_size: v} : {} })()),
                        city:             editVals.city             ?? lead.city,
                        country:          editVals.country          ?? lead.country,
                        notes:            editVals.notes            ?? lead.notes,
                      }
                      const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
                      if (error) throw error
                      setLead(l => ({...l, ...updates}))
                      showToast('✓ Lead gespeichert')
                    } catch(err) {
                      setSaveError(err.message)
                      showToast('⚠ ' + err.message)
                    }
                    setSaving(false)
                  }}
                  style={{ padding:'11px', borderRadius:8, border:'none', background:saving?'#E4E7EC':'#2563EB', color:saving?'#9CA3AF':'#fff', fontSize:14, fontWeight:600, cursor:saving?'default':'pointer', transition:'all 0.15s' }}>
                  {saving ? '⏳ Speichere…' : '💾 Änderungen speichern'}
                </button>

                <div style={{ paddingTop:8, borderTop:'1px solid #F3F4F6', textAlign:'right' }}>
                  <button onClick={()=>{ if(window.confirm('Lead wirklich löschen?')){ supabase.from('leads').delete().eq('id',lead.id); navigate('/leads') }}}
                    style={{ padding:'6px 14px', borderRadius:6, border:'1px solid #FECACA', background:'transparent', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    🗑 Lead löschen
                  </button>
                </div>
              </div>
            )}
            {/* NACHRICHT */}
            {activeTab === 'nachricht' && (
              <div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>LinkedIn Nachricht</label>
                  <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                    {[['Freundlich','Hi {name}, ich hoffe es läuft gut!'],['Anfrage','Hallo {name}, ich würde gerne mit dir vernetzen.'],['Follow-up','Hi {name}, ich melde mich nochmal wegen meiner Anfrage.']].map(([l,t]) => (
                      <button key={l} onClick={() => setMsgText(t.replace('{name}',lead.first_name||name))}
                        style={{ padding:'4px 10px', borderRadius:5, border:'1px solid #E4E7EC', background:'#F9FAFB', fontSize:11, cursor:'pointer', color:'#374151' }}>{l}</button>
                    ))}
                    <button onClick={async () => {
                      try {
                        const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:300,messages:[{role:'user',content:`Schreibe eine kurze LinkedIn-Nachricht an ${name} (${lead.job_title||''} bei ${lead.company||''}). Persönlich, direkt, auf Deutsch. Max 200 Zeichen.`}]})})
                        const d = await res.json(); setMsgText(d.content?.[0]?.text||'')
                      } catch(e) { showToast('KI-Fehler') }
                    }} style={{ padding:'4px 10px', borderRadius:5, border:'1px solid #E4E7EC', background:'#F9FAFB', fontSize:11, cursor:'pointer', color:'#7C3AED' }}>🤖 KI</button>
                  </div>
                  <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={5}
                    placeholder="Nachrichtentext…" className="lp-inp" style={{ resize:'vertical', lineHeight:1.6 }}/>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                    <span style={{ fontSize:11, color:msgText.length>300?'#DC2626':'#9CA3AF' }}>{msgText.length}/300 Zeichen</span>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => { navigator.clipboard.writeText(msgText); showToast('Kopiert ✓') }}
                        style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #E4E7EC', background:'#fff', fontSize:12, cursor:'pointer', color:'#374151' }}>📋 Kopieren</button>
                      {(lead.profile_url||lead.linkedin_url) && <a href={lead.profile_url||lead.linkedin_url} target="_blank" rel="noreferrer"
                        style={{ padding:'6px 12px', borderRadius:6, border:'none', background:'#0A66C2', fontSize:12, fontWeight:600, cursor:'pointer', color:'#fff', textDecoration:'none' }}>in LinkedIn öffnen</a>}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>

    {pitchModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
        onClick={e => e.target===e.currentTarget && setPitchModal(false)}>
        <div style={{ background:'white', borderRadius:20, padding:28, width:500, maxWidth:'95vw', boxShadow:'0 24px 48px rgba(0,0,0,0.2)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),#818CF8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🤖</div>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>KI-Elevator Pitch</div>
              <div style={{ fontSize:12, color:'#94A3B8' }}>Personalisiert für {name}</div>
            </div>
            <button onClick={() => setPitchModal(false)} style={{ marginLeft:'auto', background:'#F1F5F9', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, color:'#64748B' }}>✕</button>
          </div>
          {pitchLoading ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#94A3B8' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
              <div style={{ fontSize:13, fontWeight:600 }}>KI erstellt deinen Pitch…</div>
            </div>
          ) : (
            <>
              <div style={{ background:'#F8FAFC', borderRadius:12, padding:'16px', border:'1px solid #E5E7EB', fontSize:13, color:'rgb(20,20,43)', lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:16, minHeight:80 }}>
                {pitchText}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { navigator.clipboard.writeText(pitchText); showToast('✓ Pitch kopiert!') }}
                  style={{ flex:1, padding:'9px', borderRadius:9, border:'1.5px solid #E2E8F0', background:'white', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  📋 Kopieren
                </button>
                <button onClick={() => setPitchModal(false)}
                  style={{ flex:1, padding:'9px', borderRadius:9, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  ✓ Fertig
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}

    {toast && (
      <div style={{ position:'fixed', bottom:28, right:28, background:toast.type==='error'?'#EF4444':'#16a34a', color:'#fff', padding:'12px 22px', borderRadius:12, fontWeight:700, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,0.18)', zIndex:9999 }}>
        {toast.msg}
      </div>
    )}
    </>
  )
}
