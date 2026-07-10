import React, { useEffect, useState, useCallback } from 'react'
import {
  Check, Loader2, MessageSquare, Sparkles, Bot, Save, Download,
  RefreshCw, Zap, Target, AlignLeft, Calendar, Flame, Users, TrendingUp, Clock
} from 'lucide-react'
import { useTeam } from '../context/TeamContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useModel } from '../context/ModelContext'
import LeadDrawer from '../components/LeadDrawer'
import InboxLink from '../components/InboxLink'
import PageHeader from '../components/PageHeader'
import TabBar from '../components/TabBar'
import { scrapeLinkedInConnections, normalizeLinkedInUrl } from '../lib/leadeskExtension'
import { useInboxLists } from '../hooks/useInboxLists'

const P = 'var(--wl-primary, #0A6FB0)'
const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'
const initials = n => (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2)

const CONN_CFG = {
  verbunden:       { label:'Vernetzt',     color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  nicht_verbunden: { label:'Offen',        color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
  pending:         { label:'Ausstehend',   color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
  abgelehnt:       { label:'Abgelehnt',    color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
}

const REPLY_CFG = {
  schnell:       { label:'Schnell', color:'#065F46', bg:'#ECFDF5' },
  langsam:       { label:'Langsam', color:'#92400E', bg:'#FFFBEB' },
  keine_antwort: { label:'Keine Antwort', color:'#991B1B', bg:'#FEF2F2' },
  unbekannt:     { label:'— Unbekannt', color:'#475569', bg:'#F8FAFC' },
}

/* ── Reports-Stil Diagramm-Komponenten (gespiegelt aus Reports.jsx) ── */
const RC = { surface:'var(--surface, #fff)', border:'#E4E7EC', text1:'var(--text-strong, #111827)', text2:'#374151', text3:'#6B7280' }
const fmt = new Intl.NumberFormat('de-DE')

function KpiCard({ label, value, sub, color, Icon }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:14, padding:'14px 16px', display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
        {Icon && <Icon size={14} color={color}/>}
      </div>
      <div style={{ fontSize:22, fontWeight:800, color:RC.text1, fontVariantNumeric:'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:RC.text3 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:14, padding:18, marginBottom:16 }}>
      {title && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:RC.text1, margin:0 }}>{title}</h3>{action}
        </div>
      )}
      {children}
    </div>
  )
}

function BarRow({ label, count, total, color=P }) {
  const pct = total > 0 ? Math.round((count/total)*100) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <span style={{ fontSize:13, color:RC.text2, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:12, color:RC.text3, fontVariantNumeric:'tabular-nums' }}><strong style={{ color:RC.text1 }}>{fmt.format(count)}</strong>{total>0 && <> · {pct}%</>}</span>
      </div>
      <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, transition:'width 0.3s' }}/>
      </div>
    </div>
  )
}

function Donut({ percent=0, size=90, color=P, label }) {
  const r = size/2 - 6, circ = 2*Math.PI*r, dash = circ*Math.min(1, Math.max(0, percent/100))
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={8}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8} strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <div style={{ fontSize:18, fontWeight:800, color:RC.text1, fontVariantNumeric:'tabular-nums' }}>{Math.round(percent)}%</div>
        {label && <div style={{ fontSize:10, color:RC.text3, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>}
      </div>
    </div>
  )
}

function Avatar({ name, avatar_url, size=44 }) {
  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#0891b2']
  const bg = colors[(name||'').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.36, flexShrink:0 }}>{initials(name)}</div>
}

