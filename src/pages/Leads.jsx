// CRM Unified: first_name, last_name, job_title, status Lead/LQL/MQN/MQL/SQL
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useResponsive } from '../hooks/useResponsive'
import { useTeam } from '../context/TeamContext'
import LeadRow from './LeadRow'

function relDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso), now = new Date()
  const days = Math.floor((now - d) / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  if (days < 7)  return `${days} Tage`
  if (days < 30) return `${Math.floor(days/7)} Wo.`
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'short' })
}
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import LeadDrawer from '../components/LeadDrawer'
import OrganizationPicker from '../components/OrganizationPicker'
const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const STATUS_OPTIONS = ['Lead', 'LQL', 'MQL', 'MQN', 'SQL']
const STATUS_LABELS = { Lead:'Lead', LQL:'Light QL', MQL:'Marketing QL', MQN:'Marketing Nurture', SQL:'Sales QL' }
const STATUS_STYLE = {
  Lead: { bg:'rgb(238,241,252)', color:'var(--text-primary)', border:'#CBD5E1' },
  LQL:  { bg:'rgba(0,48,96,0.08)', color: 'var(--primary)', border:'rgba(0,48,96,0.2)' },
  MQN:  { bg:'#F5F3FF', color:'#6D28D9', border:'#DDD6FE' },
  MQL:  { bg:'#FFFBEB', color:'#B45309', border:'#FDE68A' },
  SQL:  { bg:'#F0FDF4', color:'#15803D', border:'#BBF7D0' },
}
const LIST_COLORS = ['var(--wl-primary, rgb(0,48,96))','#10B981','#F59E0B','#EF4444','#8B5CF6','#0891B2','#EC4899','#374151']

// STAGE_LABEL auf Modul-Ebene — wird in Bulk-Actions-Bar für option labels genutzt.
// STAGE_COLOR ist nicht mehr hier nötig (nur noch in LeadRow.jsx verwendet).
const STAGE_LABEL = {
  kein_deal:'Neu', neu:'Neu', prospect:'Kontaktiert', kontaktiert:'Kontaktiert',
  opportunity:'Gespräch', gespraech:'Gespräch', qualifiziert:'Qualifiziert',
  angebot:'Angebot', verhandlung:'Verhandlung',
  gewonnen:'Gewonnen', verloren:'Verloren',
  stage_custom1:'Stage 1', stage_custom2:'Stage 2', stage_custom3:'Stage 3'
}

const PlusIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const FilterIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
const SearchIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const ChevronDown = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
const XIcon      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const LiIcon     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--wl-primary, rgb(0,48,96))"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
const MailIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>
const PhoneIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const NoteIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
const TagIcon    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
const ListIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>

/* —— Helpers —— */
function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)
}

function Avatar({ name, avatar_url, size = 40, fontSize = 15 }) {
  const colors = ['var(--wl-primary, rgb(0,48,96))','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2','#EF4444','#374151']
  const idx = (name || '').charCodeAt(0) % colors.length
  const bg  = colors[idx]
  if (avatar_url) return (
    <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  )
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'linear-gradient(135deg,'+bg+','+bg+'CC)', display:'flex', alignItems:'center', justifyContent:'center', fontSize, fontWeight:800, color:'#fff', flexShrink:0, letterSpacing:'-0.5px' }}>
      {initials(name)}
    </div>
  )
}

/* —— Status Badge —— */
function StatusBadge({ status, small }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Lead
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:small?'2px 8px':'4px 12px', borderRadius:999, fontSize:small?10:11, fontWeight:700, background:s.bg, color:s.color, border:'1px solid '+s.border, whiteSpace:'nowrap' }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

/* —— Modal wrapper —— */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'rgb(20,20,43)' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-soft)', display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:6 }}>
            <XIcon/>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ——————————————————————————————————————————
   LEAD PROFILE PANEL (Waalaxy-style)
