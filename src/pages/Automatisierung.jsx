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
import InboxLink from '../components/InboxLink'
import {
  Zap, Plus, Play, Pause, RotateCw, Send, Users, BarChart3,
  Clock, X, Trash2, Eye, UserPlus, UserCheck, MessageSquare, Hourglass, Download,
  CheckCircle2, AlertCircle, Search, Filter, Mail, Sparkles, ListChecks,
  Globe, ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useResponsive } from '../hooks/useResponsive'
import { useInboxLists } from '../hooks/useInboxLists'
import WizardLayout from '../components/WizardLayout'
import { EXTENSION_WEBSTORE_URL } from '../lib/leadeskExtension'

// ─── Tokens (Leads.jsx-Alignment) ─────────────────────────────────────────
const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle    = { background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }
const pageStyle         = { width:'100%', maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column' }
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
  follow_profile: { label:'Profil folgen',     Icon: UserCheck,     color:'#0891b2', bg:'#ECFEFF', desc:'Folgt der Person auf LinkedIn (ohne Vernetzungsanfrage)' },
  send_connect:   { label:'Vernetzen',         Icon: UserPlus,      color:'#16a34a', bg:'#F0FDF4', desc:'Sendet eine Vernetzungsanfrage' },
  send_message:   { label:'Nachricht',         Icon: MessageSquare, color:'#c2410c', bg:'#FFF7ED', desc:'Sendet eine LinkedIn-Nachricht' },
  wait:           { label:'Warten',            Icon: Hourglass,     color:'#7c3aed', bg:'#F5F3FF', desc:'Zeitverzögerung zwischen Schritten' },
}

// #13: Step-Type → kanonische automation_jobs.action (CHECK connect/message/follow/visit/like/endorse)
const STEP_TO_ACTION = { send_connect: 'connect', send_message: 'message', visit_profile: 'visit', follow_profile: 'follow' }

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
  {
    id:'follow_only',
    label:'Nur folgen',
    description:'Person folgen ohne Vernetzungsanfrage — Posts im Feed sehen, weiches Outreach',
    Icon: UserCheck,
    sequence: [
      { type:'follow_profile', delay_min:5, delay_max:15, message:'' },
    ],
  },
  {
    id:'follow_then_connect',
    label:'Folgen, dann vernetzen',
    description:'Warm-up: 3 Tage folgen, dann Vernetzungsanfrage senden',
    Icon: UserCheck,
    sequence: [
      { type:'follow_profile', delay_min:5,    delay_max:15,   message:'' },
      { type:'wait',           delay_min:4320, delay_max:4320, message:'' },
      { type:'send_connect',   delay_min:5,    delay_max:15,   message:'Hallo {{first_name}}, ich folge dir bereits eine Weile und würde mich gerne mit dir vernetzen.' },
    ],
  },
]

