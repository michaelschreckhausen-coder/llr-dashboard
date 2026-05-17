// src/pages/Automatisierung.jsx
//
// LinkedIn-Automatisierung — Layout-Refresh angelehnt an Leads.jsx und
// Waalaxy-Kampagnen (Status-Tabs / Template-Picker / Daily-Quota / Sequenz mit
// Wait-Steps).
//
// Backend bleibt unverändert: automation_campaigns / automation_campaign_leads /
// automation_jobs / automation_logs. Schema-Drift (Code schreibt `type`/`lead_id`,
// Repo-Migration hat `action`/`target_url`) ist in einer separaten Session zu
// klären — diese Page behält die existierenden Schreibpfade bei.

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Plus, Play, Pause, RotateCw, Send, Users, BarChart3,
  Clock, X, Trash2, Eye, UserPlus, MessageSquare, Hourglass, Download,
  CheckCircle2, AlertCircle, Search, Filter, Mail, Sparkles, ListChecks,
  Globe,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Tokens (Leads.jsx-Alignment) ─────────────────────────────────────────
const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle    = { background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }
const pageStyle         = { width:'100%', margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle    = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle        = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)' }
const subtitleStyle     = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const searchInputStyle  = { width:220, padding:'7px 12px 7px 32px', fontSize:13, border:'1.5px solid #E4E7EC', borderRadius:10, background:'var(--surface)', outline:'none', boxSizing:'border-box' }
const searchIconStyle   = { position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' }
const iconBtnStyle      = { width:34, height:34, border:'1.5px solid #E4E7EC', background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280', cursor:'pointer' }
const primaryBtnStyle   = { padding:'9px 18px', background: PRIMARY_VAR, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const ghostBtnStyle     = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const kpiRowStyle       = { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 }
const kpiCardStyle      = { background:'var(--surface)', border:'1px solid var(--border, #E4E7EC)', borderRadius:12, padding:'14px 16px' }
const toggleGroupStyle  = { display:'inline-flex', background:'#F3F4F6', borderRadius:10, padding:3, gap:2 }
const toggleBtnStyle    = { height:32, padding:'0 14px', fontSize:13, background:'transparent', border:'none', color:'#6B7280', display:'inline-flex', alignItems:'center', gap:6, borderRadius:8, cursor:'pointer', fontWeight:600 }
const toggleBtnActive   = { ...toggleBtnStyle, background:'var(--surface)', color:'#111827', boxShadow:'0 1px 2px rgba(0,0,0,0.05)' }
const cardStyle         = { background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', padding:'14px 18px' }
const inputStyle        = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E4E7EC', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit', background:'var(--surface)' }
const labelStyle        = { display:'block', fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
const sectionTitleStyle = { fontSize:12, fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:10, display:'flex', alignItems:'center', gap:6 }

// ─── Step-Typen ──────────────────────────────────────────────────────────
const STEP_TYPES = {
  visit_profile:  { label:'Profil besuchen',   Icon: Eye,           color:'#2563eb', bg:'#EFF6FF', desc:'Besucht das LinkedIn-Profil' },
  send_connect:   { label:'Vernetzen',         Icon: UserPlus,      color:'#16a34a', bg:'#F0FDF4', desc:'Sendet eine Vernetzungsanfrage' },
  send_message:   { label:'Nachricht',         Icon: MessageSquare, color:'#c2410c', bg:'#FFF7ED', desc:'Sendet eine LinkedIn-Nachricht' },
  wait:           { label:'Warten',            Icon: Hourglass,     color:'#7c3aed', bg:'#F5F3FF', desc:'Zeitverzögerung zwischen Schritten' },
}

// Default-Sequenz für neue Kampagne (matches Waalaxy "Invitation + Message")
const DEFAULT_SEQUENCE = [
  { type:'send_connect',  delay_min:5,    delay_max:15,   message:'Hallo {{first_name}}, ich bin auf dein Profil gestoßen und würde mich gerne mit dir vernetzen.' },
  { type:'wait',          delay_min:1440, delay_max:1440, message:'' },
  { type:'send_message',  delay_min:0,    delay_max:0,    message:'Hallo {{first_name}}, danke für die Vernetzung! Ich wollte kurz Kontakt aufnehmen…' },
]

// Quick-Templates (analog Waalaxy "Schneller Zugriff auf Modelle")
const QUICK_TEMPLATES = [
  {
    id:'invitation',
    label:'Einladung',
    description:'Nur Vernetzungsanfrage senden',
    Icon: UserPlus,
    sequence: [
      { type:'send_connect', delay_min:5, delay_max:15, message:'Hallo {{first_name}}, ich würde mich gerne mit dir vernetzen.' },
    ],
  },
  {
    id:'invitation_message',
    label:'Einladung + Nachricht',
    description:'Vernetzen, dann Folgenachricht nach 1 Tag',
    Icon: MessageSquare,
    sequence: [
      { type:'send_connect',  delay_min:5,    delay_max:15,   message:'Hallo {{first_name}}, ich würde mich gerne mit dir vernetzen.' },
      { type:'wait',          delay_min:1440, delay_max:1440, message:'' },
      { type:'send_message',  delay_min:0,    delay_max:0,    message:'Hallo {{first_name}}, danke für die Vernetzung! Ich wollte kurz Kontakt aufnehmen…' },
    ],
  },
  {
    id:'invitation_2messages',
    label:'Einladung + 2 Nachrichten',
    description:'Vernetzen, Nachricht nach 1 Tag, Reminder nach 5 Tagen',
    Icon: ListChecks,
    sequence: [
      { type:'send_connect',  delay_min:5,    delay_max:15,   message:'Hallo {{first_name}}, ich würde mich gerne mit dir vernetzen.' },
      { type:'wait',          delay_min:1440, delay_max:1440, message:'' },
      { type:'send_message',  delay_min:0,    delay_max:0,    message:'Hallo {{first_name}}, danke für die Vernetzung! Ich wollte kurz Kontakt aufnehmen…' },
      { type:'wait',          delay_min:7200, delay_max:7200, message:'' },
      { type:'send_message',  delay_min:0,    delay_max:0,    message:'Hallo {{first_name}}, hattest du Gelegenheit, drüber nachzudenken?' },
    ],
  },
  {
    id:'visit_only',
    label:'Nur Profilbesuch',
    description:'Sichtbarkeit erhöhen ohne Kontaktaufnahme',
    Icon: Eye,
    sequence: [
      { type:'visit_profile', delay_min:5, delay_max:15, message:'' },
    ],
  },
]

// Tägliche Quoten (analog Waalaxy "Tägliche Quoten")
const DAILY_QUOTAS = [
  { key:'send_connect',  label:'Einladungen',     Icon: UserPlus,      cap:100 },
  { key:'send_message',  label:'Nachrichten',     Icon: MessageSquare, cap:150 },
  { key:'visit_profile', label:'Profilbesuche',   Icon: Eye,           cap:135 },
]

const STATUS_TABS = [
  { id:'active',    label:'Laufend',    Icon: Play,          color:'#16a34a' },
  { id:'paused',    label:'Pausiert',   Icon: Pause,         color:'#f59e0b' },
  { id:'draft',     label:'Entwurf',    Icon: AlertCircle,   color:'#64748B' },
  { id:'completed', label:'Gestoppt',   Icon: CheckCircle2,  color:'#2563eb' },
]

const statusColor = { draft:'#94A3B8', active:'#22c55e', paused:'#f59e0b', completed:'#2563eb', archived:'#94A3B8' }
const statusLabel = { draft:'Entwurf', active:'Laufend', paused:'Pausiert', completed:'Gestoppt', archived:'Archiviert' }

function fmtDelay(min) {
  if (!min) return 'sofort'
  if (min < 60)   return `${min} Min.`
  if (min < 1440) return `${Math.round(min/60)} Std.`
  return `${Math.round(min/1440)} Tag${Math.round(min/1440) === 1 ? '' : 'e'}`
}

function fullName(l) {
  return ((l?.first_name || '') + ' ' + (l?.last_name || '')).trim() || l?.name || 'Unbekannt'
}

// ─── Component ────────────────────────────────────────────────────────────
export default function Automatisierung({ session }) {
  const navigate = useNavigate()
  const [view, setView]               = useState('campaigns')   // campaigns | queue
  const [statusTab, setStatusTab]     = useState('active')
  const [campaigns, setCampaigns]     = useState([])
  const [jobs, setJobs]               = useState([])
  const [logs24h, setLogs24h]         = useState([])
  const [leads, setLeads]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [showNew, setShowNew]         = useState(false)
  const [flash, setFlash]             = useState(null)

  // Modal-State
  const [step, setStep] = useState('template') // template | configure | leads
  const [newCamp, setNewCamp] = useState(() => emptyCampaign())
  const [selectedLeads, setSelectedLeads] = useState([])

  const uid = session?.user?.id

  function emptyCampaign() {
    return {
      name:'',
      description:'',
      sequence: JSON.parse(JSON.stringify(DEFAULT_SEQUENCE)),
      settings: { daily_limit:20, working_hours_start:8, working_hours_end:20 },
    }
  }

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    const since24h = new Date(Date.now() - 24*60*60*1000).toISOString()
    const [c, j, l, lg] = await Promise.all([
      supabase.from('automation_campaigns').select('*').eq('user_id', uid).order('created_at', { ascending:false }),
      supabase.from('automation_jobs').select('*').eq('user_id', uid)
        .in('status', ['pending','claimed','running']).order('scheduled_at', { ascending:true }).limit(100),
      supabase.from('leads')
        .select('id,first_name,last_name,company,job_title,linkedin_url,hs_score,li_connection_status')
        .eq('user_id', uid).not('linkedin_url','is', null)
        .order('hs_score', { ascending:false }).limit(300),
      supabase.from('automation_logs').select('action,success,created_at').eq('user_id', uid).gte('created_at', since24h),
    ])
    setCampaigns(c.data || [])
    setJobs(j.data || [])
    setLeads(l.data || [])
    setLogs24h(lg.data || [])
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setInterval(() => { if (view === 'queue') load() }, 10000)
    return () => clearInterval(t)
  }, [view, load])

  function showFlash(msg, type = 'ok') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  // ── KPI-Aggregation ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = campaigns.filter(c => c.status === 'active').length
    const paused = campaigns.filter(c => c.status === 'paused').length
    const totalLeads   = campaigns.reduce((s, c) => s + (c.leads_total   || 0), 0)
    const totalDone    = campaigns.reduce((s, c) => s + (c.leads_done    || 0), 0)
    const totalReplied = campaigns.reduce((s, c) => s + (c.leads_replied || 0), 0)
    const acceptRate   = totalDone > 0 ? Math.round((totalReplied / totalDone) * 100) : 0
    const sentToday    = logs24h.filter(x => x.success).length
    return { active, paused, totalLeads, totalDone, totalReplied, acceptRate, sentToday }
  }, [campaigns, logs24h])

  const quotaUsage = useMemo(() => {
    const map = {}
    for (const q of DAILY_QUOTAS) map[q.key] = 0
    for (const log of logs24h) {
      if (log.success && map[log.action] != null) map[log.action] += 1
    }
    return map
  }, [logs24h])

  const statusCounts = useMemo(() => {
    const out = { active:0, paused:0, draft:0, completed:0 }
    for (const c of campaigns) if (out[c.status] != null) out[c.status] += 1
    return out
  }, [campaigns])

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase()
    return campaigns.filter(c => {
      if (c.status !== statusTab) return false
      if (!term) return true
      return (c.name || '').toLowerCase().includes(term) || (c.description || '').toLowerCase().includes(term)
    })
  }, [campaigns, statusTab, search])

  // ── Aktionen ────────────────────────────────────────────────────────────
  async function createCampaign() {
    if (!newCamp.name.trim()) { showFlash('Kampagnenname fehlt', 'err'); return }
    const { data, error } = await supabase.from('automation_campaigns').insert({
      user_id: uid,
      name: newCamp.name.trim(),
      description: newCamp.description,
      sequence: newCamp.sequence,
      settings: newCamp.settings,
      leads_total: selectedLeads.length,
      status: 'draft',
    }).select().single()

    if (error) { showFlash(error.message, 'err'); return }

    if (selectedLeads.length && data) {
      const now = new Date()
      const clInserts = selectedLeads.map((leadId, idx) => ({
        campaign_id: data.id,
        lead_id: leadId,
        user_id: uid,
        status: 'queued',
        current_step: 0,
        next_action_at: new Date(now.getTime() + idx * 2 * 60000).toISOString(),
      }))
      await supabase.from('automation_campaign_leads').insert(clInserts)

      const firstStep = newCamp.sequence.find(s => s.type !== 'wait')
      if (firstStep) {
        const jobInserts = []
        for (let i = 0; i < selectedLeads.length; i++) {
          const lead = leads.find(l => l.id === selectedLeads[i])
          if (!lead?.linkedin_url) continue
          jobInserts.push({
            user_id: uid,
            campaign_id: data.id,
            lead_id: lead.id,
            type: firstStep.type,
            payload: { linkedin_url: lead.linkedin_url, message: firstStep.message || '' },
            status: 'pending',
            priority: 5,
            scheduled_at: new Date(now.getTime() + i * 3 * 60000).toISOString(),
          })
        }
        if (jobInserts.length) await supabase.from('automation_jobs').insert(jobInserts)
      }
    }

    showFlash(`Kampagne "${data.name}" erstellt ✓`)
    resetModal()
    load()
  }

  function resetModal() {
    setShowNew(false)
    setSelectedLeads([])
    setNewCamp(emptyCampaign())
    setStep('template')
  }

  async function toggleCampaign(c) {
    const newStatus = c.status === 'active' ? 'paused' : 'active'
    await supabase.from('automation_campaigns').update({ status:newStatus }).eq('id', c.id)
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status:newStatus } : x))
  }

  async function deleteCampaign(id) {
    if (!confirm('Kampagne und alle Jobs löschen?')) return
    await supabase.from('automation_campaigns').delete().eq('id', id)
    setCampaigns(prev => prev.filter(x => x.id !== id))
    showFlash('Kampagne gelöscht')
  }

  async function cancelJob(id) {
    await supabase.from('automation_jobs').update({ status:'cancelled' }).eq('id', id)
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  function pickTemplate(tpl) {
    setNewCamp(p => ({
      ...p,
      name: p.name || tpl.label,
      sequence: JSON.parse(JSON.stringify(tpl.sequence)),
    }))
    setStep('configure')
  }

  function addStep(type = 'send_message') {
    setNewCamp(p => ({
      ...p,
      sequence: [...p.sequence, { type, delay_min: type === 'wait' ? 1440 : 0, delay_max: type === 'wait' ? 1440 : 0, message:'' }],
    }))
  }
  function removeStep(idx) {
    setNewCamp(p => ({ ...p, sequence: p.sequence.filter((_, i) => i !== idx) }))
  }
  function updateStep(idx, key, val) {
    setNewCamp(p => {
      const seq = [...p.sequence]
      seq[idx] = { ...seq[idx], [key]:val }
      return { ...p, sequence:seq }
    })
  }

  function exportCampaignsCsv() {
    const rows = [
      ['Name','Status','Leads gesamt','Erledigt','Antworten','Akzeptanzrate','Sequenz-Schritte','Erstellt'],
      ...campaigns.map(c => [
        c.name, statusLabel[c.status] || c.status,
        c.leads_total || 0, c.leads_done || 0, c.leads_replied || 0,
        c.leads_done > 0 ? Math.round((c.leads_replied || 0) / c.leads_done * 100) + '%' : '–',
        (c.sequence || []).length,
        c.created_at ? new Date(c.created_at).toLocaleDateString('de-DE') : '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '')
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(';')).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `kampagnen-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>

        {/* Flash */}
        {flash && (
          <div style={{ position:'fixed', top:16, right:24, zIndex:1100, padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600,
            background: flash.type === 'err' ? '#FEF2F2' : '#ECFDF5',
            color:      flash.type === 'err' ? '#dc2626' : '#059669',
            border: `1px solid ${flash.type === 'err' ? '#FECACA' : '#A7F3D0'}`,
            boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
            {flash.msg}
          </div>
        )}

        {/* Header */}
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Automatisierung</h1>
            <div style={subtitleStyle}>LinkedIn-Kampagnen · Sequenz-Builder · Browser-Extension</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <div style={{ position:'relative' }}>
              <Search size={14} style={searchIconStyle} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Kampagnen suchen…" style={searchInputStyle} />
            </div>
            <button style={ghostBtnStyle} onClick={load} title="Neu laden">
              <RotateCw size={14} /> Aktualisieren
            </button>
            <button style={ghostBtnStyle} onClick={exportCampaignsCsv} title="CSV-Export aller Kampagnen">
              <Download size={14} /> Export
            </button>
            <button style={primaryBtnStyle} onClick={() => setShowNew(true)}>
              <Plus size={14} /> Neue Kampagne
            </button>
          </div>
        </div>

        {/* KPI-Tiles */}
        <div style={kpiRowStyle}>
          <KpiTile Icon={Play}        label="Aktive Kampagnen"   value={kpis.active}      tint="#16a34a" tintBg="#ECFDF5" />
          <KpiTile Icon={Pause}       label="Pausiert"           value={kpis.paused}      tint="#f59e0b" tintBg="#FFFBEB" />
          <KpiTile Icon={Send}        label="Heute gesendet"     value={kpis.sentToday}   tint="#2563eb" tintBg="#EFF6FF" />
          <KpiTile Icon={BarChart3}   label="Akzeptanzrate"      value={kpis.acceptRate + '%'} sub={`${kpis.totalReplied} von ${kpis.totalDone}`} tint={kpis.acceptRate >= 25 ? '#16a34a' : kpis.acceptRate >= 10 ? '#f59e0b' : '#dc2626'} tintBg={kpis.acceptRate >= 25 ? '#ECFDF5' : kpis.acceptRate >= 10 ? '#FFFBEB' : '#FEF2F2'} />
        </div>

        {/* Extension-Status Banner — dezent statt gelb */}
        <ExtensionBanner jobsActive={jobs.length > 0} />

        {/* View-Toggle Kampagnen vs Warteschlange */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          <div style={toggleGroupStyle} role="tablist">
            <button onClick={() => setView('campaigns')} style={view === 'campaigns' ? toggleBtnActive : toggleBtnStyle}>
              <Zap size={14} /> Kampagnen
            </button>
            <button onClick={() => setView('queue')} style={view === 'queue' ? toggleBtnActive : toggleBtnStyle}>
              <Clock size={14} /> Warteschlange
              {jobs.length > 0 && (
                <span style={{ marginLeft:4, padding:'1px 6px', borderRadius:99, fontSize:10, fontWeight:800, background:PRIMARY_VAR, color:'#fff' }}>
                  {jobs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ──────────── KAMPAGNEN ──────────── */}
        {view === 'campaigns' && (
          <>
            {/* Status-Tabs */}
            <div style={{ ...cardStyle, padding:'10px 14px', marginBottom:12 }}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {STATUS_TABS.map(t => {
                  const active = statusTab === t.id
                  const count  = statusCounts[t.id] || 0
                  return (
                    <button key={t.id} onClick={() => setStatusTab(t.id)}
                      style={{
                        display:'inline-flex', alignItems:'center', gap:6,
                        padding:'7px 14px', borderRadius:99, cursor:'pointer',
                        fontSize:12, fontWeight:700, border:`1.5px solid ${active ? PRIMARY_VAR : '#E4E7EC'}`,
                        background: active ? PRIMARY_VAR : 'var(--surface)',
                        color: active ? '#fff' : '#374151',
                      }}>
                      <t.Icon size={13} />
                      {t.label}
                      <span style={{
                        padding:'1px 7px', borderRadius:99, fontSize:11, fontWeight:800,
                        background: active ? 'rgba(255,255,255,0.22)' : '#F1F5F9',
                        color: active ? '#fff' : '#475569',
                      }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Kampagnen-Liste */}
            {loading ? (
              <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)', fontSize:13 }}>Lade…</div>
            ) : filteredCampaigns.length === 0 ? (
              <EmptyState
                statusTab={statusTab}
                hasAny={campaigns.length > 0}
                onCreate={() => setShowNew(true)}
              />
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {filteredCampaigns.map(c => (
                  <CampaignRow key={c.id} campaign={c} onToggle={() => toggleCampaign(c)} onDelete={() => deleteCampaign(c.id)} />
                ))}
              </div>
            )}

            {/* Daily-Quota-Sektion */}
            <div style={{ marginTop:28 }}>
              <div style={sectionTitleStyle}><Clock size={14} /> Tägliche Quoten</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
                {DAILY_QUOTAS.map(q => {
                  const used = quotaUsage[q.key] || 0
                  const pct  = Math.min(100, Math.round((used / q.cap) * 100))
                  return (
                    <div key={q.key} style={cardStyle}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', color:'#475569' }}>
                          <q.Icon size={16} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{q.label}</div>
                          <div style={{ fontSize:11, color:'var(--text-muted)' }}>{q.cap - used} heute verbleibend</div>
                        </div>
                        <div style={{ fontSize:18, fontWeight:800, color:'#111827' }}>{used}<span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>/{q.cap}</span></div>
                      </div>
                      <div style={{ height:6, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ width:pct + '%', height:'100%', background: pct > 85 ? '#dc2626' : pct > 60 ? '#f59e0b' : '#16a34a', transition:'width .3s' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ──────────── WARTESCHLANGE ──────────── */}
        {view === 'queue' && (
          <QueueView jobs={jobs} onCancel={cancelJob} onReload={load} />
        )}

      </div>

      {/* ──────────── MODAL ──────────── */}
      {showNew && (
        <NewCampaignModal
          step={step} setStep={setStep}
          newCamp={newCamp} setNewCamp={setNewCamp}
          quickTemplates={QUICK_TEMPLATES} pickTemplate={pickTemplate}
          leads={leads}
          selectedLeads={selectedLeads} setSelectedLeads={setSelectedLeads}
          addStep={addStep} removeStep={removeStep} updateStep={updateStep}
          onClose={resetModal}
          onCreate={createCampaign}
        />
      )}
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function KpiTile({ Icon, label, value, sub, tint, tintBg }) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:tintBg || '#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', color:tint || '#475569' }}>
          <Icon size={16} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.02em' }}>{label}</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#0F172A', marginTop:2, lineHeight:1.1 }}>{value}</div>
          {sub && <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )
}

function ExtensionBanner({ jobsActive }) {
  return (
    <div style={{ ...cardStyle, marginBottom:20, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:32, height:32, borderRadius:8, background:jobsActive ? '#ECFDF5' : '#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', color:jobsActive ? '#16a34a' : '#64748B' }}>
        <Globe size={16} />
      </div>
      <div style={{ flex:1, fontSize:12, color:'var(--text-muted)' }}>
        <span style={{ fontWeight:700, color:'var(--text-strong)' }}>Leadesk Chrome-Extension</span> {jobsActive ? '· aktiv, verarbeitet Jobs' : '· bereit'} — Automatisierung läuft im Browser deines aktiven LinkedIn-Tabs.
      </div>
      <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:99, background:jobsActive ? '#ECFDF5' : '#F1F5F9', color:jobsActive ? '#065F46' : '#475569', fontSize:11, fontWeight:700 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:jobsActive ? '#22c55e' : '#CBD5E1' }}/>
        {jobsActive ? 'Aktiv' : 'Idle'}
      </span>
    </div>
  )
}

function EmptyState({ statusTab, hasAny, onCreate }) {
  const t = STATUS_TABS.find(x => x.id === statusTab)
  return (
    <div style={{ ...cardStyle, textAlign:'center', padding:'40px 24px' }}>
      <div style={{ width:48, height:48, borderRadius:'50%', background:'#F1F5F9', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:12, color:'#94A3B8' }}>
        {t?.Icon ? <t.Icon size={22} /> : <Zap size={22} />}
      </div>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--text-strong)', marginBottom:6 }}>
        {hasAny ? `Keine Kampagnen mit Status "${t?.label || statusTab}"` : 'Noch keine Kampagnen'}
      </div>
      <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:18 }}>
        {hasAny ? 'Wechsle den Status-Tab oder erstelle eine neue Kampagne.' : 'Erstelle deine erste LinkedIn-Automatisierungskampagne in unter zwei Minuten.'}
      </div>
      <button onClick={onCreate} style={primaryBtnStyle}>
        <Plus size={14} /> Neue Kampagne
      </button>
    </div>
  )
}

function CampaignRow({ campaign: c, onToggle, onDelete }) {
  const progress = c.leads_total > 0 ? Math.round(((c.leads_done || 0) / c.leads_total) * 100) : 0
  const acceptRate = c.leads_done > 0 ? Math.round(((c.leads_replied || 0) / c.leads_done) * 100) : 0
  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>

        {/* Status-Toggle */}
        <button onClick={onToggle}
          title={c.status === 'active' ? 'Kampagne pausieren' : 'Kampagne starten'}
          style={{ width:38, height:22, borderRadius:99, background: c.status === 'active' ? '#22c55e' : '#E5E7EB', cursor:'pointer', flexShrink:0, marginTop:4, position:'relative', border:'none', padding:0 }}>
          <span style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: c.status === 'active' ? 19 : 3, transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
        </button>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
            <span style={{ fontSize:14, fontWeight:700, color:'var(--text-strong)' }}>{c.name}</span>
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background: c.status === 'active' ? '#DCFCE7' : c.status === 'paused' ? '#FEF3C7' : '#F1F5F9', color: statusColor[c.status] || '#64748B' }}>
              {statusLabel[c.status] || c.status}
            </span>
            {c.leads_done > 0 && (
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'#EFF6FF', color:'#2563eb' }}>
                {acceptRate}% Akzeptanz
              </span>
            )}
          </div>
          {c.description && <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8 }}>{c.description}</div>}

          {/* Sequenz-Vorschau */}
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:10, alignItems:'center' }}>
            {(c.sequence || []).map((s, i) => {
              const info = STEP_TYPES[s.type]
              const Icon = info?.Icon
              return (
                <React.Fragment key={i}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'3px 9px', borderRadius:6, background: info?.bg || '#F1F5F9', color: info?.color || '#475569', fontWeight:600 }}>
                    {Icon && <Icon size={11} />} {info?.label || s.type}
                    {s.type === 'wait' && <span style={{ opacity:0.8 }}>· {fmtDelay(s.delay_min)}</span>}
                  </span>
                  {i < (c.sequence?.length || 0) - 1 && <span style={{ color:'#CBD5E1', fontSize:12 }}>→</span>}
                </React.Fragment>
              )
            })}
          </div>

          {/* Progress */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, height:5, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
              <div style={{ width:progress + '%', height:'100%', background:PRIMARY_VAR, borderRadius:99, transition:'width .3s' }}/>
            </div>
            <span style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
              {c.leads_done || 0}/{c.leads_total || 0} Leads · {c.leads_replied || 0} Antworten
            </span>
          </div>
        </div>

        <button onClick={onDelete} title="Kampagne löschen"
          style={{ padding:'5px 9px', borderRadius:7, border:'1px solid #FECACA', background:'#FEF2F2', color:'#dc2626', fontSize:11, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function QueueView({ jobs, onCancel, onReload }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:13, color:'var(--text-muted)' }}>{jobs.length} ausstehende Jobs</span>
        <button onClick={onReload} style={ghostBtnStyle}><RotateCw size={13} /> Aktualisieren</button>
      </div>
      {jobs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign:'center', padding:'40px 20px', color:'var(--text-muted)', fontSize:13 }}>
          <CheckCircle2 size={28} color="#22c55e" style={{ display:'block', margin:'0 auto 8px' }} />
          Keine Jobs in der Warteschlange — Extension ist bereit
        </div>
      ) : (
        <div style={{ background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 110px 140px 60px', padding:'10px 16px', background:'var(--surface-muted, #F8FAFC)', borderBottom:'1px solid var(--border)', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', gap:8 }}>
            <div>Typ</div><div>Details</div><div>Status</div><div>Geplant</div><div></div>
          </div>
          {jobs.map((job, i) => {
            const info = STEP_TYPES[job.type] || STEP_TYPES[job.action] || { label:job.type || job.action, Icon:Zap, color:'#475569', bg:'#F1F5F9' }
            const Icon = info.Icon
            const detail = job.payload?.linkedin_url?.replace('https://www.linkedin.com/in/', '@') || job.target_url || ''
            return (
              <div key={job.id} style={{ display:'grid', gridTemplateColumns:'140px 1fr 110px 140px 60px', padding:'10px 16px', borderBottom: i < jobs.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems:'center', gap:8, fontSize:12 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontWeight:600, color:info.color }}>
                  <span style={{ width:22, height:22, borderRadius:6, background:info.bg, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    <Icon size={12} />
                  </span>
                  {info.label}
                </div>
                <div style={{ color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{detail}</div>
                <div>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, fontWeight:700,
                    background: job.status === 'running' ? '#DCFCE7' : job.status === 'claimed' ? '#FEF3C7' : '#EFF6FF',
                    color:      job.status === 'running' ? '#16a34a' : job.status === 'claimed' ? '#d97706' : '#2563eb',
                  }}>{job.status}</span>
                </div>
                <div style={{ color:'var(--text-muted)' }}>
                  {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                </div>
                <div>
                  {job.status === 'pending' && (
                    <button onClick={() => onCancel(job.id)}
                      style={{ padding:'3px 8px', borderRadius:5, border:'1px solid #FECACA', background:'#FEF2F2', color:'#dc2626', fontSize:10, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewCampaignModal({
  step, setStep,
  newCamp, setNewCamp,
  quickTemplates, pickTemplate,
  leads,
  selectedLeads, setSelectedLeads,
  addStep, removeStep, updateStep,
  onClose, onCreate,
}) {
  const linkedinLeads = leads.filter(l => l.linkedin_url)
  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'var(--surface)', borderRadius:16, width:720, maxWidth:'95vw', maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(0,0,0,0.2)' }}>

        {/* Modal-Header mit Stepper */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border, #E4E7EC)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(49,90,231,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color:PRIMARY_VAR }}>
                <Zap size={16} />
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--text-strong)' }}>Neue Kampagne</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {step === 'template'  ? 'Wähle eine Vorlage oder starte mit leerer Sequenz' :
                   step === 'configure' ? 'Sequenz konfigurieren und Tageslimit setzen' :
                   'Leads für diese Kampagne auswählen'}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ ...iconBtnStyle, width:30, height:30 }}><X size={14} /></button>
          </div>
          <Stepper step={step} setStep={setStep} canConfig={!!newCamp.sequence?.length} canLeads={!!newCamp.name?.trim()} />
        </div>

        {/* Modal-Body */}
        <div style={{ padding:'20px 24px', overflowY:'auto', flex:1 }}>

          {step === 'template' && (
            <div>
              <div style={sectionTitleStyle}><Sparkles size={14} /> Schneller Start</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10, marginBottom:18 }}>
                {quickTemplates.map(t => (
                  <button key={t.id} onClick={() => pickTemplate(t)}
                    style={{ textAlign:'left', cursor:'pointer', padding:'14px 16px', borderRadius:12, border:'1.5px solid #E4E7EC', background:'var(--surface)', display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:30, height:30, borderRadius:8, background:'rgba(49,90,231,0.10)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:PRIMARY_VAR }}>
                        <t.Icon size={15} />
                      </span>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{t.label}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.description}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:2 }}>
                      {t.sequence.map((s, i) => {
                        const info = STEP_TYPES[s.type]
                        const Icon = info?.Icon
                        return (
                          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, padding:'2px 7px', borderRadius:5, background:info?.bg, color:info?.color, fontWeight:600 }}>
                            {Icon && <Icon size={10} />} {info?.label || s.type}
                          </span>
                        )
                      })}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'12px 0' }}>
                <div style={{ flex:1, height:1, background:'#E4E7EC' }}/>
                <span style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>oder</span>
                <div style={{ flex:1, height:1, background:'#E4E7EC' }}/>
              </div>

              <button onClick={() => { setStep('configure') }}
                style={{ width:'100%', padding:'12px', borderRadius:10, border:'1.5px dashed #CBD5E1', background:'transparent', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Eigene Sequenz von Grund auf bauen
              </button>
            </div>
          )}

          {step === 'configure' && (
            <div>
              {/* Name + Beschreibung */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:18 }}>
                <div>
                  <label style={labelStyle}>Kampagnenname *</label>
                  <input value={newCamp.name} onChange={e => setNewCamp(p => ({ ...p, name:e.target.value }))}
                    style={inputStyle} placeholder="z.B. Outreach Q2 Entscheider" autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>Beschreibung</label>
                  <input value={newCamp.description} onChange={e => setNewCamp(p => ({ ...p, description:e.target.value }))}
                    style={inputStyle} placeholder="Optional" />
                </div>
              </div>

              {/* Limits */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
                <div>
                  <label style={labelStyle}>Tageslimit pro Aktion</label>
                  <input type="number" value={newCamp.settings.daily_limit}
                    onChange={e => setNewCamp(p => ({ ...p, settings:{ ...p.settings, daily_limit:Number(e.target.value) } }))}
                    style={inputStyle} min="1" max="50" />
                </div>
                <div>
                  <label style={labelStyle}>Arbeitszeit ab (Uhr)</label>
                  <input type="number" value={newCamp.settings.working_hours_start}
                    onChange={e => setNewCamp(p => ({ ...p, settings:{ ...p.settings, working_hours_start:Number(e.target.value) } }))}
                    style={inputStyle} min="0" max="23" />
                </div>
                <div>
                  <label style={labelStyle}>Arbeitszeit bis (Uhr)</label>
                  <input type="number" value={newCamp.settings.working_hours_end}
                    onChange={e => setNewCamp(p => ({ ...p, settings:{ ...p.settings, working_hours_end:Number(e.target.value) } }))}
                    style={inputStyle} min="1" max="23" />
                </div>
              </div>

              {/* Sequenz-Builder */}
              <div style={{ marginBottom:8 }}>
                <div style={sectionTitleStyle}><ListChecks size={14} /> Sequenz</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:8 }}>
                {newCamp.sequence.map((s, i) => (
                  <StepRow key={i} idx={i} step={s} onChange={(k, v) => updateStep(i, k, v)} onRemove={() => removeStep(i)} canRemove={newCamp.sequence.length > 1} />
                ))}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => addStep('send_message')}
                  style={{ flex:1, padding:'8px', borderRadius:8, border:'1px dashed #CBD5E1', background:'transparent', color:'var(--text-muted)', fontSize:12, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <Plus size={13} /> Aktion
                </button>
                <button onClick={() => addStep('wait')}
                  style={{ flex:1, padding:'8px', borderRadius:8, border:'1px dashed #CBD5E1', background:'transparent', color:'var(--text-muted)', fontSize:12, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <Hourglass size={13} /> Warten
                </button>
              </div>
            </div>
          )}

          {step === 'leads' && (
            <div>
              <div style={{ ...sectionTitleStyle, justifyContent:'space-between', display:'flex' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <Users size={14} /> Leads auswählen
                </span>
                <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)' }}>
                  {selectedLeads.length} von {linkedinLeads.length} ausgewählt
                </span>
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                <button onClick={() => setSelectedLeads(linkedinLeads.map(l => l.id))}
                  style={ghostBtnStyle}>Alle</button>
                <button onClick={() => setSelectedLeads([])}
                  style={ghostBtnStyle}>Keine</button>
                <button onClick={() => setSelectedLeads(linkedinLeads.filter(l => (l.hs_score || 0) >= 70).map(l => l.id))}
                  style={ghostBtnStyle}><Sparkles size={12} /> Nur Hot Leads (Score ≥ 70)</button>
              </div>
              <div style={{ maxHeight:340, overflowY:'auto', border:'1px solid var(--border, #E4E7EC)', borderRadius:10 }}>
                {linkedinLeads.length === 0 ? (
                  <div style={{ padding:30, textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>
                    Keine Leads mit LinkedIn-URL gefunden. Importiere zunächst Leads.
                  </div>
                ) : linkedinLeads.map(lead => {
                  const checked = selectedLeads.includes(lead.id)
                  return (
                    <label key={lead.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:checked ? 'rgba(49,90,231,0.04)' : 'transparent' }}>
                      <input type="checkbox" checked={checked}
                        onChange={e => setSelectedLeads(prev => e.target.checked ? [...prev, lead.id] : prev.filter(x => x !== lead.id))}
                        style={{ accentColor:PRIMARY }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fullName(lead)}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {[lead.job_title, lead.company].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#EFF6FF', color:PRIMARY_VAR, fontWeight:700 }}>
                        ⚡ {lead.hs_score || 0}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal-Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border, #E4E7EC)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface)' }}>
          <button onClick={() => {
            if (step === 'configure') setStep('template')
            else if (step === 'leads') setStep('configure')
            else onClose()
          }} style={ghostBtnStyle}>
            {step === 'template' ? 'Abbrechen' : 'Zurück'}
          </button>
          {step !== 'leads' ? (
            <button onClick={() => {
              if (step === 'template')  setStep('configure')
              if (step === 'configure') {
                if (!newCamp.name?.trim()) return
                setStep('leads')
              }
            }} disabled={step === 'configure' && !newCamp.name?.trim()}
              style={{ ...primaryBtnStyle, opacity: step === 'configure' && !newCamp.name?.trim() ? 0.5 : 1, cursor: step === 'configure' && !newCamp.name?.trim() ? 'not-allowed' : 'pointer' }}>
              Weiter
            </button>
          ) : (
            <button onClick={onCreate}
              style={primaryBtnStyle}>
              <Zap size={14} /> Kampagne erstellen ({selectedLeads.length} Lead{selectedLeads.length === 1 ? '' : 's'})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stepper({ step, setStep, canConfig, canLeads }) {
  const steps = [
    { id:'template',  label:'Vorlage',        enabled:true },
    { id:'configure', label:'Sequenz & Name', enabled:canConfig },
    { id:'leads',     label:'Leads',          enabled:canLeads },
  ]
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      {steps.map((s, i) => {
        const active = step === s.id
        return (
          <React.Fragment key={s.id}>
            <button onClick={() => s.enabled && setStep(s.id)} disabled={!s.enabled}
              style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:99, border:`1.5px solid ${active ? PRIMARY_VAR : '#E4E7EC'}`, background:active ? PRIMARY_VAR : 'var(--surface)', color:active ? '#fff' : '#374151', fontSize:11, fontWeight:700, cursor:s.enabled ? 'pointer' : 'default', opacity:s.enabled ? 1 : 0.45 }}>
              <span style={{ width:18, height:18, borderRadius:'50%', background:active ? 'rgba(255,255,255,0.22)' : '#F1F5F9', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:active ? '#fff' : '#64748B' }}>{i + 1}</span>
              {s.label}
            </button>
            {i < steps.length - 1 && <div style={{ flex:1, height:1, background:'#E4E7EC', maxWidth:30 }}/>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function StepRow({ idx, step: s, onChange, onRemove, canRemove }) {
  const info = STEP_TYPES[s.type] || STEP_TYPES.send_message
  const Icon = info.Icon
  const isWait    = s.type === 'wait'
  const needsMsg  = s.type === 'send_connect' || s.type === 'send_message'
  return (
    <div style={{ background:'var(--surface-muted, #F8FAFC)', borderRadius:10, padding:'10px 12px', border:'1px solid var(--border, #E4E7EC)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ width:24, height:24, borderRadius:6, background:info.bg, display:'inline-flex', alignItems:'center', justifyContent:'center', color:info.color, fontSize:11, fontWeight:800 }}>{idx + 1}</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, padding:'3px 9px', borderRadius:6, background:info.bg, color:info.color, fontWeight:700 }}>
          <Icon size={12} /> {info.label}
        </span>
        <select value={s.type} onChange={e => onChange('type', e.target.value)}
          style={{ ...inputStyle, width:'auto', padding:'4px 8px', fontSize:12 }}>
          {Object.entries(STEP_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <div style={{ flex:1 }}/>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{isWait ? 'Warten' : 'Delay min.'}</span>
        <input type="number" value={s.delay_min} onChange={e => onChange('delay_min', Number(e.target.value))}
          style={{ ...inputStyle, width:70, padding:'4px 8px', fontSize:12 }} min="0" />
        {!isWait && (<>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>max.</span>
          <input type="number" value={s.delay_max} onChange={e => onChange('delay_max', Number(e.target.value))}
            style={{ ...inputStyle, width:70, padding:'4px 8px', fontSize:12 }} min="0" />
        </>)}
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>Min.</span>
        {canRemove && (
          <button onClick={onRemove}
            style={{ padding:'4px 7px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#dc2626', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
            <X size={12} />
          </button>
        )}
      </div>
      {needsMsg && (
        <textarea value={s.message} onChange={e => onChange('message', e.target.value)}
          rows={2} placeholder="Nachrichtentext… Variablen: {{first_name}} {{last_name}} {{company}}"
          style={{ ...inputStyle, marginTop:8, resize:'vertical', fontSize:12 }} />
      )}
      {isWait && (
        <div style={{ marginTop:6, fontSize:11, color:'var(--text-muted)' }}>
          Wartezeit: <strong>{fmtDelay(s.delay_min)}</strong>
        </div>
      )}
    </div>
  )
}
