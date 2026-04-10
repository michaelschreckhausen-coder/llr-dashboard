// CRM Unified: first_name, last_name, job_title, status Lead/LQL/MQN/MQL/SQL
import React, { useEffect, useState, useRef } from 'react'

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

/* ââ Helpers ââ */
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

/* ââ Status Badge ââ */
function StatusBadge({ status, small }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.new
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:small?'2px 8px':'4px 12px', borderRadius:999, fontSize:small?10:11, fontWeight:700, background:s.bg, color:s.color, border:'1px solid '+s.border, whiteSpace:'nowrap' }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

/* ââ Modal wrapper ââ */
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

/* ââââââââââââââââââââââââââââââââââââââââââ
   LEAD PROFILE PANEL (Waalaxy-style)
ââââââââââââââââââââââââââââââââââââââââââ */
export default function Leads({ session }) {
  const navigate = useNavigate()
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
      supabase.from('leads').select('*, lead_list_members(list_id,lead_id)').eq('user_id', uid).order('created_at', { ascending:false }),
      supabase.from('lead_lists').select('*, lead_list_members(lead_id)').eq('user_id', uid).order('created_at', { ascending:true }),
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
      res = res.filter(l => (fullName(l)||'').toLowerCase().includes(ql) || (l.company||'').toLowerCase().includes(ql) || (l.job_title||'').toLowerCase().includes(ql))
    }
    if (lf !== 'all') res = res.filter(l => l.lead_list_members?.some(m => m.list_id === lf))
    const qFilter = qf !== undefined ? qf : quickFilter
    if (qFilter === 'hot')       res = res.filter(l => l.ai_buying_intent === 'hoch')
    if (qFilter === 'pipeline')  res = res.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal' && l.deal_stage !== 'verloren')
    if (qFilter === 'highscore') res = res.filter(l => (l.hs_score || 0) >= 70)
    if (qFilter === 'favorite')    res = res.filter(l => !!l.is_favorite)
    if (qFilter === 'no_followup') res = res.filter(l => !l.next_followup || new Date(l.next_followup) < new Date())
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
    const headers = ['Vorname','Nachname','E-Mail','Telefon','Unternehmen','Position','Stage','Score','Buying Intent','LinkedIn','Erstellt']
    const rows = [headers]
    filtered.forEach(l => {
      const fname = l.first_name || (l.name||'').split(' ')[0] || ''
      const lname = l.last_name  || (l.name||'').split(' ').slice(1).join(' ') || ''
      rows.push([
        fname, lname, l.email||'', l.phone||'',
        l.company||'', l.job_title||l.headline||'',
        l.deal_stage||'', l.hs_score||0,
        l.ai_buying_intent||'',
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

  return (
    <div style={{ display:'flex', height:'calc(100vh - 0px)', overflow:'hidden', position:'relative' }}>

      {/* ââ Left: Lists sidebar ââ */}
      <div style={{ width:240, borderRight:'1px solid #E5E7EB', display:'flex', flexDirection:'column', background:'#FAFAFA', flexShrink:0 }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>Listen</span>
          <button onClick={() => { setModal('list'); setListForm({}) }} style={{ width:26, height:26, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B' }}>
            <PlusIcon/>
          </button>
        </div>
        <div style={{ overflowY:'auto', flex:1, padding:'6px 8px' }}>
          {[{ id:'all', name:'Alle Leads', count:leads.length, color:'rgb(49,90,231)' }, ...lists.map(l=>({...l, count:l.lead_list_members?.length||0}))].map(l => (
            <button key={l.id} onClick={()=>handleFilter(l.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:'none', background:listFilter===l.id?l.color+'18':'transparent', cursor:'pointer', marginBottom:2, textAlign:'left', transition:'all 0.12s' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:l.color, flexShrink:0 }}/>
              <span style={{ flex:1, fontSize:13, fontWeight:listFilter===l.id?700:500, color:listFilter===l.id?l.color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(l)}</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#94A3B8', background:'rgb(238,241,252)', padding:'1px 7px', borderRadius:999 }}>{l.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ââ Center: Lead list ââ */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, transition:'all 0.2s' }}>

        {/* Toolbar */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', gap:10, alignItems:'center', background:'#fff', flexShrink:0 }}>
          <div style={{ flex:1, position:'relative' }}>
            <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94A3B8', pointerEvents:'none' }}><SearchIcon/></div>
            <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Name, Unternehmen oder Stichwortâ¦"
              style={{ ...inp, paddingLeft:34, width:'100%' }}/>
          </div>
          <button onClick={exportCSV} style={{...inp,width:'auto',color:'#059669',cursor:'pointer',background:'#ECFDF5',border:'1px solid #A7F3D0',fontWeight:700,display:'flex',alignItems:'center',gap:5,padding:'7px 12px',whiteSpace:'nowrap'}}>⬇ CSV ({filtered.length})</button>
        {/* Quick-Filter Chips */}
        <div style={{ display:'flex', gap:6, padding:'0 16px 10px', flexWrap:'wrap' }}>
          {[
            { id:'hot',       label:'🔥 Hot Leads',   color:'#ef4444', bg:'#FEF2F2', border:'#FECACA' },
            { id:'pipeline',  label:'💼 In Pipeline',  color:'#3b82f6', bg:'#EFF6FF', border:'#BFDBFE' },
            { id:'highscore', label:'⚡ Score ≥ 70',   color:'#f59e0b', bg:'#FFFBEB', border:'#FDE68A' },
            { id:'favorite',  label:'⭐ Favoriten',    color:'#d97706', bg:'#FEF3C7', border:'#FDE68A' },
          ].map(chip => (
            <button key={chip.id} onClick={() => handleQuickFilter(chip.id)}
              style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid', transition:'all 0.15s',
                borderColor: quickFilter===chip.id ? chip.color : chip.border,
                background:  quickFilter===chip.id ? chip.bg : '#fff',
                color:       chip.color,
                boxShadow:   quickFilter===chip.id ? '0 0 0 2px '+chip.color+'22' : 'none',
              }}>
              {chip.label}
              {quickFilter===chip.id && ' ×'}
            </button>
          ))}
          {quickFilter && (
            <span style={{ fontSize:11, color:'#94A3B8', alignSelf:'center', marginLeft:4 }}>
              {filtered.length} von {leads.length} Leads
            </span>
          )}
          {(quickFilter || search) && (
            <button onClick={() => { handleQuickFilter(null); handleSearch('') }}
              style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid #E2E8F0', background:'#F1F5F9', color:'#64748B' }}>
              ✕ Zurücksetzen
            </button>
          )}
        </div>

          <select value={sortBy} onChange={e=>handleSort(e.target.value)} style={{ ...inp, width:'auto', color:'#475569', cursor:'pointer' }}>
            <option value="date">Neueste zuerst</option>
            <option value="score">Score ↓</option>
            <option value="followup">📅 Followup</option>
            <option value="name">Name A→Z</option>
            <option value="stage">Stage</option>
            <option value="status">Status</option>
          </select>
          <button onClick={() => setCompact(c => !c)}
            title={compact ? 'Normalansicht' : 'Kompaktansicht'}
            style={{ padding:'8px 12px', borderRadius:10, border:'1.5px solid '+(compact?'rgb(49,90,231)':'#E2E8F0'), background:compact?'#EFF6FF':'#F8FAFC', fontSize:12, fontWeight:700, cursor:'pointer', color:compact?'rgb(49,90,231)':'#475569' }}>
            {compact ? '≡ Normal' : '⊟ Kompakt'}
          </button>
          <button onClick={() => setImportModal(true)}
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:12, fontWeight:700, cursor:'pointer', color:'#475569', display:'flex', alignItems:'center', gap:5 }}>
            ⬆ CSV Import
          </button>
          <button onClick={() => { setModal('add'); setForm({ status:'Lead' }) }}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:999, background:'rgb(49,90,231)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0, boxShadow:'0 1px 4px rgba(10,102,194,0.3)', whiteSpace:'nowrap' }}>
            <PlusIcon/> Lead hinzufügen
          </button>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div style={{ padding:'8px 16px', background:'#EFF6FF', borderBottom:'1px solid #BFDBFE', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'#1D4ED8' }}>{selectedIds.size} ausgewählt</span>
            <select onChange={async e => {
              if (!e.target.value) return
              const stage = e.target.value
              await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ deal_stage: stage }).eq('id', id)))
              setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, deal_stage: stage} : l))
              applyFilter(leads.map(l => selectedIds.has(l.id) ? {...l, deal_stage: stage} : l), search, listFilter, sortBy)
              setSelectedIds(new Set()); e.target.value = ''
            }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #BFDBFE', background:'#fff', fontSize:12, cursor:'pointer' }}>
              <option value=''>→ Stage setzen…</option>
              {[['kein_deal','Neu'],['prospect','Kontaktiert'],['opportunity','Gespräch'],['angebot','Qualifiziert'],['verhandlung','Angebot'],['gewonnen','Gewonnen'],['verloren','Verloren']].map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {lists.length > 0 && (
              <select onChange={async e => {
                if (!e.target.value) return
                const listId = e.target.value
                const inserts = [...selectedIds].map(id => ({ lead_id:id, list_id:listId }))
                await supabase.from('lead_list_members').upsert(inserts, { onConflict:'lead_id,list_id' })
                setLeads(prev => prev.map(l => selectedIds.has(l.id) && !l.lead_list_members?.some(m=>m.list_id===listId)
                  ? {...l, lead_list_members:[...(l.lead_list_members||[]),{list_id:listId,lead_id:l.id}]} : l))
                setLists(prev => prev.map(li => li.id===listId ? {...li, lead_list_members:[...(li.lead_list_members||[]),...[...selectedIds].filter(id=>!li.lead_list_members?.some(m=>m.lead_id===id)).map(id=>({lead_id:id}))]} : li))
                setSelectedIds(new Set()); e.target.value = ''
              }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #C7D2FE', background:'#fff', fontSize:12, cursor:'pointer' }}>
                <option value=''>☰ Zu Liste…</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <select onChange={async e => {
              if (!e.target.value) return
              const days = parseInt(e.target.value)
              const date = new Date(); date.setDate(date.getDate() + days)
              const iso = date.toISOString()
              await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ next_followup: iso }).eq('id', id)))
              setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, next_followup: iso} : l))
              setSelectedIds(new Set()); e.target.value = ''
            }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #A7F3D0', background:'#ECFDF5', fontSize:12, cursor:'pointer', color:'#065F46' }}>
              <option value=''>📅 Follow-up…</option>
              <option value='0'>Heute</option>
              <option value='1'>Morgen</option>
              <option value='3'>In 3 Tagen</option>
              <option value='7'>In 7 Tagen</option>
              <option value='14'>In 14 Tagen</option>
            </select>
            <button onClick={async () => {
              if (!window.confirm(`${selectedIds.size} Leads wirklich löschen?`)) return
              await Promise.all([...selectedIds].map(id => supabase.from('leads').delete().eq('id', id)))
              const next = leads.filter(l => !selectedIds.has(l.id))
              setLeads(next); applyFilter(next, search, listFilter, sortBy); setSelectedIds(new Set())
            }} style={{ padding:'5px 12px', borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              🗑 Löschen
            </button>
            <select onChange={async e => {
              if (!e.target.value) return
              const days = Number(e.target.value)
              const d = new Date(); d.setDate(d.getDate()+days); d.setHours(9,0,0,0)
              const iso = d.toISOString().split('T')[0]
              await Promise.all([...selectedIds].map(id => supabase.from('leads').update({ next_followup: iso }).eq('id', id)))
              setLeads(prev => prev.map(l => selectedIds.has(l.id) ? {...l, next_followup: iso} : l))
              setSelectedIds(new Set()); e.target.value = ''
            }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #BFDBFE', background:'#fff', fontSize:12, cursor:'pointer' }}>
              <option value=''>📅 Follow-up…</option>
              <option value='0'>Heute</option>
              <option value='1'>Morgen</option>
              <option value='3'>In 3 Tagen</option>
              <option value='7'>In 7 Tagen</option>
              <option value='14'>In 14 Tagen</option>
            </select>
            <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:8, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:12, cursor:'pointer' }}>
              × Abwählen
            </button>
          </div>
        )}

        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:'48px 1fr 120px 100px 80px 130px', alignItems:'center', padding:'0 16px', height:compact?28:38, background:'rgb(238,241,252)', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
            <input type="checkbox"
              checked={filtered.length > 0 && filtered.every(l => selectedIds.has(l.id))}
              onChange={e => {
                if (e.target.checked) setSelectedIds(new Set(filtered.map(l => l.id)))
                else setSelectedIds(new Set())
              }}
              title="Alle auswählen"
              style={{ width:15, height:15, cursor:'pointer', accentColor:'#3b82f6' }}/>
          </div>
          {[['Name & Position','name'],['Liste',null],['Stage','stage'],['Score','score'],['Aktionen',null]].map(([h,key],i) => (
            <div key={i} onClick={() => key && handleSort(sortBy===key?'-'+key:key)}
              style={{ fontSize:10, fontWeight:700, color: key?'#64748B':'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', cursor:key?'pointer':'default', display:'flex', alignItems:'center', gap:3, userSelect:'none' }}>
              {h}
              {key && <span style={{ opacity: sortBy===key||sortBy==='-'+key ? 1 : 0.3, fontSize:9 }}>{sortBy==='-'+key?'▼':'▲'}</span>}
            </div>
          ))}
        </div>

        {/* Flash */}
        {flash && (
          <div style={{ margin:'8px 16px', padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:600, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
            {flash.msg}
          </div>
        )}

        {/* Lead rows */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ padding:56, textAlign:'center', color:'#94A3B8', fontSize:14 }}>â³ Lade Leadsâ¦</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:56, textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>ð¯</div>
              <div style={{ fontWeight:700, fontSize:15, color:'#475569' }}>Keine Leads gefunden</div>
              <div style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Füge deinen ersten Lead hinzu</div>
            </div>
          ) : filtered.map((lead, idx) => {
            const isSelected = selectedLead?.id === lead.id
            const leadLists = lists.filter(l => l.lead_list_members?.some(m => m.lead_id === lead.id))
            const [hovered, setHovered] = [false, () => {}] // managed via onMouseEnter/Leave
            return (
              <div key={lead.id}
                onClick={() => setSelectedLead(isSelected ? null : lead)}
                style={{ display:'grid', gridTemplateColumns:'48px 1fr 120px 100px 80px 140px', alignItems:'center', padding:'0 16px', minHeight:compact?40:64, borderBottom:'1px solid rgb(238,241,252)', cursor:'pointer', background:isSelected?'rgba(49,90,231,0.08)':'#fff', borderLeft:isSelected?'3px solid rgb(49,90,231)':'3px solid transparent', transition:'all 0.12s' }}
                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background='rgb(238,241,252)' }}
                onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background='#fff' }}>

                {/* Checkbox */}
                <div onClick={e => e.stopPropagation()} style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <input type="checkbox" checked={selectedIds.has(lead.id)}
                    onChange={e => { setSelectedIds(prev => { const n=new Set(prev); e.target.checked?n.add(lead.id):n.delete(lead.id); return n }) }}
                    style={{ width:15, height:15, cursor:'pointer', accentColor:'#3b82f6' }}/>
                </div>

                {/* Name + Job-Titel + Datum */}
                <div style={{ minWidth:0, paddingRight:8 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(lead) || '—'}</div>
                  <div style={{ fontSize:12, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                    {lead.job_title || lead.headline || ''}
                    {lead.company && <span style={{ color:'rgb(49,90,231)', fontWeight:500 }}> · {lead.company}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#94A3B8', marginTop:2, display:'flex', gap:6, flexWrap:'wrap' }}>
                    {lead.li_last_interaction_at
                      ? <span title={'Letzte Interaktion: '+new Date(lead.li_last_interaction_at).toLocaleDateString('de-DE')} style={{ color:'#3b82f6' }}>⚡ {relDate(lead.li_last_interaction_at)}</span>
                      : <span title={new Date(lead.created_at).toLocaleDateString('de-DE')}>{relDate(lead.created_at)}</span>
                    }
                    {lead.next_followup && (() => {
                      const due = new Date(lead.next_followup)
                      const diff = Math.ceil((due - new Date()) / 86400000)
                      const isOver = diff < 0
                      return (
                        <span style={{ color: isOver ? '#ef4444' : diff <= 1 ? '#d97706' : '#16a34a', fontWeight:600 }}>
                          📅 {isOver ? `${Math.abs(diff)}d über` : diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : `in ${diff}d`}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Lists */}
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {leadLists.slice(0,2).map(l => (
                    <span key={l.id} style={{ padding:'2px 7px', borderRadius:999, fontSize:10, fontWeight:600, background:l.color+'22', color:l.color, border:'1px solid '+l.color+'44', whiteSpace:'nowrap' }}>{fullName(l)}</span>
                  ))}
                  {leadLists.length > 2 && <span style={{ fontSize:10, color:'#94A3B8', fontWeight:600 }}>+{leadLists.length-2}</span>}
                </div>

                {/* Deal Stage */}
                <div>
                  {lead.deal_stage && lead.deal_stage !== 'kein_deal' ? (
                    <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700,
                      background:lead.deal_stage==='gewonnen'?'#F0FDF4':lead.deal_stage==='verhandlung'?'#FFF7ED':lead.deal_stage==='angebot'?'#FFFBEB':lead.deal_stage==='opportunity'?'#F5F3FF':'#EFF6FF',
                      color:lead.deal_stage==='gewonnen'?'#22c55e':lead.deal_stage==='verhandlung'?'#f97316':lead.deal_stage==='angebot'?'#f59e0b':lead.deal_stage==='opportunity'?'#8b5cf6':'#3b82f6',
                      whiteSpace:'nowrap' }}>
                      {lead.deal_stage==='gewonnen'?'Gewonnen ✓':lead.deal_stage==='verhandlung'?'Angebot':lead.deal_stage==='angebot'?'Qualif.':lead.deal_stage==='opportunity'?'Gespräch':'Kontaktiert'}
                    </span>
                  ) : <span style={{ color:'#CBD5E1', fontSize:10 }}>—</span>}
                </div>

                {/* HubSpot Score */}
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  {lead.hs_score > 0 ? (
                    <div title={`Score ${lead.hs_score}: ${lead.hs_score>=70?'Hot Lead — Sofort handeln!':lead.hs_score>=40?'Warm Lead — Im Blick behalten':' Cold Lead — Weiter nurturing'}`} style={{ display:'flex', alignItems:'center', gap:4, cursor:'help' }}>
                      <div style={{ width:28, height:4, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:Math.min(lead.hs_score,100)+'%', background:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6', borderRadius:99 }}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6' }}>{lead.hs_score}</span>
                    </div>
                  ) : <span style={{ color:'#CBD5E1', fontSize:11 }}>—</span>}
                </div>

                {/* Aktionen — dauerhaft sichtbar */}
                <div style={{ display:'flex', alignItems:'center', gap:5 }} onClick={e => e.stopPropagation()}>
                  <button onClick={async () => {
                    const v = !lead.is_favorite
                    await supabase.from('leads').update({ is_favorite: v }).eq('id', lead.id)
                    setLeads(prev => prev.map(l => l.id === lead.id ? {...l, is_favorite: v} : l))
                  }} title={lead.is_favorite ? 'Aus Favoriten' : 'Zu Favoriten'}
                    style={{ width:28, height:28, borderRadius:7, border:'1px solid '+(lead.is_favorite?'#FDE68A':'#E2E8F0'), background:lead.is_favorite?'#FFFBEB':'#F8FAFC', fontSize:14, cursor:'pointer', flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    {lead.is_favorite ? '⭐' : '☆'}
                  </button>
                  {/* Quick Follow-up */}
                  <button onClick={async () => {
                    const d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0)
                    const iso = d.toISOString().split('T')[0]
                    await supabase.from('leads').update({ next_followup: iso }).eq('id', lead.id)
                    setLeads(prev => prev.map(l => l.id === lead.id ? {...l, next_followup: iso} : l))
                  }} title="Follow-up: Morgen setzen"
                    style={{ width:28, height:28, borderRadius:7, border:'1px solid '+(lead.next_followup ? '#BFDBFE' : '#E2E8F0'), background:lead.next_followup?'#EFF6FF':'#F8FAFC', fontSize:13, cursor:'pointer', flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    📅
                  </button>
                  {(lead.linkedin_url || lead.profile_url) ? (
                    <a href={lead.linkedin_url || lead.profile_url} target="_blank" rel="noreferrer"
                      title="LinkedIn öffnen"
                      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:7, border:'1px solid rgba(10,102,194,0.3)', background:'rgba(10,102,194,0.08)', color:'#0A66C2', textDecoration:'none', fontWeight:900, fontSize:11, flexShrink:0, transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(10,102,194,0.18)' }}
                      onMouseLeave={e => { e.currentTarget.style.background='rgba(10,102,194,0.08)' }}>
                      in
                    </a>
                  ) : (
                    <div style={{ width:28, height:28, borderRadius:7, border:'1px dashed #E5E7EB', background:'#FAFAFA', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:11, color:'#D1D5DB', fontWeight:900 }}>in</span>
                    </div>
                  )}
                  {/* Listen-Zuweisung */}
                  <div style={{ position:'relative' }}>
                    <button data-list-menu
                      onClick={e => { e.stopPropagation(); setListMenuLead(listMenuLead === lead.id ? null : lead.id) }}
                      title="Zu Liste hinzufügen"
                      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:7, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#64748B', fontSize:13, cursor:'pointer', flexShrink:0, transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(49,90,231,0.08)'; e.currentTarget.style.color='rgb(49,90,231)' }}
                      onMouseLeave={e => { e.currentTarget.style.background='#F8FAFC'; e.currentTarget.style.color='#64748B' }}>
                      ☰
                    </button>
                    {listMenuLead === lead.id && (
                      <div data-list-menu style={{ position:'absolute', right:0, top:32, background:'#fff', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border:'1px solid #E5E7EB', minWidth:180, zIndex:999, padding:6 }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 8px 6px' }}>Liste zuweisen</div>
                        {lists.length === 0 && (
                          <div style={{ fontSize:12, color:'#94A3B8', padding:'6px 8px' }}>Noch keine Listen. Erst eine Liste erstellen (+ Button links).</div>
                        )}
                        {lists.map(lst => {
                          const inList = lead.lead_list_members?.some(m => m.list_id === lst.id)
                          return (
                            <div key={lst.id}
                              onClick={async () => {
                                if (inList) {
                                  await supabase.from('lead_list_members').delete().eq('lead_id', lead.id).eq('list_id', lst.id)
                                  setLeads(prev => prev.map(l => l.id === lead.id ? {...l, lead_list_members: (l.lead_list_members||[]).filter(m => m.list_id !== lst.id)} : l))
                                  setLists(prev => prev.map(l => l.id === lst.id ? {...l, lead_list_members: (l.lead_list_members||[]).filter(m => m.lead_id !== lead.id)} : l))
                                } else {
                                  await supabase.from('lead_list_members').insert({ lead_id: lead.id, list_id: lst.id })
                                  setLeads(prev => prev.map(l => l.id === lead.id ? {...l, lead_list_members: [...(l.lead_list_members||[]), {list_id: lst.id, lead_id: lead.id}]} : l))
                                  setLists(prev => prev.map(l => l.id === lst.id ? {...l, lead_list_members: [...(l.lead_list_members||[]), {lead_id: lead.id}]} : l))
                                }
                                setListMenuLead(null)
                              }}
                              style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 8px', borderRadius:7, cursor:'pointer', background:inList?'#F0FDF4':'transparent' }}
                              onMouseEnter={e => { if(!inList) e.currentTarget.style.background='#F8FAFC' }}
                              onMouseLeave={e => { if(!inList) e.currentTarget.style.background='transparent' }}>
                              <div style={{ width:10, height:10, borderRadius:'50%', background:lst.color||'#3b82f6', flexShrink:0 }}/>
                              <span style={{ fontSize:12, fontWeight:600, color:'#0F172A', flex:1 }}>{lst.name}</span>
                              {inList && <span style={{ fontSize:10, color:'#16a34a' }}>✓</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); sessionStorage.setItem('llr_lead_nav', JSON.stringify(filtered.map(l=>l.id))); navigate(`/leads/${lead.id}`) }}
                    title="Vollständiges Profil"
                    style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'5px 10px', borderRadius:7, border:'1px solid rgba(49,90,231,0.3)', background:'rgba(49,90,231,0.07)', color:'rgb(49,90,231)', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s', flexShrink:0 }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(49,90,231,0.15)'; e.currentTarget.style.borderColor='rgba(49,90,231,0.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.background='rgba(49,90,231,0.07)'; e.currentTarget.style.borderColor='rgba(49,90,231,0.3)' }}>
                    ↗ Profil
                  </button>
                </div>
              </div>
            )
          })}
        </div>

                {/* Footer count */}
        <div style={{ padding:'8px 20px', borderTop:'1px solid #E5E7EB', fontSize:12, color:'#94A3B8', background:'#FAFAFA', flexShrink:0 }}>
          {filtered.length} von {leads.length} Leads
        </div>
      </div>

      {/* ââ Right: Lead Profile Panel ââ */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
        />
      )}

      {/* ââ MODAL: Add Lead ââ */}
      {modal === 'add' && (
        <Modal title="Lead hinzufügen" onClose={() => setModal(null)}>
          <form onSubmit={handleAddLead}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Name *</label>
                  <input value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp} placeholder="Max Mustermann" required/>
                </div>
                <div>
                  <label style={lbl}>Unternehmen</label>
                  <input value={form.company||''} onChange={e=>setForm(f=>({...f,company:e.target.value}))} style={inp} placeholder="ACME GmbH"/>
                </div>
              </div>
              <div>
                <label style={lbl}>Position / Headline</label>
                <input value={form.job_title||''} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} style={inp} placeholder="CEO | Founder"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>E-Mail</label>
                  <input type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={inp} placeholder="max@firma.de"/>
                </div>
                <div>
                  <label style={lbl}>Telefon</label>
                  <input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={inp} placeholder="+49 ..."/>
                </div>
              </div>
              <div>
                <label style={lbl}>LinkedIn URL</label>
                <input value={form.linkedin_url||''} onChange={e=>setForm(f=>({...f,linkedin_url:e.target.value}))} style={inp} placeholder="https://linkedin.com/in/..."/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Standort</label>
                  <input value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={inp} placeholder="Berlin, Deutschland"/>
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status||'Lead'} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Notizen</label>
                <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical', lineHeight:1.5 }} placeholder="Persönliche Notizenâ¦"/>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid rgb(238,241,252)' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.5:1 }}>
                {saving ? 'â³' : '+ Lead hinzufügen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ââ MODAL: Add List ââ */}
      {importModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={() => { setImportModal(false); setImportResult(null) }}>
          <div style={{ background:'#fff', borderRadius:20, width:480, maxWidth:'95vw', padding:0, boxShadow:'0 24px 64px rgba(15,23,42,0.2)', overflow:'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:'#0F172A' }}>⬆ CSV Import</div>
                <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>Leads aus einer CSV-Datei importieren</div>
              </div>
              <button onClick={() => { setImportModal(false); setImportResult(null) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:22 }}>×</button>
            </div>
            <div style={{ padding:'20px 24px' }}>
              <div style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', marginBottom:16, fontSize:12, color:'#475569', lineHeight:1.6 }}>
                <strong>Erwartete Spalten (erste Zeile = Header):</strong><br/>
                <code style={{ fontSize:11 }}>first_name, last_name, email, job_title, company, profile_url</code><br/>
                Deutsch: <code style={{ fontSize:11 }}>vorname, nachname, position, firma, linkedin</code>
              </div>
              {!importResult ? (
                <label style={{ display:'block', border:'2px dashed #CBD5E1', borderRadius:12, padding:'32px', textAlign:'center', cursor:'pointer', background:'#F8FAFC', transition:'all 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='#CBD5E1'}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:4 }}>CSV-Datei auswählen</div>
                  <div style={{ fontSize:12, color:'#94A3B8' }}>oder hier ablegen</div>
                  <input type="file" accept=".csv,text/csv" style={{ display:'none' }}
                    onChange={e => e.target.files[0] && handleCsvImport(e.target.files[0])}/>
                </label>
              ) : importResult.error ? (
                <div style={{ background:'#FEF2F2', borderRadius:10, padding:'14px 16px', color:'#991B1B', fontSize:13 }}>
                  ❌ {importResult.error}
                </div>
              ) : (
                <div style={{ background:'#F0FDF4', borderRadius:10, padding:'14px 16px', color:'#15803D', fontSize:13, fontWeight:700, textAlign:'center' }}>
                  ✅ {importResult.count} Leads erfolgreich importiert!
                </div>
              )}
              {importing && (
                <div style={{ textAlign:'center', padding:'24px', color:'#64748B', fontSize:13 }}>⏳ Importiere...</div>
              )}
            </div>
            <div style={{ padding:'12px 24px 20px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => { setImportModal(false); setImportResult(null) }}
                style={{ padding:'9px 24px', borderRadius:10, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {importResult?.count ? 'Fertig' : 'Abbrechen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'list' && (
        <Modal title="Neue Liste" onClose={() => setModal(null)} width={380}>
          <form onSubmit={handleAddList}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={lbl}>Listenname *</label>
                <input value={listForm.name||''} onChange={e=>setListForm(f=>({...f,name:e.target.value}))} style={inp} placeholder="z.B. Potenzielle Kunden Q2" required/>
              </div>
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
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid rgb(238,241,252)' }}>
              <button type="button" onClick={()=>setModal(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Erstellen
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
