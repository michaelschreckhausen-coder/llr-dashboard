import { useResponsive } from '../hooks/useResponsive'
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
    loadActivities(data)
    loadNotes(data)
  }

  async function loadActivities(l) {
    const { data } = await supabase.from('activities').select('*').eq('lead_id', l.id).order('occurred_at', { ascending:false }).limit(50)
    setActivities(data || [])
  }

  async function loadNotes(l) {
    const { data } = await supabase.from('contact_notes').select('*').eq('lead_id', l.id).order('created_at', { ascending:false }).limit(50)
    setNotes(data || [])
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

  async function logActivity() {
    if (!newAct.subject.trim()) return
    setAddingAct(true); setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
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
      const { data: { user } } = await supabase.auth.getUser()
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
  if (!lead) return null

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
    { id:'details',    label:'Details' },
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

      {/* ── HERO HEADER ── */}
      <div className="lp-anim" style={{ background:'linear-gradient(135deg,#0F172A 0%,#1E3A8A 50%,#1E40AF 100%)', borderRadius:20, padding:'28px 32px', marginBottom:20, position:'relative', overflow:'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ position:'absolute', bottom:-40, right:120, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.03)' }}/>

        <div style={{ display:'flex', alignItems:'flex-start', gap:20, position:'relative', zIndex:1, flexWrap:'wrap' }}>
          <Avatar name={name} avatar_url={lead.avatar_url} size={80}/>

          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:4 }}>
              <h1 style={{ fontSize:24, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-0.03em' }}>{name}</h1>
              {lead.ai_buying_intent === 'hoch' && <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:800, background:'rgba(239,68,68,0.25)', color:'#FCA5A5', border:'1px solid rgba(239,68,68,0.3)' }}>🔥 Hot Lead</span>}
            </div>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.75)', marginBottom:4 }}>{lead.job_title || lead.headline}</div>
            {lead.company && <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', fontWeight:600 }}>{lead.company}{lead.city ? ` · ${lead.city}` : ''}</div>}

            {/* Quick badges */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
              <span style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:conn.bg, color:conn.color, border:`1px solid ${conn.border}` }}>
                <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:conn.dot, marginRight:5, verticalAlign:'middle' }}/>
                {conn.label}
              </span>
              <span style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:stageCfg.bg, color:stageCfg.color, border:`1px solid ${stageCfg.border}` }}>
                {stageCfg.label}
              </span>
              {lead.lifecycle_stage && (
                <span style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.8)' }}>
                  {LIFECYCLE_LABELS[lead.lifecycle_stage] || lead.lifecycle_stage}
                </span>
              )}
              {lead.deal_value > 0 && (
                <span style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(34,197,94,0.2)', color:'#86EFAC', border:'1px solid rgba(34,197,94,0.3)' }}>
                  💰 €{Number(lead.deal_value).toLocaleString('de-DE')}
                </span>
              )}
              {lead.email && (
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <a href={`mailto:${lead.email}`} style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.8)', textDecoration:'none' }}>
                    ✉ {lead.email}
                  </a>
                  <button onClick={() => { navigator.clipboard.writeText(lead.email); showToast('Email kopiert ✓') }}
                    style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:6, color:'rgba(255,255,255,0.7)', fontSize:11, cursor:'pointer', padding:'3px 6px' }} title="Kopieren">📋</button>
                </div>
              )}
              {(lead.profile_url || lead.linkedin_url) && (
                <a href={lead.profile_url || lead.linkedin_url} target="_blank" rel="noreferrer" style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(10,102,194,0.3)', color:'#93C5FD', textDecoration:'none', border:'1px solid rgba(10,102,194,0.4)' }}>
                  in LinkedIn →
                </a>
              )}
            </div>
            {/* Quick-Log Buttons */}
            <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
              <button onClick={() => setActiveTab('timeline')}
                style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.22)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.12)'}>
                🕐 Aktivität
              </button>
              <button onClick={() => navigate('/redaktionsplan?lead='+lead.id+'&name='+encodeURIComponent(name)+'&company='+encodeURIComponent(lead.company||''))}
                style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.22)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.12)'}>
                ✍️ Post
              </button>
              <button onClick={async () => {
                setPitchModal(true); setPitchLoading(true); setPitchText('')
                try {
                  const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:500, messages:[{ role:'user', content:
                      `Erstelle einen kurzen, personalisierten Elevator Pitch (3-4 Sätze) für einen Sales-Call mit:

Name: ${name}
Firma: ${lead.company||'unbekannt'}
Position: ${lead.job_title||lead.headline||'unbekannt'}
Kaufinteresse: ${lead.ai_buying_intent||'unbekannt'}
Besonderes: ${lead.ai_pain_points?.[0]||''}

Der Pitch soll klar machen warum ich mich melde und was ich biete. Direkt auf Deutsch, kein Einleitung.`
                    }]})
                  })
                  const d = await res.json(); setPitchText(d.content?.[0]?.text||'Fehler')
                } catch(e) { setPitchText('⚠️ Fehler beim Generieren') }
                setPitchLoading(false)
              }} style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.22)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.12)'}>
                🤖 KI-Pitch
              </button>
              {[
                { type:'call', icon:'📞', label:'Anruf' },
                { type:'email', icon:'📧', label:'Email' },
                { type:'linkedin_message', icon:'💬', label:'LinkedIn' },
                { type:'meeting', icon:'🤝', label:'Meeting' },
              ].map(({ type, icon, label }) => (
                <button key={type} onClick={async () => {
                  const subj = `${label} mit ${name}`
                  await supabase.from('activities').insert({ lead_id:lead.id, user_id:user.id, type, subject:subj, occurred_at:new Date().toISOString() })
                  setActivities(prev => [{ id:Date.now(), type, subject:subj, occurred_at:new Date().toISOString() }, ...prev])
                  showToast(`${icon} ${label} geloggt ✓`)
                }} style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', backdropFilter:'blur(4px)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.22)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.12)'}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Score Ring */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ position:'relative' }}>
              <ScoreRing score={score} size={72}/>
              {scoreTrend !== null && scoreTrend !== 0 && (
                <div style={{ position:'absolute', top:-8, right:-8, background:scoreTrend>0?'#16a34a':'#ef4444', color:'#fff', borderRadius:99, fontSize:10, fontWeight:800, padding:'2px 5px', minWidth:20, textAlign:'center' }}>
                  {scoreTrend>0?'+':''}{scoreTrend}
                </div>
              )}
            </div>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>HubSpot Score</span>
            {lead.next_followup && (() => {
              const d = new Date(lead.next_followup)
              const diff = Math.round((d - new Date()) / 86400000)
              const label = diff < 0 ? `${Math.abs(diff)}d überfällig` : diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : `in ${diff}d`
              const isOver = diff < 0
              return <span style={{ fontSize:10, fontWeight:700, color:isOver?'#fca5a5':'#86efac', background:'rgba(0,0,0,0.25)', borderRadius:6, padding:'2px 7px', marginTop:2 }}>📅 {label}</span>
            })()}
          </div>
        </div>

        {/* Pipeline Stage Progress */}
        <div style={{ marginTop:20, position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.08)', borderRadius:10, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)' }}>
            {STAGE_ORDER.filter(s => s !== 'verloren').map((s, i, arr) => {
              const cfg   = STAGE_CFG[s]
              const active = (lead.deal_stage || 'kein_deal') === s
              const past   = STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(lead.deal_stage || 'kein_deal')
              return (
                <button key={s} onClick={() => saveDealStage(s)} title={cfg.label}
                  style={{ flex:1, padding:'8px 4px', border:'none', cursor:'pointer', background:active?cfg.color:past?cfg.color+'33':'transparent', color:active||past?'#fff':'rgba(255,255,255,0.45)', fontSize:10, fontWeight:700, transition:'all 0.2s', position:'relative', borderRight:i<arr.length-1?'1px solid rgba(255,255,255,0.08)':'none', textAlign:'center' }}>
                  {active && <span style={{ position:'absolute', top:2, left:'50%', transform:'translateX(-50%)', fontSize:8, color:'rgba(255,255,255,0.7)' }}>▼</span>}
                  <div style={{ marginTop:active?8:0 }}>{cfg.label}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── ERROR BANNER ── */}
      {saveError && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 16px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, color:'#991B1B' }}>
          <span>❌ {saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#991B1B', fontSize:18 }}>×</button>
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{ background:'#fff', borderRadius:'12px 12px 0 0', border:'1px solid #E5E7EB', borderBottom:'none', display:'flex', overflow:'hidden' }}>
        {TABS.map(t => (
          <button key={t.id} className={`lp-tab${activeTab===t.id?' active':''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className="lp-anim" key={activeTab} style={{ background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:'0 0 16px 16px', padding:20, minHeight:400 }}>

        {/* ═══ ÜBERSICHT TAB ═══ */}
        {activeTab === 'uebersicht' && (
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 16 }}>
            {/* AI-Erkenntnisse */}
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ background:'linear-gradient(135deg,#F5F3FF,#EFF6FF)', borderRadius:14, padding:'16px 20px', border:'1px solid #DDD6FE', display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#7C3AED', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>🤖 AI-Erkenntnisse</div>
                  {lead.ai_need_detected && (
                    <div style={{ fontSize:13, color:'#1E1B4B', fontWeight:600, marginBottom:8, lineHeight:1.5 }}>{lead.ai_need_detected}</div>
                  )}
                  {lead.ai_next_best_action && (
                    <div style={{ fontSize:12, color:'#065F46', fontWeight:600, marginBottom:8, background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:8, padding:'6px 10px' }}>
                      ✅ {lead.ai_next_best_action}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                    {(lead.ai_pain_points||[]).map((p,i) => <Tag key={i} color="#EF4444">{p}</Tag>)}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {(lead.ai_use_cases||[]).map((u,i) => <Tag key={i} color="#3B82F6">{u}</Tag>)}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ padding:'5px 14px', borderRadius:99, fontSize:12, fontWeight:800,
                    background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC',
                    color:lead.ai_buying_intent==='hoch'?'#EF4444':lead.ai_buying_intent==='mittel'?'#F59E0B':'#64748B',
                    border:`1px solid ${lead.ai_buying_intent==='hoch'?'#FECACA':lead.ai_buying_intent==='mittel'?'#FDE68A':'#E5E7EB'}` }}>
                    {lead.ai_buying_intent==='hoch'?'🔥 Hoch':lead.ai_buying_intent==='mittel'?'⚡ Mittel':lead.ai_buying_intent==='niedrig'?'○ Niedrig':'— Unbekannt'}
                  </span>
                  <span style={{ fontSize:10, color:'#94A3B8', fontWeight:600 }}>Buying Intent</span>
                </div>
              </div>
            </div>

            {/* Letzte Aktivitäten */}
            <SectionCard title="Letzte Aktivitäten" icon="⚡" action={
              <div style={{ display:'flex', gap:6 }}>
                <button className="lp-btn-ghost" onClick={() => setActiveTab('crm')} style={{ color:'#16a34a' }}>+ Neu</button>
                <button className="lp-btn-ghost" onClick={() => setActiveTab('timeline')}>Alle →</button>
              </div>
            }>
              {activities.length === 0
                ? <div style={{ color:'#CBD5E1', fontSize:13, fontStyle:'italic', textAlign:'center', padding:'12px 0' }}>Noch keine Aktivitäten</div>
                : activities.slice(0,5).map(a => (
                  <div key={a.id} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid #F1F5F9', alignItems:'center' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:(ACT_COLORS[a.type]||'#94A3B8')+'15', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>
                      {ACT_ICONS[a.type]||'📌'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.subject}</div>
                      <div style={{ fontSize:11, color:'#94A3B8' }}>{new Date(a.occurred_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
                    </div>
                    <button onClick={async e => { e.stopPropagation(); await supabase.from('activities').delete().eq('id',a.id); setActivities(prev=>prev.filter(x=>x.id!==a.id)) }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:14, flexShrink:0, padding:'2px 4px' }}
                      onMouseEnter={e=>e.currentTarget.style.color='#EF4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
                  </div>
                ))
              }
            </SectionCard>

            {/* Letzte Notizen */}
            <SectionCard title="Notizen" icon="📝" action={
              <button className="lp-btn-ghost" onClick={() => setActiveTab('notizen')}>Alle →</button>
            }>
              {notes.length === 0
                ? <div style={{ color:'#CBD5E1', fontSize:13, fontStyle:'italic', textAlign:'center', padding:'12px 0' }}>Noch keine Notizen</div>
                : notes.slice(0,3).map(n => {
                  const d = new Date(n.created_at)
                  const days = Math.floor((Date.now()-d)/86400000)
                  const relD = days===0?'Heute':days===1?'Gestern':days<7?`${days} Tage`:d.toLocaleDateString('de-DE',{day:'2-digit',month:'short'})
                  return (
                    <div key={n.id} style={{ padding:'8px 0', borderBottom:'1px solid #F1F5F9', background:n.is_pinned?'#FFFBEB':'transparent', marginLeft:n.is_pinned?-8:0, paddingLeft:n.is_pinned?8:0, borderRadius:n.is_pinned?4:0, display:'flex', gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        {n.is_pinned && <span style={{ fontSize:10, color:'#d97706', fontWeight:700, marginBottom:2, display:'block' }}>📌 Gepinnt</span>}
                        <div style={{ fontSize:12, color:'#0F172A', lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{n.content}</div>
                        <div style={{ fontSize:11, color:'#94A3B8', marginTop:3 }}>{relD}</div>
                      </div>
                      <button onClick={async e => { e.stopPropagation(); const v=!n.is_pinned; await supabase.from('contact_notes').update({is_pinned:v}).eq('id',n.id); setNotes(prev=>prev.map(x=>x.id===n.id?{...x,is_pinned:v}:x).sort((a,b)=>b.is_pinned-a.is_pinned||new Date(b.created_at)-new Date(a.created_at))) }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:n.is_pinned?'#d97706':'#CBD5E1', fontSize:14, flexShrink:0, alignSelf:'flex-start', padding:'2px' }}
                        onMouseEnter={e=>e.currentTarget.style.color='#d97706'} onMouseLeave={e=>e.currentTarget.style.color=n.is_pinned?'#d97706':'#CBD5E1'}>📌</button>
                    </div>
                  )
                })
              }
            </SectionCard>

            {/* Kontakt-Info Quick */}
            <SectionCard title="Kontakt" icon="📧">
              <InfoRow label="E-Mail"    value={lead.email}    link={lead.email?`mailto:${lead.email}`:null}/>
              <InfoRow label="Telefon"   value={lead.phone}    link={lead.phone?`tel:${lead.phone}`:null}/>
              <InfoRow label="LinkedIn"  value={lead.profile_url||lead.linkedin_url ? 'Profil öffnen' : null} link={lead.profile_url||lead.linkedin_url}/>
              <InfoRow label="Website"   value={lead.company_website} link={lead.company_website}/>
              <InfoRow label="Standort"  value={[lead.city, lead.country].filter(Boolean).join(', ')||null}/>
            </SectionCard>

            {/* Deal-Quick */}
            <SectionCard title="Deal-Übersicht" icon="💼">
              <InfoRow label="Pipeline Stage"   value={stageCfg.label}/>
              <InfoRow label="Deal-Wert"        value={lead.deal_value ? '€'+Number(lead.deal_value).toLocaleString('de-DE') : null}/>
              <InfoRow label="Wahrscheinlichkeit" value={lead.deal_probability ? lead.deal_probability+'%' : null}/>
              <InfoRow label="Abschluss geplant" value={lead.deal_expected_close ? new Date(lead.deal_expected_close).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'}) : null}/>
              <InfoRow label="Lifecycle"        value={LIFECYCLE_LABELS[lead.lifecycle_stage] || lead.lifecycle_stage}/>
            </SectionCard>
          </div>
        )}

        {/* ═══ CRM / DEAL TAB ═══ */}
        {activeTab === 'crm' && (
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 16 }}>

            {/* Nächster empfohlener Schritt */}
            {(() => {
              const stage = lead.deal_stage || 'kein_deal'
              const steps = {
                kein_deal:    { icon:'🎯', title:'Verbindung aufbauen', text:'Sende eine LinkedIn-Anfrage mit persönlicher Nachricht. Erwähne einen gemeinsamen Kontakt oder ein gemeinsames Interesse.', action:'💬 LinkedIn', color:'#0A66C2', bg:'#EFF6FF' },
                prospect:     { icon:'📞', title:'Erstes Gespräch führen', text:'Ruf an oder schreibe eine Nachricht. Ziel: Bedarf verstehen, nicht verkaufen. Stelle offene Fragen.', action:'📞 Anruf', color:'#7C3AED', bg:'#F5F3FF' },
                opportunity:  { icon:'📋', title:'Angebot vorbereiten', text:'Erstelle ein maßgeschneidertes Angebot basierend auf dem besprochenen Bedarf. Verknüpfe Lösung mit Pain Points.', action:'📧 Email', color:'#D97706', bg:'#FFFBEB' },
                angebot:      { icon:'🤝', title:'Follow-up nach Angebot', text:'3-5 Tage nach Angebotssendung nachfassen. Offene Fragen klären. Demo anbieten falls noch nicht geschehen.', action:'📞 Follow-up', color:'#059669', bg:'#ECFDF5' },
                verhandlung:  { icon:'⚡', title:'Deal abschließen', text:'Finale Bedingungen klären. Zeitdruck höflich ansprechen. Klares Entscheidungsdatum erfragen.', action:'🤝 Meeting', color:'#DC2626', bg:'#FEF2F2' },
                gewonnen:     { icon:'🎉', title:'Onboarding starten', text:'Willkommensnachricht senden. Einführungscall vereinbaren. Referenz-Anfrage für später notieren.', action:'📧 Email', color:'#059669', bg:'#ECFDF5' },
                verloren:     { icon:'🔄', title:'Reaktivierung planen', text:'In 3-6 Monaten erneut kontaktieren. Neue Entwicklungen ansprechen. Follow-up im Kalender setzen.', action:'📅 Follow-up', color:'#64748B', bg:'#F8FAFC' },
              }
              const s = steps[stage] || steps.kein_deal
              return (
                <div style={{ gridColumn:'1/-1', background:s.bg, borderRadius:14, padding:'14px 18px', border:`1px solid ${s.color}30` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:20 }}>{s.icon}</span>
                    <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)' }}>Nächster Schritt</div>
                    <span style={{ fontSize:11, fontWeight:700, color:s.color, background:`${s.color}18`, padding:'2px 8px', borderRadius:99 }}>{s.title}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#475569', lineHeight:1.6 }}>{s.text}</div>
                </div>
              )
            })()}

            {/* Score-Erklärung */}
            {score > 0 && (
              <div style={{ gridColumn:'1/-1', background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)', borderRadius:14, padding:'14px 18px', border:'1px solid #BFDBFE', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ textAlign:'center', flexShrink:0 }}>
                  <div style={{ fontSize:32, fontWeight:900, color:score>=70?'#ef4444':score>=40?'#f59e0b':'#3b82f6' }}>{score}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8' }}>HubSpot Score</div>
                </div>
                <div style={{ flex:1, borderLeft:'1px solid #BFDBFE', paddingLeft:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0F172A', marginBottom:6 }}>Score-Faktoren</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {lead.li_connection_status==='verbunden' && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#ECFDF5', color:'#16a34a', fontWeight:600 }}>✓ Vernetzt +20</span>}
                    {lead.ai_buying_intent==='hoch' && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#FEF2F2', color:'#ef4444', fontWeight:600 }}>🔥 Hoher Intent +30</span>}
                    {lead.ai_buying_intent==='mittel' && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#FFFBEB', color:'#d97706', fontWeight:600 }}>⚡ Mittlerer Intent +15</span>}
                    {lead.deal_stage && lead.deal_stage!=='kein_deal' && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#EFF6FF', color:'#2563eb', fontWeight:600 }}>💼 In Pipeline +10</span>}
                    {lead.ai_need_detected && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#F5F3FF', color:'#7c3aed', fontWeight:600 }}>🎯 Need detected +10</span>}
                    {lead.next_followup && new Date(lead.next_followup)>new Date() && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#F0FDF4', color:'#15803d', fontWeight:600 }}>📅 Follow-up geplant +5</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Follow-up Countdown */}
            {lead.next_followup && (() => {
              const due = new Date(lead.next_followup)
              const now = new Date()
              const diffMs = due - now
              const diffDays = Math.ceil(diffMs / 86400000)
              const isOver = diffMs < 0
              const label = isOver
                ? `${Math.abs(diffDays)}d überfällig`
                : diffDays === 0 ? 'Heute fällig'
                : diffDays === 1 ? 'Morgen fällig'
                : `in ${diffDays} Tagen fällig`
              return (
                <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:12,
                  background: isOver ? '#FEF2F2' : diffDays <= 1 ? '#FFFBEB' : '#F0FDF4',
                  border: `1px solid ${isOver ? '#FECACA' : diffDays <= 1 ? '#FDE68A' : '#A7F3D0'}` }}>
                  <span style={{ fontSize:20 }}>📅</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: isOver ? '#ef4444' : diffDays <= 1 ? '#d97706' : '#16a34a' }}>
                      {label}
                    </div>
                    <div style={{ fontSize:11, color:'#64748B' }}>
                      {due.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                  <button onClick={async () => {
                    await supabase.from('leads').update({ next_followup: null }).eq('id', lead.id)
                    setLead(l => ({...l, next_followup: null}))
                  }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:16, padding:'2px 6px' }}
                    title="Follow-up entfernen"
                    onMouseEnter={e=>e.currentTarget.style.color='#ef4444'}
                    onMouseLeave={e=>e.currentTarget.style.color='#94A3B8'}>×</button>
                </div>
              )
            })()}

            {/* Pipeline Stage */}
            <div style={{ gridColumn:'1/-1' }}>
              <SectionCard title="Pipeline Stage" icon="🚀">
                <div style={{ fontSize:11, color:'#94A3B8', fontWeight:600, marginBottom:10 }}>Klicken zum sofortigen Ändern</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {STAGE_ORDER.map(s => {
                    const c = STAGE_CFG[s]
                    const active = (lead.deal_stage||'kein_deal') === s
                    return (
                      <button key={s} className="lp-stage-btn" onClick={() => saveDealStage(s)}
                        style={{ background:active?c.color:'#F8FAFC', color:active?'#fff':c.color, borderColor:active?c.color:c.border }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </SectionCard>
            </div>

            {/* Deal Details */}
            <SectionCard title="Deal Details" icon="💰">
              {[
                { key:'deal_value',           label:'Wert (€)',                type:'number', placeholder:'z.B. 4800' },
                { key:'deal_probability',     label:'Wahrscheinlichkeit (%)',  type:'number', placeholder:'0-100' },
                { key:'deal_expected_close',  label:'Abschluss geplant',       type:'date' },
                { key:'next_followup',        label:'Nächster Follow-up',       type:'datetime-local' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{label}</div>
                  {editField === key ? (
                    <div style={{ display:'flex', gap:8 }}>
                      <input type={type} defaultValue={lead[key] || ''} autoFocus
                        style={inp} onBlur={e => saveField(key, e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') saveField(key,e.target.value); if(e.key==='Escape') setEditField(null) }}/>
                    </div>
                  ) : (
                    <div onClick={() => setEditField(key)} className="lp-hover" style={{ cursor:'pointer', padding:'7px 10px', borderRadius:8, border:'1px solid transparent', fontSize:13, fontWeight:600, color:lead[key]?'#0F172A':'#CBD5E1' }}>
                      {key==='deal_value' && lead[key] ? '€'+Number(lead[key]).toLocaleString('de-DE')
                        : key==='deal_probability' && lead[key] ? lead[key]+'%'
                        : key==='deal_expected_close' && lead[key] ? new Date(lead[key]).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})
                        : key==='next_followup' && lead[key] ? new Date(lead[key]).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                        : lead[key] || <span style={{ fontStyle:'italic', fontWeight:400 }}>Klicken zum Bearbeiten…</span>}
                      <span style={{ marginLeft:8, opacity:0.3, fontSize:11 }}>✏</span>
                    </div>
                  )}
                </div>
              ))}
            </SectionCard>

            {/* Lifecycle + Verbindung */}
            <SectionCard title="Klassifizierung" icon="🏷">
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Lifecycle Stage</div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {LIFECYCLE_ORDER.map(lc => (
                    <button key={lc} onClick={() => saveLifecycle(lc)}
                      style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid', transition:'all 0.15s',
                        background:lead.lifecycle_stage===lc?'#3B82F6':'#F8FAFC', color:lead.lifecycle_stage===lc?'#fff':'#374151', borderColor:lead.lifecycle_stage===lc?'#3B82F6':'#E5E7EB' }}>
                      {LIFECYCLE_LABELS[lc]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Verbindungsstatus</div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {Object.entries(CONN_CFG).map(([key, cfg]) => (
                    <button key={key} onClick={() => saveConnection(key)}
                      style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid', transition:'all 0.15s',
                        background:lead.li_connection_status===key?cfg.bg:'#F8FAFC', color:cfg.color, borderColor:lead.li_connection_status===key?cfg.border:'#E5E7EB' }}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* AI Bedarf */}
            <div style={{ gridColumn:'1/-1' }}>
              <SectionCard title="AI-Erkenntnisse" icon="🤖">
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 16 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Erkannter Bedarf</div>
                    {editField === 'ai_need_detected' ? (
                      <input className="lp-inp" defaultValue={lead.ai_need_detected || ''} autoFocus
                        onBlur={e => saveField('ai_need_detected', e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') saveField('ai_need_detected',e.target.value); if(e.key==='Escape') setEditField(null) }}/>
                    ) : (
                      <div onClick={() => setEditField('ai_need_detected')} className="lp-hover" style={{ cursor:'pointer', padding:'8px 10px', borderRadius:8, fontSize:13, color:lead.ai_need_detected?'#0F172A':'#CBD5E1', fontStyle:lead.ai_need_detected?'normal':'italic', lineHeight:1.5 }}>
                        {lead.ai_need_detected || 'Klicken zum Bearbeiten… ✏'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Buying Intent</div>
                    <div style={{ display:'flex', gap:8 }}>
                      {['hoch','mittel','niedrig','unbekannt'].map(intent => (
                        <button key={intent} onClick={async () => { setLead(l => ({...l,ai_buying_intent:intent})); await supabase.from('leads').update({ai_buying_intent:intent}).eq('id',lead.id) }}
                          style={{ padding:'5px 12px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid', transition:'all 0.15s',
                            background:lead.ai_buying_intent===intent?(intent==='hoch'?'#EF4444':intent==='mittel'?'#F59E0B':'#94A3B8'):'#F8FAFC',
                            color:lead.ai_buying_intent===intent?'#fff':(intent==='hoch'?'#EF4444':intent==='mittel'?'#F59E0B':'#64748B'),
                            borderColor:lead.ai_buying_intent===intent?(intent==='hoch'?'#EF4444':intent==='mittel'?'#F59E0B':'#94A3B8'):'#E5E7EB' }}>
                          {intent==='hoch'?'🔥 Hoch':intent==='mittel'?'⚡ Mittel':intent==='niedrig'?'○ Niedrig':'— Unklar'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ═══ TIMELINE TAB ═══ */}
        {activeTab === 'timeline' && (
          <div style={{ maxWidth:720, margin:'0 auto' }}>
            {/* Neue Aktivität */}
            <SectionCard title="Aktivität loggen" icon="➕">
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:8, marginBottom:8 }}>
                <select value={newAct.type} onChange={e => setNewAct(a => ({...a,type:e.target.value}))}
                  className="lp-inp" style={{ width:'auto' }}>
                  {[['call','📞 Anruf'],['email','📧 E-Mail'],['meeting','🤝 Meeting'],['linkedin_message','💬 LinkedIn'],['note','📝 Notiz'],['other','📌 Sonstiges']].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <input className="lp-inp" value={newAct.subject} onChange={e => setNewAct(a => ({...a,subject:e.target.value}))}
                  placeholder="Betreff / Zusammenfassung…"
                  onKeyDown={e => e.key==='Enter' && logActivity()}/>
              </div>
              <button className="lp-btn-primary" onClick={logActivity} disabled={addingAct||!newAct.subject.trim()} style={{ width:'100%' }}>
                {addingAct ? '⏳ Speichere…' : '+ Loggen'}
              </button>
            </SectionCard>

            {/* Timeline */}
            <div style={{ marginTop:20 }}>
              {activities.length > 0 && (
                <div style={{ display:'flex', gap:5, marginBottom:12, flexWrap:'wrap' }}>
                  {[null,...[...new Set(activities.map(a=>a.type))]].map(t => {
                    const icons={call:'📞',email:'📧',linkedin_message:'💬',meeting:'🤝',note:'📝',task:'✅'}
                    const cnt = t ? activities.filter(a=>a.type===t).length : activities.length
                    return (<button key={t||'all'} onClick={()=>setActFilter(actFilter===t?null:t)} style={{ padding:'3px 9px', borderRadius:7, fontSize:11, fontWeight:600, border:'1px solid '+(actFilter===t?'rgb(49,90,231)':'#E5E7EB'), background:actFilter===t?'#EFF6FF':'#F8FAFC', color:actFilter===t?'rgb(49,90,231)':'#64748B', cursor:'pointer' }}>{t?(icons[t]||'📌')+' '+t:'Alle'} ({cnt})</button>)
                  })}
                </div>
              )}
              {activities.filter(a=>!actFilter||a.type===actFilter).length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#CBD5E1', fontSize:14, fontStyle:'italic' }}>Noch keine Aktivitäten</div>
              )}
              {activities.filter(a=>!actFilter||a.type===actFilter).map((a, i) => (
                <div key={a.id} style={{ display:'flex', gap:16, marginBottom:0 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:(ACT_COLORS[a.type]||'#94A3B8')+'18', border:`2px solid ${ACT_COLORS[a.type]||'#E5E7EB'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>
                      {ACT_ICONS[a.type]||'📌'}
                    </div>
                    {i < activities.filter(a=>!actFilter||a.type===actFilter).length-1 && <div style={{ width:2, flex:1, background:'#E5E7EB', margin:'4px 0' }}/>}
                  </div>
                  <div className="act-item" style={{ flex:1, background:'#fff', borderRadius:12, padding:'12px 16px', marginBottom:10, border:'1px solid #E5E7EB', cursor:'default' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>{a.subject}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:10 }}>
                        <div style={{ fontSize:11, color:'#94A3B8' }}>
                          {new Date(a.occurred_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                        </div>
                        <button onClick={async () => {
                          if (!window.confirm('Aktivität löschen?')) return
                          await supabase.from('activities').delete().eq('id', a.id)
                          setActivities(prev => prev.filter(x => x.id !== a.id))
                        }} title="Löschen" style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:15, lineHeight:1, padding:0 }}
                          onMouseEnter={e => e.currentTarget.style.color='#EF4444'}
                          onMouseLeave={e => e.currentTarget.style.color='#CBD5E1'}>×</button>
                      </div>
                    </div>
                    {a.body && <div style={{ fontSize:12, color:'#64748B', marginTop:4, lineHeight:1.5 }}>{a.body}</div>}
                    <div style={{ marginTop:6 }}>
                      <span style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:(ACT_COLORS[a.type]||'#94A3B8')+'15', color:ACT_COLORS[a.type]||'#94A3B8' }}>
                        {a.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ NOTIZEN TAB ═══ */}
        {activeTab === 'notizen' && (
          <div style={{ maxWidth:720, margin:'0 auto' }}>
            <SectionCard title="Neue Notiz" icon="📝">
              <textarea className="lp-inp" value={newNote} onChange={e => setNewNote(e.target.value)}
                rows={4} placeholder="Notiz eingeben… (Shift+Enter für neue Zeile)"
                style={{ resize:'vertical', lineHeight:1.6 }}/>
              <button className="lp-btn-primary" onClick={addNote} disabled={addingNote||!newNote.trim()} style={{ width:'100%', marginTop:8 }}>
                {addingNote ? '⏳ Speichere…' : '+ Notiz speichern'}
              </button>
            </SectionCard>
            <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
              {notes.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#CBD5E1', fontSize:14, fontStyle:'italic' }}>Noch keine Notizen</div>
              )}
              {notes.map(n => (
                <div key={n.id} style={{ background: n.is_pinned ? '#FFFBEB' : '#fff', borderRadius:12, padding:'14px 18px', border:'1px solid '+(n.is_pinned?'#FDE68A':'#E5E7EB'), boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  {editingNote?.id === n.id ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <textarea value={editingNote.content} onChange={e => setEditingNote(prev => ({...prev, content:e.target.value}))}
                        rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid rgb(49,90,231)', fontSize:13, lineHeight:1.6, resize:'vertical', outline:'none', boxSizing:'border-box' }}/>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={async () => {
                          await supabase.from('contact_notes').update({ content: editingNote.content }).eq('id', n.id)
                          setNotes(prev => prev.map(x => x.id===n.id ? {...x, content:editingNote.content} : x))
                          setEditingNote(null)
                        }} style={{ padding:'4px 12px', borderRadius:7, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>Speichern</button>
                        <button onClick={() => setEditingNote(null)} style={{ padding:'4px 12px', borderRadius:7, border:'1px solid #E5E7EB', background:'#F8FAFC', color:'#64748B', fontSize:12, cursor:'pointer' }}>Abbrechen</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:13, color:'#0F172A', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{n.content}</div>
                  )}
                  <div style={{ fontSize:11, color:'#94A3B8', marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
                    {n.is_pinned && <span style={{ color:'#d97706', fontWeight:700 }}>📌 Gepinnt</span>}
                    <span>📅 {new Date(n.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                    <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                      <button onClick={() => setEditingNote({id:n.id, content:n.content})}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:13 }}
                        onMouseEnter={e => e.currentTarget.style.color='rgb(49,90,231)'}
                        onMouseLeave={e => e.currentTarget.style.color='#CBD5E1'}
                        title="Bearbeiten">✏️</button>
                      <button onClick={async () => {
                        await supabase.from('contact_notes').update({ is_pinned: !n.is_pinned }).eq('id', n.id)
                        setNotes(prev => prev.map(x => x.id===n.id ? {...x, is_pinned:!n.is_pinned} : x).sort((a,b) => b.is_pinned-a.is_pinned||new Date(b.created_at)-new Date(a.created_at)))
                      }} style={{ background:'none', border:'none', cursor:'pointer', color: n.is_pinned?'#d97706':'#CBD5E1', fontSize:14 }}
                        onMouseEnter={e => e.currentTarget.style.color='#d97706'}
                        onMouseLeave={e => e.currentTarget.style.color=n.is_pinned?'#d97706':'#CBD5E1'}
                        title={n.is_pinned?'Entpinnen':'Pinnen'}>📌</button>
                      <button onClick={async () => {
                        if (!window.confirm('Notiz löschen?')) return
                        await supabase.from('contact_notes').delete().eq('id', n.id)
                        setNotes(prev => prev.filter(x => x.id !== n.id))
                      }} style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:14 }}
                        onMouseEnter={e => e.currentTarget.style.color='#EF4444'}
                        onMouseLeave={e => e.currentTarget.style.color='#CBD5E1'}
                        title="Löschen">×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ NACHRICHT TAB ═══ */}
        {activeTab === 'nachricht' && (
          <div style={{ maxWidth:680, margin:'0 auto' }}>
            <SectionCard title="KI-Nachricht generieren" icon="✨">
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                {[['connection','🔗 Vernetzungsanfrage'],['followup','📧 Follow-up'],['intro','👋 Erstansprache'],['value','💡 Mehrwert-Nachricht']].map(([v,l]) => (
                  <button key={v} onClick={() => setMsgType(v)}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid '+(msgType===v?'rgb(49,90,231)':'#E2E8F0'), background:msgType===v?'rgba(49,90,231,0.08)':'#fff', color:msgType===v?'rgb(49,90,231)':'#64748B', fontSize:12, fontWeight:msgType===v?700:400, cursor:'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
              <button className="lp-btn-primary" onClick={async () => {
                setMsgLoading(true)
                try {
                  const r = await fetch('/api/generate-connection', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ name: ((lead.first_name||'')+' '+(lead.last_name||'')).trim()||lead.name||'', position:lead.job_title||lead.headline||'', company:lead.company||'', type:msgType })
                  })
                  const d = await r.json()
                  setMsgText(d.text || d.message || d.about || '')
                } catch(e) { setMsgText('Fehler beim Generieren. Bitte manuell eingeben.') }
                setMsgLoading(false)
              }} disabled={msgLoading} style={{ marginBottom:12 }}>
                {msgLoading ? '⏳ Generiere…' : '✨ KI-Nachricht generieren'}
              </button>
              <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={7}
                placeholder="Hier erscheint die generierte Nachricht — oder direkt eingeben…"
                className="lp-inp" style={{ resize:'vertical', lineHeight:1.7, fontFamily:'inherit' }}/>
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <button className="lp-btn-ghost" onClick={() => { navigator.clipboard.writeText(msgText); showToast('In Zwischenablage kopiert ✓') }}>
                  📋 Kopieren
                </button>
                {lead.linkedin_url || lead.profile_url ? (
                  <a href={lead.linkedin_url || lead.profile_url} target="_blank" rel="noreferrer" className="lp-btn-ghost" style={{ textDecoration:'none', color:'#0A66C2', borderColor:'rgba(10,102,194,0.3)', background:'rgba(10,102,194,0.06)' }}>
                    in LinkedIn öffnen ↗
                  </a>
                ) : null}
                <button className="lp-btn-ghost" onClick={async () => {
                  if (!msgText.trim()) return
                  await supabase.from('activities').insert({ lead_id:lead.id, user_id:session?.user?.id||user?.id, type:'linkedin_message', subject:msgText.substring(0,100), body:msgText, direction:'outbound', occurred_at:new Date().toISOString() })
                  showToast('Als Aktivität gespeichert ✓')
                }}>
                  💾 Als Aktivität speichern
                </button>
              </div>
            </SectionCard>

            {/* Lead-Info Zusammenfassung für KI-Kontext */}
            <div style={{ marginTop:12, background:'rgba(49,90,231,0.04)', borderRadius:12, padding:'14px 16px', border:'1px solid rgba(49,90,231,0.12)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>KI nutzt diese Kontext-Daten</div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:6, fontSize:12, color:'#475569' }}>
                {[
                  ['Name', ((lead.first_name||'')+' '+(lead.last_name||'')).trim()||lead.name||'—'],
                  ['Position', lead.job_title||lead.headline||'—'],
                  ['Unternehmen', lead.company||'—'],
                  ['Erkannter Bedarf', lead.ai_need_detected?.substring(0,60)||'—'],
                  ['Intent', lead.ai_buying_intent||'—'],
                  ['Pain Point', lead.ai_pain_points?.[0]||'—'],
                ].map(([k,v]) => (
                  <div key={k}><span style={{ fontWeight:600, color:'#64748B' }}>{k}:</span> {v}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ DETAILS TAB ═══ */}}
        {activeTab === 'details' && (
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 16 }}>

            {/* Danger Zone */}
            <div style={{ gridColumn:'1/-1', marginTop:8, padding:'16px 20px', background:'#FEF2F2', borderRadius:12, border:'1px solid #FECACA' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#991B1B', marginBottom:10 }}>⚠️ Danger Zone</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>Lead löschen</div>
                  <div style={{ fontSize:12, color:'#94A3B8' }}>Löscht diesen Lead dauerhaft inkl. aller Aktivitäten und Notizen</div>
                </div>
                <button onClick={async () => {
                  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unbekannt'
                  if (!window.confirm(`"${name}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.`)) return
                  const { error } = await supabase.from('leads').delete().eq('id', lead.id)
                  if (error) { alert('Fehler: '+error.message); return }
                  navigate('/leads')
                }} style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #FECACA', background:'#fff', color:'#EF4444', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#FEF2F2'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#fff'}}>
                  🗑 Löschen
                </button>
              </div>
            </div>

          {/* Persönliche Daten */}
            <SectionCard title="Persönliche Daten" icon="👤">
              {[
                { key:'first_name',  label:'Vorname' },
                { key:'last_name',   label:'Nachname' },
                { key:'email',       label:'E-Mail' },
                { key:'phone',       label:'Telefon' },
                { key:'job_title',   label:'Position' },
                { key:'headline',    label:'LinkedIn Headline' },
              ].map(({ key, label }) => (
                <div key={key} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{label}</div>
                  {editField === key ? (
                    <input className="lp-inp" defaultValue={lead[key]||''} autoFocus
                      onBlur={e => saveField(key, e.target.value)}
                      onKeyDown={e => { if(e.key==='Enter') saveField(key,e.target.value); if(e.key==='Escape') setEditField(null) }}/>
                  ) : (
                    <div onClick={() => setEditField(key)} className="lp-hover" style={{ cursor:'pointer', padding:'6px 8px', borderRadius:8, fontSize:13, color:lead[key]?'#0F172A':'#CBD5E1', fontStyle:lead[key]?'normal':'italic' }}>
                      {lead[key] || 'Klicken zum Bearbeiten ✏'}
                    </div>
                  )}
                </div>
              ))}
            </SectionCard>

            {/* Unternehmen */}
            <SectionCard title="Unternehmen" icon="🏢">
              {[
                { key:'company',          label:'Firma' },
                { key:'industry',         label:'Branche' },
                { key:'company_size',     label:'Mitarbeiterzahl' },
                { key:'company_website',  label:'Website' },
                { key:'city',             label:'Stadt' },
                { key:'country',          label:'Land' },
              ].map(({ key, label }) => (
                <div key={key} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{label}</div>
                  {editField === key ? (
                    <input className="lp-inp" defaultValue={lead[key]||''} autoFocus
                      onBlur={e => saveField(key, e.target.value)}
                      onKeyDown={e => { if(e.key==='Enter') saveField(key,e.target.value); if(e.key==='Escape') setEditField(null) }}/>
                  ) : (
                    <div onClick={() => setEditField(key)} className="lp-hover" style={{ cursor:'pointer', padding:'6px 8px', borderRadius:8, fontSize:13, color:lead[key]?'#0F172A':'#CBD5E1', fontStyle:lead[key]?'normal':'italic' }}>
                      {lead[key] || 'Klicken zum Bearbeiten ✏'}
                    </div>
                  )}
                </div>
              ))}
            </SectionCard>

            {/* LinkedIn */}
            <SectionCard title="LinkedIn" icon="in">
              <InfoRow label="Profil URL"    value={lead.profile_url||lead.linkedin_url ? 'Profil öffnen' : null} link={lead.profile_url||lead.linkedin_url}/>
              <InfoRow label="Verbunden seit" value={lead.li_connected_at ? new Date(lead.li_connected_at).toLocaleDateString('de-DE') : null}/>
              <InfoRow label="Aktivitätslevel" value={lead.li_activity_level}/>
              <InfoRow label="Antwortverhalten" value={lead.li_reply_behavior}/>
              <InfoRow label="Letzte Interaktion" value={lead.li_last_interaction_at ? new Date(lead.li_last_interaction_at).toLocaleDateString('de-DE') : null}/>
            </SectionCard>

            {/* Tags + System */}
            <SectionCard title="Tags & System" icon="🏷">
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Tags</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                  {(lead.tags||[]).map((t,i) => (
                    <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE' }}>
                      {t}
                      <button onClick={async () => {
                        const next = (lead.tags||[]).filter((_,j)=>j!==i)
                        await supabase.from('leads').update({tags:next}).eq('id',lead.id)
                        setLead(l=>({...l,tags:next}))
                      }} style={{background:'none',border:'none',cursor:'pointer',color:'#93C5FD',fontSize:13,lineHeight:1,padding:0}}>×</button>
                    </span>
                  ))}
                  <input placeholder="+ Tag" onKeyDown={async e=>{
                    if(e.key==='Enter'&&e.target.value.trim()){
                      const next=[...(lead.tags||[]),e.target.value.trim()]
                      await supabase.from('leads').update({tags:next}).eq('id',lead.id)
                      setLead(l=>({...l,tags:next}))
                      e.target.value=''
                    }
                  }} style={{border:'1px dashed #BFDBFE',borderRadius:99,padding:'3px 10px',fontSize:11,outline:'none',color:'#1d4ed8',background:'transparent',minWidth:80}}/>
                </div>
              </div>
              <InfoRow label="ICP Match"   value={lead.icp_match != null ? lead.icp_match+'%' : null}/>
              <InfoRow label="Status"      value={lead.status}/>
              <InfoRow label="Lead-Quelle" value={lead.lead_source}/>
              <InfoRow label="GDPR"        value={lead.gdpr_consent ? '✓ Consent erteilt' : '✗ Kein Consent'}/>
              <InfoRow label="Erstellt"    value={lead.created_at ? new Date(lead.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'}) : null}/>
              <InfoRow label="Aktualisiert" value={lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'}) : null}/>
            </SectionCard>
          </div>
        )}

      </div>
    </div>

    {/* KI-Pitch Modal */}
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
                  style={{ flex:1, padding:'9px', borderRadius:9, border:'none', background:'rgb(49,90,231)', color:'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
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
