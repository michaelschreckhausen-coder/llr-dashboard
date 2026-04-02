import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const STAGE_CFG = {
  kein_deal:   { label:'Neu',          color:'#64748b', bg:'#F8FAFC' },
  prospect:    { label:'Kontaktiert',  color:'#3b82f6', bg:'#EFF6FF' },
  opportunity: { label:'Gespräch',     color:'#8b5cf6', bg:'#F5F3FF' },
  angebot:     { label:'Qualifiziert', color:'#f59e0b', bg:'#FFFBEB' },
  verhandlung: { label:'Angebot',      color:'#f97316', bg:'#FFF7ED' },
  gewonnen:    { label:'Gewonnen ✓',   color:'#22c55e', bg:'#F0FDF4' },
  verloren:    { label:'Verloren ✗',   color:'#94a3b8', bg:'#F8FAFC' },
}
const STAGE_ORDER = ['kein_deal','prospect','opportunity','angebot','verhandlung','gewonnen','verloren']

const CONN_CFG = {
  verbunden:       { label:'✓ Vernetzt',     color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  nicht_verbunden: { label:'— Kein Kontakt', color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
  pending:         { label:'⏳ Ausstehend',  color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
  abgelehnt:       { label:'✗ Abgelehnt',    color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
}

const ACT_ICONS = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', linkedin_connection:'🔗', task:'✅', other:'📌' }

function Avatar({ name, avatar_url, size=52 }) {
  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#0891b2']
  const bg = colors[(name||'').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.36, flexShrink:0 }}>
    {(name||'?').substring(0,2).toUpperCase()}
  </div>
}

function ScoreMeter({ score }) {
  const pct = Math.min(score||0, 100)
  const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#3b82f6'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:5, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:99, transition:'width 0.5s' }}/>
      </div>
      <span style={{ fontSize:12, fontWeight:800, color, minWidth:24, textAlign:'right' }}>{score||0}</span>
    </div>
  )
}

export default function LeadDrawer({ lead, onClose, onUpdate, onDelete }) {
  const [activeTab, setActiveTab] = useState('crm')
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [activities, setActivities] = useState([])
  const [notes, setNotes]         = useState([])
  const [newNote, setNewNote]     = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [newActivity, setNewActivity] = useState({ type:'note', subject:'', body:'' })
  const [addingActivity, setAddingActivity] = useState(false)
  const [form, setForm]           = useState({})

  useEffect(() => {
    if (!lead) return
    setForm({
      deal_stage: lead.deal_stage || 'kein_deal',
      deal_value: lead.deal_value || '',
      deal_expected_close: lead.deal_expected_close || '',
      deal_probability: lead.deal_probability || 0,
      ai_need_detected: lead.ai_need_detected || '',
      notes: lead.notes || '',
      lifecycle_stage: lead.lifecycle_stage || 'lead',
      li_connection_status: lead.li_connection_status || 'nicht_verbunden',
      li_reply_behavior: lead.li_reply_behavior || 'unbekannt',
    })
    loadActivities()
    loadNotes()
  }, [lead?.id])

  async function loadActivities() {
    if (!lead?.id) return
    const { data } = await supabase.from('activities').select('*').eq('lead_id', lead.id).order('occurred_at', { ascending:false }).limit(20)
    setActivities(data || [])
  }

  async function loadNotes() {
    if (!lead?.id) return
    const { data } = await supabase.from('contact_notes').select('*').eq('lead_id', lead.id).order('created_at', { ascending:false }).limit(20)
    setNotes(data || [])
  }

  async function save() {
    setSaving(true)
    const updates = {
      deal_stage: form.deal_stage,
      deal_value: form.deal_value || null,
      deal_expected_close: form.deal_expected_close || null,
      deal_probability: Number(form.deal_probability) || 0,
      ai_need_detected: form.ai_need_detected || null,
      notes: form.notes || null,
      lifecycle_stage: form.lifecycle_stage,
      li_connection_status: form.li_connection_status,
      li_reply_behavior: form.li_reply_behavior,
      deal_stage_changed_at: form.deal_stage !== lead.deal_stage ? new Date().toISOString() : lead.deal_stage_changed_at,
    }
    await supabase.from('leads').update(updates).eq('id', lead.id)
    onUpdate({ ...lead, ...updates })
    setSaving(false)
    setEditing(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('contact_notes').insert({
      lead_id: lead.id,
      user_id: user.id,
      content: newNote.trim(),
      is_pinned: false,
      is_private: false,
    }).select().single()
    if (data) setNotes(n => [data, ...n])
    setNewNote('')
    setAddingNote(false)
  }

  async function addActivity() {
    if (!newActivity.subject.trim()) return
    setAddingActivity(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('activities').insert({
      lead_id: lead.id,
      user_id: user.id,
      type: newActivity.type,
      subject: newActivity.subject,
      body: newActivity.body || null,
      direction: 'outbound',
      occurred_at: new Date().toISOString(),
    }).select().single()
    if (data) setActivities(a => [data, ...a])
    setNewActivity({ type:'note', subject:'', body:'' })
    setAddingActivity(false)
  }

  async function changeDealStage(stage) {
    setForm(f => ({ ...f, deal_stage: stage }))
    await supabase.from('leads').update({ deal_stage: stage, deal_stage_changed_at: new Date().toISOString() }).eq('id', lead.id)
    onUpdate({ ...lead, deal_stage: stage })
  }

  if (!lead) return null

  const conn = CONN_CFG[lead.li_connection_status || 'nicht_verbunden']
  const stageCfg = STAGE_CFG[lead.deal_stage || 'kein_deal']

  const TABS = [
    { id:'crm',      label:'CRM' },
    { id:'timeline', label:'Timeline' },
    { id:'notes',    label:'Notizen' },
    { id:'profil',   label:'Profil' },
  ]

  const inp = { padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#FAFAFA', width:'100%', boxSizing:'border-box' }
  const lbl = { fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4, display:'block' }

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:440, background:'#fff', boxShadow:'-4px 0 40px rgba(15,23,42,0.14)', zIndex:600, display:'flex', flexDirection:'column', animation:'slideIn 0.2s ease-out' }}>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} .ld-tab:hover{background:rgba(49,90,231,0.06)!important}`}</style>

      {/* HEADER */}
      <div style={{ background:'linear-gradient(135deg,#1e3a8a,#3b82f6)', padding:'20px', flexShrink:0, position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:12, right:12, background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:14 }}>
          <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={50}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(lead)}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.8)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.job_title || lead.headline}</div>
            {lead.company && <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{lead.company}</div>}
          </div>
        </div>
        {/* Quick badges */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
          <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:conn.bg, color:conn.color, border:'1px solid '+conn.border }}>{conn.label}</span>
          <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:stageCfg.bg, color:stageCfg.color }}>{stageCfg.label}</span>
          {lead.ai_buying_intent === 'hoch' && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:'rgba(239,68,68,0.15)', color:'#ef4444' }}>🔥 Hot</span>}
          {lead.deal_value > 0 && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:'rgba(34,197,94,0.15)', color:'#22c55e' }}>€{Number(lead.deal_value).toLocaleString('de-DE')}</span>}
        </div>
        {/* Score */}
        <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 12px' }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginBottom:4 }}>HubSpot Score</div>
          <ScoreMeter score={lead.hs_score}/>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display:'flex', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
        {TABS.map(t => (
          <button key={t.id} className="ld-tab" onClick={() => setActiveTab(t.id)}
            style={{ flex:1, padding:'10px 4px', border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:activeTab===t.id?700:500, color:activeTab===t.id?'#3b82f6':'#64748B', borderBottom:activeTab===t.id?'2px solid #3b82f6':'2px solid transparent', transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ flex:1, overflowY:'auto', padding:16 }}>

        {/* ── CRM TAB ── */}
        {activeTab === 'crm' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Deal Stage */}
            <div>
              <label style={lbl}>Pipeline Stage</label>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {STAGE_ORDER.map(s => {
                  const c = STAGE_CFG[s]
                  const active = (lead.deal_stage || 'kein_deal') === s
                  return (
                    <button key={s} onClick={() => changeDealStage(s)}
                      style={{ padding:'4px 10px', borderRadius:99, fontSize:10, fontWeight:700, cursor:'pointer', background:active?c.color:'#F8FAFC', color:active?'#fff':c.color, border:'1.5px solid '+(active?c.color:'#E5E7EB'), transition:'all 0.12s' }}>
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Deal Details */}
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Deal Details</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={lbl}>Wert (€)</label>
                  {editing ? <input type="number" value={form.deal_value} onChange={e=>setForm(f=>({...f,deal_value:e.target.value}))} style={inp}/> : <div style={{ fontSize:14, fontWeight:800, color:'#22c55e' }}>{lead.deal_value ? '€'+Number(lead.deal_value).toLocaleString('de-DE') : '—'}</div>}
                </div>
                <div>
                  <label style={lbl}>Wahrscheinlichkeit</label>
                  {editing ? <input type="number" min="0" max="100" value={form.deal_probability} onChange={e=>setForm(f=>({...f,deal_probability:e.target.value}))} style={inp}/> : <div style={{ fontSize:14, fontWeight:700, color:'#f59e0b' }}>{lead.deal_probability||0}%</div>}
                </div>
                <div>
                  <label style={lbl}>Abschluss geplant</label>
                  {editing ? <input type="date" value={form.deal_expected_close} onChange={e=>setForm(f=>({...f,deal_expected_close:e.target.value}))} style={inp}/> : <div style={{ fontSize:12, color:'#374151' }}>{lead.deal_expected_close ? new Date(lead.deal_expected_close).toLocaleDateString('de-DE') : '—'}</div>}
                </div>
                <div>
                  <label style={lbl}>Lifecycle Stage</label>
                  {editing ? (
                    <select value={form.lifecycle_stage} onChange={e=>setForm(f=>({...f,lifecycle_stage:e.target.value}))} style={inp}>
                      {['subscriber','lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <div style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{lead.lifecycle_stage || '—'}</div>}
                </div>
              </div>
            </div>

            {/* LinkedIn CRM */}
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>LinkedIn CRM</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={lbl}>Verbindung</label>
                  {editing ? (
                    <select value={form.li_connection_status} onChange={e=>setForm(f=>({...f,li_connection_status:e.target.value}))} style={inp}>
                      {['nicht_verbunden','pending','verbunden','abgelehnt'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, background:conn.bg, color:conn.color, border:'1px solid '+conn.border }}>{conn.label}</span>}
                </div>
                <div>
                  <label style={lbl}>Antwortverhalten</label>
                  <div style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{lead.li_reply_behavior || '—'}</div>
                </div>
                <div>
                  <label style={lbl}>Verbunden am</label>
                  <div style={{ fontSize:12, color:'#374151' }}>{lead.li_connected_at ? new Date(lead.li_connected_at).toLocaleDateString('de-DE') : '—'}</div>
                </div>
                <div>
                  <label style={lbl}>Aktivitätslevel</label>
                  <div style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{lead.li_activity_level || '—'}</div>
                </div>
              </div>
            </div>

            {/* AI Insights */}
            <div style={{ background:'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(59,130,246,0.06))', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7C3AED', marginBottom:10 }}>🤖 AI-Erkenntnisse</div>
              <div style={{ marginBottom:8 }}>
                <label style={{ ...lbl, color:'#7C3AED' }}>Buying Intent</label>
                <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC', color:lead.ai_buying_intent==='hoch'?'#ef4444':lead.ai_buying_intent==='mittel'?'#f59e0b':'#64748b' }}>
                  {lead.ai_buying_intent==='hoch'?'🔥 Hoch':lead.ai_buying_intent==='mittel'?'⚡ Mittel':lead.ai_buying_intent==='niedrig'?'○ Niedrig':'— Unbekannt'}
                </span>
              </div>
              {editing ? (
                <div>
                  <label style={{ ...lbl, color:'#7C3AED' }}>Erkannter Bedarf</label>
                  <input value={form.ai_need_detected} onChange={e=>setForm(f=>({...f,ai_need_detected:e.target.value}))} style={inp} placeholder="Kurze Bedarfsbeschreibung…"/>
                </div>
              ) : lead.ai_need_detected && (
                <div style={{ fontSize:12, color:'#374151', marginBottom:6 }}><b>Bedarf:</b> {lead.ai_need_detected}</div>
              )}
              {lead.ai_pain_points && lead.ai_pain_points.length > 0 && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                  {lead.ai_pain_points.map((p,i) => (
                    <span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:'#FEF2F2', color:'#B91C1C', border:'1px solid #FECACA', fontWeight:600 }}>⚠ {p}</span>
                  ))}
                </div>
              )}
              {lead.ai_use_cases && lead.ai_use_cases.length > 0 && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                  {lead.ai_use_cases.map((u,i) => (
                    <span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE', fontWeight:600 }}>✓ {u}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {activeTab === 'timeline' && (
          <div>
            {/* New Activity */}
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:8 }}>+ Aktivität loggen</div>
              <select value={newActivity.type} onChange={e=>setNewActivity(a=>({...a,type:e.target.value}))} style={{ ...inp, marginBottom:6 }}>
                {[['call','📞 Anruf'],['email','📧 E-Mail'],['meeting','🤝 Meeting'],['linkedin_message','💬 LinkedIn'],['note','📝 Notiz'],['other','📌 Sonstiges']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={newActivity.subject} onChange={e=>setNewActivity(a=>({...a,subject:e.target.value}))} placeholder="Betreff / Zusammenfassung" style={{ ...inp, marginBottom:6 }}/>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={addActivity} disabled={addingActivity || !newActivity.subject.trim()}
                  style={{ flex:1, padding:'7px 0', borderRadius:8, border:'none', background:newActivity.subject.trim()?'#3b82f6':'#E5E7EB', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                  {addingActivity ? '⏳' : '+ Loggen'}
                </button>
              </div>
            </div>
            {/* Activity Feed */}
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {activities.length === 0 && <div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic', textAlign:'center', padding:'24px 0' }}>Noch keine Aktivitäten</div>}
              {activities.map((a, i) => (
                <div key={a.id} style={{ display:'flex', gap:12, paddingBottom:14, position:'relative' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>{ACT_ICONS[a.type]||'📌'}</div>
                    {i < activities.length-1 && <div style={{ width:2, flex:1, background:'#E5E7EB', marginTop:4 }}/>}
                  </div>
                  <div style={{ flex:1, paddingTop:4 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{a.subject || a.type}</div>
                    {a.body && <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>{a.body}</div>}
                    <div style={{ fontSize:11, color:'#94A3B8', marginTop:3 }}>{new Date(a.occurred_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── NOTIZEN TAB ── */}
        {activeTab === 'notes' && (
          <div>
            <div style={{ marginBottom:14 }}>
              <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Neue Notiz…" rows={3}
                style={{ ...inp, resize:'vertical', lineHeight:1.5, marginBottom:8 }}/>
              <button onClick={addNote} disabled={addingNote || !newNote.trim()}
                style={{ width:'100%', padding:'8px', borderRadius:8, border:'none', background:newNote.trim()?'#3b82f6':'#E5E7EB', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                {addingNote ? '⏳' : '+ Notiz speichern'}
              </button>
            </div>
            {notes.length === 0 && <div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic', textAlign:'center', padding:'24px 0' }}>Noch keine Notizen</div>}
            {notes.map(n => (
              <div key={n.id} style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 12px', marginBottom:8, border:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:13, color:'#0F172A', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{n.content}</div>
                <div style={{ fontSize:11, color:'#94A3B8', marginTop:6 }}>{new Date(n.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── PROFIL TAB ── */}
        {activeTab === 'profil' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Kontakt</div>
              {[
                ['E-Mail', lead.email, lead.email ? `mailto:${lead.email}` : null],
                ['Telefon', lead.phone, lead.phone ? `tel:${lead.phone}` : null],
                ['LinkedIn', lead.profile_url || lead.linkedin_url, lead.profile_url || lead.linkedin_url],
                ['Website', lead.company_website, lead.company_website],
              ].map(([label, val, href]) => val && (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #E5E7EB', fontSize:12 }}>
                  <span style={{ color:'#64748B', fontWeight:500 }}>{label}</span>
                  {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color:'#3b82f6', textDecoration:'none', fontWeight:600, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</a>
                    : <span style={{ color:'#0F172A', fontWeight:600 }}>{val}</span>}
                </div>
              ))}
            </div>
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Unternehmen</div>
              {[
                ['Firma', lead.company],
                ['Branche', lead.industry],
                ['Größe', lead.company_size],
                ['Standort', lead.city ? `${lead.city}, ${lead.country||''}`.trim().replace(/,$/, '') : lead.country],
                ['ICP Match', lead.icp_match != null ? lead.icp_match+'%' : null],
              ].filter(([,v])=>v).map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #E5E7EB', fontSize:12 }}>
                  <span style={{ color:'#64748B', fontWeight:500 }}>{label}</span>
                  <span style={{ color:'#0F172A', fontWeight:600 }}>{val}</span>
                </div>
              ))}
            </div>
            {/* Tags */}
            {lead.tags && lead.tags.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {lead.tags.map((t,i) => <span key={i} style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE' }}>{t}</span>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid #E5E7EB', display:'flex', gap:8, justifyContent:'space-between', flexShrink:0, background:'#FAFAFA' }}>
        <button onClick={() => { if(window.confirm('Lead wirklich löschen?')) { supabase.from('leads').delete().eq('id',lead.id); onDelete(lead.id); onClose() }}}
          style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          🗑 Löschen
        </button>
        <div style={{ display:'flex', gap:8 }}>
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button onClick={save} disabled={saving} style={{ padding:'7px 20px', borderRadius:8, border:'none', background:'#3b82f6', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
                {saving ? '⏳' : '💾 Speichern'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{ padding:'7px 20px', borderRadius:8, border:'none', background:'#3b82f6', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              ✎ Bearbeiten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
