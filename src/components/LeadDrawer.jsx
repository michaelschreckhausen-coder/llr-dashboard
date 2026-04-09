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
      <div style={{ flex:1, height:5, background:'rgba(255,255,255,0.3)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:pct+'%', background:'#fff', borderRadius:99, transition:'width 0.5s', opacity:0.9 }}/>
      </div>
      <span style={{ fontSize:12, fontWeight:800, color:'#fff', minWidth:24, textAlign:'right' }}>{score||0}</span>
    </div>
  )
}

// Separater Speicheraufruf nur für Nicht-ENUM Felder (safe fields)
async function updateLeadSafe(leadId, updates) {
  const { error, data } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .select()
  if (error) {
    console.error('[LeadDrawer] Update error:', error)
    throw error
  }
  return data
}

export default function LeadDrawer({ lead, onClose, onUpdate, onDelete }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]   = useState('crm')
  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState(null)
  const [activities, setActivities] = useState([])
  const [notes, setNotes]           = useState([])
  const [newNote, setNewNote]       = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [newActivity, setNewActivity] = useState({ type:'note', subject:'', body:'' })
  const [addingActivity, setAddingActivity] = useState(false)
  const [form, setForm]             = useState({})

  useEffect(() => {
    if (!lead) return
    setForm({
      deal_value:          lead.deal_value        || '',
      deal_expected_close: lead.deal_expected_close || '',
      deal_probability:    lead.deal_probability  || 0,
      ai_need_detected:    lead.ai_need_detected  || '',
      notes:               lead.notes             || '',
    })
    loadActivities()
    loadNotes()
  }, [lead?.id])

  async function loadActivities() {
    if (!lead?.id) return
    const { data } = await supabase.from('activities')
      .select('*').eq('lead_id', lead.id)
      .order('occurred_at', { ascending:false }).limit(20)
    setActivities(data || [])
  }

  async function loadNotes() {
    if (!lead?.id) return
    const { data } = await supabase.from('contact_notes')
      .select('*').eq('lead_id', lead.id)
      .order('created_at', { ascending:false }).limit(20)
    setNotes(data || [])
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      // Only save non-ENUM plain fields to avoid type cast issues
      const safeUpdates = {
        deal_value:           form.deal_value ? Number(form.deal_value) : null,
        deal_expected_close:  form.deal_expected_close || null,
        deal_probability:     Number(form.deal_probability) || 0,
        ai_need_detected:     form.ai_need_detected || null,
        notes:                form.notes || null,
      }
      await updateLeadSafe(lead.id, safeUpdates)
      onUpdate({ ...lead, ...safeUpdates })
      setEditing(false)
    } catch (err) {
      setSaveError(err.message || 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  async function changeDealStage(stage) {
    setSaveError(null)
    // Optimistic UI update immediately
    onUpdate({ ...lead, deal_stage: stage })
    try {
      const { error } = await supabase.from('leads')
        .update({
          deal_stage: stage,
          deal_stage_changed_at: new Date().toISOString()
        })
        .eq('id', lead.id)
      if (error) throw error
    } catch (err) {
      console.error('[LeadDrawer] Stage change error:', err)
      setSaveError('Stage-Wechsel fehlgeschlagen: ' + err.message)
      // Revert
      onUpdate({ ...lead })
    }
  }

  async function changeLifecycle(lc) {
    setSaveError(null)
    onUpdate({ ...lead, lifecycle_stage: lc })
    try {
      const { error } = await supabase.from('leads')
        .update({ lifecycle_stage: lc })
        .eq('id', lead.id)
      if (error) throw error
    } catch (err) {
      setSaveError('Lifecycle-Update fehlgeschlagen: ' + err.message)
      onUpdate({ ...lead })
    }
  }

  async function changeConnectionStatus(status) {
    setSaveError(null)
    onUpdate({ ...lead, li_connection_status: status })
    try {
      const updates = { li_connection_status: status }
      if (status === 'verbunden' && lead.li_connection_status !== 'verbunden') {
        updates.li_connected_at = new Date().toISOString()
      }
      const { error } = await supabase.from('leads')
        .update(updates)
        .eq('id', lead.id)
      if (error) throw error
    } catch (err) {
      setSaveError('Status-Update fehlgeschlagen: ' + err.message)
      onUpdate({ ...lead })
    }
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('contact_notes').insert({
        lead_id: lead.id,
        user_id: user.id,
        content: newNote.trim(),
        is_pinned: false,
        is_private: false,
      }).select().single()
      if (error) throw error
      setNotes(n => [data, ...n])
      setNewNote('')
    } catch (err) {
      setSaveError('Notiz konnte nicht gespeichert werden: ' + err.message)
    } finally {
      setAddingNote(false)
    }
  }

  async function addActivity() {
    if (!newActivity.subject.trim()) return
    setAddingActivity(true)
    setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('activities').insert({
        lead_id: lead.id,
        user_id: user.id,
        type: newActivity.type,
        subject: newActivity.subject,
        body: newActivity.body || null,
        direction: 'outbound',
        occurred_at: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      setActivities(a => [data, ...a])
      setNewActivity({ type:'note', subject:'', body:'' })
    } catch (err) {
      setSaveError('Aktivität konnte nicht gespeichert werden: ' + err.message)
    } finally {
      setAddingActivity(false)
    }
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
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} .ld-tab:hover{background:rgba(59,130,246,0.06)!important}`}</style>

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
          {lead.ai_buying_intent === 'hoch' && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:'rgba(239,68,68,0.2)', color:'#fca5a5' }}>🔥 Hot</span>}
          {lead.deal_value > 0 && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:'rgba(34,197,94,0.2)', color:'#86efac' }}>€{Number(lead.deal_value).toLocaleString('de-DE')}</span>}
        </div>
        {/* Score */}
        <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 12px' }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginBottom:4 }}>HubSpot Score</div>
          <ScoreMeter score={lead.hs_score}/>
        </div>
      </div>

      {/* Error Banner */}
      {saveError && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:0, padding:'8px 16px', fontSize:12, color:'#991B1B', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span>❌ {saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#991B1B', fontSize:16, padding:'0 4px' }}>×</button>
        </div>
      )}

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

            {/* Pipeline Stage — 1-Klick, kein Speichern nötig */}
            <div>
              <label style={lbl}>Pipeline Stage — sofort gespeichert</label>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {STAGE_ORDER.map(s => {
                  const c = STAGE_CFG[s]
                  const active = (lead.deal_stage || 'kein_deal') === s
                  return (
                    <button key={s} onClick={() => changeDealStage(s)}
                      style={{ padding:'5px 10px', borderRadius:99, fontSize:10, fontWeight:700, cursor:'pointer', background:active?c.color:'#F8FAFC', color:active?'#fff':c.color, border:'1.5px solid '+(active?c.color:'#E5E7EB'), transition:'all 0.15s' }}>
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Verbindungsstatus — 1-Klick */}
            <div>
              <label style={lbl}>Verbindungsstatus — sofort gespeichert</label>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {Object.entries(CONN_CFG).map(([key, cfg]) => {
                  const active = (lead.li_connection_status || 'nicht_verbunden') === key
                  return (
                    <button key={key} onClick={() => changeConnectionStatus(key)}
                      style={{ padding:'4px 10px', borderRadius:99, fontSize:10, fontWeight:700, cursor:'pointer', background:active?cfg.bg:'#F8FAFC', color:cfg.color, border:'1.5px solid '+(active?cfg.border:'#E5E7EB'), transition:'all 0.15s' }}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Lifecycle Stage — 1-Klick */}
            <div>
              <label style={lbl}>Lifecycle Stage — sofort gespeichert</label>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {['lead','marketing_qualified','sales_qualified','opportunity','customer'].map(lc => {
                  const active = lead.lifecycle_stage === lc
                  const labels = { lead:'Lead', marketing_qualified:'MQL', sales_qualified:'SQL', opportunity:'Opportunity', customer:'Kunde' }
                  return (
                    <button key={lc} onClick={() => changeLifecycle(lc)}
                      style={{ padding:'4px 10px', borderRadius:99, fontSize:10, fontWeight:700, cursor:'pointer', background:active?'#3b82f6':'#F8FAFC', color:active?'#fff':'#374151', border:'1.5px solid '+(active?'#3b82f6':'#E5E7EB'), transition:'all 0.15s' }}>
                      {labels[lc]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Deal Details — Speichern-Button */}
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Deal Details
                <span style={{ fontSize:10, color:'#94A3B8', fontWeight:400, marginLeft:8 }}>(💾 Speichern klicken)</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={lbl}>Wert (€)</label>
                  <input type="number" value={form.deal_value} onChange={e=>setForm(f=>({...f,deal_value:e.target.value}))}
                    style={inp} placeholder="z.B. 4800" onFocus={() => setEditing(true)}/>
                </div>
                <div>
                  <label style={lbl}>Wahrscheinlichkeit (%)</label>
                  <input type="number" min="0" max="100" value={form.deal_probability} onChange={e=>setForm(f=>({...f,deal_probability:e.target.value}))}
                    style={inp} onFocus={() => setEditing(true)}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={lbl}>Abschluss geplant</label>
                  <input type="date" value={form.deal_expected_close} onChange={e=>setForm(f=>({...f,deal_expected_close:e.target.value}))}
                    style={inp} onFocus={() => setEditing(true)}/>
                </div>
              </div>
            </div>

            {/* AI Insights — Bedarf editierbar */}
            <div style={{ background:'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(59,130,246,0.06))', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7C3AED', marginBottom:10 }}>🤖 AI-Erkenntnisse
                <span style={{ fontSize:10, color:'#94A3B8', fontWeight:400, marginLeft:8 }}>(💾 Speichern klicken)</span>
              </div>
              <div style={{ marginBottom:8 }}>
                <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700,
                  background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC',
                  color:lead.ai_buying_intent==='hoch'?'#ef4444':lead.ai_buying_intent==='mittel'?'#f59e0b':'#64748b' }}>
                  {lead.ai_buying_intent==='hoch'?'🔥 Hoch':lead.ai_buying_intent==='mittel'?'⚡ Mittel':lead.ai_buying_intent==='niedrig'?'○ Niedrig':'— Unbekannt'}
                </span>
              </div>
              <div>
                <label style={{ ...lbl, color:'#7C3AED' }}>Erkannter Bedarf</label>
                <input value={form.ai_need_detected} onChange={e=>setForm(f=>({...f,ai_need_detected:e.target.value}))}
                  style={inp} placeholder="Kurze Bedarfsbeschreibung…" onFocus={() => setEditing(true)}/>
              </div>
              {lead.ai_pain_points && lead.ai_pain_points.length > 0 && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:8 }}>
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

            {/* Notes */}
            <div>
              <label style={lbl}>Notizen
                <span style={{ fontSize:10, color:'#94A3B8', fontWeight:400, marginLeft:8 }}>(💾 Speichern klicken)</span>
              </label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
                placeholder="Allgemeine Notizen…" onFocus={() => setEditing(true)}
                style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/>
            </div>
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {activeTab === 'timeline' && (
          <div>
            <div style={{ background:'#F8FAFC', borderRadius:12, padding:'12px', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:8 }}>+ Aktivität loggen</div>
              <select value={newActivity.type} onChange={e=>setNewActivity(a=>({...a,type:e.target.value}))} style={{ ...inp, marginBottom:6 }}>
                {[['call','📞 Anruf'],['email','📧 E-Mail'],['meeting','🤝 Meeting'],['linkedin_message','💬 LinkedIn'],['note','📝 Notiz'],['other','📌 Sonstiges']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={newActivity.subject} onChange={e=>setNewActivity(a=>({...a,subject:e.target.value}))}
                placeholder="Betreff / Zusammenfassung" style={{ ...inp, marginBottom:6 }}/>
              <button onClick={addActivity} disabled={addingActivity || !newActivity.subject.trim()}
                style={{ width:'100%', padding:'8px', borderRadius:8, border:'none', background:newActivity.subject.trim()?'#3b82f6':'#E5E7EB', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                {addingActivity ? '⏳ Speichere…' : '+ Loggen'}
              </button>
            </div>
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
                {addingNote ? '⏳ Speichere…' : '+ Notiz speichern'}
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
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10 }}>Unternehmen & CRM</div>
              {[
                ['Firma', lead.company],
                ['Branche', lead.industry],
                ['Größe', lead.company_size],
                ['Standort', lead.city ? `${lead.city}${lead.country ? ', '+lead.country : ''}` : lead.country],
                ['ICP Match', lead.icp_match != null ? lead.icp_match+'%' : null],
                ['Verbunden am', lead.li_connected_at ? new Date(lead.li_connected_at).toLocaleDateString('de-DE') : null],
                ['Letzte Interaktion', lead.li_last_interaction_at ? new Date(lead.li_last_interaction_at).toLocaleDateString('de-DE') : null],
                ['Antwortverhalten', lead.li_reply_behavior],
                ['Aktivitätslevel', lead.li_activity_level],
                ['GDPR Consent', lead.gdpr_consent ? '✓ Ja' : '✗ Nein'],
              ].filter(([,v])=>v).map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #E5E7EB', fontSize:12 }}>
                  <span style={{ color:'#64748B', fontWeight:500 }}>{label}</span>
                  <span style={{ color:'#0F172A', fontWeight:600 }}>{val}</span>
                </div>
              ))}
            </div>
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
        {editing && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setEditing(false); setSaveError(null) }}
              style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Abbrechen
            </button>
            <button onClick={save} disabled={saving}
              style={{ padding:'7px 24px', borderRadius:8, border:'none', background:saving?'#94A3B8':'#3b82f6', color:'#fff', fontSize:12, fontWeight:700, cursor:saving?'default':'pointer' }}>
              {saving ? '⏳ Speichere…' : '💾 Speichern'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
