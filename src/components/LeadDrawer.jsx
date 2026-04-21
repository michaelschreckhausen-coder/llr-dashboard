import { useTeam } from '../context/TeamContext'
import LeadTasks from './LeadTasks'
import React, { useState, useEffect, useRef } from 'react'
import OrganizationPicker from './OrganizationPicker'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const STAGE_CFG = {
  kein_deal:   { label:'Neu',         color:'#64748b', activeBg:'#64748b' },
  prospect:    { label:'Kontaktiert', color:'#2563eb', activeBg:'#2563eb' },
  opportunity: { label:'Gespräch',    color:'#7c3aed', activeBg:'#7c3aed' },
  angebot:     { label:'Angebot',     color:'#d97706', activeBg:'#d97706' },
  verhandlung: { label:'Verhandlung', color:'#ea580c', activeBg:'#ea580c' },
  gewonnen:    { label:'Gewonnen',    color:'#059669', activeBg:'#059669' },
  verloren:    { label:'Verloren',    color:'#94a3b8', activeBg:'#94a3b8' },
}
const STAGE_ORDER = ['kein_deal','prospect','opportunity','angebot','verhandlung','gewonnen','verloren']

const CONN_CFG = {
  verbunden:       { label:'Vernetzt',     color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
  nicht_verbunden: { label:'Kein Kontakt', color:'#475569', bg:'#F8FAFC', border:'#E2E8F0' },
  pending:         { label:'Ausstehend',   color:'#d97706', bg:'#FFFBEB', border:'#FDE68A' },
  abgelehnt:       { label:'Abgelehnt',   color:'#dc2626', bg:'#FEF2F2', border:'#FECACA' },
}

const ACT_ICONS  = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', linkedin_connection:'🔗', task:'✅', other:'📌' }
const ACT_LABELS = { call:'Anruf', email:'E-Mail', linkedin_message:'LinkedIn', meeting:'Meeting', note:'Notiz', other:'Sonstiges' }

function StageSlider({ label, options, value, onChange, accent='#2563eb' }) {
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  const pct = options.length > 1 ? (idx / (options.length - 1)) * 100 : 50
  const moveTo = (clientX) => {
    const t = trackRef.current; if (!t) return
    const rect = t.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const n = options.length > 1 ? Math.round((x / rect.width) * (options.length - 1)) : 0
    if (n !== idx) onChange(options[n].value)
  }
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:14 }}>{label}</div>
      <div ref={trackRef}
        onPointerMove={e => { if (dragging) moveTo(e.clientX) }}
        onPointerUp={e => { if (dragging) { setDragging(false); try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {} } }}
        onPointerCancel={() => setDragging(false)}
        style={{ position:'relative', height:44, margin:'0 8px', touchAction:'none', userSelect:'none' }}>
        <div style={{ position:'absolute', top:8, left:0, right:0, height:3, borderRadius:99, background:'#E5E7EB' }}/>
        <div style={{ position:'absolute', top:8, left:0, height:3, borderRadius:99, width:`${pct}%`, background:accent, transition: dragging ? 'none' : 'width 0.2s' }}/>
        {options.map((o, i) => {
          const left = options.length > 1 ? (i / (options.length - 1)) * 100 : 50
          const active = i === idx
          return (
            <div key={o.value} onClick={() => onChange(o.value)}
              style={{ position:'absolute', left:`${left}%`, top:0, transform:'translateX(-50%)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center' }}
              title={o.label}>
              <div style={{ width:11, height:11, borderRadius:'50%', background:active?accent:'#fff', border:`2px solid ${active?accent:'#CBD5E1'}`, marginTop:3 }}/>
              <div style={{ fontSize:9, fontWeight:active?700:500, color:active?'#0F172A':'#94A3B8', marginTop:6, whiteSpace:'nowrap' }}>{o.label}</div>
            </div>
          )
        })}
        <div
          onPointerDown={e => { setDragging(true); try { e.currentTarget.setPointerCapture(e.pointerId) } catch {} }}
          style={{ position:'absolute', left:`${pct}%`, top:3, transform:'translateX(-50%)', width:15, height:15, borderRadius:'50%', background:accent, border:'2.5px solid #fff', boxShadow:'0 2px 6px rgba(0,0,0,0.2)', cursor:dragging?'grabbing':'grab', touchAction:'none', transition: dragging ? 'none' : 'left 0.2s', zIndex:2 }}/>
      </div>
    </div>
  )
}