// Tägliche Quoten (analog Waalaxy "Tägliche Quoten")
const DAILY_QUOTAS = [
  { key:'send_connect',   label:'Einladungen',     Icon: UserPlus,      cap:100 },
  { key:'send_message',   label:'Nachrichten',     Icon: MessageSquare, cap:150 },
  { key:'visit_profile',  label:'Profilbesuche',   Icon: Eye,           cap:135 },
  { key:'follow_profile', label:'Profil-Follows',  Icon: UserCheck,     cap:100 },
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
  const { isMobile } = useResponsive()
  const { activeTeamId } = useTeam() || {}
  const [sponsoringCampaigns, setSponsoringCampaigns] = useState([]) // K3: für die Zuordnung
  const [view, setView]               = useState('campaigns')   // campaigns | queue
  const [statusTab, setStatusTab]     = useState('active')
  const [campaigns, setCampaigns]     = useState([])
  const [jobs, setJobs]               = useState([])
  const [drafts, setDrafts]           = useState([])
  const [uniConnected, setUniConnected] = useState(false)
  const [logs24h, setLogs24h]         = useState([])
  const [leads, setLeads]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [showNew, setShowNew]         = useState(false)
  const [flash, setFlash]             = useState(null)

  // Modal-State
  const [step, setStep] = useState('template') // template | configure | source | list | select
  const [newCamp, setNewCamp] = useState(() => emptyCampaign())
  const [selectedLeads, setSelectedLeads] = useState([])

  // K3: Sponsoring-Kampagnen (für die optionale Zuordnung im Wizard) laden.
  useEffect(() => {
    if (!activeTeamId) { setSponsoringCampaigns([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('sponsoring').from('campaigns')
        .select('id, title').eq('team_id', activeTeamId).order('created_at', { ascending: false })
      if (!cancelled) setSponsoringCampaigns(data || [])
    })()
    return () => { cancelled = true }
  }, [activeTeamId])

  const uid = session?.user?.id

  function emptyCampaign() {
    return {
      name:'',
      description:'',
      sponsoring_campaign_id:'',   // K3: optional einer Sponsoring-Kampagne zuordnen
      sequence: JSON.parse(JSON.stringify(DEFAULT_SEQUENCE)),
      settings: { daily_limit:20, working_hours_start:8, working_hours_end:20 },
    }
  }

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    const since24h = new Date(Date.now() - 24*60*60*1000).toISOString()
    // Fallstrick #14: linkedin_inbox EXPLIZIT team-scopen. Sonst lässt RLS bei Multi-Team-Membership
    // ALLE Teams des Users durch und limit(300) cappt fremde Teams über das aktive — Listen aus kleineren
    // Teams fallen aus dem Fenster (medizin-Bug: 7 Rows jenseits Pos.300 von 1428 quer über 8 Teams).
    let inboxQ = supabase.from('linkedin_inbox')
      .select('id,first_name,last_name,name,company,job_title,linkedin_url,li_connection_status')
      .eq('review_status', 'new').not('linkedin_url','is', null)
    if (activeTeamId) inboxQ = inboxQ.eq('team_id', activeTeamId)
    inboxQ = inboxQ.order('imported_at', { ascending:false }).limit(300)
    const [c, j, l, lg] = await Promise.all([
      supabase.from('automation_campaigns').select('*').eq('user_id', uid).order('created_at', { ascending:false }),
      supabase.from('automation_jobs').select('*').eq('user_id', uid)
        .in('status', ['pending','claimed','running']).order('scheduled_at', { ascending:true }).limit(100),
      inboxQ,
      supabase.from('automation_logs').select('action,success,created_at').eq('user_id', uid).gte('created_at', since24h),
    ])
    setCampaigns(c.data || [])
    setJobs(j.data || [])
    setLeads(l.data || [])
    setLogs24h(lg.data || [])
    const { data: dr } = await supabase.from('automation_jobs').select('*').eq('user_id', uid)
      .eq('status', 'draft').eq('action', 'message').order('created_at', { ascending: true })
    setDrafts(dr || [])
    const { data: ua } = await supabase.from('unipile_accounts').select('status').eq('user_id', uid).eq('status', 'OK').limit(1).maybeSingle()
    setUniConnected(!!ua)
    setLoading(false)
  }, [uid, activeTeamId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setInterval(() => { if (view === 'queue') load() }, 10000)
    return () => clearInterval(t)
  }, [view, load])

  function showFlash(msg, type = 'ok') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  // ── Nachrichten-Entwürfe: Freigeben (draft→pending) / Verwerfen (→cancelled) ──
  async function approveDraft(id, text) {
    const d = drafts.find(x => x.id === id)
    if (d && text != null && text !== (d.payload?.message || '')) {
      await supabase.from('automation_jobs').update({ payload: { ...(d.payload || {}), message: text } }).eq('id', id)
    }
    const { error } = await supabase.from('automation_jobs').update({ status: 'pending' }).eq('id', id) // CHECK-Feld separat (#1)
    if (error) { showFlash(error.message, 'err'); return }
    setDrafts(prev => prev.filter(x => x.id !== id))
    showFlash('Nachricht freigegeben — wird gesendet.')
  }
  async function rejectDraft(id) {
    const { error } = await supabase.from('automation_jobs').update({ status: 'cancelled' }).eq('id', id)
    if (error) { showFlash(error.message, 'err'); return }
    setDrafts(prev => prev.filter(x => x.id !== id))
    showFlash('Entwurf verworfen.')
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
    // Bug1-Fix: Default 'active'; Entwurf nur bei 'Später'(=0 Leads) ODER Message-Erst-Sequenz
    // (Message-Jobs sind eh Freigabe-pflichtig, Z353). Nutzt nur createCampaign-eigene Vars (source lebt im Wizard).
    const firstAction = STEP_TO_ACTION[newCamp.sequence.find(s => s.type !== 'wait')?.type] || 'connect'
    const isDraft = selectedLeads.length === 0 || firstAction === 'message'
    // #13: kanonisches automation_*-Schema (Prod = Repo) + inbox_id-dual-track.
    const { data, error } = await supabase.from('automation_campaigns').insert({
      user_id: uid,
      name: newCamp.name.trim(),
      description: newCamp.description || null,
      sponsoring_campaign_id: newCamp.sponsoring_campaign_id || null,
      sequence: newCamp.sequence,
      settings: newCamp.settings,
      status: isDraft ? 'draft' : 'active',
      leads_total: selectedLeads.length,
    }).select().single()

    if (error) { showFlash(error.message, 'err'); return }

    if (selectedLeads.length && data) {
      const now = new Date()
      // dual-track: inbox_id statt lead_id (XOR), user_id NOT NULL (kanonisch).
      const clInserts = selectedLeads.map((inboxId, idx) => ({
        campaign_id: data.id,
        inbox_id: inboxId,
        user_id: uid,
        status: 'queued',
        current_step: 0,
        next_action_at: new Date(now.getTime() + idx * 2 * 60000).toISOString(),
      }))
      await supabase.from('automation_campaign_leads').insert(clInserts)

      const firstStep = newCamp.sequence.find(s => s.type !== 'wait')
      if (firstStep) {
        const action = STEP_TO_ACTION[firstStep.type] || 'connect'
        const jobInserts = []
        for (let i = 0; i < selectedLeads.length; i++) {
          const lead = leads.find(l => l.id === selectedLeads[i])
          if (!lead?.linkedin_url) continue
          jobInserts.push({
            // kanonisch: action/target_url/target_name + inbox_id-dual-track.
            user_id: uid,
            campaign_id: data.id,
            action,
            target_url: lead.linkedin_url,
            target_name: ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || lead.name || null,
            payload: { message: firstStep.message || '' },
            status: action === 'message' ? 'draft' : 'pending', // message = Entwurf, wartet auf Freigabe
            scheduled_at: new Date(now.getTime() + i * 3 * 60000).toISOString(),
            inbox_id: lead.id,
          })
        }
        if (jobInserts.length) await supabase.from('automation_jobs').insert(jobInserts)
      }
    }

    showFlash(`Kampagne "${data.name}" erstellt ✓`)
    resetModal()
    setStatusTab(isDraft ? 'draft' : 'active')   // Bug1: aktive Kampagne → Laufend-Tab, sonst scheint sie "verschwunden"
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

  // ── Render: Wizard hat eigene Full-Page-View ────────────────────────────
  if (showNew) {
    return (
      <NewCampaignWizard
        step={step} setStep={setStep}
        newCamp={newCamp} setNewCamp={setNewCamp}
        sponsoringCampaigns={sponsoringCampaigns}
        quickTemplates={QUICK_TEMPLATES} pickTemplate={pickTemplate}
        leads={leads} uid={uid}
        selectedLeads={selectedLeads} setSelectedLeads={setSelectedLeads}
        addStep={addStep} removeStep={removeStep} updateStep={updateStep}
        onClose={resetModal}
        onCreate={createCampaign}
      />
    )
  }

  // ── Render: Liste + Warteschlange ───────────────────────────────────────
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

        {/* Journal-Header (analog /messages) */}
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:20, flexWrap:'wrap', marginBottom:22 }}>
          <div style={{ flex:'1 1 auto', minWidth:280 }}>
            <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>LinkedIn · Automatisierung</div>
            <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--text-primary, rgb(20,20,43))' }}>Deine Kampagnen, auf Autopilot.</h1>
            <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:600 }}>
              LinkedIn-Sequenzen aus deinen Import-Kontakten — Vernetzen, Nachrichten und Follow-ups, automatisch &amp; serverseitig über Unipile.
            </p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <InboxLink />
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
        <div style={{ ...kpiRowStyle, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
          <KpiTile Icon={Play}        label="Aktive Kampagnen"   value={kpis.active}      tint="#16a34a" tintBg="#ECFDF5" />
          <KpiTile Icon={Pause}       label="Pausiert"           value={kpis.paused}      tint="#f59e0b" tintBg="#FFFBEB" />
          <KpiTile Icon={Send}        label="Heute gesendet"     value={kpis.sentToday}   tint="#2563eb" tintBg="#EFF6FF" />
          <KpiTile Icon={BarChart3}   label="Akzeptanzrate"      value={kpis.acceptRate + '%'} sub={`${kpis.totalReplied} von ${kpis.totalDone}`} tint={kpis.acceptRate >= 25 ? '#16a34a' : kpis.acceptRate >= 10 ? '#f59e0b' : '#dc2626'} tintBg={kpis.acceptRate >= 25 ? '#ECFDF5' : kpis.acceptRate >= 10 ? '#FFFBEB' : '#FEF2F2'} />
        </div>

        {/* Unipile-Verbindungsstatus (serverseitige Automatisierung) */}
        <ExtensionBanner
          connected={uniConnected}
          runningCount={jobs.filter(j => j.status === 'running').length}
          waitingCount={jobs.filter(j => j.status !== 'running').length}
          onManage={() => navigate('/settings/linkedin')}
        />

        {/* Nachrichten-Freigabe — message-Entwürfe warten auf menschliches OK vor dem Versand */}
        {drafts.length > 0 && (
          <div style={{ ...cardStyle, marginBottom:16, border:'1px solid #FDE68A', background:'#FFFBEB' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              <MessageSquare size={16} color="#d97706" />
              <span style={{ fontSize:14, fontWeight:800, color:'var(--text-strong)' }}>Nachrichten-Freigabe</span>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>· {drafts.length} {drafts.length === 1 ? 'Entwurf wartet' : 'Entwürfe warten'} auf deine Freigabe</span>
            </div>
            {drafts.map(d => <DraftCard key={d.id} draft={d} onApprove={approveDraft} onReject={rejectDraft} />)}
          </div>
        )}

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
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
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

function DraftCard({ draft, onApprove, onReject }) {
  const [text, setText] = useState(draft.payload?.message || '')
  const [busy, setBusy] = useState(false)
  const canSend = !busy && !!text.trim()
  return (
    <div style={{ background:'var(--surface)', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{draft.target_name || draft.target_url}</span>
        {draft.target_url && <a href={draft.target_url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:PRIMARY_VAR, textDecoration:'none', whiteSpace:'nowrap' }}>Profil ↗</a>}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        style={{ width:'100%', boxSizing:'border-box', border:'1px solid #E4E7EC', borderRadius:8, padding:'8px 10px', fontSize:12.5, fontFamily:'inherit', resize:'vertical', color:'var(--text-strong)' }} />
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
        <button disabled={busy} onClick={async () => { setBusy(true); await onReject(draft.id) }}
          style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#dc2626', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>Verwerfen</button>
        <button disabled={!canSend} onClick={async () => { setBusy(true); await onApprove(draft.id, text) }}
          style={{ padding:'7px 14px', borderRadius:8, border:'none', background:PRIMARY_VAR, color:'#fff', fontSize:12.5, fontWeight:700, cursor: canSend ? 'pointer' : 'default', opacity: canSend ? 1 : 0.6 }}>Freigeben &amp; senden</button>
      </div>
    </div>
  )
}

function ExtensionBanner({ connected = false, runningCount = 0, waitingCount = 0, onManage }) {
  const active  = runningCount > 0
  const waiting = waitingCount > 0
  const line  = active  ? `· verarbeitet ${runningCount} Job${runningCount !== 1 ? 's' : ''}`
              : waiting ? `· ${waitingCount} Job${waitingCount !== 1 ? 's' : ''} in Warteschlange`
              : '· bereit'
  const okBg  = connected ? '#ECFDF5' : '#FEF2F2'
  const okFg  = connected ? '#065F46' : '#991B1B'
  const okDot = connected ? '#22c55e' : '#f87171'
  return (
    <div style={{ ...cardStyle, marginBottom:20, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <div style={{ width:32, height:32, borderRadius:8, background:okBg, display:'flex', alignItems:'center', justifyContent:'center', color:connected ? '#16a34a' : '#dc2626' }}>
        <Globe size={16} />
      </div>
      <div style={{ flex:1, minWidth:240, fontSize:12, color:'var(--text-muted)' }}>
        <span style={{ fontWeight:700, color:'var(--text-strong)' }}>Serverseitige Automatisierung</span> {connected ? line : ''}
        <div style={{ marginTop:2 }}>{connected
          ? 'LinkedIn verbunden über Unipile — Kampagnen laufen serverseitig, kein Browser nötig.'
          : 'LinkedIn noch nicht verbunden — Kampagnen starten erst nach der Verbindung.'}</div>
      </div>
      <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:99, background:okBg, color:okFg, fontSize:11, fontWeight:700 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:okDot }}/>
        {connected ? 'Verbunden' : 'Nicht verbunden'}
      </span>
      <button onClick={onManage}
        style={{ ...ghostBtnStyle, cursor:'pointer', color:PRIMARY_VAR, borderColor:'rgba(49,90,231,0.35)', background:'rgba(49,90,231,0.06)' }}>
        <ExternalLink size={13} /> Verbindung verwalten
      </button>
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
          Keine Jobs in der Warteschlange — bereit, sobald du eine Kampagne startest
        </div>
      ) : (
        <div style={{ background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', overflowX:'auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 110px 140px 60px', minWidth:560, padding:'10px 16px', background:'var(--surface-muted, #F8FAFC)', borderBottom:'1px solid var(--border)', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', gap:8 }}>
            <div>Typ</div><div>Details</div><div>Status</div><div>Geplant</div><div></div>
          </div>
          {jobs.map((job, i) => {
            const info = STEP_TYPES[job.type] || STEP_TYPES[job.action] || { label:job.type || job.action, Icon:Zap, color:'#475569', bg:'#F1F5F9' }
            const Icon = info.Icon
            const detail = job.payload?.linkedin_url?.replace('https://www.linkedin.com/in/', '@') || job.target_url || ''
            return (
              <div key={job.id} style={{ display:'grid', gridTemplateColumns:'140px 1fr 110px 140px 60px', minWidth:560, padding:'10px 16px', borderBottom: i < jobs.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems:'center', gap:8, fontSize:12 }}>
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

// ─── Inline Wizard-Helpers (im BrandVoice-Stil) ───────────────────────────
function WIn({ value, onChange, placeholder, type='text', autoFocus, max, min }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type} value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} autoFocus={autoFocus} max={max} min={min}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width:'100%', padding:'11px 14px',
        border:'1.5px solid '+(focused ? PRIMARY_VAR : 'var(--border, #E5E7EB)'),
        borderRadius:10, fontSize:13.5, boxSizing:'border-box', outline:'none',
        background:'var(--surface, #fff)', fontFamily:'inherit',
        transition:'border-color .15s',
      }}
    />
  )
}
function WTx({ value, onChange, rows=3, placeholder }) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      value={value || ''} onChange={e => onChange(e.target.value)}
      rows={rows} placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width:'100%', padding:'11px 14px',
        border:'1.5px solid '+(focused ? PRIMARY_VAR : 'var(--border, #E5E7EB)'),
        borderRadius:10, fontSize:13.5, lineHeight:1.55, resize:'vertical',
        boxSizing:'border-box', outline:'none', background:'var(--surface, #fff)',
        fontFamily:'inherit', transition:'border-color .15s',
      }}
    />
  )
}
function WLb({ label, hint }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:11.5, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{label}</div>
      {hint && <div style={{ fontSize:12, color:'var(--text-soft, #9CA3AF)', lineHeight:1.5 }}>{hint}</div>}
    </div>
  )
}
function WSc({ title, hint, action, children }) {
  return (
    <section style={{
      width:'100%', boxSizing:'border-box',
      background:'var(--surface, #fff)', borderRadius:14,
      border:'1px solid var(--border, #E5E7EB)',
      marginBottom:16, overflow:'hidden',
      boxShadow:'0 1px 3px rgba(15,23,42,.04)',
    }}>
      <header style={{
        padding:'14px 20px', borderBottom:'1px solid var(--border-soft, #F1F5F9)',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
      }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary, #111827)', letterSpacing:'-.1px' }}>{title}</div>
          {hint && <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2 }}>{hint}</div>}
        </div>
        {action}
      </header>
      <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>{children}</div>
    </section>
  )
}

const STEP_LABELS = { template:'Vorlage', configure:'Sequenz & Name', source:'Quelle', list:'Liste' }

function NewCampaignWizard({
  step, setStep,
  newCamp, setNewCamp,
  sponsoringCampaigns = [],
  quickTemplates, pickTemplate,
  leads, uid,
  selectedLeads, setSelectedLeads,
  addStep, removeStep, updateStep,
  onClose, onCreate,
}) {
  const { isMobile } = useResponsive()
  const { activeTeamId } = useTeam() || {}
  const { lists: inboxLists, membersByList } = useInboxLists({ activeTeamId })
  const linkedinLeads = useMemo(() => leads.filter(l => l.linkedin_url), [leads])

  // Lead-Quelle (Waalaxy-artig): 'inbox_list' | 'all' | 'later'
  const [source, setSource]         = useState(null)
  const [sourceListId, setSourceListId] = useState('')
  const [listLeads, setListLeads]   = useState([]) // Fix 3: Member-Rows der gewählten Liste, DIREKT geladen (ungecappt)

  // Eligibility (b): inbox_ids die AKTUELL in einer aktiven Kampagne enrollt sind.
  // Nur laufende Kampagnen (active/paused) sperren Kontakte — gestoppte,
  // abgeschlossene und Entwurf-Kampagnen geben ihre Kontakte fürs Re-Targeting
  // wieder frei (Waalaxy-Regel „nicht aktuell in einer Kampagne").
  // Zwei-Schritt statt Embed (#4). automation_campaign_leads ist user-scoped
  // (kein team_id) → expliziter user_id-Filter statt nur RLS (#14).
  const [enrolledIds, setEnrolledIds] = useState(() => new Set())
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    ;(async () => {
      const { data: camps } = await supabase.from('automation_campaigns')
        .select('id').eq('user_id', uid).in('status', ['active', 'paused'])
      if (cancelled) return
      const activeIds = (camps || []).map(c => c.id)
      if (!activeIds.length) { setEnrolledIds(new Set()); return }
      const { data } = await supabase.from('automation_campaign_leads')
        .select('inbox_id').eq('user_id', uid).in('campaign_id', activeIds)
      if (cancelled) return
      setEnrolledIds(new Set((data || []).map(r => r.inbox_id).filter(Boolean)))
    })()
    return () => { cancelled = true }
  }, [uid])

  // Fix 3: bei gewählter Liste die Member-Rows DIREKT laden (ungecappt) statt gegen den
  // limit(300)-Pool zu matchen — entfernt die 300-Fragilität für Listen dauerhaft.
  useEffect(() => {
    if (source !== 'inbox_list' || !sourceListId) { setListLeads([]); return }
    const ids = [...(membersByList.get(sourceListId) || [])]
    if (!ids.length) { setListLeads([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('linkedin_inbox')
        .select('id,first_name,last_name,name,company,job_title,linkedin_url,li_connection_status')
        .in('id', ids).eq('review_status', 'new').not('linkedin_url', 'is', null)
      if (!cancelled) setListLeads(data || [])
    })()
    return () => { cancelled = true }
  }, [source, sourceListId, membersByList])

  // Kandidatenmenge je nach Quelle (Inbox-Kontakte mit linkedin_url).
  const candidates = useMemo(() => {
    if (source === 'inbox_list') return listLeads // Fix 3: direkt geladen, ungecappt
    return linkedinLeads // 'all' — team-gescopeter Pool (Fix 2)
  }, [source, listLeads, linkedinLeads])

  // Eligibility: (a) nicht bereits vernetzt, (b) nicht schon in einer Kampagne.
  const eligible = useMemo(
    () => candidates.filter(l => l.li_connection_status !== 'verbunden' && !enrolledIds.has(l.id)),
    [candidates, enrolledIds]
  )
  const excludedCount = candidates.length - eligible.length
  const eligibleIds = useMemo(() => eligible.map(l => l.id), [eligible])

  // Auswahl automatisch = alle zulässigen (kein manueller Auswahl-Screen mehr).
  // Greift, sobald die Quelle final ist: „Alle Inbox-Kontakte" oder gewählte Liste.
  useEffect(() => {
    if (source === 'all' || (source === 'inbox_list' && sourceListId)) {
      setSelectedLeads(eligibleIds)
    }
  }, [source, sourceListId, eligibleIds, setSelectedLeads])

  // Pfad ist dynamisch: der „Liste"-Schritt erscheint nur bei „Aus Inbox-Liste".
  // Der frühere „Auswahl"-Screen entfällt — der letzte Schritt jedes Pfads erstellt.
  const path = source === 'inbox_list'
    ? ['template', 'configure', 'source', 'list']
    : ['template', 'configure', 'source']
  const stepIndex = Math.max(path.indexOf(step), 0)
  const canConfigureNext = !!newCamp.name?.trim() && !!newCamp.sequence?.length
  // Erstellen möglich, sobald die Quelle final ist (Alle-Karte bzw. Liste gewählt).
  const canCreate = (step === 'source' && source === 'all') || (step === 'list' && !!sourceListId)
  const WIZARD_STEPS = path.map(s => ({
    label: STEP_LABELS[s],
    sub: ((s === 'source' && source === 'all') || (s === 'list' && sourceListId)) && selectedLeads.length
      ? `${selectedLeads.length} zulässig` : undefined,
  }))

  // Beim (Wieder-)Betreten der Quelle: Auswahl + Quelle zurücksetzen → sauberes
  // Branching (und „Später" erstellt garantiert ohne Leads).
  function goSource() {
    setSource(null); setSourceListId(''); setSelectedLeads([]); setStep('source')
  }

  function goToStep(n) {
    const target = path[n - 1]
    if (!target) return
    if ((target === 'source' || target === 'list') && !canConfigureNext) return
    if (target === 'list' && !source) return
    setStep(target)
  }

  function nextStep() {
    if (step === 'template') setStep('configure')
    else if (step === 'configure') { if (canConfigureNext) goSource() }
    // 'source' verzweigt über Karten, 'list' erstellt über den Footer.
  }
  function prevStep() {
    if (step === 'configure') setStep('template')
    else if (step === 'source') setStep('configure')
    else if (step === 'list') goSource()
    else onClose()
  }

  // Inline-Eligibility-Hinweis für den letzten Schritt (still, ohne Auswahl-Screen).
  function renderEligibility() {
    if (eligible.length === 0) {
      return (
        <div style={{ fontSize:12.5, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px', lineHeight:1.5 }}>
          Keine zulässigen Kontakte{excludedCount > 0 ? ` — ${excludedCount} ausgeschlossen (bereits vernetzt oder in Kampagne)` : ''}. Du kannst die Kampagne trotzdem als Entwurf ohne Leads erstellen.
        </div>
      )
    }
    return (
      <div style={{ fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5 }}>
        <strong style={{ color:PRIMARY_VAR }}>{eligible.length}</strong> zulässige Kontakt(e) werden hinzugefügt{excludedCount > 0 ? `, ${excludedCount} ausgeschlossen (bereits vernetzt oder in Kampagne)` : ''}.
      </div>
    )
  }

  const footer = (
    <>
      <button onClick={prevStep} style={ghostBtnStyle}>
        <ChevronLeft size={14} /> {step === 'template' ? 'Abbrechen' : 'Zurück'}
      </button>
      <div style={{ fontSize:12, color:'var(--text-muted)' }}>
        Schritt {stepIndex + 1} von {path.length}
      </div>
      {canCreate ? (
        <button onClick={onCreate} style={primaryBtnStyle}>
          <Zap size={14} /> Kampagne erstellen{selectedLeads.length > 0 ? ` (${selectedLeads.length} Lead${selectedLeads.length === 1 ? '' : 's'})` : ''}
        </button>
      ) : step === 'source' ? (
        <span style={{ width:1 }} />
      ) : step === 'list' ? (
        <button disabled style={{ ...primaryBtnStyle, opacity:0.5, cursor:'not-allowed' }}>
          <Zap size={14} /> Kampagne erstellen
        </button>
      ) : (
        <button onClick={nextStep} disabled={step === 'configure' && !canConfigureNext}
          style={{ ...primaryBtnStyle, opacity:(step === 'configure' && !canConfigureNext) ? 0.5 : 1, cursor:(step === 'configure' && !canConfigureNext) ? 'not-allowed' : 'pointer' }}>
          Weiter <ChevronRight size={14} />
        </button>
      )}
    </>
  )

  return (
    <WizardLayout
      eyebrow="Automatisierung · Neue Kampagne"
      title="LinkedIn-Sequenz starten"
      subtitle="Vorlage wählen, Sequenz und Limits festlegen, Leads zuweisen — in unter zwei Minuten."
      steps={WIZARD_STEPS}
      currentStep={stepIndex + 1}
      onStepClick={goToStep}
      onBack={onClose}
      footer={footer}
    >
      {step === 'template' && (
        <WSc
          title="Schritt 1: Welche Sequenz?"
          hint="Wähle eine bewährte Vorlage oder baue von Grund auf — du kannst alles im nächsten Schritt anpassen."
        >
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
            {quickTemplates.map(t => (
              <button key={t.id} onClick={() => pickTemplate(t)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = PRIMARY_VAR; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(49,90,231,0.10)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #E5E7EB)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,.04)' }}
                style={{
                  textAlign:'left', cursor:'pointer', padding:'16px 18px',
                  borderRadius:12, border:'1.5px solid var(--border, #E5E7EB)',
                  background:'var(--surface, #fff)', display:'flex', flexDirection:'column', gap:10,
                  boxShadow:'0 1px 2px rgba(15,23,42,.04)',
                  transition:'all .15s ease',
                }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:36, height:36, borderRadius:10, background:'rgba(49,90,231,0.10)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:PRIMARY_VAR }}>
                    <t.Icon size={17} />
                  </span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong)', lineHeight:1.2 }}>{t.label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{t.sequence.length} Schritt{t.sequence.length === 1 ? '' : 'e'}</div>
                  </div>
                </div>
                <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{t.description}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {t.sequence.map((s, i) => {
                    const info = STEP_TYPES[s.type]
                    const Icon = info?.Icon
                    return (
                      <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10.5, padding:'3px 8px', borderRadius:6, background:info?.bg, color:info?.color, fontWeight:700 }}>
                        {Icon && <Icon size={11} />} {info?.label || s.type}
                      </span>
                    )
                  })}
                </div>
              </button>
            ))}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 0' }}>
            <div style={{ flex:1, height:1, background:'var(--border-soft, #F1F5F9)' }}/>
            <span style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>oder</span>
            <div style={{ flex:1, height:1, background:'var(--border-soft, #F1F5F9)' }}/>
          </div>

          <button onClick={() => setStep('configure')}
            style={{ width:'100%', padding:'14px', borderRadius:12, border:'1.5px dashed var(--border, #E5E7EB)', background:'transparent', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <Plus size={14} /> Leere Sequenz öffnen
          </button>
        </WSc>
      )}

      {step === 'configure' && (
        <>
          <WSc title="Schritt 2: Kampagne benennen" hint="Der Name hilft dir, die Kampagne in der Liste wiederzufinden. Beschreibung ist optional.">
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 3fr', gap:14 }}>
              <div>
                <WLb label="Kampagnenname *" />
                <WIn value={newCamp.name} onChange={v => setNewCamp(p => ({ ...p, name:v }))}
                  placeholder="z.B. Outreach Q2 Entscheider" autoFocus />
              </div>
              <div>
                <WLb label="Beschreibung" hint="Optional — für deine Übersicht in der Liste" />
                <WIn value={newCamp.description} onChange={v => setNewCamp(p => ({ ...p, description:v }))}
                  placeholder="z.B. Cold Outreach an HR-Leiter aus E-Commerce" />
              </div>
            </div>
            {sponsoringCampaigns.length > 0 && (
              <div style={{ marginTop:14 }}>
                <WLb label="Sponsoring-Kampagne (optional)" hint="Ordne diesen Outreach einer Sponsoring-Kampagne zu — er läuft dann unter dieser Kampagne." />
                <select value={newCamp.sponsoring_campaign_id || ''} onChange={e => setNewCamp(p => ({ ...p, sponsoring_campaign_id:e.target.value }))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-primary, #111827)', fontSize:14, outline:'none' }}>
                  <option value="">— keine —</option>
                  {sponsoringCampaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            )}
          </WSc>

          <WSc title="Limits & Arbeitszeit" hint="Wie viele Aktionen pro Tag und wann darf die Extension senden? Sinnvolle Defaults sind 20/Tag, 8–20 Uhr.">
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:14 }}>
              <div>
                <WLb label="Tageslimit pro Aktion" />
                <WIn type="number" value={newCamp.settings.daily_limit}
                  onChange={v => setNewCamp(p => ({ ...p, settings:{ ...p.settings, daily_limit:Number(v) } }))}
                  min="1" max="50" />
              </div>
              <div>
                <WLb label="Arbeitszeit ab (Uhr)" />
                <WIn type="number" value={newCamp.settings.working_hours_start}
                  onChange={v => setNewCamp(p => ({ ...p, settings:{ ...p.settings, working_hours_start:Number(v) } }))}
                  min="0" max="23" />
              </div>
              <div>
                <WLb label="Arbeitszeit bis (Uhr)" />
                <WIn type="number" value={newCamp.settings.working_hours_end}
                  onChange={v => setNewCamp(p => ({ ...p, settings:{ ...p.settings, working_hours_end:Number(v) } }))}
                  min="1" max="23" />
              </div>
            </div>
          </WSc>

          <WSc
            title="Sequenz"
            hint="Aktionen werden in dieser Reihenfolge ausgeführt. Wait-Steps dazwischen definieren die Verzögerung."
            action={
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => addStep('send_message')} style={ghostBtnStyle}><Plus size={12} /> Aktion</button>
                <button onClick={() => addStep('wait')}         style={ghostBtnStyle}><Hourglass size={12} /> Warten</button>
              </div>
            }
          >
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {newCamp.sequence.map((s, i) => (
                <StepRow key={i} idx={i} step={s} onChange={(k, v) => updateStep(i, k, v)} onRemove={() => removeStep(i)} canRemove={newCamp.sequence.length > 1} />
              ))}
              {newCamp.sequence.length === 0 && (
                <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:12, border:'1.5px dashed var(--border)', borderRadius:10 }}>
                  Noch keine Schritte. Füge eine Aktion oder einen Wait-Step hinzu.
                </div>
              )}
            </div>
          </WSc>
        </>
      )}

      {step === 'source' && (
        <WSc title="Schritt 3: Lead-Quelle" hint="Woher sollen die Kontakte für diese Kampagne kommen? Wähle eine Option.">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:12 }}>
            {[
              { key:'inbox_list', Icon:ListChecks, label:'Aus Inbox-Liste',     desc:'Kontakte aus einer gespeicherten Inbox-Liste wählen.' },
              { key:'all',        Icon:Users,      label:'Alle Inbox-Kontakte', desc:'Alle offenen Inbox-Kontakte mit LinkedIn-URL — alle zulässigen werden automatisch übernommen.' },
              { key:'later',      Icon:Clock,      label:'Später hinzufügen',   desc:'Kampagne als Entwurf ohne Leads anlegen — Kontakte kommen später.' },
            ].map(opt => {
              const active = source === opt.key
              return (
              <button key={opt.key}
                onClick={() => {
                  if (opt.key === 'inbox_list') { setSource('inbox_list'); setSourceListId(''); setSelectedLeads([]); setStep('list') }
                  else if (opt.key === 'all')   { setSource('all') }
                  else                          { setSource('later'); setSelectedLeads([]); onCreate() }
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = PRIMARY_VAR; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = active ? PRIMARY_VAR : 'var(--border, #E5E7EB)'; e.currentTarget.style.transform = 'translateY(0)' }}
                style={{ textAlign:'left', cursor:'pointer', padding:'16px 18px', borderRadius:12, border:`1.5px solid ${active ? PRIMARY_VAR : 'var(--border, #E5E7EB)'}`, background: active ? 'rgba(49,90,231,0.06)' : 'var(--surface, #fff)', display:'flex', flexDirection:'column', gap:10, boxShadow:'0 1px 2px rgba(15,23,42,.04)', transition:'all .15s ease' }}>
                <span style={{ width:36, height:36, borderRadius:10, background:'rgba(49,90,231,0.10)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:PRIMARY_VAR }}>
                  <opt.Icon size={17} />
                </span>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong)' }}>{opt.label}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{opt.desc}</div>
                {opt.key === 'inbox_list' && inboxLists.length === 0 && (
                  <div style={{ fontSize:11, color:'#B45309', fontStyle:'italic' }}>Noch keine Inbox-Listen angelegt.</div>
                )}
              </button>
              )
            })}
          </div>
          {source === 'all' && (
            <div style={{ marginTop:4 }}>{renderEligibility()}</div>
          )}
        </WSc>
      )}

      {step === 'list' && (
        <WSc title="Schritt 4: Inbox-Liste wählen" hint="Nur Kontakte dieser Liste kommen als Kandidaten in die Auswahl.">
          {inboxLists.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13, border:'1.5px dashed var(--border)', borderRadius:10 }}>
              Noch keine Inbox-Listen. Lege welche in der LinkedIn-Inbox an („Zu Liste").
            </div>
          ) : (
            <>
              <WLb label="Inbox-Liste" hint="Zahl in Klammern = Anzahl Kontakte in der Liste." />
              <select value={sourceListId} onChange={e => setSourceListId(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-primary, #111827)', fontSize:14, outline:'none' }}>
                <option value="">— Liste wählen —</option>
                {inboxLists.map(l => {
                  const cnt = (membersByList.get(l.id) || new Set()).size
                  return <option key={l.id} value={l.id}>{l.name} ({cnt})</option>
                })}
              </select>
              {sourceListId && (
                <div style={{ marginTop:4 }}>{renderEligibility()}</div>
              )}
            </>
          )}
        </WSc>
      )}

    </WizardLayout>
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
