import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import LeadDrawer from '../components/LeadDrawer'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'
const initials = n => (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2)

const CONN_CFG = {
  verbunden:       { label:'✅ Vernetzt',       color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  nicht_verbunden: { label:'— Kein Kontakt',    color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
  pending:         { label:'⏳ Ausstehend',      color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
  abgelehnt:       { label:'❌ Abgelehnt',       color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
}

const REPLY_CFG = {
  schnell:       { label:'⚡ Schnell', color:'#065F46', bg:'#ECFDF5' },
  langsam:       { label:'🐢 Langsam', color:'#92400E', bg:'#FFFBEB' },
  keine_antwort: { label:'🔇 Keine Antwort', color:'#991B1B', bg:'#FEF2F2' },
  unbekannt:     { label:'— Unbekannt', color:'#475569', bg:'#F8FAFC' },
}

function Avatar({ name, avatar_url, size=44 }) {
  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#0891b2']
  const bg = colors[(name||'').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.36, flexShrink:0 }}>{initials(name)}</div>
}

/* ── Aktivitäts-Log Card ── */
function ActivityItem({ type, text, date }) {
  const icons = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', linkedin_connection:'🔗', task:'✅', other:'📌' }
  return (
    <div style={{ display:'flex', gap:10, paddingBottom:12 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>{icons[type] || '📌'}</div>
      <div>
        <div style={{ fontSize:13, color:'#1E293B', fontWeight:500 }}>{text}</div>
        <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{date ? new Date(date).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</div>
      </div>
    </div>
  )
}

/* ── KI-Anfrage Modal ── */
function AnfrageModal({ lead, onClose, onSaved }) {
  const [msg, setMsg]     = useState('')
  const [gen, setGen]     = useState(false)
  const [saving, setSave] = useState(false)
  const [sent, setSent]   = useState(false)

  async function generate() {
    setGen(true)
    try {
      const { data } = await supabase.functions.invoke('generate', {
        body: { type:'connection_request', name:fullName(lead), position:lead.job_title||lead.headline||'', company:lead.company||'' }
      })
      const text = (typeof data==='string'?data:null)||data?.text||data?.content||(Array.isArray(data?.content)?data.content[0]?.text:null)
      setMsg(text ? text.trim() : 'KI-Generierung nicht verfügbar.')
    } catch(e) { setMsg('Fehler: '+e.message) }
    setGen(false)
  }

  async function save() {
    setSave(true)
    await supabase.from('leads').update({
      li_connection_status: 'pending',
      li_connection_requested_at: new Date().toISOString(),
    }).eq('id', lead.id)
    // Log activity
    await supabase.from('activities').insert({
      lead_id: lead.id, team_id: lead.team_id || null,
      user_id: (await supabase.auth.getUser()).data.user.id,
      type: 'linkedin_connection', direction: 'outbound',
      subject: 'Vernetzungsanfrage gesendet', body: msg,
      occurred_at: new Date().toISOString(),
    }).select()
    onSaved(lead.id, 'pending')
    setSave(false); setSent(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:20, padding:28, width:520, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight:800, fontSize:17, color:'#0F172A', marginBottom:4 }}>Vernetzungsanfrage</div>
        <div style={{ fontSize:13, color:'#64748B', marginBottom:20 }}>{fullName(lead)} · {lead.company||''}</div>
        <textarea value={msg} onChange={e=>setMsg(e.target.value.substring(0,300))} maxLength={300} rows={5}
          placeholder="Persönliche Nachricht (max. 300 Zeichen)..."
          style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, resize:'vertical', outline:'none' }}/>
        <div style={{ textAlign:'right', fontSize:11, color:'#94A3B8', marginTop:4 }}>{msg.length}/300</div>
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <button onClick={generate} disabled={gen} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'rgb(49,90,231)', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            {gen ? '⏳ Generiere...' : '✨ KI-Nachricht'}
          </button>
          <button onClick={save} disabled={saving||sent||!msg} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'none', background:sent?'#10B981':msg?'rgb(49,90,231)':'#E5E7EB', color:'#fff', fontWeight:700, fontSize:13, cursor:msg&&!sent?'pointer':'default', transition:'background 0.3s' }}>
            {sent ? '✅ Gesendet!' : saving ? '⏳...' : '🤝 Anfrage senden'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Status Modal ── */
function StatusModal({ lead, onClose, onSaved }) {
  const [status, setStatus] = useState(lead.li_connection_status || 'nicht_verbunden')
  const [reply, setReply]   = useState(lead.li_reply_behavior || 'unbekannt')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const updates = {
      li_connection_status: status,
      li_reply_behavior: reply,
      li_last_interaction_at: new Date().toISOString(),
    }
    if (status === 'verbunden' && lead.li_connection_status !== 'verbunden') {
      updates.li_connected_at = new Date().toISOString()
    }
    await supabase.from('leads').update(updates).eq('id', lead.id)
    onSaved(lead.id, status, reply)
    setSaving(false)
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:20, padding:28, width:440, boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight:800, fontSize:17, color:'#0F172A', marginBottom:4 }}>Status aktualisieren</div>
        <div style={{ fontSize:13, color:'#64748B', marginBottom:20 }}>{fullName(lead)}</div>
        
        <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Verbindungsstatus</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
          {Object.entries(CONN_CFG).map(([key,cfg]) => (
            <button key={key} onClick={()=>setStatus(key)} style={{ padding:'10px 14px', borderRadius:10, border:`2px solid ${status===key?cfg.border:'#E5E7EB'}`, background:status===key?cfg.bg:'#fff', color:cfg.color, fontWeight:status===key?700:400, fontSize:13, cursor:'pointer', textAlign:'left' }}>
              {cfg.label}
            </button>
          ))}
        </div>
        
        <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Antwortverhalten</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
          {Object.entries(REPLY_CFG).map(([key,cfg]) => (
            <button key={key} onClick={()=>setReply(key)} style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${reply===key?'#6366f1':'#E5E7EB'}`, background:reply===key?'#EEF2FF':'#fff', color:reply===key?'#4F46E5':cfg.color, fontSize:12, fontWeight:reply===key?700:400, cursor:'pointer' }}>
              {cfg.label}
            </button>
          ))}
        </div>
        
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E5E7EB', background:'#fff', color:'#64748B', fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
          <button onClick={save} disabled={saving} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'none', background:'rgb(49,90,231)', color:'#fff', fontWeight:700, cursor:'pointer' }}>
            {saving ? '⏳...' : '💾 Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Lead Detail Drawer ── */
function LeadDrawer({ lead, activities, onClose }) {
  if (!lead) return null
  const conn = CONN_CFG[lead.li_connection_status || 'nicht_verbunden']
  const reply = REPLY_CFG[lead.li_reply_behavior || 'unbekannt']
  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:400, background:'#fff', boxShadow:'-4px 0 32px rgba(15,23,42,0.12)', zIndex:500, display:'flex', flexDirection:'column', animation:'slideIn 0.2s ease-out' }}>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      <div style={{ background:'linear-gradient(135deg,#1e3a8a,#3b82f6)', padding:'24px 20px', flexShrink:0 }}>
        <button onClick={onClose} style={{ position:'absolute', top:14, right:14, background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18 }}>×</button>
        <div style={{ display:'flex', alignItems:'flex-end', gap:14 }}>
          <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={56}/>
          <div>
            <div style={{ fontWeight:800, fontSize:17, color:'#fff' }}>{fullName(lead)}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2 }}>{lead.job_title || lead.headline}</div>
            {lead.company && <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{lead.company}</div>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
          <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:conn.bg, color:conn.color, border:'1px solid '+conn.border }}>{conn.label}</span>
          <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:reply.bg, color:'#475569' }}>{reply.label}</span>
          {lead.hs_score > 0 && <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.2)', color:'#fff' }}>Score: {lead.hs_score}</span>}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:20 }}>
        {/* CRM Infos */}
        <div style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>CRM Details</div>
          {[
            ['Lifecycle', lead.lifecycle_stage],
            ['Deal Stage', lead.deal_stage],
            ['Deal Wert', lead.deal_value ? '€'+Number(lead.deal_value).toLocaleString('de-DE') : null],
            ['Buying Intent', lead.ai_buying_intent],
            ['Verbunden am', lead.li_connected_at ? new Date(lead.li_connected_at).toLocaleDateString('de-DE') : null],
            ['Letzte Interaktion', lead.li_last_interaction_at ? new Date(lead.li_last_interaction_at).toLocaleDateString('de-DE') : null],
          ].filter(([,v]) => v).map(([label, val]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #E5E7EB', fontSize:13 }}>
              <span style={{ color:'#64748B', fontWeight:500 }}>{label}</span>
              <span style={{ color:'#0F172A', fontWeight:600 }}>{val}</span>
            </div>
          ))}
        </div>
        {/* AI Insights */}
        {(lead.ai_need_detected || lead.li_message_summary || lead.li_about_summary) && (
          <div style={{ background:'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(59,130,246,0.08))', borderRadius:12, padding:'14px 16px', marginBottom:16, border:'1px solid rgba(139,92,246,0.2)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#7C3AED', marginBottom:8 }}>🤖 AI-Erkenntnisse</div>
            {lead.ai_need_detected && <div style={{ fontSize:12, color:'#374151', marginBottom:6 }}><b>Bedarf:</b> {lead.ai_need_detected}</div>}
            {lead.li_message_summary && <div style={{ fontSize:12, color:'#374151', marginBottom:6 }}><b>Nachrichten:</b> {lead.li_message_summary}</div>}
            {lead.li_about_summary && <div style={{ fontSize:12, color:'#374151' }}><b>Profil:</b> {lead.li_about_summary}</div>}
          </div>
        )}
        {/* Aktivitäts-Timeline */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>Aktivitäten</div>
          {activities && activities.length > 0 ? (
            activities.map(a => (
              <ActivityItem key={a.id} type={a.type} text={a.subject || a.body || a.type} date={a.occurred_at}/>
            ))
          ) : (
            <div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic' }}>Noch keine Aktivitäten</div>
          )}
        </div>
        {/* LinkedIn Profil Link */}
        {(lead.profile_url || lead.linkedin_url) && (
          <a href={lead.profile_url || lead.linkedin_url} target="_blank" rel="noreferrer"
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'rgba(49,90,231,0.08)', borderRadius:10, color:'rgb(49,90,231)', textDecoration:'none', fontSize:13, fontWeight:700 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="rgb(49,90,231)"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            LinkedIn Profil öffnen
          </a>
        )}
      </div>
    </div>
  )
}

/* ── Haupt-Komponente ── */
export default function Vernetzungen({ session }) {
  const [leads, setLeads]               = useState([])
  const [activities, setActivities]     = useState({})
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState(null)
  const [anfrageModal, setAnfrageModal] = useState(null)
  const [statusModal, setStatusModal]   = useState(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,avatar_url,profile_url,linkedin_url,email,li_connection_status,li_connection_requested_at,li_connected_at,li_reply_behavior,li_last_interaction_at,li_message_summary,li_about_summary,ai_need_detected,ai_buying_intent,hs_score,deal_stage,deal_value,lifecycle_stage,notes,created_at')
      .eq('user_id', user.id)
      .order('li_connected_at', { ascending:false, nullsFirst:false })
    setLeads(data || [])
    setLoading(false)
  }, [])

  async function loadActivities(leadId) {
    if (activities[leadId]) return
    const { data } = await supabase.from('activities').select('*').eq('lead_id', leadId).order('occurred_at', { ascending:false }).limit(10)
    setActivities(prev => ({ ...prev, [leadId]: data || [] }))
  }

  useEffect(() => { load() }, [load])

  function handleSelect(lead) {
    if (selected?.id === lead.id) { setSelected(null); return }
    setSelected(lead)
    loadActivities(lead.id)
  }

  function handleAnfrageSaved(id, newStatus) {
    setLeads(l => l.map(x => x.id===id ? {...x, li_connection_status:newStatus, li_connection_requested_at:new Date().toISOString()} : x))
  }
  function handleStatusSaved(id, newStatus, replyBehavior) {
    setLeads(l => l.map(x => x.id===id ? {...x, li_connection_status:newStatus, li_reply_behavior:replyBehavior} : x))
    if (selected?.id === id) setSelected(prev => ({...prev, li_connection_status:newStatus, li_reply_behavior:replyBehavior}))
  }

  const filtered = leads.filter(l => {
    const statusMatch = filter === 'all' || (l.li_connection_status || 'nicht_verbunden') === filter
    const searchMatch = !search || fullName(l).toLowerCase().includes(search.toLowerCase()) || (l.company||'').toLowerCase().includes(search.toLowerCase())
    return statusMatch && searchMatch
  })

  const stats = {
    verbunden:       leads.filter(l => l.li_connection_status === 'verbunden').length,
    pending:         leads.filter(l => l.li_connection_status === 'pending').length,
    nicht_verbunden: leads.filter(l => !l.li_connection_status || l.li_connection_status === 'nicht_verbunden').length,
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#64748B' }}>Lade Vernetzungen…</div>

  return (
    <div style={{ padding:'0 0 32px', maxWidth:1100, margin:'0 auto' }}>
      {anfrageModal && <AnfrageModal lead={anfrageModal} onClose={()=>setAnfrageModal(null)} onSaved={handleAnfrageSaved}/>}
      {statusModal  && <StatusModal  lead={statusModal}  onClose={()=>setStatusModal(null)}  onSaved={handleStatusSaved}/>}
      {selected     && <LeadDrawer lead={selected} onClose={()=>setSelected(null)} onUpdate={(u)=>{ setLeads(l=>l.map(x=>x.id===u.id?u:x)); setSelected(u) }} onDelete={(id)=>{ setLeads(l=>l.filter(x=>x.id!==id)); setSelected(null) }}/>}

      {/* Stats Row */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:24 }}>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { label:'Vernetzt', val:stats.verbunden, color:'#065F46', bg:'#ECFDF5' },
            { label:'Ausstehend', val:stats.pending, color:'#92400E', bg:'#FFFBEB' },
            { label:'Kein Kontakt', val:stats.nicht_verbunden, color:'#475569', bg:'#F8FAFC' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'10px 18px', textAlign:'center', minWidth:90 }}>
              <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:11, color:s.color, fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter + Search */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, Firma oder Jobtitel suchen…"
          style={{ flex:1, minWidth:200, padding:'9px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none' }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[['all','Alle'],['verbunden','Vernetzt'],['pending','Ausstehend'],['nicht_verbunden','Nicht vernetzt'],['abgelehnt','Abgelehnt']].map(([key,lbl]) => (
            <button key={key} onClick={()=>setFilter(key)} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid', borderColor:filter===key?'rgb(49,90,231)':'#E5E7EB', background:filter===key?'rgba(49,90,231,0.08)':'#fff', color:filter===key?'rgb(49,90,231)':'#64748B', fontSize:13, fontWeight:filter===key?700:400, cursor:'pointer' }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Lead Cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.length === 0 && <div style={{ textAlign:'center', padding:'60px 0', color:'#94A3B8', fontSize:14 }}>Keine Vernetzungen gefunden.</div>}
        {filtered.map(lead => {
          const conn     = CONN_CFG[lead.li_connection_status || 'nicht_verbunden']
          const reply    = REPLY_CFG[lead.li_reply_behavior || 'unbekannt']
          const alreadySent = ['pending','verbunden'].includes(lead.li_connection_status)
          const isSelected = selected?.id === lead.id
          return (
            <div key={lead.id} style={{ background:'#fff', border:'1px solid '+(isSelected?'rgb(49,90,231)':'#E8EDF2'), borderRadius:12, overflow:'hidden', transition:'all 0.15s', boxShadow:isSelected?'0 0 0 2px rgba(49,90,231,0.15)':'none' }}>
              <div onClick={() => handleSelect(lead)} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer' }}>
                <Avatar name={fullName(lead)} avatar_url={lead.avatar_url}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>{fullName(lead)}</span>
                    {lead.profile_url && (
                      <a href={lead.profile_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:11, color:'rgb(49,90,231)', textDecoration:'none', fontWeight:600 }}>LinkedIn ↗</a>
                    )}
                  </div>
                  <div style={{ fontSize:13, color:'#64748B', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {lead.job_title||lead.headline||'—'}
                    {lead.company && <span style={{ color:'rgb(49,90,231)', fontWeight:600 }}> · {lead.company}</span>}
                  </div>
                  {/* AI Buying Intent + Reply Behavior */}
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    {lead.ai_buying_intent && lead.ai_buying_intent !== 'unbekannt' && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, fontWeight:700, background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC', color:lead.ai_buying_intent==='hoch'?'#ef4444':lead.ai_buying_intent==='mittel'?'#f59e0b':'#64748b' }}>
                        {lead.ai_buying_intent==='hoch'?'🔥':lead.ai_buying_intent==='mittel'?'⚡':'○'} Intent: {lead.ai_buying_intent}
                      </span>
                    )}
                    {lead.li_reply_behavior && lead.li_reply_behavior !== 'unbekannt' && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, fontWeight:600, background:reply.bg, color:'#475569' }}>{reply.label}</span>
                    )}
                    {lead.hs_score > 0 && <span style={{ fontSize:10, color:'#94A3B8' }}>Score: {lead.hs_score}</span>}
                  </div>
                </div>
                {/* Right side */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                  <span style={{ fontSize:12, padding:'4px 10px', borderRadius:8, background:conn.bg, color:conn.color, border:'1px solid '+conn.border, fontWeight:600 }}>{conn.label}</span>
                  <span style={{ fontSize:11, color:'#94A3B8' }}>{new Date(lead.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</span>
                  <button onClick={e => { e.stopPropagation(); if(!alreadySent) setAnfrageModal(lead) }} disabled={alreadySent}
                    style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, cursor:alreadySent?'default':'pointer', border:alreadySent?'1px solid #BBF7D0':'1px solid #BFDBFE', background:alreadySent?'#F0FDF4':'rgba(49,90,231,0.08)', color:alreadySent?'#166534':'rgb(49,90,231)', whiteSpace:'nowrap' }}>
                    {alreadySent ? '✅ Gesendet' : '✨ Anfrage'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setStatusModal(lead) }}
                    style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    ↺ Status
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