function Avatar({ name, avatar_url, size=44 }) {
  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#0891b2']
  const bg = colors[(name||'').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:10, objectFit:'cover', flexShrink:0, border:'2px solid #E5E7EB' }}/>
  return <div style={{ width:size, height:size, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:size*0.36, flexShrink:0 }}>
    {(name||'?').substring(0,2).toUpperCase()}
  </div>
}

async function updateLeadSafe(leadId, updates) {
  const { error, data } = await supabase.from('leads').update(updates).eq('id', leadId).select()
  if (error) throw error
  return data
}

export default function LeadDrawer({ lead, session, onClose, onUpdate, onDelete }) {
  const { team, members, shareLeadWithTeam, unshareLeadFromTeam } = useTeam()
  const navigate = useNavigate()
  const [activeTab, setActiveTab]     = useState('uebersicht')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState(null)
  const [activities, setActivities]   = useState([])
  const [notes, setNotes]             = useState([])
  const [newNote, setNewNote]         = useState('')
  const [addingNote, setAddingNote]   = useState(false)
  const [newAct, setNewAct]           = useState({ type:'call', subject:'' })
  const [addingAct, setAddingAct]     = useState(false)
  const [deals, setDeals]             = useState([])
  const [form, setForm]               = useState({})
  const [formDirty, setFormDirty]     = useState(false)
  const [quickLog, setQuickLog]       = useState(null)
  const [editForm, setEditForm]       = useState({})
  const [editDirty, setEditDirty]     = useState(false)
  const [editSaving, setEditSaving]   = useState(false)
  const [editSuccess, setEditSuccess] = useState(false)

  useEffect(() => {
    if (!lead) return
    setForm({ deal_value:lead.deal_value||'', deal_expected_close:lead.deal_expected_close||'', deal_probability:lead.deal_probability||0, ai_need_detected:lead.ai_need_detected||'', notes:lead.notes||'' })
    setFormDirty(false); setQuickLog(null)
    setEditForm({
      first_name: lead.first_name||'', last_name: lead.last_name||'',
      job_title: lead.job_title||lead.headline||'', company: lead.company||'',
      organization_id: lead.organization_id||null,
      email: lead.email||'', phone: lead.phone||'',
      linkedin_url: lead.linkedin_url||lead.profile_url||'',
      city: lead.city||'',
      country: lead.country||'', notes: lead.notes||'',
    })
    setEditDirty(false); setEditSuccess(false)
    loadActivities(); loadNotes(); loadDeals()
  }, [lead?.id])

  async function loadActivities() {
    if (!lead?.id) return
    const { data } = await supabase.from('activities').select('*').eq('lead_id', lead.id).order('occurred_at', { ascending:false }).limit(20)
    setActivities(data || [])
  }
  async function loadDeals() {
    const { data } = await supabase.from('deals').select('id,title,value,currency,stage,probability,expected_close_date,created_at').eq('lead_id', lead.id).order('created_at', { ascending:false })
    setDeals(data || [])
  }

  async function loadNotes() {
    if (!lead?.id) return
    const { data } = await supabase.from('contact_notes').select('*').eq('lead_id', lead.id).order('created_at', { ascending:false }).limit(20)
    setNotes(data || [])
  }

  function setField(k, v) { setForm(f=>({...f,[k]:v})); setFormDirty(true) }

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      const u = { deal_value:form.deal_value?Number(form.deal_value):null, deal_expected_close:form.deal_expected_close||null, deal_probability:Number(form.deal_probability)||0, ai_need_detected:form.ai_need_detected||null, notes:form.notes||null }
      await updateLeadSafe(lead.id, u)
      onUpdate({ ...lead, ...u }); setFormDirty(false)
    } catch(err) { setSaveError(err.message) }
    finally { setSaving(false) }
  }

  async function changeDealStage(s) {
    onUpdate({ ...lead, deal_stage:s })
    const { error } = await supabase.from('leads').update({ deal_stage:s, deal_stage_changed_at:new Date().toISOString() }).eq('id', lead.id)
    if (error) { setSaveError('Stage-Wechsel fehlgeschlagen'); onUpdate({ ...lead }) }
  }
  async function changeLifecycle(lc) {
    onUpdate({ ...lead, lifecycle_stage:lc })
    const { error } = await supabase.from('leads').update({ lifecycle_stage:lc }).eq('id', lead.id)
    if (error) { setSaveError('Lifecycle fehlgeschlagen'); onUpdate({ ...lead }) }
  }
  async function changeConn(status) {
    onUpdate({ ...lead, li_connection_status:status })
    const u = { li_connection_status:status }
    if (status==='verbunden' && lead.li_connection_status!=='verbunden') u.li_connected_at = new Date().toISOString()
    const { error } = await supabase.from('leads').update(u).eq('id', lead.id)
    if (error) { setSaveError('Status fehlgeschlagen'); onUpdate({ ...lead }) }
  }

  async function logQuick(type, subject) {
    const uid = session?.user?.id; if (!uid) return
    const { data, error } = await supabase.from('activities').insert({ lead_id:lead.id, user_id:uid, type, subject, direction:'outbound', occurred_at:new Date().toISOString() }).select().single()
    if (!error && data) setActivities(a => [data, ...a])
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    const uid = session?.user?.id
    const { data, error } = await supabase.from('contact_notes').insert({ lead_id:lead.id, user_id:uid, content:newNote.trim(), is_pinned:false, is_private:false }).select().single()
    if (!error && data) { setNotes(n=>[data,...n]); setNewNote('') }
    else if (error) setSaveError('Notiz konnte nicht gespeichert werden')
    setAddingNote(false)
  }

  async function deleteNote(id) {
    await supabase.from('contact_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function addAct() {
    if (!newAct.subject.trim()) return
    setAddingAct(true)
    const uid = session?.user?.id
    const { data, error } = await supabase.from('activities').insert({ lead_id:lead.id, user_id:uid, type:newAct.type, subject:newAct.subject, direction:'outbound', occurred_at:new Date().toISOString() }).select().single()
    if (!error && data) { setActivities(a=>[data,...a]); setNewAct({ type:'call', subject:'' }) }
    else if (error) setSaveError('Aktivität fehlgeschlagen')
    setAddingAct(false)
  }

  if (!lead) return <div style={{ position:'fixed', top:0, right:0, bottom:0, width:440, background:'#fff', boxShadow:'-4px 0 40px rgba(15,23,42,0.12)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ color:'#94A3B8' }}>Lade…</div></div>

  const conn     = CONN_CFG[lead.li_connection_status || 'nicht_verbunden']
  const stageCfg = STAGE_CFG[lead.deal_stage || 'kein_deal']
  const name     = fullName(lead)
  const score    = lead.hs_score || 0
  const scoreClr = score>=70?'#ef4444':score>=40?'#d97706':'#3b82f6'

  const inp = { padding:'7px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', color:'#0F172A' }
  const lbl = { fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4, display:'block' }

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:440, background:'#fff', boxShadow:'-4px 0 48px rgba(15,23,42,0.14)', zIndex:600, display:'flex', flexDirection:'column', animation:'drawerIn 0.22s cubic-bezier(0.22,1,0.36,1)' }}>
      <style>{`
        @keyframes drawerIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        .ld-ib:hover{background:#F1F5F9!important}
        .ld-qa:hover{background:#EFF6FF!important;border-color:#BFDBFE!important;color:#1d4ed8!important}
        .ld-sb:hover{opacity:0.8!important}
        .ld-tab:hover{color:#0F172A!important}
        .ld-row:hover{background:#F8FAFC!important}
      `}</style>

      {/* ─ HEADER ─ */}
      <div style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', padding:'14px 16px 12px', flexShrink:0 }}>
        {/* Top: Avatar + Info + Buttons */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
          <Avatar name={name} avatar_url={lead.avatar_url} size={44}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
            <div style={{ fontSize:12, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1 }}>{lead.job_title || lead.headline || ''}</div>
            {(lead.organizations?.name || lead.company) && <span style={{ display:'inline-block', marginTop:4, fontSize:11, fontWeight:600, background:'#E0E7FF', color:'#3730a3', borderRadius:4, padding:'1px 7px' }}>{lead.organizations?.name || lead.company}</span>}
          </div>
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            {team && (
              <button className="ld-ib" onClick={async () => { if(lead.is_shared){await unshareLeadFromTeam(lead.id);onUpdate({...lead,is_shared:false,team_id:null})}else{await shareLeadWithTeam(lead.id);onUpdate({...lead,is_shared:true,team_id:team.id})} }}
                title={lead.is_shared?'Sharing aufheben':`Mit "${team.name}" teilen`}
                style={{ width:30, height:30, borderRadius:7, border:`1px solid ${lead.is_shared?'#6EE7B7':'#E5E7EB'}`, background:lead.is_shared?'#ECFDF5':'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:14, transition:'all 0.15s' }}>👥</button>
            )}
            <button className="ld-ib" onClick={async () => { const v=!lead.is_favorite; await supabase.from('leads').update({is_favorite:v}).eq('id',lead.id); onUpdate({...lead,is_favorite:v}) }}
              style={{ width:30, height:30, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:15, transition:'background 0.15s' }}>
              {lead.is_favorite?'⭐':'☆'}
            </button>
            <button className="ld-ib" onClick={onClose}
              style={{ width:30, height:30, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:17, color:'#64748B' }}>×</button>
          </div>
        </div>

        {/* KPI Kacheln */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:10 }}>
          <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:8, padding:'7px 10px' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Score</div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ flex:1, height:3, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', width:Math.min(score,100)+'%', background:scoreClr, borderRadius:99 }}/>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:scoreClr, minWidth:20, textAlign:'right' }}>{score}</span>
            </div>
          </div>
          <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:8, padding:'7px 10px' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Stage</div>
            <div style={{ fontSize:11, fontWeight:700, color:stageCfg.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stageCfg.label}</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:8, padding:'7px 10px' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Deal</div>
            <div style={{ fontSize:11, fontWeight:700, color:lead.deal_value>0?'#059669':'#CBD5E1' }}>{lead.deal_value>0?`€${Number(lead.deal_value).toLocaleString('de-DE')}`:'—'}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:5 }}>
          {[
            ['📞','Anruf', async()=>{ await logQuick('call','Anruf'); setActiveTab('aktivitaet') }],
            ['📅','Follow-up', ()=>setQuickLog(quickLog==='followup'?null:'followup')],
            ['✏','Notiz', ()=>{ setActiveTab('aktivitaet'); setQuickLog(null) }],
            ['↗','Profil', ()=>navigate(`/leads/${lead.id}`)],
          ].map(([icon,label,fn]) => (
            <button key={label} className="ld-qa" onClick={fn}
              style={{ padding:'7px 2px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', fontSize:11, fontWeight:600, color:'#475569', cursor:'pointer', transition:'all 0.15s' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Follow-up Schnellauswahl */}
        {quickLog === 'followup' && (
          <div style={{ marginTop:8, background:'#fff', border:'1px solid #BFDBFE', borderRadius:8, padding:'8px 10px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#1d4ed8', marginBottom:6 }}>Follow-up setzen</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {[['Heute',0],['Morgen',1],['3 Tage',3],['7 Tage',7],['14 Tage',14]].map(([l,d]) => {
                const dt = new Date(); dt.setDate(dt.getDate()+d)
                const iso = dt.toISOString().split('T')[0]
                return <button key={d} onClick={async()=>{ await supabase.from('leads').update({next_followup:iso}).eq('id',lead.id); onUpdate({...lead,next_followup:iso}); setQuickLog(null) }}
                  style={{ padding:'3px 9px', borderRadius:6, border:'1px solid #BFDBFE', background:'#EFF6FF', fontSize:11, fontWeight:600, color:'#1d4ed8', cursor:'pointer' }}>{l}</button>
              })}
              {lead.next_followup && <button onClick={async()=>{ await supabase.from('leads').update({next_followup:null}).eq('id',lead.id); onUpdate({...lead,next_followup:null}); setQuickLog(null) }}
                style={{ padding:'3px 9px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', fontSize:11, fontWeight:600, color:'#dc2626', cursor:'pointer' }}>✕ Löschen</button>}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {saveError && (
        <div style={{ background:'#FEF2F2', borderBottom:'1px solid #FECACA', padding:'8px 14px', fontSize:12, color:'#991B1B', display:'flex', justifyContent:'space-between', flexShrink:0 }}>
          <span>⚠ {saveError}</span>
          <button onClick={()=>setSaveError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#991B1B', fontSize:16 }}>×</button>
        </div>
      )}

      {/* ─ TABS ─ */}
      <div style={{ display:'flex', borderBottom:'1px solid #E5E7EB', flexShrink:0, background:'#fff' }}>
        {[['uebersicht','Übersicht'],['verlauf','📋 Verlauf'],['bearbeiten','✏ Bearbeiten']].map(([id,label]) => (
          <button key={id} className="ld-tab" onClick={()=>{ setActiveTab(id); setQuickLog(null) }}
            style={{ flex:1, padding:'10px 4px', border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:activeTab===id?700:500, color:activeTab===id?'#0F172A':'#94A3B8', boxShadow:activeTab===id?'inset 0 -2px 0 #0F172A':'none', transition:'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ─ CONTENT ─ */}
      <div style={{ flex:1, overflowY:'auto', padding:16 }}>

        {/* ÜBERSICHT */}
        {activeTab === 'uebersicht' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            <StageSlider
              label="Pipeline Stage"
              options={STAGE_ORDER.map(s => ({ value:s, label:STAGE_CFG[s].label, color:STAGE_CFG[s].activeBg }))}
              value={lead.deal_stage||'kein_deal'}
              onChange={changeDealStage}
              accent="#2563eb"
            />

            <StageSlider
              label="Verbindung"
              options={Object.entries(CONN_CFG).map(([k,v]) => ({ value:k, label:v.label }))}
              value={lead.li_connection_status||'nicht_verbunden'}
              onChange={changeConn}
              accent="#059669"
            />
            <StageSlider
              label="Lifecycle"
              options={[['lead','Lead'],['marketing_qualified','MQL'],['sales_qualified','SQL'],['opportunity','Opportunity'],['customer','Kunde']].map(([k,l]) => ({ value:k, label:l }))}
              value={lead.lifecycle_stage||'lead'}
              onChange={changeLifecycle}
              accent="#7c3aed"
            />

            {/* Deals für diesen Lead */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#475569' }}>Deals {deals.length > 0 && <span style={{ fontWeight:500, color:'#94A3B8' }}>({deals.length})</span>}</div>
                <button onClick={()=>navigate('/deals')} style={{ fontSize:10, fontWeight:600, color:'#2563eb', background:'transparent', border:'none', cursor:'pointer', padding:0 }}>Alle ansehen →</button>
              </div>
              {deals.length === 0 ? (
                <div style={{ fontSize:12, color:'#94A3B8', textAlign:'center', padding:'12px 0' }}>Noch keine Deals für diesen Lead.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {deals.map(d => {
                    const stg = STAGE_CFG[d.stage] || STAGE_CFG.kein_deal
                    return (
                      <div key={d.id} onClick={()=>navigate('/deals')} className="ld-row" style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:8, padding:'10px 12px', cursor:'pointer', transition:'background 0.12s' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{d.title || '— kein Titel —'}</div>
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:stg.color+'15', color:stg.color, whiteSpace:'nowrap', flexShrink:0 }}>{stg.label}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, color:'#64748B' }}>
                          <div>
                            {d.value > 0 ? <span style={{ color:'#059669', fontWeight:700 }}>€{Number(d.value).toLocaleString('de-DE')}</span> : <span style={{ color:'#CBD5E1' }}>— kein Wert</span>}
                            {d.probability != null && <span style={{ marginLeft:8 }}>{d.probability}%</span>}
                          </div>
                          {d.expected_close_date && <div>🗓 {new Date(d.expected_close_date).toLocaleDateString('de-DE')}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* KI-Erkenntnisse */}
            {(lead.ai_buying_intent || lead.ai_pain_points?.length || lead.ai_use_cases?.length) && (
              <div style={{ background:'#FAFAFF', borderRadius:10, padding:'12px 14px', border:'1px solid #E0E7FF', borderLeft:'3px solid #7c3aed' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#7c3aed' }}>KI-Einschätzung</span>
                  {lead.ai_buying_intent && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC', color:lead.ai_buying_intent==='hoch'?'#dc2626':lead.ai_buying_intent==='mittel'?'#d97706':'#64748b' }}>
                    {lead.ai_buying_intent==='hoch'?'🔥 Hoch':lead.ai_buying_intent==='mittel'?'⚡ Mittel':'○ Niedrig'}
                  </span>}
                </div>
                {lead.ai_need_detected && <div style={{ fontSize:12, color:'#475569', marginBottom:8, fontStyle:'italic' }}>"{lead.ai_need_detected}"</div>}
                {lead.ai_pain_points?.length > 0 && (
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:4 }}>
                    {lead.ai_pain_points.map((p,i)=><span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:'#FEF2F2', color:'#dc2626', border:'1px solid #FECACA', fontWeight:600 }}>⚠ {p}</span>)}
                  </div>
                )}
                {lead.ai_use_cases?.length > 0 && (
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {lead.ai_use_cases.map((u,i)=><span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:'#ECFDF5', color:'#059669', border:'1px solid #A7F3D0', fontWeight:600 }}>✓ {u}</span>)}
                  </div>
                )}
              </div>
            )}

            {/* Allgemeine Notiz */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>Notiz</span>
                {formDirty && <span style={{ fontSize:10, color:'#d97706' }}>• Ungespeichert</span>}
              </div>
              <textarea value={form.notes} onChange={e=>setField('notes',e.target.value)} rows={3} placeholder="Notizen zu diesem Lead…" style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/>
            </div>
          </div>
        )}

        {/* AKTIVITÄT */}
        {activeTab === 'verlauf' && (
          <div>
            {/* Aktivität loggen */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px', marginBottom:12, border:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:8 }}>Aktivität loggen</div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
                {[['call','📞','Anruf'],['email','📧','E-Mail'],['meeting','🤝','Meeting'],['linkedin_message','💬','LinkedIn'],['note','📝','Notiz']].map(([type,icon,label]) => (
                  <button key={type} onClick={()=>setNewAct(a=>({...a,type}))}
                    style={{ padding:'4px 9px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.12s', background:newAct.type===type?'#2563eb':'#fff', color:newAct.type===type?'#fff':'#64748B', border:`1px solid ${newAct.type===type?'#2563eb':'#E5E7EB'}` }}>
                    {icon} {label}
                  </button>
                ))}
              </div>
              <input value={newAct.subject} onChange={e=>setNewAct(a=>({...a,subject:e.target.value}))} placeholder="Betreff / Zusammenfassung" style={{ ...inp, marginBottom:8 }} onKeyDown={e=>e.key==='Enter'&&addAct()}/>
              <button onClick={addAct} disabled={addingAct||!newAct.subject.trim()}
                style={{ width:'100%', padding:'8px', borderRadius:7, border:'none', background:newAct.subject.trim()?'#2563eb':'#E5E7EB', color:'#fff', fontWeight:700, fontSize:12, cursor:newAct.subject.trim()?'pointer':'default' }}>
                {addingAct?'⏳ Speichere…':'+ Loggen'}
              </button>
            </div>

            {/* Notiz */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px', marginBottom:12, border:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:8 }}>Kontakt-Notiz</div>
              <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Neue Notiz…" rows={2} style={{ ...inp, resize:'vertical', lineHeight:1.5, marginBottom:8 }}/>
              <button onClick={addNote} disabled={addingNote||!newNote.trim()}
                style={{ width:'100%', padding:'8px', borderRadius:7, border:'none', background:newNote.trim()?'#475569':'#E5E7EB', color:'#fff', fontWeight:700, fontSize:12, cursor:newNote.trim()?'pointer':'default' }}>
                {addingNote?'⏳ Speichere…':'+ Notiz speichern'}
              </button>
            </div>

            {/* Aufgaben */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Aufgaben</div>
              <LeadTasks leadId={lead.id} teamId={team?.id} session={session} members={members}/>
            </div>

            {/* Notizen Liste */}
            {notes.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Notizen</div>
                {notes.map(n => (
                  <div key={n.id} className="ld-row" style={{ background:'#fff', borderRadius:8, padding:'9px 12px', marginBottom:6, border:'1px solid #E5E7EB', transition:'background 0.12s' }}>
                    <div style={{ fontSize:12, color:'#0F172A', lineHeight:1.5, whiteSpace:'pre-wrap', marginBottom:4 }}>{n.content}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:10, color:'#94A3B8' }}>{new Date(n.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
                      <button onClick={()=>deleteNote(n.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#E5E7EB', fontSize:11 }}
                        onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#E5E7EB'}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
                Timeline {activities.length>0&&<span style={{ fontWeight:500 }}>({activities.length})</span>}
              </div>
              {activities.length===0&&notes.length===0&&<div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic', textAlign:'center', padding:'24px 0' }}>Noch keine Aktivitäten</div>}
              {activities.map((a,i) => (
                <div key={a.id} style={{ display:'flex', gap:10, paddingBottom:12 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>{ACT_ICONS[a.type]||'📌'}</div>
                    {i<activities.length-1&&<div style={{ width:1, flex:1, background:'#E5E7EB', marginTop:4 }}/>}
                  </div>
                  <div style={{ flex:1, paddingTop:4 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'#0F172A' }}>{a.subject||ACT_LABELS[a.type]||a.type}</div>
                    {a.body&&<div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{a.body}</div>}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                      <div style={{ fontSize:10, color:'#94A3B8' }}>{new Date(a.occurred_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                      <button onClick={async()=>{ await supabase.from('activities').delete().eq('id',a.id); setActivities(p=>p.filter(x=>x.id!==a.id)) }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#E5E7EB', fontSize:10 }}
                        onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#E5E7EB'}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BEARBEITEN */}
        {activeTab === 'bearbeiten' && (() => {
          const lbl = { fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }
          const inp = { width:'100%', padding:'8px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', color:'#0F172A', background:'#FAFAFA', transition:'border-color 0.15s' }
          const onFocus = e => e.target.style.borderColor = 'var(--wl-primary, #2563eb)'
          const onBlur  = e => e.target.style.borderColor = '#E5E7EB'
          const setE = (k,v) => { setEditForm(f=>({...f,[k]:v})); setEditDirty(true); setEditSuccess(false) }
          const saveEdit = async () => {
            setEditSaving(true)
            try {
              // Nur Felder senden die tatsächlich definiert sind (kein undefined)
              const raw = {
                first_name: editForm.first_name, last_name: editForm.last_name,
                job_title: editForm.job_title, company: editForm.company,
                email: editForm.email, phone: editForm.phone,
                linkedin_url: editForm.linkedin_url, organization_id: editForm.organization_id || null,
                city: editForm.city, country: editForm.country, notes: editForm.notes,
              }
              const updates = Object.fromEntries(
                Object.entries(raw).filter(([, v]) => v !== undefined)
              )
              const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
              if (error) throw error
              onUpdate({ ...lead, ...updates })
              setEditDirty(false); setEditSuccess(true)
              setTimeout(() => setEditSuccess(false), 3000)
            } catch(e) { setSaveError(e.message) }
            setEditSaving(false)
          }
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {editSuccess && (
                <div style={{ padding:'8px 12px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, fontSize:12, fontWeight:600, color:'#166534' }}>
                  ✓ Gespeichert
                </div>
              )}

              {/* Person */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Person</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={lbl}>Vorname</label>
                    <input value={editForm.first_name} onChange={e=>setE('first_name',e.target.value)} style={inp} placeholder="Vorname" onFocus={onFocus} onBlur={onBlur}/>
                  </div>
                  <div>
                    <label style={lbl}>Nachname</label>
                    <input value={editForm.last_name} onChange={e=>setE('last_name',e.target.value)} style={inp} placeholder="Nachname" onFocus={onFocus} onBlur={onBlur}/>
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={lbl}>Jobtitel / Position</label>
                    <input value={editForm.job_title} onChange={e=>setE('job_title',e.target.value)} style={inp} placeholder="z.B. Head of Sales" onFocus={onFocus} onBlur={onBlur}/>
                  </div>
                </div>
              </div>

              {/* Kontakt */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Kontakt</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label style={lbl}>E-Mail</label>
                    <input type="email" value={editForm.email} onChange={e=>setE('email',e.target.value)} style={inp} placeholder="name@firma.de" onFocus={onFocus} onBlur={onBlur}/>
                  </div>
                  <div>
                    <label style={lbl}>Telefon</label>
                    <input type="tel" value={editForm.phone} onChange={e=>setE('phone',e.target.value)} style={inp} placeholder="+49 151 23456789" onFocus={onFocus} onBlur={onBlur}/>
                  </div>
                  <div>
                    <label style={lbl}>LinkedIn URL</label>
                    <input value={editForm.linkedin_url} onChange={e=>setE('linkedin_url',e.target.value)} style={inp} placeholder="https://linkedin.com/in/..." onFocus={onFocus} onBlur={onBlur}/>
                  </div>
                </div>
              </div>

              {/* Unternehmen */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Unternehmen</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label style={lbl}>Organisation</label>
                    <OrganizationPicker
                      value={editForm.organization_id}
                      valueName={editForm.company || lead.company}
                      onChange={(orgId, orgName) => { setE('organization_id', orgId); setE('company', orgName || editForm.company) }}
                      placeholder="Firma suchen oder neu anlegen…"
                    />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label style={lbl}>Stadt</label>
                      <input value={editForm.city} onChange={e=>setE('city',e.target.value)} style={inp} placeholder="München" onFocus={onFocus} onBlur={onBlur}/>
                    </div>
                    <div>
                      <label style={lbl}>Land</label>
                      <input value={editForm.country} onChange={e=>setE('country',e.target.value)} style={inp} placeholder="Deutschland" onFocus={onFocus} onBlur={onBlur}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notizen */}
              <div>
                <label style={{ ...lbl, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Interne Notizen</label>
                <textarea value={editForm.notes} onChange={e=>setE('notes',e.target.value)} rows={4}
                  style={{ ...inp, resize:'vertical', lineHeight:1.6 }}
                  placeholder="Notizen zu diesem Lead…" onFocus={onFocus} onBlur={onBlur}/>
              </div>

              {/* Speichern */}
              <button onClick={saveEdit} disabled={editSaving || !editDirty}
                style={{ padding:'10px', borderRadius:8, border:'none', background:editDirty?'var(--wl-primary, #2563eb)':'#E5E7EB', color:editDirty?'#fff':'#9CA3AF', fontSize:13, fontWeight:700, cursor:editDirty?'pointer':'default', transition:'all 0.15s' }}>
                {editSaving ? '⏳ Speichere…' : editDirty ? '💾 Änderungen speichern' : 'Keine Änderungen'}
              </button>

              {/* Löschen */}
              <div style={{ paddingTop:8, borderTop:'1px solid #E5E7EB', textAlign:'center' }}>
                <button onClick={()=>{ if(window.confirm('Lead wirklich löschen?')){ supabase.from('leads').delete().eq('id',lead.id); onDelete(lead.id); onClose() }}}
                  style={{ padding:'6px 16px', borderRadius:7, border:'1px solid #FECACA', background:'transparent', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  🗑 Lead löschen
                </button>
              </div>
            </div>
          )
        })()}

      </div>

      {/* ─ FOOTER: Speichern nur wenn dirty ─ */}
      {formDirty && activeTab==='uebersicht' && (
        <div style={{ padding:'10px 16px', borderTop:'1px solid #E5E7EB', background:'#FFFBEB', display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={save} disabled={saving}
            style={{ flex:1, padding:'8px', borderRadius:8, border:'none', background:saving?'#94A3B8':'#2563eb', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            {saving?'⏳ Speichere…':'💾 Speichern'}
          </button>
          <button onClick={()=>{ setForm(f=>({...f,deal_value:lead.deal_value||'',deal_expected_close:lead.deal_expected_close||'',deal_probability:lead.deal_probability||0,notes:lead.notes||'',ai_need_detected:lead.ai_need_detected||''})); setFormDirty(false) }}
            style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', color:'#64748B', fontSize:13, cursor:'pointer' }}>
            Verwerfen
          </button>
        </div>
      )}
    </div>
  )
}
