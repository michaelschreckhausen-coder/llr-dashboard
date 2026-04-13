// CRM Unified: first_name, last_name, job_title, status Lead/LQL/MQN/MQL/SQL
import React, { useEffect, useState, useRef } from 'react'
import { useResponsive } from '../hooks/useResponsive'
import { useTeam } from '../context/TeamContext'

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
import { supabase } from '../lib/supabase'
import LeadDrawer from '../components/LeadDrawer'
const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const STATUS_OPTIONS = ['Lead', 'LQL', 'MQN', 'MQL', 'SQL']
const STATUS_LABELS = { Lead:'Lead', LQL:'LQL', MQN:'MQN', MQL:'MQL', SQL:'SQL' }
const STATUS_STYLE = {
  Lead: { bg:'rgb(238,241,252)', color:'#475569', border:'#CBD5E1' },
  LQL:  { bg:'rgba(49,90,231,0.08)', color:'rgb(49,90,231)', border:'rgba(49,90,231,0.2)' },
  MQN:  { bg:'#F5F3FF', color:'#6D28D9', border:'#DDD6FE' },
  MQL:  { bg:'#FFFBEB', color:'#B45309', border:'#FDE68A' },
  SQL:  { bg:'#F0FDF4', color:'#15803D', border:'#BBF7D0' },
}
const LIST_COLORS = ['rgb(49,90,231)','#10B981','#F59E0B','#EF4444','#8B5CF6','#0891B2','#EC4899','#374151']

const PlusIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const FilterIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
const SearchIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const ChevronDown = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
const XIcon      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const LiIcon     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="rgb(49,90,231)"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
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
  const colors = ['rgb(49,90,231)','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2','#EF4444','#374151']
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
  const s = STATUS_STYLE[status] || STATUS_STYLE.new
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
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'rgb(20,20,43)' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:6 }}>
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
  const { isMobile } = useResponsive()
  const { team, members, shareLeadWithTeam, unshareLeadFromTeam, shareListWithTeam, isAdmin } = useTeam()
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
  const [importModal, setImportModal] = useState(false)
  const [importing,   setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [compact, setCompact] = useState(false) // 'hot' | 'pipeline' | 'highscore'
  const [listMenuLead, setListMenuLead] = useState(null) // lead.id für das offene Listen-Dropdown

  useEffect(() => { loadAll() }, [])

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
    const [{ data:ld }, { data:ls }] = await Promise.all([
      supabase.from('leads').select('*, lead_list_members(list_id,lead_id)').or(`user_id.eq.${uid},is_shared.eq.true`).order('created_at', { ascending:false }),
      supabase.from('lead_lists').select('*, lead_list_members(lead_id)').or(`user_id.eq.${uid},is_shared.eq.true`).order('created_at', { ascending:true }),
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
    if (qFilter === 'hot')       res = res.filter(l => l.ai_buying_intent === 'hoch')
    if (qFilter === 'pipeline')  res = res.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal' && l.deal_stage !== 'verloren')
    if (qFilter === 'highscore') res = res.filter(l => (l.hs_score || 0) >= 70)
    if (qFilter === 'favorite')    res = res.filter(l => !!l.is_favorite)
    if (qFilter === 'no_followup') res = res.filter(l => !l.next_followup || new Date(l.next_followup) < new Date())
    if (qFilter === 'nofollowup')  res = res.filter(l => !l.next_followup)
    if (qFilter === 'team')        res = res.filter(l => l.is_shared === true)
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

  function showFlash(msg, type='success') { setFlash({msg,type}); setTimeout(()=>setFlash(null),3000) }

  async function handleAddLead(e) {
    e.preventDefault()
    // Name aufteilen in first_name / last_name
    const nameParts = (form.name||'').trim().split(' ')
    const first_name = nameParts[0] || form.first_name || ''
    const last_name  = nameParts.slice(1).join(' ') || form.last_name || ''
    if (!first_name && !last_name) return showFlash('Name ist Pflicht', 'error')
    setSaving(true)
    const insertData = { ...form, first_name, last_name, user_id: session.user.id, status: form.status||'Lead' }
    delete insertData.name
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
    const { data } = await supabase.from('lead_lists').insert({ name:listForm.name, color:listForm.color||LIST_COLORS[lists.length%LIST_COLORS.length], user_id:session.user.id }).select().single()
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
      return {
        first_name: vals[col('first_name')] || vals[col('vorname')] || '',
        last_name:  vals[col('last_name')]  || vals[col('nachname')] || '',
        email:      vals[col('email')] || '',
        job_title:  vals[col('job_title')] || vals[col('position')] || vals[col('titel')] || '',
        company:    vals[col('company')]    || vals[col('firma')] || vals[col('unternehmen')] || '',
        profile_url:vals[col('profile_url')]|| vals[col('linkedin')] || vals[col('linkedin_url')] || '',
        user_id: session.user.id,
        status: 'Lead',
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

  const inp = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff', width:'100%' }
  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }


  // ── Hover-State für Row-Menü ──────────────────────────────
  const [hoveredId, setHoveredId] = useState(null)
  const [rowMenuId, setRowMenuId] = useState(null)
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

  const STAGE_LABEL = {
    kein_deal:'Neu', neu:'Neu', prospect:'Kontaktiert', kontaktiert:'Kontaktiert',
    opportunity:'Gespräch', gespraech:'Gespräch', qualifiziert:'Qualifiziert',
    angebot:'Angebot', verhandlung:'Verhandlung',
    gewonnen:'Gewonnen', verloren:'Verloren',
    stage_custom1:'Stage 1', stage_custom2:'Stage 2', stage_custom3:'Stage 3'
  }
  const STAGE_COLOR = {
    kein_deal:'#94a3b8', neu:'#94a3b8', prospect:'#3b82f6', kontaktiert:'#3b82f6',
    opportunity:'#8b5cf6', gespraech:'#8b5cf6', qualifiziert:'#f59e0b',
    angebot:'#f97316', verhandlung:'#f97316',
    gewonnen:'#22c55e', verloren:'#ef4444', verhandlung:'#f97316',
    angebot:'#f59e0b', qualifiziert:'#8b5cf6', gespraech:'#3b82f6',
    kontaktiert:'#64748b', neu:'#94a3b8', kein_deal:'#cbd5e1'
  }

  const allListsOption = { id:'all', name:'Alle Leads', color:'rgb(49,90,231)' }
  const listOptions = [allListsOption, ...lists]
  const activeList = listOptions.find(l => l.id === listFilter) || allListsOption

  return (
    <div style={{ display:'flex', flexDirection:'column', height: isMobile ? undefined : 'calc(100vh - 0px)', overflow:'hidden', background:'#F8FAFC' }}>

      {/* ─── Toolbar ─────────────────────────────────────── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #E5E7EB', flexShrink:0, padding:'0 20px' }}>

        {/* Zeile 1: Suche + Listen-Dropdown + Aktionen */}
        <div style={{ display:'flex', gap:10, alignItems:'center', padding:'12px 0 10px' }}>

          {/* Suche */}
          <div style={{ flex:1, position:'relative', maxWidth:400 }}>
            <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94A3B8', pointerEvents:'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Name, Firma, Position…"
              style={{ width:'100%', padding:'8px 12px 8px 32px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', background:'#F8FAFC', color:'rgb(20,20,43)', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgb(49,90,231)'}
              onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
          </div>

          {/* Listen-Dropdown — custom */}
          <div data-list-drop style={{ position:'relative', flexShrink:0 }}>
            {/* Trigger Button */}
            <button data-list-drop onClick={() => setListDropOpen(o => !o)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px 7px 12px', border:`1.5px solid ${listDropOpen?'rgb(49,90,231)':'#E5E7EB'}`, borderRadius:10, fontSize:13, fontWeight:600, color:'rgb(20,20,43)', background:'#fff', cursor:'pointer', outline:'none', minWidth:170, whiteSpace:'nowrap', transition:'border-color 0.15s' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:activeList.color, flexShrink:0, display:'inline-block' }}/>
              <span style={{ flex:1, textAlign:'left', overflow:'hidden', textOverflow:'ellipsis' }}>
                {activeList.id === 'all' ? 'Alle Leads' : activeList.name}
              </span>
              <span style={{ fontSize:11, fontWeight:500, color:'#94A3B8', background:'#F1F5F9', borderRadius:99, padding:'1px 7px', flexShrink:0 }}>
                {activeList.id === 'all' ? leads.length : (lists.find(l=>l.id===activeList.id)?.lead_list_members?.length||0)}
              </span>
              <svg style={{ color:'#94A3B8', flexShrink:0, transition:'transform 0.2s', transform:listDropOpen?'rotate(180deg)':'rotate(0deg)' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            {/* Dropdown Panel */}
            {listDropOpen && (
              <div data-list-drop style={{ position:'absolute', left:0, top:'calc(100% + 6px)', background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', border:'1px solid #E5E7EB', minWidth:220, zIndex:300, overflow:'hidden', padding:'6px 0' }}>

                {/* Alle Leads */}
                <button data-list-drop onClick={() => { handleFilter('all'); setListDropOpen(false) }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:listFilter==='all'?'rgba(49,90,231,0.06)':'none', border:'none', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e=>{ if(listFilter!=='all') e.currentTarget.style.background='#F8FAFC' }}
                  onMouseLeave={e=>{ if(listFilter!=='all') e.currentTarget.style.background='none' }}>
                  <span style={{ width:9, height:9, borderRadius:'50%', background:'rgb(49,90,231)', flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:13, fontWeight:listFilter==='all'?700:500, color:listFilter==='all'?'rgb(49,90,231)':'rgb(20,20,43)' }}>Alle Leads</span>
                  <span style={{ fontSize:11, color:'#94A3B8', background:'#F1F5F9', borderRadius:99, padding:'1px 7px', flexShrink:0 }}>{leads.length}</span>
                  {listFilter==='all' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(49,90,231)" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
                </button>

                {lists.length > 0 && <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>}

                {lists.map(lst => {
                  const count = lst.lead_list_members?.length || 0
                  const active = listFilter === lst.id
                  return (
                    <button data-list-drop key={lst.id}
                      onClick={() => { handleFilter(lst.id); setListDropOpen(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:active?`${lst.color}10`:'none', border:'none', cursor:'pointer', textAlign:'left' }}
                      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#F8FAFC' }}
                      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='none' }}>
                      <span style={{ width:9, height:9, borderRadius:'50%', background:lst.color, flexShrink:0 }}/>
                      <span style={{ flex:1, fontSize:13, fontWeight:active?700:500, color:active?lst.color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lst.name}</span>
                      <span style={{ fontSize:11, color:'#94A3B8', background:'#F1F5F9', borderRadius:99, padding:'1px 7px', flexShrink:0 }}>{count}</span>
                      {active && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={lst.color} strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
                    </button>
                  )
                })}

                <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
                <button data-list-drop
                  onClick={() => { setListDropOpen(false); setModal('list'); setListForm({}) }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <span style={{ width:9, height:9, borderRadius:'50%', border:'1.5px solid #CBD5E1', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ width:4, height:4, background:'#94A3B8', borderRadius:'50%' }}/>
                  </span>
                  <span style={{ fontSize:13, fontWeight:600, color:'rgb(49,90,231)' }}>+ Neue Liste erstellen</span>
                </button>
              </div>
            )}
          </div>

          {/* Sortierung — custom */}
          {(() => {
            const SL = { date:'Neueste', score:'Score ↓', followup:'Follow-up', name:'A → Z', stage:'Stage', favorite:'Favoriten', updated:'Geändert', lastact:'Aktivität' }
            const OPTS = [['date','Neueste zuerst'],['score','Score ↓'],['followup','Follow-up'],['name','Name A → Z'],['stage','Pipeline Stage'],['favorite','Favoriten zuerst'],['updated','Zuletzt geändert'],['lastact','Letzte Aktivität']]
            return (
              <div data-sort-drop style={{ position:'relative', flexShrink:0 }}>
                <button data-sort-drop onClick={() => setSortDropOpen(o => !o)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', border:`1.5px solid ${sortDropOpen?'rgb(49,90,231)':'#E5E7EB'}`, borderRadius:10, fontSize:12, fontWeight:500, color:'#475569', background:'#fff', cursor:'pointer', outline:'none', whiteSpace:'nowrap' }}>
                  <svg style={{ color:'#94A3B8' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
                  {SL[sortBy] || 'Sortieren'}
                  <svg style={{ color:'#94A3B8', transition:'transform 0.2s', transform:sortDropOpen?'rotate(180deg)':'rotate(0deg)' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {sortDropOpen && (
                  <div data-sort-drop style={{ position:'absolute', left:0, top:'calc(100% + 6px)', background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', border:'1px solid #E5E7EB', minWidth:200, zIndex:300, padding:'6px 0' }}>
                    {OPTS.map(([k,label]) => (
                      <button data-sort-drop key={k} onClick={() => { handleSort(k); setSortDropOpen(false) }}
                        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:sortBy===k?'rgb(49,90,231)':'rgb(20,20,43)', fontWeight:sortBy===k?700:400 }}
                        onMouseEnter={e=>{ if(sortBy!==k) e.currentTarget.style.background='#F8FAFC' }}
                        onMouseLeave={e=>{ if(sortBy!==k) e.currentTarget.style.background='none' }}>
                        <span>{label}</span>
                        {sortBy===k && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(49,90,231)" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          <div style={{ flex:1 }}/>

          {/* CSV + Import — nur Desktop */}
          {!isNotebook && (
            <button onClick={exportCSV} style={{ padding:'7px 14px', borderRadius:10, border:'1px solid #A7F3D0', background:'#ECFDF5', color:'#059669', fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
              CSV ({filtered.length})
            </button>
          )}
          {!isNotebook && (
            <button onClick={() => setImportModal(true)} style={{ padding:'7px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:12, fontWeight:600, cursor:'pointer', color:'#475569', whiteSpace:'nowrap' }}>
              Import
            </button>
          )}


          {/* Neuer Lead */}
          <button onClick={() => { setModal('add'); setForm({ status:'Lead' }) }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10, background:'rgb(49,90,231)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 2px 8px rgba(49,90,231,0.3)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
            {isMobile ? 'Neu' : 'Lead hinzufügen'}
          </button>
        </div>

        {/* Zeile 2: Filter-Chips — kompakt, scrollbar */}
        <div style={{ display:'flex', gap:5, paddingBottom:10, overflowX:'auto', scrollbarWidth:'none' }}>
          {[
            { id:'hot',       label:'🔥 Hot',         color:'#ef4444', bg:'#FEF2F2', border:'#FECACA', count: leads.filter(l=>(l.hs_score||0)>=70).length },
            { id:'pipeline',  label:'💼 Pipeline',     color:'#3b82f6', bg:'#EFF6FF', border:'#BFDBFE', count: leads.filter(l=>l.deal_stage&&l.deal_stage!=='kein_deal'&&l.deal_stage!=='verloren').length },
            { id:'favorite',  label:'⭐ Favoriten',    color:'#d97706', bg:'#FEF3C7', border:'#FDE68A', count: leads.filter(l=>l.is_favorite).length },
            { id:'nofollowup',label:'📅 Fehlt',color:'#64748B',bg:'#F8FAFC', border:'#E2E8F0', count: leads.filter(l=>!l.next_followup).length },
            ...(team ? [{ id:'team', label:`👥 ${team.name}`, color:'#10b981', bg:'#ECFDF5', border:'#A7F3D0', count: leads.filter(l=>l.is_shared).length }] : []),
          ].map(chip => (
            <button key={chip.id} onClick={() => handleQuickFilter(chip.id)}
              style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', border:'1.5px solid', whiteSpace:'nowrap', flexShrink:0, transition:'all 0.12s',
                borderColor: quickFilter===chip.id ? chip.color : chip.border,
                background:  quickFilter===chip.id ? chip.bg : 'transparent',
                color:       quickFilter===chip.id ? chip.color : '#64748B',
              }}>
              {chip.label}
              {chip.count > 0 && <span style={{ marginLeft:4, fontSize:10, opacity:0.7 }}>{chip.count}</span>}
              {quickFilter===chip.id && <span style={{ marginLeft:3 }}>×</span>}
            </button>
          ))}
          {(quickFilter || search) && (
            <button onClick={() => { handleQuickFilter(null); handleSearch('') }}
              style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', border:'1.5px solid #E2E8F0', background:'transparent', color:'#94A3B8', flexShrink:0 }}>
              Alle zeigen
            </button>
          )}
          <span style={{ fontSize:11, color:'#94A3B8', alignSelf:'center', marginLeft:'auto', flexShrink:0, whiteSpace:'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'Lead' : 'Leads'}
          </span>
        </div>
      </div>

      {/* ─── Bulk-Action Bar ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ padding:'8px 20px', background:'#EFF6FF', borderBottom:'1px solid #BFDBFE', display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', flexShrink:0 }}>{selectedIds.size} ausgewählt</span>
          <select onChange={async e => {
            if (!e.target.value) return
            const stage = e.target.value; e.target.value = ''
            await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ deal_stage: stage }).eq('id', id)))
            setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, deal_stage: stage} : l))
            applyFilter(leads.map(l => selectedIds.has(l.id) ? {...l, deal_stage: stage} : l), search, listFilter, sortBy)
          }} defaultValue="" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #BFDBFE', background:'#fff', fontSize:12, cursor:'pointer' }}>
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
          }} defaultValue="" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #BFDBFE', background:'#fff', fontSize:12, cursor:'pointer' }}>
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
          }} defaultValue="" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #BFDBFE', background:'#fff', fontSize:12, cursor:'pointer' }}>
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
          <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:8, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:12, cursor:'pointer' }}>
            × Abwählen
          </button>
        </div>
      )}

      {/* ─── Flash ───────────────────────────────────────── */}
      {flash && (
        <div style={{ margin:'8px 20px', padding:'9px 14px', borderRadius:8, fontSize:13, fontWeight:600, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0'), flexShrink:0 }}>
          {flash.msg}
        </div>
      )}

      {/* ─── Lead-Tabelle ────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', background:'#fff', position:'relative' }}>

        {/* Header */}
        {!isMobile && (
          <div style={{ display:'grid', gridTemplateColumns:'36px 36px 1fr 140px 100px 100px 56px', alignItems:'center', padding:'0 12px 0 16px', height:36, background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', position:'sticky', top:0, zIndex:2 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
              <input type="checkbox"
                ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                checked={selectedIds.size === filtered.length && filtered.length > 0}
                onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(l=>l.id)) : new Set())}
                style={{ width:14, height:14, cursor:'pointer', accentColor:'rgb(49,90,231)' }}/>
            </div>
            <div/>
            {[['Name & Position','name'],['Stage','stage'],['Score','score']].map(([h,k]) => (
              <button key={h} onClick={() => handleSort(sortBy===k?`-${k}`:k)}
                style={{ background:'none', border:'none', padding:'0 0 0 2px', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:3 }}>
                {h} {sortBy===k?'↓':sortBy===`-${k}`?'↑':''}
              </button>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Follow-up</div>
            <div/>
          </div>
        )}

        {/* Rows */}
        {loading ? (
          <div style={{ padding:56, textAlign:'center', color:'#94A3B8' }}>Lade…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:64, textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
            <div style={{ fontWeight:700, fontSize:15, color:'#475569', marginBottom:4 }}>Keine Leads gefunden</div>
            <div style={{ fontSize:13, color:'#94A3B8' }}>Passe die Suche oder Filter an</div>
          </div>
        ) : filtered.map(lead => {
          const isSelected = selectedLead?.id === lead.id
          const isChecked = selectedIds.has(lead.id)
          const hasFollowup = !!lead.next_followup
          const followupOverdue = hasFollowup && new Date(lead.next_followup) < new Date()
          const stageColor = STAGE_COLOR[lead.deal_stage] || '#94A3B8'
          const hasStage = lead.deal_stage && lead.deal_stage !== 'kein_deal'

          // ── MOBILE ──
          if (isMobile) return (
            <div key={lead.id}
              onClick={() => { sessionStorage.setItem('llr_lead_nav', JSON.stringify(filtered.map(l=>l.id))); navigate(`/leads/${lead.id}`) }}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#fff', borderBottom:'1px solid #F1F5F9', cursor:'pointer', borderLeft:`3px solid ${(lead.hs_score||0)>=70?'#ef4444':(lead.hs_score||0)>=40?'#f59e0b':'#e2e8f0'}` }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:`linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:700, flexShrink:0 }}>
                {lead.first_name?.[0] || lead.name?.[0] || '?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {fullName(lead)}
                  {lead.is_shared && team && <span style={{ marginLeft:6, fontSize:9, fontWeight:800, background:'rgba(16,185,129,0.15)', color:'#059669', borderRadius:4, padding:'1px 5px' }}>👥</span>}
                </div>
                <div style={{ fontSize:12, color:'#64748B', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {[lead.job_title||lead.headline, lead.company].filter(Boolean).join(' · ')}
                </div>
                {lead.next_followup && (
                  <div style={{ fontSize:11, color:followupOverdue?'#ef4444':'#3b82f6', marginTop:2 }}>
                    📅 {new Date(lead.next_followup).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}
                    {followupOverdue ? ' überfällig' : ''}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
                {lead.hs_score > 0 && <span style={{ fontSize:13, fontWeight:800, color:(lead.hs_score||0)>=70?'#ef4444':(lead.hs_score||0)>=40?'#f59e0b':'#3b82f6' }}>{lead.hs_score}</span>}
                {hasStage && <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:99, background:stageColor+'18', color:stageColor }}>{STAGE_LABEL[lead.deal_stage]||lead.deal_stage}</span>}
                <span style={{ fontSize:18, color:'#CBD5E1' }}>›</span>
              </div>
            </div>
          )

          // ── DESKTOP ──
          return (
            <div key={lead.id}
              onClick={e => { if (e.target.closest('[data-row-menu]')) return; setSelectedLead(prev => prev?.id === lead.id ? null : lead) }}
              onMouseEnter={() => setHoveredId(lead.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ display:'grid', gridTemplateColumns:'36px 36px 1fr 140px 100px 100px 56px', alignItems:'center', padding:'0 12px 0 16px', minHeight:56, borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:isSelected?'rgba(49,90,231,0.06)':isChecked?'rgba(49,90,231,0.03)':hoveredId===lead.id?'#F8FAFC':'#fff', borderLeft:isSelected?'3px solid rgb(49,90,231)':hoveredId===lead.id?'3px solid #E2E8F0':'3px solid transparent', position:'relative', transition:'background 0.1s' }}>

              {/* Checkbox */}
              <div onClick={e=>e.stopPropagation()} style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                <input type="checkbox" checked={isChecked}
                  onChange={e => { setSelectedIds(prev => { const n=new Set(prev); e.target.checked?n.add(lead.id):n.delete(lead.id); return n }) }}
                  style={{ width:14, height:14, cursor:'pointer', accentColor:'rgb(49,90,231)' }}/>
              </div>

              {/* Avatar */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                {lead.avatar_url ? (
                  <img src={lead.avatar_url} alt="" style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover', border:'1.5px solid #E5E7EB' }}/>
                ) : (
                  <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg, rgb(49,90,231), rgb(100,140,240))`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {(lead.first_name?.[0] || lead.name?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name + Meta */}
              <div style={{ minWidth:0, paddingRight:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:1 }}>
                  <span 
                    onClick={e => { e.stopPropagation(); sessionStorage.setItem('llr_lead_nav', JSON.stringify(filtered.map(l=>l.id))); navigate(`/leads/${lead.id}`) }}
                    title="Profil öffnen"
                    style={{ fontWeight:700, fontSize:14, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth: isNotebook ? 180 : 280, cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.color='rgb(49,90,231)'}
                    onMouseLeave={e=>e.currentTarget.style.color='rgb(20,20,43)'}>
                    {fullName(lead)}
                  </span>
                  {lead.is_favorite && <span style={{ fontSize:11, flexShrink:0 }}>⭐</span>}
                  {new Date(lead.created_at).toDateString() === new Date().toDateString() && (
                    <span style={{ fontSize:9, fontWeight:800, background:'#22c55e', color:'#fff', borderRadius:4, padding:'1px 5px', flexShrink:0 }}>NEU</span>
                  )}
                  {lead.is_shared && team && (() => {
                    const owner = members?.find(m => m.user_id === lead.user_id)
                    const ownerName = owner?.profile?.full_name?.split(' ')?.[0] || owner?.profile?.email?.split('@')?.[0]
                    const isOwn = lead.user_id === session?.user?.id
                    return (
                      <span title={isOwn?`Geteilt — klicken zum Aufheben`:`Von ${ownerName||'Teammitglied'}`}
                        onClick={async e => { e.stopPropagation(); if(!isOwn) return; await unshareLeadFromTeam(lead.id); setLeads(prev=>prev.map(l=>l.id===lead.id?{...l,is_shared:false,team_id:null}:l)) }}
                        style={{ fontSize:9, fontWeight:800, background:'rgba(16,185,129,0.12)', color:'#059669', borderRadius:4, padding:'1px 6px', flexShrink:0, border:'1px solid rgba(16,185,129,0.25)', cursor:isOwn?'pointer':'default' }}>
                        👥 {isOwn ? team.name : (ownerName || team.name)}
                      </span>
                    )
                  })()}
                </div>
                <div style={{ fontSize:12, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {[lead.job_title||lead.headline, lead.company].filter(Boolean).join(' · ')}
                  {!lead.job_title && !lead.headline && !lead.company && <span style={{ color:'#CBD5E1' }}>—</span>}
                </div>
              </div>

              {/* Stage */}
              <div>
                {hasStage ? (
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, background:stageColor+'15', color:stageColor, whiteSpace:'nowrap' }}>
                    {STAGE_LABEL[lead.deal_stage] || lead.deal_stage}
                  </span>
                ) : <span style={{ fontSize:12, color:'#E2E8F0' }}>—</span>}
              </div>

              {/* Score */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {lead.hs_score != null ? (
                  <>
                    <div style={{ width:40, height:4, background:'#E5E7EB', borderRadius:99, overflow:'hidden', flexShrink:0 }}>
                      <div style={{ height:'100%', width:Math.min(lead.hs_score,100)+'%', background:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6', borderRadius:99 }}/>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6', flexShrink:0 }}>{lead.hs_score}</span>
                  </>
                ) : <span style={{ fontSize:12, color:'#E2E8F0' }}>—</span>}
              </div>

              {/* Follow-up */}
              <div>
                {hasFollowup ? (
                  (() => {
                    const d = new Date(lead.next_followup), now = new Date()
                    const days = Math.round((d - now) / 86400000)
                    const label = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : days === -1 ? 'Gestern' : days < 0 ? `${Math.abs(days)}T über` : `in ${days}T`
                    return <span style={{ fontSize:11, fontWeight:600, color:followupOverdue?'#ef4444':'#3b82f6', background:followupOverdue?'#FEF2F2':'#EFF6FF', padding:'3px 8px', borderRadius:99, whiteSpace:'nowrap' }}>
                      {followupOverdue ? '⚠ ' : '📅 '}{label}
                    </span>
                  })()
                ) : <span style={{ fontSize:12, color:'#E2E8F0' }}>—</span>}
              </div>

              {/* Aktionen — 3-Punkte-Menü */}
              <div style={{ position:'relative', display:'flex', justifyContent:'center' }} onClick={e=>e.stopPropagation()} data-row-menu>
                <button
                  data-row-menu
                  onClick={e => { e.stopPropagation(); setRowMenuId(rowMenuId === lead.id ? null : lead.id) }}
                  style={{ width:30, height:30, borderRadius:8, border:'1px solid', borderColor:rowMenuId===lead.id?'rgb(49,90,231)':'#E5E7EB', background:rowMenuId===lead.id?'rgba(49,90,231,0.08)':'transparent', color:rowMenuId===lead.id?'rgb(49,90,231)':'#94A3B8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, opacity:1, transition:'all 0.15s' }}>
                  ···
                </button>

                {rowMenuId === lead.id && (
                  <>
                  {/* Transparenter Overlay zum Schließen */}
                  <div onClick={e => { e.stopPropagation(); setRowMenuId(null) }}
                    style={{ position:'fixed', inset:0, zIndex:998 }}/>
                  <div data-row-menu style={{ position:'absolute', right:0, top:34, background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.16)', border:'1px solid #E5E7EB', minWidth:220, zIndex:9999, padding:'6px 0', maxHeight:480, overflowY:'auto' }}>

                    {/* Profil öffnen */}
                    <button onClick={() => { setRowMenuId(null); sessionStorage.setItem('llr_lead_nav', JSON.stringify(filtered.map(l=>l.id))); navigate(`/leads/${lead.id}`) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <span style={{ width:20, textAlign:'center' }}>👤</span> Profil öffnen
                    </button>

                    {/* Anruf loggen */}
                    <button onClick={async () => {
                      setRowMenuId(null)
                      await supabase.from('activities').insert({ lead_id:lead.id, user_id:session.user.id, type:'call', subject:'Anruf', direction:'outbound', occurred_at:new Date().toISOString() })
                      showFlash('📞 Anruf geloggt', 'success')
                    }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <span style={{ width:20, textAlign:'center' }}>📞</span> Anruf loggen
                    </button>

                    {/* Follow-up — SubMenü mit Schnellauswahl */}
                    <div style={{ width:'100%' }}>
                      <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Follow-up setzen</div>
                      {[['Heute', 0], ['Morgen', 1], ['In 3 Tagen', 3], ['In 7 Tagen', 7], ['In 14 Tagen', 14]].map(([label, days]) => {
                        const d = new Date(); d.setDate(d.getDate()+days)
                        const iso = d.toISOString().split('T')[0]
                        return (
                          <button key={days} onClick={async () => {
                            setRowMenuId(null)
                            await supabase.from('leads').update({ next_followup: iso }).eq('id', lead.id)
                            setLeads(prev => prev.map(l => l.id===lead.id ? {...l, next_followup:iso} : l))
                            showFlash(`📅 Follow-up: ${label}`, 'success')
                          }} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 14px 7px 28px', background:'none', border:'none', cursor:'pointer', fontSize:12, color:lead.next_followup===iso?'rgb(49,90,231)':'rgb(20,20,43)', textAlign:'left' }}
                            onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            <span>{label}</span>
                            <span style={{ fontSize:11, color:'#94A3B8' }}>{new Date(iso).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</span>
                          </button>
                        )
                      })}
                      {lead.next_followup && (
                        <button onClick={async () => {
                          setRowMenuId(null)
                          await supabase.from('leads').update({ next_followup: null }).eq('id', lead.id)
                          setLeads(prev => prev.map(l => l.id===lead.id ? {...l, next_followup:null} : l))
                          showFlash('Follow-up entfernt', 'success')
                        }} style={{ width:'100%', display:'flex', alignItems:'center', padding:'7px 14px 7px 28px', background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#DC2626', textAlign:'left' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#FEF2F2'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                          ✕ Follow-up löschen
                        </button>
                      )}
                    </div>

                    {/* Favorit */}
                    <button onClick={async () => { setRowMenuId(null)
                      const v = !lead.is_favorite
                      await supabase.from('leads').update({ is_favorite:v }).eq('id', lead.id)
                      setLeads(prev => prev.map(l => l.id===lead.id ? {...l, is_favorite:v} : l))
                    }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <span style={{ width:20, textAlign:'center' }}>{lead.is_favorite?'⭐':'☆'}</span> {lead.is_favorite?'Aus Favoriten':'Zu Favoriten'}
                    </button>

                    {/* Liste zuweisen */}
                    {lists.length > 0 && (
                      <>
                        <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Liste zuweisen</div>
                        {lists.map(lst => {
                          const inList = lead.lead_list_members?.some(m => m.list_id === lst.id)
                          return (
                            <button key={lst.id} onClick={async () => { setRowMenuId(null)
                              if (inList) {
                                await supabase.from('lead_list_members').delete().eq('lead_id', lead.id).eq('list_id', lst.id)
                                setLeads(prev => prev.map(l => l.id===lead.id ? {...l, lead_list_members:(l.lead_list_members||[]).filter(m=>m.list_id!==lst.id)} : l))
                              } else {
                                await supabase.from('lead_list_members').insert({ lead_id:lead.id, list_id:lst.id })
                                setLeads(prev => prev.map(l => l.id===lead.id ? {...l, lead_list_members:[...(l.lead_list_members||[]),{list_id:lst.id,lead_id:lead.id}]} : l))
                              }
                            }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'7px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:inList?lst.color:'rgb(20,20,43)', textAlign:'left' }}
                              onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                              <span style={{ width:8, height:8, borderRadius:'50%', background:lst.color, flexShrink:0, marginLeft:6 }}/>
                              <span style={{ flex:1 }}>{lst.name}</span>
                              {inList && <span style={{ fontSize:12 }}>✓</span>}
                            </button>
                          )
                        })}
                      </>
                    )}

                    {/* LinkedIn */}
                    {(lead.linkedin_url || lead.profile_url) && (
                      <>
                        <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
                        <a href={lead.linkedin_url||lead.profile_url} target="_blank" rel="noreferrer"
                          onClick={() => setRowMenuId(null)}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#0A66C2', textDecoration:'none' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                          <span style={{ width:20, textAlign:'center', fontWeight:900, fontSize:12 }}>in</span> LinkedIn öffnen
                        </a>
                      </>
                    )}

                    {/* Team teilen */}
                    {team && lead.user_id === session?.user?.id && (
                      <>
                        <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
                        <button onClick={async () => { setRowMenuId(null)
                          if (lead.is_shared) {
                            await unshareLeadFromTeam(lead.id)
                            setLeads(prev => prev.map(l => l.id===lead.id ? {...l,is_shared:false,team_id:null} : l))
                          } else {
                            await shareLeadWithTeam(lead.id)
                            setLeads(prev => prev.map(l => l.id===lead.id ? {...l,is_shared:true,team_id:team.id} : l))
                          }
                        }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:lead.is_shared?'#059669':'rgb(20,20,43)', textAlign:'left' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                          <span style={{ width:20, textAlign:'center' }}>👥</span> {lead.is_shared?`Sharing aufheben`:`Mit "${team.name}" teilen`}
                        </button>
                      </>
                    )}

                    {/* Löschen */}
                    <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
                    <button onClick={async () => { setRowMenuId(null)
                      if (!window.confirm('Lead löschen?')) return
                      await supabase.from('leads').delete().eq('id', lead.id)
                      const next = leads.filter(l => l.id !== lead.id)
                      setLeads(next); applyFilter(next, search, listFilter, sortBy)
                    }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#DC2626', textAlign:'left' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#FEF2F2'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <span style={{ width:20, textAlign:'center' }}>🗑</span> Lead löschen
                    </button>
                  </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

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
            const insertData = { user_id:uid, first_name:form.first_name||'', last_name:form.last_name||'', job_title:form.job_title||'', company:form.company||'', email:form.email||'', linkedin_url:form.linkedin_url||'', status:form.status||'Lead' }
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
              {[['Position / Titel','job_title'],['Unternehmen','company'],['E-Mail','email'],['LinkedIn URL','linkedin_url']].map(([l,k]) => (
                <div key={k}><label style={lbl}>{l}</label><input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}/></div>
              ))}
              <div><label style={lbl}>Status</label>
                <select value={form.status||'Lead'} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={inp}>
                  {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
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
            const { data } = await supabase.from('lead_lists').insert({ name:listForm.name, color:listForm.color||LIST_COLORS[lists.length%LIST_COLORS.length], user_id:session.user.id }).select().single()
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
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Erstellen</button>
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
                <p style={{ fontSize:13, color:'#64748B', marginBottom:16 }}>
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
                    const inserts = rows.map(r => ({
                      user_id:uid, first_name:r['vorname']||r['first name']||'', last_name:r['nachname']||r['last name']||'',
                      email:r['e-mail']||r['email']||'', linkedin_url:r['linkedin']||r['linkedin url']||'',
                      company:r['unternehmen']||r['company']||'', job_title:r['position']||r['job title']||r['titel']||'', status:'Lead'
                    }))
                    const { data, error } = await supabase.from('leads').insert(inserts).select()
                    if (!error && data) { const next = [...data, ...leads]; setLeads(next); applyFilter(next, search, listFilter, sortBy) }
                    setImportResult({ count:data?.length||0, error:error?.message })
                    setImporting(false)
                  }}
                  style={{ display:'block', width:'100%', padding:'12px', border:'2px dashed #E5E7EB', borderRadius:10, cursor:'pointer', fontSize:13 }}/>
                {importing && <div style={{ marginTop:12, textAlign:'center', color:'#64748B', fontSize:13 }}>Importiere…</div>}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                {importResult.error ? (
                  <><div style={{ fontSize:32, marginBottom:8 }}>⚠️</div><div style={{ color:'#DC2626', fontWeight:700 }}>{importResult.error}</div></>
                ) : (
                  <><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div style={{ fontWeight:700, color:'#065F46' }}>{importResult.count} Leads importiert</div></>
                )}
                <button onClick={() => { setImportModal(false); setImportResult(null) }} style={{ marginTop:16, padding:'8px 20px', borderRadius:999, border:'none', background:'rgb(49,90,231)', color:'#fff', fontWeight:700, cursor:'pointer' }}>Fertig</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
