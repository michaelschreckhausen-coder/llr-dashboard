import { useTranslation } from 'react-i18next'
import React, { useEffect, useState, useCallback } from 'react'
import { useResponsive } from '../hooks/useResponsive'
import { useTeam } from '../context/TeamContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LeadDrawer from '../components/LeadDrawer'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'
const initials = n => (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2)

const CONN_CFG = {
  verbunden:       { label:'✅ Vernetzt',       color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  nicht_verbunden: { label:'— Kein Kontakt',    color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
  pending:         { label:'⏳ ' + t('vernetzungen.pending'),      color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
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
function AnfrageModal({ lead, onClose, onSaved, session }) {
  const [msg, setMsg]     = useState('')
  const [gen, setGen]     = useState(false)
  const [saving, setSave] = useState(false)
  const [sent, setSent]   = useState(false)

  async function generate() {
    setGen(true)
    try {
            // Brand Voice laden für authentischen Ton
            const { data: bvData } = await supabase.from('brand_voices').select('*').eq('user_id', lead.user_id).eq('is_active', true).maybeSingle()
            const bv = bvData
            const bvParts = bv ? [
                      bv.ai_summary || '',
                      bv.personality ? 'Persönlichkeit: ' + bv.personality : '',
                      bv.tone_attributes?.length ? 'Ton: ' + bv.tone_attributes.join(', ') : '',
                      bv.formality === 'du' ? 'Ansprache: Du-Form' : bv.formality === 'sie' ? 'Ansprache: Sie-Form' : '',
                      bv.word_choice ? 'Wortwahl: ' + bv.word_choice : '',
                      bv.sentence_style ? 'Satzstruktur: ' + bv.sentence_style : '',
                      bv.dos ? 'Dos: ' + bv.dos : '',
                      bv.donts ? 'Donts: ' + bv.donts : '',
                    ].filter(Boolean) : []
            const systemPrompt = bv
              ? 'Du bist LinkedIn Ghostwriter. Schreibe eine persönliche Vernetzungsanfrage. BRAND VOICE (PFLICHT): ' + bvParts.join(' | ') + ' Kein generischer KI-Stil. Max. 300 Zeichen. Nur den fertigen Text, ohne Erklärung.'
                      : 'Du bist LinkedIn Experte. Schreibe eine kurze, authentische Vernetzungsanfrage. Max. 300 Zeichen. Nur den Text.'
            const { data } = await supabase.functions.invoke('generate', {
                      body: { type:'connection_request', name:fullName(lead), position:lead.job_title||lead.headline||'', company:lead.company||'', systemPrompt }
            })
      const text = (typeof data==='string'?data:null)||data?.text||data?.content||(Array.isArray(data?.content)?data.content[0]?.text:null)
      setMsg(text ? text.trim() : 'KI-Generierung nicht verfügbar.')
    } catch(e) { setMsg('Fehler: '+e.message) }
    setGen(false)
  }

  // Manuell senden (nur Status setzen)
  async function save() {
    setSave(true)
    await supabase.from('leads').update({
      li_connection_status: 'pending',
      li_connection_requested_at: new Date().toISOString(),
    }).eq('id', lead.id)
    await supabase.from('activities').insert({
      lead_id: lead.id, team_id: lead.team_id || null,
      user_id: session.user.id,
      type: 'linkedin_connection', direction: 'outbound',
      subject: 'Vernetzungsanfrage gesendet', body: msg,
      occurred_at: new Date().toISOString(),
    }).select()
    onSaved(lead.id, 'pending')
    setSave(false); setSent(true)
    setTimeout(onClose, 1200)
  }

  // Automatisch via Extension in Queue schreiben
  async function queueConnect() {
    if (!lead.linkedin_url && !lead.profile_url) {
      alert('Kein LinkedIn-Profil hinterlegt')
      return
    }
    setSave(true)
    const liUrl = (lead.linkedin_url || lead.profile_url).split('?')[0].replace(/\/$/, '')
    const { error } = await supabase.from('connection_queue').insert({
      user_id: session.user.id,
      lead_id: lead.id,
      linkedin_url: liUrl,
      message: msg || null,
      status: 'pending',
    })
    if (!error) {
      // Status auf pending setzen
      await supabase.from('leads').update({
        li_connection_status: 'pending',
      }).eq('id', lead.id)
      onSaved(lead.id, 'pending')
      setSave(false); setSent(true)
      setTimeout(onClose, 1200)
    } else {
      alert('Fehler: ' + error.message)
      setSave(false)
    }
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
          <button onClick={generate} disabled={gen} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'var(--wl-primary, rgb(49,90,231))', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            {gen ? '⏳ Generiere...' : '✨ KI-Nachricht'}
          </button>
          <button onClick={queueConnect} disabled={saving||sent} title="Wird automatisch über die Leadesk Chrome Extension gesendet" style={{ flex:1.4, padding:'10px 0', borderRadius:10, border:'none', background:sent?'#10B981':'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontWeight:700, fontSize:13, cursor:!sent?'pointer':'default', transition:'background 0.3s' }}>
            {sent ? '✅ In Queue!' : saving ? '⏳...' : '🤖 Automatisch senden'}
          </button>
          <button onClick={save} disabled={saving||sent||!msg} title="Nur Status setzen (manuell auf LinkedIn senden)" style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontWeight:600, fontSize:12, cursor:msg&&!sent?'pointer':'default' }}>
            {saving ? '...' : 'Manuell'}
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
          <button onClick={save} disabled={saving} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontWeight:700, cursor:'pointer' }}>
            {saving ? '⏳...' : '💾 Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ── Haupt-Komponente ── */
export default function Vernetzungen({ session }) {
  const { isMobile } = useResponsive()
  const { team, activeTeamId } = useTeam()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [leads, setLeads]               = useState([])
  const [activities, setActivities]     = useState({})
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [sortBy, setSortBy]             = useState('date')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState(null)
  const [anfrageModal, setAnfrageModal] = useState(null)
  const [statusModal, setStatusModal]   = useState(null)
  const [reactivateModal, setReactivateModal] = useState(null)
  const [reactivateMsg, setReactivateMsg]     = useState('')
  const [reactivateDone, setReactivateDone]   = useState(false)

  const load = useCallback(async () => {
    const user = session.user
    const { data } = await supabase
      .from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,avatar_url,profile_url,linkedin_url,email,li_connection_status,li_connection_requested_at,li_connected_at,li_reply_behavior,li_last_interaction_at,li_message_summary,li_about_summary,ai_need_detected,ai_buying_intent,hs_score,deal_stage,deal_value,lifecycle_stage,notes,created_at,is_shared,team_id,user_id')
      .eq(activeTeamId ? 'team_id' : 'user_id', activeTeamId || user.id)
      .order('li_connected_at', { ascending:false, nullsFirst:false })
    const leads = data || []
    setLeads(leads)
    setLoading(false)
    // Lade letzte Aktivität für alle Leads auf einmal (batch)
    if (leads.length > 0) {
      const { data: acts } = await supabase
        .from('activities')
        .select('lead_id, type, occurred_at')
        .in('lead_id', leads.map(l => l.id))
        .order('occurred_at', { ascending: false })
      if (acts) {
        // Nur die jeweils neueste Aktivität pro Lead behalten
        const map = {}
        acts.forEach(a => { if (!map[a.lead_id]) map[a.lead_id] = [a] })
        setActivities(prev => ({ ...prev, ...map }))
      }
    }
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

  const sortedLeads = [...leads].sort((a, b) => {
    if (sortBy === 'score') return (b.hs_score||0) - (a.hs_score||0)
    if (sortBy === 'name') {
      const na = ((a.first_name||'')+' '+(a.last_name||'')).trim() || a.name || ''
      const nb = ((b.first_name||'')+' '+(b.last_name||'')).trim() || b.name || ''
      return na.localeCompare(nb, 'de')
    }
    // date: neueste zuerst
    return new Date(b.li_connected_at||b.created_at||0) - new Date(a.li_connected_at||a.created_at||0)
  })

  const filtered = sortedLeads.filter(l => {
    const statusMatch = filter === 'all'
      ? true
      : filter === 'inaktiv30'
        ? l.li_connection_status === 'verbunden' && l.li_last_interaction_at && (Date.now()-new Date(l.li_last_interaction_at))>30*86400000
        : (l.li_connection_status || 'nicht_verbunden') === filter
    const searchMatch = !search || fullName(l).toLowerCase().includes(search.toLowerCase()) || (l.company||'').toLowerCase().includes(search.toLowerCase())
    return statusMatch && searchMatch
  })

  const stats = {
    verbunden:       leads.filter(l => l.li_connection_status === 'verbunden').length,
    pending:         leads.filter(l => l.li_connection_status === 'pending').length,
    inaktiv30:       leads.filter(l => l.li_connection_status === 'verbunden' && l.li_last_interaction_at && (Date.now()-new Date(l.li_last_interaction_at))>30*86400000).length,
    nicht_verbunden: leads.filter(l => !l.li_connection_status || l.li_connection_status === 'nicht_verbunden').length,
    schnell:         leads.filter(l => l.li_reply_behavior === 'schnell').length,
  }
  const replyRate = stats.verbunden > 0 ? Math.round(stats.schnell / stats.verbunden * 100) : 0
  const responseLeads = leads.filter(l => l.li_connection_status === 'verbunden' && l.li_reply_behavior && l.li_reply_behavior !== 'unbekannt')
  const totalResponseRate = responseLeads.length > 0 ? Math.round(responseLeads.filter(l => l.li_reply_behavior !== 'keine_antwort').length / responseLeads.length * 100) : 0

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#64748B' }}>Lade Vernetzungen…</div>

  return (
    <div style={{ padding:'0 0 32px', maxWidth:1100, margin:'0 auto' }}>
      {anfrageModal && <AnfrageModal lead={anfrageModal} onClose={()=>setAnfrageModal(null)} onSaved={handleAnfrageSaved} session={session}/>}
      {statusModal  && <StatusModal  lead={statusModal}  onClose={()=>setStatusModal(null)}  onSaved={handleStatusSaved}/>}
      {selected     && <LeadDrawer session={session} lead={selected} onClose={()=>setSelected(null)} onUpdate={(u)=>{ setLeads(l=>l.map(x=>x.id===u.id?u:x)); setSelected(u) }} onDelete={(id)=>{ setLeads(l=>l.filter(x=>x.id!==id)); setSelected(null) }}/>}

      {/* Reaktivierungs-Modal */}
      {reactivateModal && (() => {
        const templates = [
          `Hi ${reactivateModal.first_name||''},\n\nich hoffe, es läuft gut bei dir! Ich wollte mich mal wieder melden — wie läuft es aktuell bei ${reactivateModal.company||'euch'}?\n\nBeste Grüße\nMichael`,
          `Hey ${reactivateModal.first_name||''},\n\nlange nichts gehört! Ich bin gerade dabei, meinen Kontakten Updates zu schicken — bei uns hat sich einiges getan. Wäre schön, mal wieder in Kontakt zu kommen.\n\nWann passt dir ein kurzer Call?`,
          `Hi ${reactivateModal.first_name||''},\n\nich dachte gerade an dich — wie läuft es aktuell? Ich habe kürzlich etwas gesehen, das für dich relevant sein könnte.\n\nLass mich wissen, ob du Zeit für einen kurzen Austausch hast!`,
        ]
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
            onClick={e => e.target===e.currentTarget && (setReactivateModal(null), setReactivateDone(false), setReactivateMsg(''))}>
            <div style={{ background:'white', borderRadius:20, padding:28, width:520, maxWidth:'95vw', boxShadow:'0 24px 48px rgba(0,0,0,0.2)' }}>
              {reactivateDone ? (
                <div style={{ textAlign:'center', padding:'20px 0' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'rgb(20,20,43)' }}>Follow-up gesetzt!</div>
                  <div style={{ fontSize:13, color:'#64748B', marginTop:8 }}>In 3 Tagen wirst du an {reactivateModal.first_name||'diesen Kontakt'} erinnert.</div>
                  <button onClick={() => { setReactivateModal(null); setReactivateDone(false); setReactivateMsg('') }}
                    style={{ marginTop:20, padding:'10px 28px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    Fertig
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                    <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg, rgb(49,90,231), rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:16, fontWeight:700 }}>
                      {reactivateModal.first_name?.[0]||'?'}
                    </div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>⚡ {reactivateModal.first_name||''} {reactivateModal.last_name||''} reaktivieren</div>
                      <div style={{ fontSize:12, color:'#94A3B8' }}>{reactivateModal.company||''} · Inaktiv &gt;30 Tage</div>
                    </div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#475569', marginBottom:8 }}>Vorlage wählen:</div>
                  <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                    {['🤝 Freundlich','📞 Call anfragen','💡 Themen-Aufhänger'].map((label, i) => (
                      <button key={i} onClick={() => setReactivateMsg(templates[i])}
                        style={{ padding:'5px 12px', borderRadius:8, border:`1.5px solid ${reactivateMsg===templates[i]?'var(--wl-primary, rgb(49,90,231))':'#E5E7EB'}`, background:reactivateMsg===templates[i]?'rgba(49,90,231,0.08)':'#F8FAFC', fontSize:11, cursor:'pointer', fontWeight:600, color:reactivateMsg===templates[i]?'var(--wl-primary, rgb(49,90,231))':'#475569' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea value={reactivateMsg} onChange={e => setReactivateMsg(e.target.value)}
                    placeholder="Vorlage wählen oder Nachricht selbst schreiben…"
                    style={{ width:'100%', height:130, padding:'10px 12px', borderRadius:10, border:'1.5px solid #E5E7EB', fontSize:12, fontFamily:'inherit', resize:'vertical', outline:'none', boxSizing:'border-box', lineHeight:1.6 }}/>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14 }}>
                    <div style={{ fontSize:11, color:'#94A3B8' }}>Follow-up wird in 3 Tagen automatisch gesetzt</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setReactivateModal(null); setReactivateMsg('') }}
                        style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#F8FAFC', color:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                      <button onClick={async () => {
                        const d = new Date(); d.setDate(d.getDate()+3)
                        await supabase.from('leads').update({ next_followup: d.toISOString().split('T')[0] }).eq('id', reactivateModal.id)
                        setReactivateDone(true)
                      }} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        ✅ Follow-up setzen
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Stats + Toolbar — kompakt 2-zeilig */}
      <div style={{ marginBottom:20 }}>
        {/* KPI-Kacheln */}
        <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          {[
            { label:'Vernetzt',     val:stats.verbunden,       color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
            { label:t('vernetzungen.pending'),   val:stats.pending,         color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
            { label:'Kein Kontakt', val:stats.nicht_verbunden, color:'#475569', bg:'#F8FAFC', border:'#E2E8F0' },
            { label:'Antwortquote', val:totalResponseRate+'%', color:totalResponseRate>=50?'#16a34a':totalResponseRate>=25?'#d97706':'#dc2626', bg:totalResponseRate>=50?'#F0FDF4':totalResponseRate>=25?'#FFFBEB':'#FEF2F2', border:totalResponseRate>=50?'#86EFAC':totalResponseRate>=25?'#FCD34D':'#FECACA' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, border:'1px solid '+s.border, borderRadius:12, padding:'10px 20px', textAlign:'center', flex:'1 1 80px' }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color, lineHeight:1.2 }}>{s.val}</div>
              <div style={{ fontSize:11, color:s.color, fontWeight:600, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* Aktions-Buttons */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <button onClick={async () => {
            const toQueue = filtered.filter(l => l.li_connection_status !== 'verbunden' && l.li_connection_status !== 'pending' && (l.linkedin_url || l.profile_url))
            if (!toQueue.length) { alert('Keine Kontakte zum Hinzufügen'); return }
            if (!window.confirm(`${toQueue.length} Kontakte automatisch vernetzen?`)) return
            const uid = session.user.id
            const jobs = toQueue.map(l => ({ user_id:uid, lead_id:l.id, linkedin_url:(l.linkedin_url||l.profile_url).split('?')[0].replace(/\/$/,''), status:'pending' }))
            const { error } = await supabase.from('connection_queue').insert(jobs)
            if (!error) { await Promise.all(toQueue.map(l => supabase.from('leads').update({ li_connection_status:'pending' }).eq('id', l.id))); alert(`✅ ${jobs.length} Kontakte in Queue gestellt.`) }
            else alert('Fehler: '+error.message)
          }} style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            🤖 Auto-Vernetzen <span style={{ background:'rgba(255,255,255,0.25)', borderRadius:99, padding:'1px 7px', fontSize:11 }}>{filtered.filter(l => l.li_connection_status !== 'verbunden' && l.li_connection_status !== 'pending').length}</span>
          </button>
          <button onClick={async () => {
            if (!window.confirm(`Für ${filtered.length} Kontakte eine LinkedIn-Aktivität loggen?`)) return
            const uid = session.user.id
            const rows = filtered.map(l => ({ lead_id:l.id, user_id:uid, type:'linkedin_message', subject:'LinkedIn-Kontakt', direction:'outbound', occurred_at:new Date().toISOString() }))
            await supabase.from('activities').insert(rows)
            alert(`✅ ${rows.length} Aktivitäten geloggt`)
          }} style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(10,102,194,0.3)', background:'rgba(10,102,194,0.07)', fontSize:12, fontWeight:700, color:'#0A66C2', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            💬 Batch <span style={{ background:'rgba(10,102,194,0.15)', borderRadius:99, padding:'1px 6px', fontSize:11 }}>{filtered.length}</span>
          </button>
          <button onClick={async () => {
            const choice = window.prompt('Follow-up setzen:\n0=Heute  1=Morgen  3=3T  7=7T  14=14T')
            if (choice === null) return
            const days = parseInt(choice)
            if (isNaN(days) || ![0,1,3,7,14].includes(days)) { alert('Ungültige Eingabe'); return }
            const date = new Date(); date.setDate(date.getDate()+days)
            await Promise.all(filtered.map(l => supabase.from('leads').update({ next_followup: date.toISOString() }).eq('id', l.id)))
            alert(`✅ Follow-up für ${filtered.length} Kontakte gesetzt`)
          }} style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(16,163,74,0.3)', background:'rgba(16,163,74,0.07)', fontSize:12, fontWeight:700, color:'#16a34a', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            📅 Follow-up <span style={{ background:'rgba(16,163,74,0.15)', borderRadius:99, padding:'1px 6px', fontSize:11 }}>{filtered.length}</span>
          </button>
          <div style={{ flex:1 }}/>
          <button onClick={() => {
            const rows = [['Name','Jobtitel','Unternehmen','Status','Score','LinkedIn']]
            filtered.forEach(l => rows.push([((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'', l.job_title||l.headline||'', l.company||'', l.li_connection_status||'', l.hs_score||0, l.profile_url||l.linkedin_url||'']))
            const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
            const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv); a.download=`vernetzungen-${new Date().toISOString().substring(0,10)}.csv`; a.click()
          }} style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:12, fontWeight:600, color:'#64748B', cursor:'pointer' }}>
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* Filter + Search */}
      {/* Filter + Search */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:6, marginBottom:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Sort:</span>
          {[['date','📅 Datum'],['last_contact','⚡ Letzter Kontakt'],['score','🎯 Score'],['name','🔤 Name']].map(([v,l]) => (
            <button key={v} onClick={() => setSortBy(v)}
              style={{ padding:'4px 10px', borderRadius:7, border:'1px solid '+(sortBy===v?'#3b82f6':'#E5E7EB'), background:sortBy===v?'#EFF6FF':'#fff', color:sortBy===v?'#1d4ed8':'#64748B', fontSize:11, fontWeight:sortBy===v?700:400, cursor:'pointer' }}>
              {l}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, Firma oder Jobtitel suchen…"
          style={{ flex:1, minWidth:200, padding:'9px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none' }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[
            ['all','Alle',leads.length,'#64748B'],
            ['verbunden','✓ Vernetzt',stats.verbunden,'#16a34a'],
            ['pending','⏳ Ausstehend',stats.pending,'#d97706'],
            ['nicht_verbunden','Kein Kontakt',stats.nicht_verbunden,'#64748B'],
            ['abgelehnt','✕ Abgelehnt',leads.filter(l=>l.li_connection_status==='abgelehnt').length,'#ef4444'],
            ['inaktiv30','😴 Inaktiv >30d',stats.inaktiv30,'#8b5cf6']
          ].map(([key,lbl,cnt,clr]) => (
            <button key={key} onClick={()=>setFilter(key)} style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid', borderColor:filter===key?clr:'#E5E7EB', background:filter===key?clr+'18':'#fff', color:filter===key?clr:'#64748B', fontSize:12, fontWeight:filter===key?700:400, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              {lbl}
              <span style={{ fontSize:11, fontWeight:700, background:filter===key?clr+'30':'#F1F5F9', padding:'1px 6px', borderRadius:99, color:filter===key?clr:'#94A3B8' }}>{cnt}</span>
            </button>
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
            <div key={lead.id} style={{ background:'#fff', border:'1px solid '+(isSelected?'var(--wl-primary, rgb(49,90,231))':'#E8EDF2'), borderRadius:12, overflow:'hidden', transition:'all 0.15s', boxShadow:isSelected?'0 0 0 2px rgba(49,90,231,0.15)':'none' }}>
              <div onClick={() => handleSelect(lead)} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer' }}>
                <Avatar name={fullName(lead)} avatar_url={lead.avatar_url}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>{fullName(lead)}</span>
                    {lead.profile_url && (
                      <a href={lead.profile_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:11, color:'var(--wl-primary, rgb(49,90,231))', textDecoration:'none', fontWeight:600 }}>LinkedIn ↗</a>
                    )}
                    {lead.is_shared && team && (
                      <span style={{ fontSize:10, fontWeight:700, background:'rgba(16,185,129,0.12)', color:'#059669', borderRadius:4, padding:'1px 7px', border:'1px solid rgba(16,185,129,0.25)', flexShrink:0 }}>
                        👥 {team.name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:13, color:'#64748B', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {lead.job_title||lead.headline||'—'}
                    {lead.company && <span style={{ color:'var(--wl-primary, rgb(49,90,231))', fontWeight:600 }}> · {lead.company}</span>}
                  </div>
                  {/* AI Buying Intent + Reply Behavior */}
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    {lead.ai_buying_intent && lead.ai_buying_intent !== 'unbekannt' && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, fontWeight:700, background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC', color:lead.ai_buying_intent==='hoch'?'#ef4444':lead.ai_buying_intent==='mittel'?'#f59e0b':'#64748b' }}>
                        {lead.ai_buying_intent==='hoch'?'🔥':lead.ai_buying_intent==='mittel'?'⚡':'○'} Intent: {lead.ai_buying_intent}
                      </span>
                    )}
                    {lead.li_reply_behavior && lead.li_reply_behavior !== 'unbekannt' && (
                      <span onClick={async e => {
                        e.stopPropagation()
                        const order = ['unbekannt','schnell','langsam','keine_antwort']
                        const cur = lead.li_reply_behavior || 'unbekannt'
                        const next = order[(order.indexOf(cur)+1) % order.length]
                        await supabase.from('leads').update({ li_reply_behavior: next }).eq('id', lead.id)
                        setLeads(l => l.map(x => x.id===lead.id ? {...x, li_reply_behavior:next} : x))
                      }} title="Klicken zum Ändern"
                        style={{ fontSize:10, padding:'1px 7px', borderRadius:99, fontWeight:600, background:reply.bg, color:'#475569', cursor:'pointer', userSelect:'none' }}>{reply.label} ↺</span>
                    )}
                    {lead.hs_score > 0 && <span style={{ fontSize:10, fontWeight:700, color:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6', background:lead.hs_score>=70?'#FEF2F2':lead.hs_score>=40?'#FFFBEB':'#EFF6FF', padding:'1px 6px', borderRadius:6 }}>⚡ {lead.hs_score}</span>}
                    {lead.li_last_interaction_at && (() => {
                      const d = new Date(lead.li_last_interaction_at)
                      const days = Math.floor((Date.now()-d)/86400000)
                      const txt = days===0?'Heute':days===1?'Gestern':days<7?`${days}d`:d.toLocaleDateString('de-DE',{day:'2-digit',month:'short'})
                      return <span style={{ fontSize:10, color:'#0A66C2', background:'#EFF6FF', padding:'1px 7px', borderRadius:99, border:'1px solid #BFDBFE', fontWeight:600 }}>⚡ {txt}</span>
                    })()}
                    {activities[lead.id]?.length > 0 && (
                      <span style={{ fontSize:10, color:'#94A3B8', background:'#F8FAFC', padding:'1px 7px', borderRadius:99, border:'1px solid #E5E7EB' }}>
                        ⚡ {activities[lead.id][0].type} · {new Date(activities[lead.id][0].occurred_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short'})}
                      </span>
                    )}
                  </div>
                </div>
                {/* Right side — kompakt */}
                <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, padding:'4px 10px', borderRadius:8, background:conn.bg, color:conn.color, border:'1px solid '+conn.border, fontWeight:700, whiteSpace:'nowrap' }}>{conn.label}</span>
                  <span style={{ fontSize:11, color:'#94A3B8', whiteSpace:'nowrap' }}>
                    {lead.li_connected_at ? new Date(lead.li_connected_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}) : lead.li_connection_requested_at ? new Date(lead.li_connection_requested_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}) : new Date(lead.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}
                  </span>
                  {!alreadySent && (
                    <button onClick={e => { e.stopPropagation(); setAnfrageModal(lead) }}
                      style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', whiteSpace:'nowrap' }}>
                      ✨ Anfrage
                    </button>
                  )}
                  {lead.li_connection_status === 'verbunden' && (
                    <button onClick={e => { e.stopPropagation(); navigate(`/messages?lead=${lead.id}`) }}
                      style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #DDD6FE', background:'#F5F3FF', color:'#7C3AED', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                      💬
                    </button>
                  )}
                  {filter === 'inaktiv30' && lead.li_connection_status === 'verbunden' && (
                    <button onClick={async e => { e.stopPropagation(); setReactivateMsg(''); setReactivateDone(false); setReactivateModal(lead) }}
                      style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #A7F3D0', background:'#ECFDF5', color:'#065F46', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      ⚡
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); setStatusModal(lead) }}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    ↺
                  </button>
                  <button onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid rgba(49,90,231,0.2)', background:'rgba(49,90,231,0.06)', color:'var(--wl-primary, rgb(49,90,231))', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    ↗
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