/* ── KI-Anfrage Modal — Doppelpfad: Auto-vernetzen (Extension) ODER nur Nachricht ── */
function AnfrageModal({ lead, onClose, onSaved, session }) {
  const { activeBrandVoice } = useBrandVoice()
  const { activeTeamId } = useTeam()
  const [msg, setMsg]     = useState('')
  const [gen, setGen]     = useState(false)
  const { model: selectedModel } = useModel()
  const [saving, setSave] = useState(false)
  const [sent, setSent]   = useState(false)

  async function generate() {
    setGen(true)
    try {
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
        body: { type:'connection_request', name:fullName(lead), position:lead.job_title||lead.headline||'', company:lead.company||'', systemPrompt, brand_voice_id: activeBrandVoice?.id || null, content_kind: 'connection_msg' }
      })
      if (data?.text || data?.result) {
        try {
          const { recordGeneration } = await import('../lib/contentMemory')
          await recordGeneration({
            userId: session.user.id, teamId: activeTeamId,
            kind: 'connection_msg', model: 'auto',
            promptInput: { lead_name: fullName(lead), position: lead.job_title||lead.headline||'', company: lead.company||'' },
            brandVoiceId: activeBrandVoice?.id || null,
            variants: [data.text || data.result],
          })
        } catch (_) {}
      }
      const text = (typeof data==='string'?data:null)||data?.text||data?.content||(Array.isArray(data?.content)?data.content[0]?.text:null)
      setMsg(text ? text.trim() : 'KI-Generierung nicht verfügbar.')
    } catch(e) { setMsg('Fehler: '+e.message) }
    setGen(false)
  }

  // Pfad B: nur Nachricht — Status auf "ausstehend" setzen, manuell auf LinkedIn senden.
  async function saveManual() {
    setSave(true)
    await supabase.from('linkedin_inbox').update({
      li_connection_status: 'pending',
      li_connection_requested_at: new Date().toISOString(),
    }).eq('id', lead.id)
    onSaved(lead.id, 'pending')
    setSave(false); setSent(true)
    setTimeout(onClose, 1200)
  }

  // Pfad A: Auto-vernetzen — Job für die Extension in connection_queue schreiben.
  async function queueConnect() {
    if (!lead.linkedin_url && !lead.profile_url) { alert('Kein LinkedIn-Profil hinterlegt'); return }
    setSave(true)
    const liUrl = (lead.linkedin_url || lead.profile_url).split('?')[0].replace(/\/$/, '')
    const { error } = await supabase.from('connection_queue').insert({
      brand_voice_id: activeBrandVoice?.id || null,
      user_id: session.user.id,
      inbox_id: lead.id,
      linkedin_url: liUrl,
      message: msg || null,
      status: 'pending',
    })
    if (!error) {
      await supabase.from('linkedin_inbox').update({
        li_connection_status: 'pending',
        li_connection_requested_at: new Date().toISOString(),
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
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:20, padding:28, width:520, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight:800, fontSize:17, color:'var(--text-strong)', marginBottom:4 }}>Vernetzungsanfrage</div>
        <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>{fullName(lead)} · {lead.company||''}</div>
        <textarea value={msg} onChange={e=>setMsg(e.target.value.substring(0,300))} maxLength={300} rows={5}
          placeholder="Persönliche Nachricht (max. 300 Zeichen)…"
          style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, resize:'vertical', outline:'none' }}/>
        <div style={{ textAlign:'right', fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{msg.length}/300</div>
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <button className="lk-btn lk-btn-ghost" onClick={generate} disabled={gen} style={{ flex:1 }}>
            {gen ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className='lk-spin'/>Generiere…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>KI-Nachricht</span>}
          </button>
          <button className="lk-btn lk-btn-primary" onClick={queueConnect} disabled={saving||sent} title="Wird automatisch über die Leadesk Chrome Extension gesendet" style={{ flex:1.4 }}>
            {sent ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Check size={14}/>In Queue!</span> : saving ? <Loader2 size={14} className='lk-spin'/> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Bot size={14}/>Auto-vernetzen</span>}
          </button>
          <button className="lk-btn lk-btn-ghost" onClick={saveManual} disabled={saving||sent||!msg} title="Nur Nachricht merken & Status setzen (manuell auf LinkedIn senden)" style={{ flex:1 }}>
            {saving ? '…' : 'Nur Nachricht'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Status Modal — manueller Fallback (Scrape-Abgleich ist der Normalfall) ── */
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
    await supabase.from('linkedin_inbox').update(updates).eq('id', lead.id)
    onSaved(lead.id, status, reply)
    setSaving(false)
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:20, padding:28, width:440, boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight:800, fontSize:17, color:'var(--text-strong)', marginBottom:4 }}>Status manuell setzen</div>
        <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>{fullName(lead)} · Fallback, falls der Abgleich etwas nicht erkennt</div>

        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Verbindungsstatus</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
          {Object.entries(CONN_CFG).map(([key,cfg]) => (
            <button key={key} onClick={()=>setStatus(key)} style={{ padding:'10px 14px', borderRadius:10, border:`2px solid ${status===key?cfg.border:'#E5E7EB'}`, background:status===key?cfg.bg:'#fff', color:cfg.color, fontWeight:status===key?700:400, fontSize:13, cursor:'pointer', textAlign:'left' }}>
              {cfg.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Antwortverhalten</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
          {Object.entries(REPLY_CFG).map(([key,cfg]) => (
            <button key={key} onClick={()=>setReply(key)} style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${reply===key?'#6366f1':'#E5E7EB'}`, background:reply===key?'#EAF6FC':'#fff', color:reply===key?'#0A6FB0':cfg.color, fontSize:12, fontWeight:reply===key?700:400, cursor:'pointer' }}>
              {cfg.label}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="lk-btn lk-btn-ghost" onClick={onClose} style={{ flex:1 }}>Abbrechen</button>
          <button className="lk-btn lk-btn-primary" onClick={save} disabled={saving} style={{ flex:1 }}>
            {saving ? <Loader2 size={14} className='lk-spin'/> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Save size={14}/>Speichern</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Haupt-Komponente ── */
export default function Vernetzungen({ session }) {
  const { activeBrandVoice } = useBrandVoice()
  const { team, activeTeamId } = useTeam()
  const navigate = useNavigate()
  const [leads, setLeads]               = useState([])
  const [activities, setActivities]     = useState({})
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState('offen')
  const [sortBy, setSortBy]             = useState('date')
  const [search, setSearch]             = useState('')
  const [listFilter, setListFilter]     = useState('all')   // 'all' | inbox_list_id
  const { lists: inboxLists, membersByList } = useInboxLists({ activeTeamId })
  const [selected, setSelected]         = useState(null)
  const [anfrageModal, setAnfrageModal] = useState(null)
  const [statusModal, setStatusModal]   = useState(null)
  const [syncing, setSyncing]           = useState(false)
  const [syncMsg, setSyncMsg]           = useState(null)

  const load = useCallback(async () => {
    // STRICT team_id-Filter (Fallstrick #14 — kein user_id-Fallback)
    if (!activeTeamId) { setLeads([]); setLoading(false); return }
    const { data } = await supabase
      .from('linkedin_inbox')
      .select('id,first_name,last_name,name,job_title,headline,company,avatar_url,linkedin_url,li_connection_status,li_connection_requested_at,li_connected_at,li_accepted_at,li_last_interaction_at,li_reply_behavior,team_id,user_id,imported_at')
      .eq('team_id', activeTeamId)
      .eq('review_status', 'new')
      .order('li_connected_at', { ascending:false, nullsFirst:false })
    const rows = (data || []).map(r => ({ ...r, created_at: r.imported_at }))
    setLeads(rows)
    setLoading(false)
    if (rows.length > 0) {
      const { data: acts } = await supabase
        .from('activities')
        .select('lead_id, type, occurred_at')
        .in('lead_id', rows.map(l => l.id))
        .order('occurred_at', { ascending: false })
      if (acts) {
        const map = {}
        acts.forEach(a => { if (!map[a.lead_id]) map[a.lead_id] = [a] })
        setActivities(prev => ({ ...prev, ...map }))
      }
    }
  }, [activeTeamId])

  useEffect(() => { load() }, [load])

  function handleSelect(lead) {
    if (selected?.id === lead.id) { setSelected(null); return }
    setSelected(lead)
  }
  function handleAnfrageSaved(id, newStatus) {
    setLeads(l => l.map(x => x.id===id ? {...x, li_connection_status:newStatus, li_connection_requested_at:new Date().toISOString()} : x))
  }
  function handleStatusSaved(id, newStatus, replyBehavior) {
    setLeads(l => l.map(x => x.id===id ? {...x, li_connection_status:newStatus, li_reply_behavior:replyBehavior} : x))
    if (selected?.id === id) setSelected(prev => ({...prev, li_connection_status:newStatus, li_reply_behavior:replyBehavior}))
  }

  // ── Verbindungen abgleichen: Connections-Seite scrapen → ausstehende auf "vernetzt" ──
  async function abgleichen() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await scrapeLinkedInConnections()
      if (res.error) { setSyncMsg({ type:'err', text: res.error }); setSyncing(false); return }
      const conns = res.connections || []
      const slugSet = new Set(conns.map(c => normalizeLinkedInUrl(c.profile_url)).filter(Boolean))
      const nameSet = new Set(conns.map(c => (c.name||'').trim().toLowerCase()).filter(Boolean))
      // Kandidaten: alle, die noch NICHT als vernetzt markiert sind — nicht nur 'pending',
      // da man auch ohne App-Anfrage bereits vernetzt sein kann.
      const candidates = leads.filter(l => l.li_connection_status !== 'verbunden')
      const now = new Date().toISOString()
      const matched = candidates.filter(l => {
        const slug = normalizeLinkedInUrl(l.linkedin_url || l.profile_url)
        return (slug && slugSet.has(slug)) || nameSet.has(fullName(l).trim().toLowerCase())
      })
      // Matched → verbunden (per Zeile via .eq, kein .in()-Bundle — Fallstrick #1)
      await Promise.all(matched.map(l => supabase.from('linkedin_inbox').update({
        li_connection_status: 'verbunden', li_accepted_at: now, li_connected_at: now, li_connection_checked_at: now,
      }).eq('id', l.id)))
      // checked_at auf alle geprüften Kandidaten (auch ohne Treffer) — reines Timestamp-Feld
      if (candidates.length) {
        await supabase.from('linkedin_inbox').update({ li_connection_checked_at: now }).in('id', candidates.map(l => l.id))
      }
      const matchedIds = new Set(matched.map(l => l.id))
      setLeads(ls => ls.map(l => matchedIds.has(l.id) ? {...l, li_connection_status:'verbunden', li_accepted_at:now, li_connected_at:now} : l))
      setSyncMsg({ type:'ok', text: `${matched.length} neue Annahme${matched.length===1?'':'n'} erkannt · ${conns.length} Verbindungen gescannt.` })
    } catch (e) {
      setSyncMsg({ type:'err', text: e.message || 'Abgleich fehlgeschlagen' })
    }
    setSyncing(false)
  }

  const sortedLeads = [...leads].sort((a, b) => {
    if (sortBy === 'score') return (b.hs_score||0) - (a.hs_score||0)
    if (sortBy === 'name') return fullName(a).localeCompare(fullName(b), 'de')
    return new Date(b.li_connected_at||b.created_at||0) - new Date(a.li_connected_at||a.created_at||0)
  })

  const statusOf = l => l.li_connection_status || 'nicht_verbunden'
  const tabMatch = (l) => {
    const s = statusOf(l)
    if (tab === 'alle') return true
    if (tab === 'offen') return s === 'nicht_verbunden'
    if (tab === 'ausstehend') return s === 'pending'
    if (tab === 'vernetzt') return s === 'verbunden'
    if (tab === 'abgelehnt') return s === 'abgelehnt'
    return true
  }
  const filtered = sortedLeads.filter(l => {
    const searchMatch = !search || fullName(l).toLowerCase().includes(search.toLowerCase()) || (l.company||'').toLowerCase().includes(search.toLowerCase())
    let listMatch = true
    if (listFilter !== 'all') {
      const set = membersByList.get(listFilter)
      listMatch = !!set && set.has(l.id)
    }
    return tabMatch(l) && searchMatch && listMatch
  })

  const stats = {
    offen:      leads.filter(l => statusOf(l) === 'nicht_verbunden').length,
    pending:    leads.filter(l => statusOf(l) === 'pending').length,
    verbunden:  leads.filter(l => statusOf(l) === 'verbunden').length,
    abgelehnt:  leads.filter(l => statusOf(l) === 'abgelehnt').length,
  }
  const responseLeads = leads.filter(l => l.li_connection_status === 'verbunden' && l.li_reply_behavior && l.li_reply_behavior !== 'unbekannt')
  const totalResponseRate = responseLeads.length > 0 ? Math.round(responseLeads.filter(l => l.li_reply_behavior !== 'keine_antwort').length / responseLeads.length * 100) : 0

  // Diagramm-Daten (Reports-Stil)
  const CONN_LABELS = [
    { key:'verbunden',       label:'Vernetzt',   color:'#059669' },
    { key:'pending',         label:'Ausstehend', color:'#D97706' },
    { key:'nicht_verbunden', label:'Offen',      color:'#6B7280' },
    { key:'abgelehnt',       label:'Abgelehnt',  color:'#DC2626' },
  ]
  const connStats = CONN_LABELS.map(c => ({ ...c, count: leads.filter(l => (l.li_connection_status || 'nicht_verbunden') === c.key).length }))
  const totalForConn = leads.length || 1
  const connRate = leads.length > 0 ? Math.round(stats.verbunden / leads.length * 100) : 0
  const replyStats = leads.reduce((acc, l) => { const r = l.li_reply_behavior; if (r && r !== 'unbekannt') acc[r] = (acc[r] || 0) + 1; return acc }, {})

  const TABS = [
    { v:'offen',      label:`Offen (${stats.offen})`,           color:'blue' },
    { v:'ausstehend', label:`Ausstehend (${stats.pending})`,    color:'amber' },
    { v:'vernetzt',   label:`Vernetzt (${stats.verbunden})`,    color:'green' },
    { v:'abgelehnt',  label:`Abgelehnt (${stats.abgelehnt})`,   color:'coral' },
    { v:'alle',       label:`Alle (${leads.length})`,           color:'brand' },
  ]

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--text-muted)' }}>Lade Vernetzungen…</div>

  const headerAction = (
    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
      <InboxLink />
      <button className="lk-btn lk-btn-primary" onClick={abgleichen} disabled={syncing}
        title="Scannt deine LinkedIn-Connections-Seite und erkennt angenommene Anfragen automatisch"
        style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
        {syncing ? <Loader2 size={15} className='lk-spin'/> : <RefreshCw size={15}/>}
        {syncing ? 'Gleiche ab…' : 'Verbindungen abgleichen'}
      </button>
    </div>
  )

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {anfrageModal && <AnfrageModal lead={anfrageModal} onClose={()=>setAnfrageModal(null)} onSaved={handleAnfrageSaved} session={session}/>}
      {statusModal  && <StatusModal  lead={statusModal}  onClose={()=>setStatusModal(null)}  onSaved={handleStatusSaved}/>}
      {selected     && <LeadDrawer session={session} lead={selected} onClose={()=>setSelected(null)} onUpdate={(u)=>{ setLeads(l=>l.map(x=>x.id===u.id?u:x)); setSelected(u) }} onDelete={(id)=>{ setLeads(l=>l.filter(x=>x.id!==id)); setSelected(null) }}/>}

      <PageHeader
        overline="LinkedIn · Outreach"
        title="Vernetzungen"
        subtitle="LinkedIn Kontakte vernetzen — automatisch über die Extension oder mit eigener Nachricht. Angenommene Anfragen erkennt der Abgleich von selbst."
        action={headerAction}
      />

      {syncMsg && (
        <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600,
          background: syncMsg.type==='ok' ? '#ECFDF5' : '#FEF2F2',
          border: '1px solid ' + (syncMsg.type==='ok' ? '#A7F3D0' : '#FECACA'),
          color: syncMsg.type==='ok' ? '#065F46' : '#991B1B' }}>
          {syncMsg.text}
        </div>
      )}

      {/* KPI-Karten (Reports-Stil) */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:16 }}>
        <KpiCard label="Vernetzt"     value={stats.verbunden}        color="#059669" Icon={Check}/>
        <KpiCard label="Ausstehend"   value={stats.pending}          color="#D97706" Icon={Clock}/>
        <KpiCard label="Offen"        value={stats.offen}            color="#6B7280" Icon={Users}/>
        <KpiCard label="Antwortquote" value={totalResponseRate+'%'}  color={totalResponseRate>=50?'#059669':totalResponseRate>=25?'#D97706':'#DC2626'} Icon={TrendingUp}/>
      </div>

      {/* Diagramme (Reports-Stil) */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
        <Panel title="Verbindungsstatus">
          {connStats.map(s => <BarRow key={s.key} label={s.label} count={s.count} total={totalForConn} color={s.color}/>)}
        </Panel>
        <Panel title="Connection-Rate">
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <Donut percent={connRate} color="#0C447C" label="Verbunden"/>
            <div style={{ fontSize:12, color:RC.text3, textAlign:'center' }}>{stats.verbunden} von {leads.length} Kontakten</div>
          </div>
        </Panel>
      </div>
      {Object.keys(replyStats).length > 0 && (
        <Panel title="Antwortverhalten">
          {Object.entries(replyStats).map(([k, v]) => <BarRow key={k} label={REPLY_CFG[k]?.label || k} count={v} total={stats.verbunden || leads.length} color="#185FA5"/>)}
        </Panel>
      )}

      {/* Tabs */}
      <TabBar tabs={TABS} active={tab} onChange={setTab} style={{ marginBottom:14 }}/>

      {/* Toolbar: Bulk-Vernetzen + Sort + Suche + CSV */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <button className="lk-btn lk-btn-primary" onClick={async () => {
          const toQueue = filtered.filter(l => !['verbunden','pending'].includes(l.li_connection_status) && (l.linkedin_url || l.profile_url))
          if (!toQueue.length) { alert('Keine offenen Kontakte zum Vernetzen'); return }
          if (!window.confirm(`${toQueue.length} Kontakte automatisch vernetzen?`)) return
          const uid = session.user.id
          const jobs = toQueue.map(l => ({ user_id:uid, brand_voice_id: activeBrandVoice?.id || null, inbox_id:l.id, linkedin_url:(l.linkedin_url||l.profile_url).split('?')[0].replace(/\/$/,''), status:'pending' }))
          const { error } = await supabase.from('connection_queue').insert(jobs)
          if (!error) {
            const now = new Date().toISOString()
            await Promise.all(toQueue.map(l => supabase.from('linkedin_inbox').update({ li_connection_status:'pending', li_connection_requested_at:now }).eq('id', l.id)))
            setLeads(ls => ls.map(l => toQueue.find(t=>t.id===l.id) ? {...l, li_connection_status:'pending', li_connection_requested_at:now} : l))
            alert(`${jobs.length} Kontakte in die Vernetzungs-Queue gestellt.`)
          } else alert('Fehler: '+error.message)
        }} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <Bot size={14}/>Auto-vernetzen
          <span style={{ background:'rgba(255,255,255,0.25)', borderRadius:99, padding:'1px 7px', fontSize:11 }}>{filtered.filter(l => !['verbunden','pending'].includes(l.li_connection_status)).length}</span>
        </button>

        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Sort:</span>
          {[['date','Datum',<Calendar size={11} strokeWidth={1.75}/>],['score','Score',<Target size={11} strokeWidth={1.75}/>],['name','Name',<AlignLeft size={11} strokeWidth={1.75}/>]].map(([v,l,ic]) => (
            <button key={v} onClick={() => setSortBy(v)}
              style={{ padding:'4px 10px', borderRadius:7, border:'1px solid '+(sortBy===v?'#3b82f6':'#E5E7EB'), background:sortBy===v?'#EFF6FF':'#fff', color:sortBy===v?'#1d4ed8':'#64748B', fontSize:11, fontWeight:sortBy===v?700:400, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5 }}>
              {ic}{l}
            </button>
          ))}
        </div>

        {inboxLists.length > 0 && (
          <select value={listFilter} onChange={e=>setListFilter(e.target.value)} title="Nach Inbox-Liste filtern"
            style={{ padding:'9px 12px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', background:'var(--surface)', color:'var(--text-primary)', cursor:'pointer' }}>
            <option value="all">Alle Listen</option>
            {inboxLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, Firma oder Jobtitel suchen…"
          style={{ flex:1, minWidth:180, padding:'9px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none' }}/>

        <button className="lk-btn lk-btn-ghost" onClick={() => {
          const rows = [['Name','Jobtitel','Unternehmen','Status','LinkedIn']]
          filtered.forEach(l => rows.push([fullName(l), l.job_title||l.headline||'', l.company||'', l.li_connection_status||'', l.linkedin_url||l.profile_url||'']))
          const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
          const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,﻿'+encodeURIComponent(csv); a.download=`vernetzungen-${new Date().toISOString().substring(0,10)}.csv`; a.click()
        }} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <Download size={13} strokeWidth={1.75}/>CSV
        </button>
      </div>

      {/* Kontakt-Liste */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.length === 0 && <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)', fontSize:14 }}>Keine Kontakte in diesem Tab.</div>}
        {filtered.map(lead => {
          const conn = CONN_CFG[lead.li_connection_status || 'nicht_verbunden']
          const reply = REPLY_CFG[lead.li_reply_behavior || 'unbekannt']
          const alreadySent = ['pending','verbunden'].includes(lead.li_connection_status)
          const isSelected = selected?.id === lead.id
          return (
            <div key={lead.id} style={{ background:'var(--surface)', border:'1px solid '+(isSelected?P:'#E8EDF2'), borderRadius:12, overflow:'hidden', transition:'all 0.15s', boxShadow:isSelected?'0 0 0 2px rgba(10,111,176,0.15)':'none' }}>
              <div onClick={() => handleSelect(lead)} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer' }}>
                <Avatar name={fullName(lead)} avatar_url={lead.avatar_url}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:15, color:'var(--text-strong)' }}>{fullName(lead)}</span>
                    {(lead.linkedin_url||lead.profile_url) && (
                      <a href={lead.linkedin_url||lead.profile_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:11, color:P, textDecoration:'none', fontWeight:600 }}>LinkedIn ↗</a>
                    )}
                    {lead.is_shared && team && (
                      <span style={{ fontSize:10, fontWeight:700, background:'rgba(16,185,129,0.12)', color:'#059669', borderRadius:4, padding:'1px 7px', border:'1px solid rgba(16,185,129,0.25)', flexShrink:0 }}>👥 {team.name}</span>
                    )}
                  </div>
                  <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {lead.job_title||lead.headline||'—'}
                    {lead.company && <span style={{ color:P, fontWeight:600 }}> · {lead.company}</span>}
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    {lead.ai_buying_intent && lead.ai_buying_intent !== 'unbekannt' && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, fontWeight:700, background:lead.ai_buying_intent==='hoch'?'#FEF2F2':lead.ai_buying_intent==='mittel'?'#FFFBEB':'#F8FAFC', color:lead.ai_buying_intent==='hoch'?'#ef4444':lead.ai_buying_intent==='mittel'?'#f59e0b':'#64748b' }}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{lead.ai_buying_intent==='hoch'?<Flame size={11} strokeWidth={1.75}/>:lead.ai_buying_intent==='mittel'?<Zap size={11} strokeWidth={1.75}/>:'○'} Intent: {lead.ai_buying_intent}</span>
                      </span>
                    )}
                    {lead.li_reply_behavior && lead.li_reply_behavior !== 'unbekannt' && (
                      <span onClick={async e => {
                        e.stopPropagation()
                        const order = ['unbekannt','schnell','langsam','keine_antwort']
                        const cur = lead.li_reply_behavior || 'unbekannt'
                        const next = order[(order.indexOf(cur)+1) % order.length]
                        await supabase.from('linkedin_inbox').update({ li_reply_behavior: next }).eq('id', lead.id)
                        setLeads(l => l.map(x => x.id===lead.id ? {...x, li_reply_behavior:next} : x))
                      }} title="Klicken zum Ändern"
                        style={{ fontSize:10, padding:'1px 7px', borderRadius:99, fontWeight:600, background:reply.bg, color:'#475569', cursor:'pointer', userSelect:'none' }}>{reply.label} ↺</span>
                    )}
                    {lead.hs_score > 0 && <span style={{ fontSize:10, fontWeight:700, color:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6', background:lead.hs_score>=70?'#FEF2F2':lead.hs_score>=40?'#FFFBEB':'#EFF6FF', padding:'1px 6px', borderRadius:6, display:'inline-flex', alignItems:'center', gap:3 }}><Zap size={9} strokeWidth={2}/>{lead.hs_score}</span>}
                    {activities[lead.id]?.length > 0 && (
                      <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'1px 7px', borderRadius:99, border:'1px solid var(--border)' }}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Zap size={10} strokeWidth={1.75}/>{activities[lead.id][0].type} · {new Date(activities[lead.id][0].occurred_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short'})}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, padding:'4px 10px', borderRadius:8, background:conn.bg, color:conn.color, border:'1px solid '+conn.border, fontWeight:700, whiteSpace:'nowrap' }}>{conn.label}</span>
                  {!alreadySent && (
                    <button className="lk-btn lk-btn-primary" onClick={e => { e.stopPropagation(); setAnfrageModal(lead) }}
                      style={{ whiteSpace:'nowrap' }}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Sparkles size={10} strokeWidth={1.75}/>Anfrage</span>
                    </button>
                  )}
                  {lead.li_connection_status === 'verbunden' && (
                    <button onClick={e => { e.stopPropagation(); navigate(`/messages?lead=${lead.id}`) }} title="Nachricht schreiben"
                      style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #DDD6FE', background:'#F5F3FF', color:'#003060', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                      <MessageSquare size={11} strokeWidth={1.75}/>
                    </button>
                  )}
                  <button className="lk-btn lk-btn-ghost" onClick={e => { e.stopPropagation(); setStatusModal(lead) }} title="Status manuell setzen"
                    >
                    ↺
                  </button>
                  <button onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }} title="Kontakt öffnen"
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid rgba(10,111,176,0.2)', background:'rgba(10,111,176,0.06)', color:P, fontSize:12, fontWeight:600, cursor:'pointer' }}>
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