—————————————————————————————————————————— */
export default function Leads({ session }) {
  const navigate = useNavigate()

  // ── Responsive Breakpoints ──────────────────────────────
  const { t } = useTranslation()
  const { isMobile } = useResponsive()
  const { team, activeTeamId, members, shareLeadWithTeam, unshareLeadFromTeam, shareListWithTeam, isAdmin } = useTeam()
  const [windowW, setWindowW] = useState(window.innerWidth)
  useEffect(() => {
    const handler = () => setWindowW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const isNotebook = windowW <= 1280  // 13-14" Notebooks
  const isSmall    = windowW <= 1100  // sehr kleine Screens

  const [leads,       setLeads]       = useState([])
  const [filtered,    setFiltered]    = useState([])
  const [lists,       setLists]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState('date')
  const [listFilter,  setListFilter]  = useState('all')
  const [selectedLead, setSelectedLead] = useState(null)
  const [modal,       setModal]       = useState(null)   // 'add' | 'list'
  const [form,        setForm]        = useState({})
  const [listForm,    setListForm]    = useState({})
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState(null)
  const [quickFilter, setQuickFilter] = useState(null)
  const [stageTab,    setStageTab]    = useState(null) // null=Alle, 'kontaktiert'|'gespräch'|'angebot'|'gewonnen'
  const [importModal, setImportModal] = useState(false)
  const [importing,   setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [compact, setCompact] = useState(false) // 'hot' | 'pipeline' | 'highscore'
  const [listMenuLead, setListMenuLead] = useState(null) // lead.id für das offene Listen-Dropdown

  useEffect(() => { loadAll() }, [activeTeamId])

  // Keyboard Shortcuts: N = Neuer Lead, / = Suche fokussieren
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('add'); setForm({ status:'Lead' }) }
      if (e.key === '/') { e.preventDefault(); document.querySelector('input[placeholder*="Name"]')?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Schließe Listen-Dropdown bei Klick außerhalb
  useEffect(() => {
    if (!listMenuLead) return
    const handler = e => {
      if (!e.target.closest('[data-list-menu]')) setListMenuLead(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [listMenuLead])

  async function loadAll() {
    setLoading(true)
    const uid = session.user.id
    // Team-Kontext: wenn aktives Team → Leads des Teams laden
    // Kein Team → eigene private Leads
    const tid = activeTeamId
    const [{ data:ld }, { data:ls }] = await Promise.all([
      tid
        ? supabase.from('leads').select('*, organizations(id,name), lead_list_members(list_id,lead_id)').eq('team_id', tid).order('created_at', { ascending:false })
        : supabase.from('leads').select('*, organizations(id,name), lead_list_members(list_id,lead_id)').eq('user_id', uid).is('team_id', null).order('created_at', { ascending:false }),
      tid
        ? supabase.from('lead_lists').select('*, lead_list_members(lead_id)').eq('team_id', tid).order('created_at', { ascending:true })
        : supabase.from('lead_lists').select('*, lead_list_members(lead_id)').eq('user_id', uid).is('team_id', null).order('created_at', { ascending:true }),
    ])
    setLeads(ld || [])
    applyFilter(ld || [], search, listFilter, sortBy)
    setLists(ls || [])
    setLoading(false)
  }

  function applyFilter(src, q, lf, sb, qf) {
    let res = src
    if (q) {
      const ql = q.toLowerCase()
      res = res.filter(l => (fullName(l)||'').toLowerCase().includes(ql) || (l.company||'').toLowerCase().includes(ql) || (l.job_title||'').toLowerCase().includes(ql) || (l.email||'').toLowerCase().includes(ql))
    }
    if (lf !== 'all') res = res.filter(l => l.lead_list_members?.some(m => m.list_id === lf))
    const qFilter = qf !== undefined ? qf : quickFilter
    if (qFilter === 'hot')       res = res.filter(l => (l.hs_score||0) >= 70)
    if (qFilter === 'pipeline')  res = res.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal' && l.deal_stage !== 'verloren')
    if (qFilter === 'highscore') res = res.filter(l => (l.hs_score || 0) >= 70)
    if (qFilter === 'favorite')    res = res.filter(l => !!l.is_favorite)
    if (qFilter === 'no_followup') res = res.filter(l => !l.next_followup || new Date(l.next_followup) < new Date())
    if (qFilter === 'nofollowup')  res = res.filter(l => !l.next_followup)
    if (qFilter === 'followup_today') res = res.filter(l => l.next_followup && new Date(l.next_followup).toDateString()===new Date().toDateString())
    if (qFilter === 'overdue') res = res.filter(l => l.next_followup && new Date(l.next_followup) < new Date())
    if (qFilter === 'team')        res = res.filter(l => l.is_shared === true)
    // Stage-Tab Filter (unabhängig von quickFilter)
    const st = arguments[5] !== undefined ? arguments[5] : stageTab
    if (st === 'kontaktiert') res = res.filter(l => ['prospect','kontaktiert'].includes(l.deal_stage))
    if (st === 'gespräch')    res = res.filter(l => ['opportunity','gespraech'].includes(l.deal_stage))
    if (st === 'angebot')     res = res.filter(l => ['angebot','verhandlung','qualifiziert'].includes(l.deal_stage))
    if (st === 'gewonnen')    res = res.filter(l => l.deal_stage === 'gewonnen')
    if (sb === 'score' || sb === '-score')  res = [...res].sort((a,b) => sb==='-score' ? (a.hs_score||0)-(b.hs_score||0) : (b.hs_score||0)-(a.hs_score||0))
    else if (sb === 'name' || sb === '-name') {
      res = [...res].sort((a,b) => {
        const na = ((a.first_name||'')+' '+(a.last_name||'')).trim()||a.name||''
        const nb = ((b.first_name||'')+' '+(b.last_name||'')).trim()||b.name||''
        return sb==='-name' ? nb.localeCompare(na,'de') : na.localeCompare(nb,'de')
      })
    }
    else if (sb === 'stage' || sb === '-stage') res = [...res].sort((a,b) => sb==='-stage' ? (b.deal_stage||'').localeCompare(a.deal_stage||'') : (a.deal_stage||'').localeCompare(b.deal_stage||''))
    else if (sb === 'status') res = [...res].sort((a,b) => STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status))
    else if (sb === 'followup') res = [...res].sort((a,b) => {
      if (!a.next_followup && !b.next_followup) return 0
      if (!a.next_followup) return 1
      if (!b.next_followup) return -1
      return new Date(a.next_followup) - new Date(b.next_followup)
    })
    else if (sb === 'favorite') res = [...res].sort((a,b) => (b.is_favorite?1:0)-(a.is_favorite?1:0))
    else if (sb === 'updated') res = [...res].sort((a,b) => new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at))
    else if (sb === 'lastact') res = [...res].sort((a,b) => new Date(b.li_last_interaction_at||b.updated_at||b.created_at) - new Date(a.li_last_interaction_at||a.updated_at||a.created_at))
    setFiltered(res)
  }

  function handleSearch(v)     { setSearch(v);     applyFilter(leads, v, listFilter, sortBy) }
  function handleFilter(v)     { setListFilter(v); applyFilter(leads, search, v, sortBy) }
  function handleSort(v)       { setSortBy(v);     applyFilter(leads, search, listFilter, v) }
  function handleQuickFilter(v) {
    const next = quickFilter === v ? null : v
    setQuickFilter(next)
    applyFilter(leads, search, listFilter, sortBy, next)
  }

  function exportCSV() {
    const headers = ['Vorname','Nachname','E-Mail','Telefon','Unternehmen','Position','Status','Stage','Deal-Wert (€)','Score','Buying Intent','Verbindungsstatus','Next Follow-up','LinkedIn','Erstellt']
    const rows = [headers]
    filtered.forEach(l => {
      const fname = l.first_name || (l.name||'').split(' ')[0] || ''
      const lname = l.last_name  || (l.name||'').split(' ').slice(1).join(' ') || ''
      rows.push([
        fname, lname, l.email||'', l.phone||'',
        l.company||'', l.job_title||l.headline||'',
        l.status||'', l.deal_stage||'', l.deal_value||'',
        l.hs_score||0, l.ai_buying_intent||'',
        l.li_connection_status||'',
        l.next_followup ? new Date(l.next_followup).toLocaleDateString('de-DE') : '',
        l.profile_url||l.linkedin_url||'',
        l.created_at ? new Date(l.created_at).toLocaleDateString('de-DE') : ''
      ])
    })
    const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'}))
    a.download = 'leads-'+new Date().toISOString().slice(0,10)+'.csv'
    a.click()
  }

  const showFlash = useCallback((msg, type='success') => { setFlash({msg,type}); setTimeout(()=>setFlash(null),3000) }, [])

  async function handleAddLead(e) {
    e.preventDefault()
    // Name aufteilen in first_name / last_name
    const nameParts = (form.name||'').trim().split(' ')
    const first_name = nameParts[0] || form.first_name || ''
    const last_name  = nameParts.slice(1).join(' ') || form.last_name || ''
    if (!first_name && !last_name) return showFlash('Name ist Pflicht', 'error')
    setSaving(true)
    const fullName = [first_name, last_name].filter(Boolean).join(' ').trim() || form.email || 'Unbekannt'
    const insertData = { ...form, first_name, last_name, name: fullName, user_id: session.user.id, status: form.status||'Lead', ...(activeTeamId ? { team_id: activeTeamId } : {}) }
    const { data, error } = await supabase.from('leads').insert(insertData).select().single()
    setSaving(false)
    if (error) return showFlash(error.message, 'error')
    const updated = [data, ...leads]
    setLeads(updated)
    applyFilter(updated, search, listFilter, sortBy)
    setModal(null); setForm({})
    showFlash('Lead erfolgreich hinzugefügt!')
  }

  async function handleAddList(e) {
    e.preventDefault()
    if (!listForm.name) return
    setSaving(true)
    const { data } = await supabase.from('lead_lists').insert({ name:listForm.name, color:listForm.color||LIST_COLORS[lists.length%LIST_COLORS.length], user_id:session.user.id, ...(activeTeamId ? { team_id: activeTeamId } : {}) }).select().single()
    setSaving(false)
    if (data) { setLists(l=>[...l,data]); setModal(null); setListForm({}) }
  }

  async function handleCsvImport(file) {
    setImporting(true); setImportResult(null)
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { setImporting(false); return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g,''))
    const col = (name) => headers.indexOf(name)
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''))
      const first = vals[col('first_name')] || vals[col('vorname')] || ''
      const last  = vals[col('last_name')]  || vals[col('nachname')] || ''
      const mail  = vals[col('email')] || ''
      return {
        first_name: first,
        last_name:  last,
        name:       [first, last].filter(Boolean).join(' ').trim() || mail || 'Unbekannt',
        email:      mail,
        job_title:  vals[col('job_title')] || vals[col('position')] || vals[col('titel')] || '',
        company:    vals[col('company')]    || vals[col('firma')] || vals[col('unternehmen')] || '',
        profile_url:vals[col('profile_url')]|| vals[col('linkedin')] || vals[col('linkedin_url')] || '',
        user_id: session.user.id,
        status: 'Lead',
        ...(activeTeamId ? { team_id: activeTeamId } : {}),
      }
    }).filter(r => r.first_name || r.last_name || r.email)
    if (!rows.length) { setImporting(false); setImportResult({ error: 'Keine gültigen Zeilen gefunden.' }); return }
    const { data, error } = await supabase.from('leads').insert(rows).select()
    setImporting(false)
    if (error) { setImportResult({ error: error.message }); return }
    const updated = [...(data||[]), ...leads]
    setLeads(updated); applyFilter(updated, search, listFilter, sortBy)
    setImportResult({ count: data?.length || 0 })
    showFlash(`${data?.length || 0} Leads importiert!`)
  }

  function handleLeadUpdate(updated) {
    const next = leads.map(l => l.id===updated.id ? updated : l)
    setLeads(next)
    applyFilter(next, search, listFilter, sortBy)
    if (selectedLead?.id === updated.id) setSelectedLead(updated)
  }

  function handleLeadDelete(id) {
    const next = leads.filter(l => l.id !== id)
    setLeads(next)
    applyFilter(next, search, listFilter, sortBy)
    if (selectedLead?.id === id) setSelectedLead(null)
  }

  const inp = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'var(--surface)', width:'100%' }
  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }


  // ── Hover-State für Row-Menü ──────────────────────────────
  const [hoveredId, setHoveredId] = useState(null)
  const [rowMenuId, setRowMenuId] = useState(null)
  const [fuPickerId, setFuPickerId] = useState(null)
  const [stagePickerId, setStagePickerId] = useState(null)
  const [listDropOpen, setListDropOpen] = useState(false)
  const [sortDropOpen, setSortDropOpen] = useState(false)

  // Schließe Sort-Dropdown bei Klick außen
  useEffect(() => {
    if (!sortDropOpen) return
    const h = e => { if (!e.target.closest('[data-sort-drop]')) setSortDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [sortDropOpen])

  // Schließe Listen-Dropdown bei Klick außen
  useEffect(() => {
    if (!listDropOpen) return
    const h = e => { if (!e.target.closest('[data-list-drop]')) setListDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [listDropOpen])

  // Row-Menü Schließen via Overlay (kein mousedown race condition)
  // Der Overlay wird unterhalb des Menüs gerendert

  // ── Handler für LeadRow (stabil via useCallback) ────────────
  // Pattern: setX(prev => ...) damit keine State-Dependency nötig ist.
  // filteredIdsRef hält aktuelle IDs für sessionStorage-Navigation, ohne
  // dass navigate-Handler bei jedem filtered-Change neu erzeugt wird.
  const filteredIdsRef = useRef([])
  useEffect(() => { filteredIdsRef.current = filtered.map(l => l.id) }, [filtered])

  // Delete-Handler braucht applyFilter + aktuelle Filter-State-Werte.
  // Refs vermeiden, dass der Handler bei jedem Filter-Change neu erzeugt wird.
  const applyFilterRef = useRef(null)
  useEffect(() => { applyFilterRef.current = applyFilter })
  const filterStateRef = useRef(null)
  useEffect(() => { filterStateRef.current = { search, listFilter, sortBy } })
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session })
  const teamRef = useRef(team)
  useEffect(() => { teamRef.current = team })

  const handleSelect = useCallback(lead => {
    setSelectedLead(prev => prev?.id === lead.id ? null : lead)
  }, [])

  const handleToggleCheck = useCallback((leadId, checked) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (checked) n.add(leadId); else n.delete(leadId)
      return n
    })
  }, [])

  const handleHoverEnter = useCallback(leadId => setHoveredId(leadId), [])
  const handleHoverLeave = useCallback(() => setHoveredId(null), [])

  const handleToggleStagePicker = useCallback(leadId => {
    setStagePickerId(prev => prev === leadId ? null : leadId)
  }, [])

  const handleStageChange = useCallback(async (leadId, newStage, oldStage) => {
    // Optimistic update
    setLeads(ls => ls.map(l => l.id === leadId ? { ...l, deal_stage: newStage } : l))
    setFiltered(ls => ls.map(l => l.id === leadId ? { ...l, deal_stage: newStage } : l))
    const { error } = await supabase.from('leads').update({ deal_stage: newStage }).eq('id', leadId)
    if (error) {
      // Rollback
      setLeads(ls => ls.map(l => l.id === leadId ? { ...l, deal_stage: oldStage } : l))
      setFiltered(ls => ls.map(l => l.id === leadId ? { ...l, deal_stage: oldStage } : l))
    }
    setStagePickerId(null)
  }, [])

  const handleToggleFuPicker = useCallback(leadId => {
    setFuPickerId(prev => prev === leadId ? null : leadId)
  }, [])

  const handleFollowupSet = useCallback(async (leadId, iso, label) => {
    await supabase.from('leads').update({ next_followup: iso }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, next_followup: iso } : l))
    setFiltered(prev => prev.map(l => l.id === leadId ? { ...l, next_followup: iso } : l))
    setFuPickerId(null)
    setRowMenuId(null)
    showFlash(`📅 Follow-up: ${label}`, 'success')
  }, [showFlash])

  const handleFollowupClear = useCallback(async leadId => {
    await supabase.from('leads').update({ next_followup: null }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, next_followup: null } : l))
    setFiltered(prev => prev.map(l => l.id === leadId ? { ...l, next_followup: null } : l))
    setFuPickerId(null)
    setRowMenuId(null)
  }, [])

  const handleToggleRowMenu = useCallback(leadId => {
    setRowMenuId(prev => prev === leadId ? null : leadId)
  }, [])

  const handleLogCall = useCallback(async leadId => {
    setRowMenuId(null)
    const uid = sessionRef.current?.user?.id
    if (!uid) return
    await supabase.from('activities').insert({
      lead_id: leadId, user_id: uid, type: 'call',
      subject: 'Anruf', direction: 'outbound',
      occurred_at: new Date().toISOString(),
    })
    showFlash('📞 Anruf geloggt', 'success')
  }, [showFlash])

  const handleToggleFavorite = useCallback(async (leadId, newValue) => {
    setRowMenuId(null)
    await supabase.from('leads').update({ is_favorite: newValue }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, is_favorite: newValue } : l))
  }, [])

  const handleToggleListMembership = useCallback(async (leadId, list, currentlyIn) => {
    setRowMenuId(null)
    if (currentlyIn) {
      await supabase.from('lead_list_members').delete().eq('lead_id', leadId).eq('list_id', list.id)
      setLeads(prev => prev.map(l => l.id === leadId
        ? { ...l, lead_list_members: (l.lead_list_members || []).filter(m => m.list_id !== list.id) }
        : l))
    } else {
      await supabase.from('lead_list_members').insert({ lead_id: leadId, list_id: list.id })
      setLeads(prev => prev.map(l => l.id === leadId
        ? { ...l, lead_list_members: [...(l.lead_list_members || []), { list_id: list.id, lead_id: leadId }] }
        : l))
    }
  }, [])

  const handleToggleTeamShare = useCallback(async (leadId, currentlyShared) => {
    setRowMenuId(null)
    const t = teamRef.current
    if (currentlyShared) {
      await unshareLeadFromTeam(leadId)
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, is_shared: false, team_id: null } : l))
    } else {
      await shareLeadWithTeam(leadId)
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, is_shared: true, team_id: t?.id } : l))
    }
  }, [shareLeadWithTeam, unshareLeadFromTeam])

  const handleUnshare = useCallback(async leadId => {
    await unshareLeadFromTeam(leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, is_shared: false, team_id: null } : l))
  }, [unshareLeadFromTeam])

  const handleDelete = useCallback(async leadId => {
    setRowMenuId(null)
    if (!window.confirm('Lead löschen?')) return
    await supabase.from('leads').delete().eq('id', leadId)
    setLeads(prev => {
      const next = prev.filter(l => l.id !== leadId)
      const fs = filterStateRef.current
      if (applyFilterRef.current && fs) applyFilterRef.current(next, fs.search, fs.listFilter, fs.sortBy)
      return next
    })
  }, [])

  const handleNavigateToProfile = useCallback(leadId => {
    setRowMenuId(null)
    sessionStorage.setItem('llr_lead_nav', JSON.stringify(filteredIdsRef.current))
    navigate(`/leads/${leadId}`)
  }, [navigate])

  const allListsOption = { id:'all', name:'Alle Leads', color: 'var(--primary)' }
  const listOptions = [allListsOption, ...lists]
  const activeList = listOptions.find(l => l.id === listFilter) || allListsOption

  // KPIs
  const hotCount = leads.filter(l=>(l.hs_score||0)>=70).length
  const followupToday = leads.filter(l=>{ if(!l.next_followup) return false; return new Date(l.next_followup).toDateString()===new Date().toDateString() }).length
  const avgScore = leads.length ? Math.round(leads.reduce((s,l)=>s+(l.hs_score||0),0)/leads.length) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height: isMobile ? undefined : 'calc(100vh - 0px)', overflow:'hidden', background:'var(--surface)' }}>

      {/* ─── Topbar ─────────────────────────────────────── */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid #E8EDF2', flexShrink:0, padding:'10px 20px', display:'flex', gap:10, alignItems:'center' }}>

          {/* Suche */}
          <div style={{ flex:1, position:'relative', maxWidth:460 }}>
            <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-soft)', pointerEvents:'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Name, Firma, Position…"
              style={{ width:'100%', padding:'8px 12px 8px 32px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', background:'var(--surface-muted)', color:'rgb(20,20,43)', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='var(--wl-primary, rgb(0,48,96))'}
              onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
          </div>

          <div style={{ flex:1 }}/>

          {/* CSV + Import */}
          {!isNotebook && (
            <button onClick={exportCSV}
              style={{
                padding:'8px 16px', borderRadius: 999,
                border:'1px solid #E4E5EB', background:'var(--surface)',
                color:'var(--text-muted)', fontWeight:500, fontSize:13,
                cursor:'pointer', whiteSpace:'nowrap',
                letterSpacing:'-0.005em',
                transition:'all 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#D2D4DE'; e.currentTarget.style.color = '#0E1633' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E5EB'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              CSV
            </button>
          )}
          {!isNotebook && (
            <button onClick={() => setImportModal(true)}
              style={{
                padding:'8px 16px', borderRadius: 999,
                border:'1px solid #E4E5EB', background:'var(--surface)',
                color:'var(--text-muted)', fontWeight:500, fontSize:13,
                cursor:'pointer', whiteSpace:'nowrap',
                letterSpacing:'-0.005em',
                transition:'all 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#D2D4DE'; e.currentTarget.style.color = '#0E1633' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E5EB'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              Import
            </button>
          )}


          {/* Neuer Lead */}
          <button onClick={() => { setModal('add'); setForm({ status:'Lead' }) }}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'9px 20px', borderRadius: 999,
              background:'var(--wl-primary, rgb(0,48,96))',
              color:'#fff', border:'none',
              fontSize:13, fontWeight:500,
              cursor:'pointer', whiteSpace:'nowrap',
              letterSpacing:'-0.005em',
              boxShadow:'0 6px 18px rgba(0,48,96,0.18)',
              transition:'all 0.2s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 10px 24px rgba(0,48,96,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 6px 18px rgba(0,48,96,0.18)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
            {isMobile ? t('common.new') : t('leads.addLead')}
          </button>
      </div>

      {/* ─── Body: Sidebar + Main ─────────────────────────── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Linke Sidebar */}
        {!isMobile && (
          <div style={{ width:210, background:'var(--surface)', borderRight:'1px solid #EEEFF4', flexShrink:0, display:'flex', flexDirection:'column', overflowY:'auto' }}>
            <div style={{ padding:'14px 14px 4px', fontSize:10, fontWeight:700, color:'var(--text-soft)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Ansicht</div>
            {[
              { id:'all',        label:'Alle Leads',    dot:'var(--wl-primary, rgb(0,48,96))', count: leads.length,                                  filter: () => { handleQuickFilter(null); handleFilter('all') } },
              { id:'hot',        label:'Hot Leads',     dot:'#DC2626',                            count: hotCount,                                      filter: () => handleQuickFilter('hot') },
              { id:'pipeline',   label:'In Pipeline',   dot:'#185FA5',                            count: leads.filter(l=>l.deal_stage&&l.deal_stage!=='kein_deal'&&l.deal_stage!=='verloren').length, filter: () => handleQuickFilter('pipeline') },
              { id:'favorite',   label:'Favoriten',     dot:'#D97706',                            count: leads.filter(l=>l.is_favorite).length,         filter: () => handleQuickFilter('favorite') },
              { id:'nofollowup',     label:'Kein Follow-up',  dot:'#64748B', count: leads.filter(l=>!l.next_followup).length, filter: () => handleQuickFilter('nofollowup') },
              { id:'followup_today', label:'Follow-up heute',  dot:'#185FA5', count: followupToday, filter: () => handleQuickFilter('followup_today') },
              { id:'overdue',        label:'Überfällig',       dot:'#DC2626', count: leads.filter(l=>l.next_followup&&new Date(l.next_followup)<new Date()).length, filter: () => handleQuickFilter('overdue') },
            ].map(item => {
              const active = item.id === 'all' ? (!quickFilter && listFilter==='all') : quickFilter === item.id
              return (
                <button key={item.id} onClick={item.filter}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 14px', background:active?'rgba(0,48,96,0.07)':'transparent', border:'none', cursor:'pointer', textAlign:'left', width:'100%', borderLeft:active?'2px solid var(--wl-primary, rgb(0,48,96))':'2px solid transparent' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:item.dot, flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:13, fontWeight:active?600:400, color:active?'var(--wl-primary, rgb(0,48,96))':'var(--text-primary)' }}>{item.label}</span>
                  <span style={{ fontSize:11, background:active?'rgba(0,48,96,0.12)':'#EEEFF4', color:active?'var(--wl-primary, rgb(0,48,96))':'#94A3B8', padding:'1px 7px', borderRadius:99 }}>{item.count}</span>
                </button>
              )
            })}

            {lists.length > 0 && <>
              <div style={{ height:1, background:'#EEEFF4', margin:'8px 14px' }}/>
              <div style={{ padding:'6px 14px 4px', fontSize:10, fontWeight:700, color:'var(--text-soft)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Listen</div>
              {lists.map(lst => {
                const active = listFilter === lst.id
                return (
                  <button key={lst.id} onClick={() => handleFilter(lst.id)}
                    style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 14px', background:active?`${lst.color}12`:'transparent', border:'none', cursor:'pointer', textAlign:'left', width:'100%', borderLeft:active?`2px solid ${lst.color}`:'2px solid transparent' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:lst.color, flexShrink:0 }}/>
                    <span style={{ flex:1, fontSize:13, fontWeight:active?600:400, color:active?lst.color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lst.name}</span>
                    <span style={{ fontSize:11, background:'#EEEFF4', color:'var(--text-soft)', padding:'1px 7px', borderRadius:99 }}>{lst.lead_list_members?.length||0}</span>
                  </button>
                )
              })}
            </>}

            <div style={{ height:1, background:'#EEEFF4', margin:'8px 14px' }}/>
            <button onClick={() => { setModal('list'); setListForm({}) }}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'transparent', border:'none', cursor:'pointer', width:'100%', color: 'var(--primary)', fontSize:12, fontWeight:600 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
              Neue Liste
            </button>

            {team && <>
              <div style={{ height:1, background:'#EEEFF4', margin:'8px 14px' }}/>
              <div style={{ padding:'6px 14px 4px', fontSize:10, fontWeight:700, color:'var(--text-soft)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Team</div>
              <button onClick={() => handleQuickFilter('team')}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 14px', background:quickFilter==='team'?'#ECFDF512':'transparent', border:'none', cursor:'pointer', textAlign:'left', width:'100%', borderLeft:quickFilter==='team'?'2px solid #059669':'2px solid transparent' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'#059669', flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:13, color:'var(--text-primary)' }}>Geteilt</span>
                <span style={{ fontSize:11, background:'#EEEFF4', color:'var(--text-soft)', padding:'1px 7px', borderRadius:99 }}>{leads.filter(l=>l.is_shared).length}</span>
              </button>
            </>}
          </div>
        )}

        {/* Hauptbereich */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--surface)' }}>

      {/* ─── Bulk-Action Bar ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ padding:'8px 20px', background:'var(--surface-muted)', borderBottom:'1px solid #BFDBFE', display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', flexShrink:0 }}>{selectedIds.size} ausgewählt</span>
          <select onChange={async e => {
            if (!e.target.value) return
            const stage = e.target.value; e.target.value = ''
            await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ deal_stage: stage }).eq('id', id)))
            setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, deal_stage: stage} : l))
            applyFilter(leads.map(l => selectedIds.has(l.id) ? {...l, deal_stage: stage} : l), search, listFilter, sortBy)
          }} defaultValue="" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #BFDBFE', background:'var(--surface)', fontSize:12, cursor:'pointer' }}>
            <option value="">Stage setzen…</option>
            {['neu','kontaktiert','gespraech','qualifiziert','angebot','verhandlung','gewonnen','verloren'].map(s =>
              <option key={s} value={s}>{STAGE_LABEL[s]||s}</option>
            )}
          </select>
          <select onChange={async e => {
            if (!e.target.value) return
            const listId = e.target.value; e.target.value = ''
            await Promise.all([...selectedIds].map(id => supabase.from('lead_list_members').upsert({ lead_id:id, list_id:listId }, { onConflict:'lead_id,list_id' })))
            showFlash(`${selectedIds.size} Leads zur Liste hinzugefügt`, 'success')
          }} defaultValue="" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #BFDBFE', background:'var(--surface)', fontSize:12, cursor:'pointer' }}>
            <option value="">Zu Liste…</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select onChange={async e => {
            if (!e.target.value) return
            const days = parseInt(e.target.value); e.target.value = ''
            const d = new Date(); d.setDate(d.getDate()+days)
            const iso = d.toISOString().split('T')[0]
            await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ next_followup: iso }).eq('id', id)))
            setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, next_followup: iso} : l))
            showFlash(`Follow-up auf ${new Date(iso).toLocaleDateString('de-DE')} gesetzt`, 'success')
          }} defaultValue="" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #BFDBFE', background:'var(--surface)', fontSize:12, cursor:'pointer' }}>
            <option value="">Follow-up…</option>
            <option value="0">Heute</option>
            <option value="1">Morgen</option>
            <option value="3">In 3 Tagen</option>
            <option value="7">In 7 Tagen</option>
          </select>
          {team && (
            <button onClick={async () => {
              await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ team_id: team.id, is_shared: true }).eq('id', id)))
              setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, is_shared:true, team_id:team.id} : l))
              setSelectedIds(new Set())
              showFlash(`👥 ${selectedIds.size} Leads mit "${team.name}" geteilt`, 'success')
            }} style={{ padding:'4px 10px', borderRadius:8, border:'1px solid rgba(16,185,129,0.4)', background:'rgba(16,185,129,0.08)', color:'#059669', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              👥 Mit Team teilen
            </button>
          )}
          <button onClick={async () => {
            if (!window.confirm(`${selectedIds.size} Leads wirklich löschen?`)) return
            await Promise.all([...selectedIds].map(id => supabase.from('leads').delete().eq('id', id)))
            const next = leads.filter(l => !selectedIds.has(l.id))
            setLeads(next); applyFilter(next, search, listFilter, sortBy); setSelectedIds(new Set())
          }} style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer' }}>
            Löschen
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>
            × Abwählen
          </button>
        </div>
      )}

      {/* ─── Flash ───────────────────────────────────────── */}
          {flash && (
            <div style={{ margin:'8px 20px 0', padding:'9px 14px', borderRadius:6, fontSize:13, fontWeight:500, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
              {flash.msg}
            </div>
          )}

          {/* ─── Filter-Zeile ── */}
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #EEEFF4', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            {/* Stage-Filter Pills */}
            {[
              { id:null,         label:'Alle',        count:leads.length },
              { id:'kontaktiert',label:'Kontaktiert', count:leads.filter(l=>['prospect','kontaktiert'].includes(l.deal_stage)).length },
              { id:'gespräch',   label:'Gespräch',    count:leads.filter(l=>['opportunity','gespraech'].includes(l.deal_stage)).length },
              { id:'angebot',    label:'Angebot',     count:leads.filter(l=>['angebot','verhandlung','qualifiziert'].includes(l.deal_stage)).length },
              { id:'gewonnen',   label:'Gewonnen',    count:leads.filter(l=>l.deal_stage==='gewonnen').length },
            ].map(tab => {
              const active = stageTab === tab.id
              return (
                <button key={String(tab.id)}
                  onClick={() => { const next = stageTab===tab.id ? null : tab.id; setStageTab(next); applyFilter(leads, search, listFilter, sortBy, quickFilter, next) }}
                  style={{
                    height:32, padding:'0 16px',
                    borderRadius: 999,
                    border:'1px solid',
                    whiteSpace:'nowrap',
                    fontSize:13, fontWeight: active ? 500 : 400,
                    cursor:'pointer', flexShrink:0,
                    fontFamily:'inherit',
                    letterSpacing:'-0.005em',
                    transition:'all 0.15s',
                    borderColor: active ? 'var(--wl-primary, rgb(0,48,96))' : '#E4E5EB',
                    background: active ? 'rgba(0,48,96,0.08)' : '#FFFFFF',
                    color: active ? 'var(--wl-primary, rgb(0,48,96))' : 'var(--text-muted)',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#D2D4DE'; e.currentTarget.style.color = '#0E1633' } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E4E5EB'; e.currentTarget.style.color = 'var(--text-muted)' } }}>
                  {tab.label}{tab.count > 0 && tab.id !== null ? <span style={{ marginLeft:6, fontSize:12, opacity: 0.7 }}>{tab.count}</span> : null}
                </button>
              )
            })}
            <div style={{ flex:1 }}/>
            <span style={{ fontSize:13, color:'var(--text-muted)', fontWeight: 500 }}>{filtered.length} Lead{filtered.length!==1?'s':''}</span>
          </div>

          {/* ─── Lead-Tabelle (Waalaxy-Style) ── */}
          <div style={{ flex:1, overflowY:'auto' }}>

            {/* Tabellen-Header */}
            {!isMobile && filtered.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'44px 40px 1fr 120px 80px 100px 80px', alignItems:'center', padding:'0 20px', height:36, background:'var(--surface-muted)', borderBottom:'1px solid #EEEFF4', position:'sticky', top:0, zIndex:2 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <input type="checkbox"
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(l=>l.id)) : new Set())}
                    style={{ width:14, height:14, cursor:'pointer', accentColor:'var(--wl-primary, rgb(0,48,96))' }}/>
                </div>
                <div/>
                {[['Name','name'],['Stage','stage'],['Score','score']].map(([h,k]) => (
                  <button key={h} onClick={() => handleSort(sortBy===k?`-${k}`:k)}
                    style={{ background:'none', border:'none', padding:0, fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:3 }}>
                    {h}{sortBy===k?' ↓':sortBy===`-${k}`?' ↑':''}
                  </button>
                ))}
                <div style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em' }}>Follow-up</div>
                <div/>
              </div>
            )}

        {/* Rows */}
        {loading ? (
          <div style={{ padding:56, textAlign:'center', color:'var(--text-soft)' }}>Lade…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'80px 32px 100px', textAlign:'center', maxWidth: 520, margin: '0 auto' }}>
            {/* Eyebrow */}
            <span style={{
              display:'inline-flex', alignItems:'center', gap:8,
              fontSize:13, fontWeight:600,
              color:'var(--primary)',
              background:'rgba(0,48,96,0.08)',
              padding:'6px 14px', borderRadius:999,
              letterSpacing:'-0.005em',
              marginBottom: 18,
            }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:'rgb(0,48,96)' }}/>
              {leads.length === 0 ? 'CRM' : 'Suche'}
            </span>

            {/* Narrative Headline */}
            <div style={{
              fontSize: 32, fontWeight: 600,
              color: '#0E1633',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              marginBottom: 12,
            }}>
              {leads.length === 0
                ? <>Dein <span className="highlight-word">CRM</span> wartet auf den ersten Lead.</>
                : 'Keine Treffer.'}
            </div>

            {/* Body */}
            <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 32, maxWidth: '44ch', margin: '0 auto 32px' }}>
              {leads.length === 0
                ? 'Import direkt aus LinkedIn über die Leadesk Chrome Extension — oder leg manuell los, wenn du nur einen einzigen hinzufügen willst.'
                : t('leads.noLeads')}
            </div>

            {leads.length === 0 && (
              <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer"
                  style={{
                    padding:'12px 22px', borderRadius:999,
                    background:'rgb(0,48,96)',
                    color:'#fff', fontSize:14, fontWeight:500,
                    textDecoration:'none',
                    display:'inline-flex', alignItems:'center', gap:8,
                    letterSpacing:'-0.005em',
                    boxShadow:'0 6px 18px rgba(0,48,96,0.18)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 24px rgba(0,48,96,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,48,96,0.18)' }}>
                  LinkedIn öffnen →
                </a>
              </div>
            )}
          </div>
        ) : filtered.map(lead => (
          <LeadRow
            key={lead.id}
            lead={lead}
            isSelected={selectedLead?.id === lead.id}
            isChecked={selectedIds.has(lead.id)}
            isHovered={hoveredId === lead.id}
            isStagePickerOpen={stagePickerId === lead.id}
            isFuPickerOpen={fuPickerId === lead.id}
            isRowMenuOpen={rowMenuId === lead.id}
            team={team}
            session={session}
            lists={lists}
            isMobile={isMobile}
            isNotebook={isNotebook}
            onSelect={handleSelect}
            onToggleCheck={handleToggleCheck}
            onHoverEnter={handleHoverEnter}
            onHoverLeave={handleHoverLeave}
            onToggleStagePicker={handleToggleStagePicker}
            onStageChange={handleStageChange}
            onToggleFuPicker={handleToggleFuPicker}
            onFollowupSet={handleFollowupSet}
            onFollowupClear={handleFollowupClear}
            onToggleRowMenu={handleToggleRowMenu}
            onLogCall={handleLogCall}
            onToggleFavorite={handleToggleFavorite}
            onToggleListMembership={handleToggleListMembership}
            onToggleTeamShare={handleToggleTeamShare}
            onUnshare={handleUnshare}
            onDelete={handleDelete}
            onNavigateToProfile={handleNavigateToProfile}
          />
        ))}
          </div> {/* Ende lead-liste */}
        </div> {/* Ende Main Content */}
      </div> {/* Ende Body flex */}

      {/* ─── Lead-Drawer ─────────────────────────────────── */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          session={session}
          lists={lists}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
        />
      )}

      {/* ─── Modal: Neuer Lead ───────────────────────────── */}
      {modal === 'add' && (
        <Modal title="Neuer Lead" onClose={() => { setModal(null); setForm({}) }}>
          <form onSubmit={async e => { e.preventDefault(); setSaving(true)
            const uid = session.user.id
            const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ').trim() || form.email || 'Unbekannt'
            const insertData = { user_id:uid, first_name:form.first_name||'', last_name:form.last_name||'', name:fullName, job_title:form.job_title||'', company:form.company||'', organization_id:form.organization_id||null, email:form.email||'', linkedin_url:form.linkedin_url||'', status:form.status||'Lead', ...(activeTeamId ? { team_id: activeTeamId } : {}) }
            const { data, error } = await supabase.from('leads').insert(insertData).select().single()
            if (!error && data) { const next = [data, ...leads]; setLeads(next); applyFilter(next, search, listFilter, sortBy); setModal(null); setForm({}) }
            setSaving(false)
          }}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[['Vorname','first_name'],['Nachname','last_name']].map(([l,k]) => (
                  <div key={k}><label style={lbl}>{l}</label><input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}/></div>
                ))}
              </div>
              <div>
                <label style={lbl}>Organisation</label>
                <OrganizationPicker
                  value={form.organization_id}
                  valueName={form.company}
                  onChange={(orgId, orgName) => setForm(f => ({ ...f, organization_id: orgId, company: orgName || f.company }))}
                  placeholder="Firma suchen oder neu anlegen…"
                />
              </div>
              {[['Position / Titel','job_title'],['E-Mail','email'],['LinkedIn URL','linkedin_url']].map(([l,k]) => (
                <div key={k}><label style={lbl}>{l}</label><input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}/></div>
              ))}
              <div><label style={lbl}>Status</label>
                <select value={form.status||'Lead'} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={inp}>
                  {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #EEEFF4' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'var(--wl-primary, rgb(0,48,96))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Speichere…' : 'Erstellen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── Modal: Neue Liste ───────────────────────────── */}
      {modal === 'list' && (
        <Modal title="Neue Liste" onClose={() => { setModal(null); setListForm({}) }}>
          <form onSubmit={async e => { e.preventDefault()
            const { data } = await supabase.from('lead_lists').insert({ name:listForm.name, color:listForm.color||LIST_COLORS[lists.length%LIST_COLORS.length], user_id:session.user.id, ...(activeTeamId ? { team_id: activeTeamId } : {}) }).select().single()
            if (data) { setLists(l=>[...l,data]); setModal(null); setListForm({}) }
          }}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div><label style={lbl}>Name</label><input required value={listForm.name||''} onChange={e=>setListForm(f=>({...f,name:e.target.value}))} style={inp}/></div>
              <div>
                <label style={lbl}>Farbe</label>
                <div style={{ display:'flex', gap:8, marginTop:4 }}>
                  {LIST_COLORS.map(c => (
                    <button key={c} type="button" onClick={()=>setListForm(f=>({...f,color:c}))}
                      style={{ width:28, height:28, borderRadius:'50%', background:c, border:listForm.color===c?'3px solid rgb(20,20,43)':'2px solid transparent', cursor:'pointer', transition:'all 0.15s' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #EEEFF4' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'var(--wl-primary, rgb(0,48,96))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Erstellen</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── Import Modal ────────────────────────────────── */}
      {importModal && (
        <Modal title="Leads importieren (CSV)" onClose={() => { setImportModal(false); setImportResult(null) }}>
          <div style={{ padding:'20px 24px' }}>
            {!importResult ? (
              <>
                <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
                  CSV mit Spalten: <code>Vorname, Nachname, E-Mail, LinkedIn, Unternehmen, Position</code>
                </p>
                <input type="file" accept=".csv" disabled={importing}
                  onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return
                    setImporting(true)
                    const text = await file.text()
                    const lines = text.trim().split('\n')
                    const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/["']/g,''))
                    const rows = lines.slice(1).map(line => {
                      const vals = line.split(',').map(v=>v.trim().replace(/^["']|["']$/g,''))
                      const obj = {}; headers.forEach((h,i)=>{ obj[h]=vals[i]||'' }); return obj
                    }).filter(r => r['vorname']||r['nachname']||r['name']||r['e-mail']||r['email'])
                    const uid = session.user.id
                    const inserts = rows.map(r => {
                      const first = r['vorname']||r['first name']||''
                      const last  = r['nachname']||r['last name']||''
                      const mail  = r['e-mail']||r['email']||''
                      return {
                        user_id:uid,
                        first_name: first,
                        last_name:  last,
                        name: [first, last].filter(Boolean).join(' ').trim() || mail || 'Unbekannt',
                        email: mail,
                        linkedin_url:r['linkedin']||r['linkedin url']||'',
                        company:r['unternehmen']||r['company']||'',
                        job_title:r['position']||r['job title']||r['titel']||'',
                        status:'Lead',
                        ...(activeTeamId ? { team_id: activeTeamId } : {}),
                      }
                    })
                    const { data, error } = await supabase.from('leads').insert(inserts).select()
                    if (!error && data) { const next = [...data, ...leads]; setLeads(next); applyFilter(next, search, listFilter, sortBy) }
                    setImportResult({ count:data?.length||0, error:error?.message })
                    setImporting(false)
                  }}
                  style={{ display:'block', width:'100%', padding:'12px', border:'2px dashed #E5E7EB', borderRadius:10, cursor:'pointer', fontSize:13 }}/>
                {importing && <div style={{ marginTop:12, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Importiere…</div>}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                {importResult.error ? (
                  <><div style={{ fontSize:32, marginBottom:8 }}>⚠️</div><div style={{ color:'#DC2626', fontWeight:700 }}>{importResult.error}</div></>
                ) : (
                  <><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div style={{ fontWeight:700, color:'#065F46' }}>{importResult.count} Leads importiert</div></>
                )}
                <button onClick={() => { setImportModal(false); setImportResult(null) }} style={{ marginTop:16, padding:'8px 20px', borderRadius:999, border:'none', background:'var(--wl-primary, rgb(0,48,96))', color:'#fff', fontWeight:700, cursor:'pointer' }}>Fertig</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
