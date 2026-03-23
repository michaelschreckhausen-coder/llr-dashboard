import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = ['new', 'contacted', 'replied', 'converted']
const STATUS_LABELS  = { new: 'Neu', contacted: 'Kontaktiert', replied: 'Geantwortet', converted: 'Konvertiert' }
const LIST_COLORS    = ['#0a66c2','#057642','#b25e09','#cc1016','#7c3aed','#0891b2','#be185d','#374151']

const STATUS_STYLE = {
  new:       { border: '#0a66c2', color: '#0a66c2', bg: '#e8f0fb' },
  contacted: { border: '#b25e09', color: '#b25e09', bg: '#fff8e6' },
  replied:   { border: '#057642', color: '#057642', bg: '#e6f4ee' },
  converted: { border: '#7c3aed', color: '#7c3aed', bg: '#f0eaf9' },
}

const SN = {
  sidebar:    '#1d2226',
  sidebarTxt: '#b0b7bf',
  active:     '#0a66c2',
  blue:       '#0073b1',
  bg:         '#f3f2ef',
  border:     '#e0e0e0',
  white:      '#ffffff',
  textPrimary:'#000000e6',
  textMuted:  '#666666',
}

/* ── SearchBar: Sales Navigator-style active search with filter chips ── */
function SearchBar({ leads, onResults }) {
  const [query,        setQuery]        = useState('')
  const [titleFilter,  setTitleFilter]  = useState('')
  const [companyFilter,setCompanyFilter]= useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters,  setShowFilters]  = useState(false)
  const inputRef = useRef(null)

  // Active filter chips
  const chips = [
    ...(titleFilter   ? [{ label: 'Titel: ' + titleFilter,   clear: () => setTitleFilter('')    }] : []),
    ...(companyFilter ? [{ label: 'Firma: ' + companyFilter,  clear: () => setCompanyFilter('') }] : []),
    ...(statusFilter  ? [{ label: 'Status: ' + STATUS_LABELS[statusFilter], clear: () => setStatusFilter('') }] : []),
  ]

  useEffect(() => {
    const q = query.toLowerCase()
    const results = leads.filter(l => {
      const matchQ       = !q || l.name.toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q) || (l.headline||'').toLowerCase().includes(q)
      const matchTitle   = !titleFilter   || (l.headline||'').toLowerCase().includes(titleFilter.toLowerCase())
      const matchCompany = !companyFilter || (l.company||'').toLowerCase().includes(companyFilter.toLowerCase())
      const matchStatus  = !statusFilter  || l.status === statusFilter
      return matchQ && matchTitle && matchCompany && matchStatus
    })
    onResults(results)
  }, [query, titleFilter, companyFilter, statusFilter, leads])

  const hasFilters = query || titleFilter || companyFilter || statusFilter

  function clearAll() {
    setQuery(''); setTitleFilter(''); setCompanyFilter(''); setStatusFilter('')
  }

  return (
    <div style={{ background: SN.white, borderBottom: '1px solid ' + SN.border }}>
      {/* ── Main search row ── */}
      <div style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Search input with icon */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 520 }}>
          <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0073b1" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Name, Unternehmen oder Stichwort suchen…"
            style={{
              width: '100%', border: '2px solid ' + SN.blue, borderRadius: 6,
              padding: '9px 36px 9px 38px', fontSize: 14,
              background: '#f0f7ff', color: SN.textPrimary, outline: 'none',
              fontWeight: 500,
            }}
            onFocus={e => e.target.style.background = SN.white}
            onBlur={e => e.target.style.background = query ? SN.white : '#f0f7ff'}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#999', fontSize:16, lineHeight:1, padding:2 }}>✕</button>
          )}
        </div>

        {/* Filter toggle button */}
        <button
          onClick={() => setShowFilters(f => !f)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: '1.5px solid ' + (showFilters || chips.length ? SN.blue : '#c9cdd2'),
            background: showFilters || chips.length ? '#e8f0fb' : SN.white,
            color: showFilters || chips.length ? SN.blue : '#444',
            transition: 'all 0.15s',
          }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          Alle Filter
          {chips.length > 0 && (
            <span style={{ background: SN.blue, color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 11, fontWeight: 700, display:'flex', alignItems:'center', justifyContent:'center', marginLeft: 2 }}>{chips.length}</span>
          )}
        </button>

        {/* Result count */}
        <span style={{ fontSize: 13, color: SN.textMuted, whiteSpace: 'nowrap' }}>
          {/* populated by parent */}
        </span>

        {/* Clear all */}
        {hasFilters && (
          <button onClick={clearAll} style={{ fontSize: 13, color: '#cc1016', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Alle zurücksetzen
          </button>
        )}
      </div>

      {/* ── Expanded filter panel ── */}
      {showFilters && (
        <div style={{ padding: '0 28px 16px', display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          {/* Title filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Titel / Position</label>
            <input
              value={titleFilter}
              onChange={e => setTitleFilter(e.target.value)}
              placeholder="z.B. CEO, Marketing Manager…"
              style={{ border: '1.5px solid #c9cdd2', borderRadius: 4, padding: '7px 10px', fontSize: 13, outline: 'none' }}
              onFocus={e => e.target.style.borderColor = SN.blue}
              onBlur={e => e.target.style.borderColor = '#c9cdd2'}
            />
          </div>

          {/* Company filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unternehmen</label>
            <input
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              placeholder="z.B. DYMATRIX, Scalemaker…"
              style={{ border: '1.5px solid #c9cdd2', borderRadius: 4, padding: '7px 10px', fontSize: 13, outline: 'none' }}
              onFocus={e => e.target.style.borderColor = SN.blue}
              onBlur={e => e.target.style.borderColor = '#c9cdd2'}
            />
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ border: '1.5px solid #c9cdd2', borderRadius: 4, padding: '7px 10px', fontSize: 13, outline: 'none', background: SN.white, cursor: 'pointer' }}
              onFocus={e => e.target.style.borderColor = SN.blue}
              onBlur={e => e.target.style.borderColor = '#c9cdd2'}
            >
              <option value="">Alle Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Active filter chips ── */}
      {chips.length > 0 && (
        <div style={{ padding: '0 28px 10px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: SN.textMuted, fontWeight: 600 }}>Aktive Filter:</span>
          {chips.map((chip, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 14,
              background: '#e8f0fb', color: SN.blue,
              fontSize: 12, fontWeight: 600, border: '1px solid #c2d9f0',
            }}>
              {chip.label}
              <button onClick={chip.clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SN.blue, fontSize: 14, lineHeight: 1, padding: 0, display:'flex', alignItems:'center' }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Leads({ session }) {
  const [leads,       setLeads]       = useState([])
  const [lists,       setLists]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filtered,    setFiltered]    = useState([])
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState({})
  const [saving,      setSaving]      = useState(false)
  const [listModal,   setListModal]   = useState(null)
  const [listForm,    setListForm]    = useState({})
  const [assignModal, setAssignModal] = useState(null)
  const [hoveredRow,  setHoveredRow]  = useState(null)
  const [sortBy,      setSortBy]      = useState('date')
  const [listFilter,  setListFilter]  = useState('all')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const uid = session.user.id
    const [{ data: ld }, { data: ls }] = await Promise.all([
      supabase.from('leads').select('*, lead_list_members(list_id)').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('lead_lists').select('*, lead_list_members(lead_id)').eq('user_id', uid).order('created_at', { ascending: true }),
    ])
    setLeads(ld || [])
    setFiltered(ld || [])
    setLists(ls || [])
    setLoading(false)
  }

  // Apply list filter on top of search results
  const visibleLeads = filtered
    .filter(l => listFilter === 'all' || l.lead_list_members?.some(m => m.list_id === listFilter))
    .sort((a, b) => {
      if (sortBy === 'name')    return a.name.localeCompare(b.name)
      if (sortBy === 'company') return (a.company || '').localeCompare(b.company || '')
      if (sortBy === 'status')  return STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  function openAdd()      { setForm({ status: 'new' }); setModal('add') }
  function openEdit(l)    { setForm({ ...l }); setModal(l) }
  function closeModal()   { setModal(null); setForm({}) }

  async function save() {
    setSaving(true)
    if (modal === 'add') await supabase.from('leads').insert({ ...form, user_id: session.user.id })
    else                 await supabase.from('leads').update(form).eq('id', modal.id)
    await loadAll(); setSaving(false); closeModal()
  }

  async function deleteLead(id) {
    if (!confirm('Lead wirklich löschen?')) return
    await supabase.from('leads').delete().eq('id', id)
    setLeads(l => l.filter(x => x.id !== id))
    setFiltered(l => l.filter(x => x.id !== id))
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(l => l.map(x => x.id === id ? { ...x, status } : x))
    setFiltered(l => l.map(x => x.id === id ? { ...x, status } : x))
  }

  function openNewList()    { setListForm({ color: LIST_COLORS[0] }); setListModal('new') }
  function openEditList(l)  { setListForm({ ...l }); setListModal(l) }
  function closeListModal() { setListModal(null); setListForm({}) }

  async function saveList() {
    setSaving(true)
    if (listModal === 'new') await supabase.from('lead_lists').insert({ ...listForm, user_id: session.user.id })
    else                     await supabase.from('lead_lists').update(listForm).eq('id', listModal.id)
    await loadAll(); setSaving(false); closeListModal()
  }

  async function deleteList(id) {
    if (!confirm('Liste löschen? Leads bleiben erhalten.')) return
    await supabase.from('lead_lists').delete().eq('id', id)
    setLists(l => l.filter(x => x.id !== id))
    if (listFilter === id) setListFilter('all')
  }

  async function toggleListMember(leadId, listId, isIn) {
    if (isIn) await supabase.from('lead_list_members').delete().eq('lead_id', leadId).eq('list_id', listId)
    else      await supabase.from('lead_list_members').insert({ lead_id: leadId, list_id: listId })
    await loadAll()
  }

  const getLeadListIds = (lead) => lead.lead_list_members?.map(m => m.list_id) || []

  /* ── Styles ── */
  const S = {
    shell:        { display: 'flex', minHeight: '100vh', background: SN.bg, fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" },
    sidebar:      { width: 220, flexShrink: 0, background: SN.sidebar, display: 'flex', flexDirection: 'column', boxShadow: '2px 0 8px rgba(0,0,0,0.2)' },
    sidebarHdr:   { padding: '13px 16px', borderBottom: '1px solid #2d3338', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    sidebarHdrTxt:{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '1.2px' },
    addListBtn:   { background: SN.active, color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
    listItem:     (a, c) => ({ padding: '8px 12px', cursor: 'pointer', borderRadius: 4, margin: '2px 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: a ? (c || SN.active) + '22' : 'transparent', color: a ? (c || SN.active) : SN.sidebarTxt, fontWeight: a ? 700 : 400, borderLeft: a ? '3px solid ' + (c || SN.active) : '3px solid transparent' }),
    main:         { flex: 1, display: 'flex', flexDirection: 'column', background: SN.white, minWidth: 0 },

    /* Page header */
    pageHeader:   {
      padding: '0 28px',
      background: SN.sidebar,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      minHeight: 56, gap: 16, borderBottom: '1px solid #2d3338',
    },
    pageTitle:    { fontSize: 15, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' },
    pageTitleSub: { fontSize: 12, color: '#8b949e', fontWeight: 400 },
    addBtn:       { background: SN.blue, color: '#fff', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, padding: '8px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 },

    /* Results bar */
    resultsBar:   { padding: '8px 28px', borderBottom: '1px solid ' + SN.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' },
    sortSelect:   { fontSize: 12, padding: '4px 8px', border: '1px solid #c9cdd2', borderRadius: 4, color: '#333', background: SN.white, cursor: 'pointer', outline: 'none' },
    colHeader:    { display: 'flex', alignItems: 'center', padding: '0 28px', height: 34, background: '#f3f2ef', borderBottom: '1px solid ' + SN.border },
    colTxt:       { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.9px', userSelect: 'none' },

    /* Lead rows */
    row:          (h) => ({ display: 'flex', alignItems: 'center', padding: '0 28px', minHeight: 70, borderBottom: '1px solid ' + SN.border, background: h ? '#f3f2ef' : SN.white, transition: 'background 0.1s', cursor: 'pointer', position: 'relative' }),
    avatar:       { width: 46, height: 46, borderRadius: '50%', border: '2px solid ' + SN.border, flexShrink: 0, objectFit: 'cover', marginRight: 14 },
    avatarPH:     { width: 46, height: 46, borderRadius: '50%', border: '2px solid ' + SN.border, flexShrink: 0, background: '#e8f0fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: SN.blue, marginRight: 14 },
    leadName:     { fontSize: 14, fontWeight: 700, color: SN.blue, marginBottom: 1, display: 'block' },
    leadTitle:    { fontSize: 12, color: '#333', marginBottom: 1 },
    leadCompany:  { fontSize: 12, color: SN.textMuted },
    statusSel:    (s) => ({ fontSize: 11, padding: '4px 9px', borderRadius: 12, border: '1.5px solid ' + (STATUS_STYLE[s]?.border || '#ccc'), color: STATUS_STYLE[s]?.color || '#333', background: STATUS_STYLE[s]?.bg || '#f0f0f0', fontWeight: 700, cursor: 'pointer', outline: 'none' }),
    actionBtn:    (d) => ({ background: 'transparent', border: '1.5px solid ' + (d ? '#f5b8b8' : '#c9cdd2'), color: d ? '#cc1016' : '#555', borderRadius: '50%', width: 30, height: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: 'pointer' }),
    profilBtn:    (h) => ({ opacity: h ? 1 : 0, transition: 'opacity 0.15s', background: SN.blue, color: '#fff', border: 'none', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', marginRight: 8 }),

    /* Modals */
    overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalCard:    { background: SN.white, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: 460, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' },
    modalHdr:     { padding: '16px 22px', borderBottom: '1px solid ' + SN.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle:   { fontWeight: 700, fontSize: 15, color: SN.textPrimary },
    modalClose:   { background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer' },
    modalBody:    { padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 },
    modalLabel:   { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 },
    modalFoot:    { padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10 },
  }

  const activeListName = listFilter === 'all' ? 'Alle Leads' : (lists.find(l => l.id === listFilter)?.name || 'Leads')
  const activeList     = lists.find(l => l.id === listFilter)

  return (
    <div style={S.shell}>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={S.sidebar}>
        <div style={S.sidebarHdr}>
          <span style={S.sidebarHdrTxt}>Listen</span>
          <button style={S.addListBtn} onClick={openNewList} title="Neue Liste">+</button>
        </div>

        <div onClick={() => setListFilter('all')} style={S.listItem(listFilter === 'all', null)}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ flex: 1 }}>Alle Leads</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: listFilter === 'all' ? 'rgba(255,255,255,0.25)' : '#2d3338', color: listFilter === 'all' ? '#fff' : '#8b949e' }}>{leads.length}</span>
        </div>

        {lists.map(list => (
          <div key={list.id} onClick={() => setListFilter(list.id)} style={S.listItem(listFilter === list.id, list.color)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: list.color, flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</span>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#8b949e' }}>{list.lead_list_members?.length || 0}</span>
              <button onClick={e => { e.stopPropagation(); openEditList(list) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#8b949e', padding: 2 }}>✏️</button>
              <button onClick={e => { e.stopPropagation(); deleteList(list.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#8b949e', padding: 2 }}>🗑</button>
            </div>
          </div>
        ))}

        {lists.length === 0 && <div style={{ padding: '10px 16px', fontSize: 12, color: '#8b949e', lineHeight: 1.5 }}>Noch keine Listen.<br />Klicke + um eine zu erstellen.</div>}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={S.main}>

        {/* ── PAGE HEADER (Sales Navigator dark bar) ── */}
        <div style={S.pageHeader}>
          <div style={S.pageTitle}>
            {/* Breadcrumb-style: Alle Leads / List name */}
            <span style={{ color: '#8b949e', fontSize: 13, fontWeight: 400, cursor: 'pointer' }} onClick={() => setListFilter('all')}>Leads</span>
            {listFilter !== 'all' && <>
              <span style={{ color: '#4d5760', fontSize: 13 }}>›</span>
              <span style={{ color: SN.white, fontSize: 14, fontWeight: 700 }}>{activeListName}</span>
              {activeList && <span style={{ width: 10, height: 10, borderRadius: '50%', background: activeList.color, flexShrink: 0 }} />}
            </>}
            {listFilter === 'all' && <span style={{ color: SN.white, fontSize: 15, fontWeight: 700 }}>Alle Leads</span>}
            <span style={S.pageTitleSub}>({visibleLeads.length} {visibleLeads.length === 1 ? 'Lead' : 'Leads'})</span>
          </div>

          {/* Right side: sort + add button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#8b949e' }}>Sortieren:</span>
              <select
                value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 4, border: '1px solid #3d4348', background: '#2d3338', color: '#d0d7de', cursor: 'pointer', outline: 'none' }}>
                <option value="date">Zuletzt hinzugefügt</option>
                <option value="name">Name A–Z</option>
                <option value="status">Status</option>
                <option value="company">Unternehmen</option>
              </select>
            </div>
            <button style={S.addBtn} onClick={openAdd}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Lead hinzufügen
            </button>
          </div>
        </div>

        {/* ── SEARCH BAR (Sales Navigator active search) ── */}
        <SearchBar leads={leads} onResults={setFiltered} />

        {/* ── RESULTS BAR ── */}
        <div style={S.resultsBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: SN.textMuted }}>
              <strong style={{ color: SN.textPrimary }}>{visibleLeads.length}</strong> Ergebnis{visibleLeads.length !== 1 ? 'se' : ''}
            </span>
            <span style={{ width: 1, height: 14, background: SN.border, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: SN.blue, cursor: 'pointer', fontWeight: 600 }}>Alle auswählen</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#999' }}>{leads.length} gespeicherte Leads gesamt</span>
          </div>
        </div>

        {/* ── COLUMN HEADERS ── */}
        <div style={S.colHeader}>
          <div style={{ width: 36, flexShrink: 0 }} />
          <div style={{ width: 60, flexShrink: 0, marginRight: 14 }} />
          <div style={{ flex: 1, ...S.colTxt }}>Name & Unternehmen</div>
          <div style={{ width: 120, flexShrink: 0, paddingRight: 12, ...S.colTxt }}>Liste</div>
          <div style={{ width: 148, flexShrink: 0, paddingRight: 12, ...S.colTxt }}>Status</div>
          <div style={{ width: 88, flexShrink: 0, ...S.colTxt, textAlign: 'right' }}>Hinzugefügt</div>
          <div style={{ width: 138, flexShrink: 0, marginLeft: 16, ...S.colTxt, textAlign: 'right' }}>Aktionen</div>
        </div>

        {/* ── LEAD ROWS ── */}
        {loading ? (
          <div style={{ padding: 48, color: '#aaa', textAlign: 'center', fontSize: 14 }}>⏳ Lade Leads…</div>
        ) : visibleLeads.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#444', marginBottom: 6 }}>Keine Ergebnisse</div>
            <div style={{ fontSize: 13, color: '#999' }}>{leads.length === 0 ? 'Noch keine Leads. Speichere deinen ersten Lead über LinkedIn!' : 'Versuche andere Suchbegriffe oder Filter.'}</div>
          </div>
        ) : visibleLeads.map(l => {
          const leadLists = lists.filter(list => getLeadListIds(l).includes(list.id))
          const isHov = hoveredRow === l.id
          return (
            <div key={l.id} style={S.row(isHov)} onMouseEnter={() => setHoveredRow(l.id)} onMouseLeave={() => setHoveredRow(null)}>
              <div style={{ width: 36, flexShrink: 0 }}>
                <input type="checkbox" onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, accentColor: SN.blue, cursor: 'pointer' }} />
              </div>

              {l.avatar_url
                ? <img src={l.avatar_url} style={S.avatar} onError={e => { e.target.style.display = 'none' }} />
                : <div style={S.avatarPH}>{l.name.charAt(0).toUpperCase()}</div>
              }

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={S.leadName}>{l.name}</span>
                {l.headline && <div style={S.leadTitle}>{l.headline}</div>}
                {l.company  && <div style={S.leadCompany}>{l.company}</div>}
              </div>

              <div style={{ width: 120, flexShrink: 0, paddingRight: 12, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {leadLists.map(list => (
                  <span key={list.id} style={{ padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: list.color + '22', color: list.color }}>{list.name}</span>
                ))}
                <button onClick={e => { e.stopPropagation(); setAssignModal(l) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ccc', padding: 2 }} title="Listen zuweisen">📋</button>
              </div>

              <div style={{ width: 148, flexShrink: 0, paddingRight: 12 }}>
                <select value={l.status} style={S.statusSel(l.status)} onClick={e => e.stopPropagation()} onChange={e => updateStatus(l.id, e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>

              <div style={{ width: 88, flexShrink: 0, fontSize: 11, color: '#aaa', textAlign: 'right' }}>
                {new Date(l.created_at).toLocaleDateString('de-DE')}
              </div>

              <div style={{ width: 138, flexShrink: 0, marginLeft: 16, display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button style={S.profilBtn(isHov)} onClick={e => { e.stopPropagation(); l.profile_url && window.open(l.profile_url, '_blank') }}>Profil öffnen</button>
                {!isHov && <>
                  {l.profile_url && <a href={l.profile_url} target="_blank" rel="noreferrer" style={{ ...S.actionBtn(false), textDecoration: 'none' }} onClick={e => e.stopPropagation()}>↗</a>}
                  <button style={S.actionBtn(false)} onClick={e => { e.stopPropagation(); openEdit(l) }}>✏️</button>
                  <button style={S.actionBtn(true)}  onClick={e => { e.stopPropagation(); deleteLead(l.id) }}>🗑</button>
                </>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── MODAL: Lead ── */}
      {modal && (
        <div style={S.overlay} onClick={closeModal}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <div style={S.modalTitle}>{modal === 'add' ? '+ Lead hinzufügen' : 'Lead bearbeiten'}</div>
              <button style={S.modalClose} onClick={closeModal}>✕</button>
            </div>
            <div style={S.modalBody}>
              {[['name','Name *',true],['company','Unternehmen',false],['headline','Position / Headline',false],['profile_url','LinkedIn URL',false]].map(([key,label,req]) => (
                <div key={key}>
                  <label style={S.modalLabel}>{label}</label>
                  <input value={form[key]||''} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} style={{ width:'100%' }} placeholder={req?'Pflichtfeld':'Optional'} />
                </div>
              ))}
              <div>
                <label style={S.modalLabel}>Status</label>
                <select value={form.status||'new'} onChange={e => setForm(f => ({...f,status:e.target.value}))} style={{ width:'100%' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label style={S.modalLabel}>Notizen</label>
                <textarea value={form.notes||''} onChange={e => setForm(f => ({...f,notes:e.target.value}))} rows={3} style={{ width:'100%', resize:'vertical' }} placeholder="Persönliche Notizen…" />
              </div>
            </div>
            <div style={S.modalFoot}>
              <button className="btn btn-secondary" onClick={closeModal}>Abbrechen</button>
              <button className="btn btn-primary" onClick={save} disabled={saving||!form.name}>{saving?'⏳':'💾 Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Liste ── */}
      {listModal && (
        <div style={S.overlay} onClick={closeListModal}>
          <div style={{ ...S.modalCard, width: 380 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <div style={S.modalTitle}>{listModal==='new'?'📋 Neue Liste':'Liste bearbeiten'}</div>
              <button style={S.modalClose} onClick={closeListModal}>✕</button>
            </div>
            <div style={S.modalBody}>
              <div><label style={S.modalLabel}>Name *</label><input value={listForm.name||''} onChange={e => setListForm(f => ({...f,name:e.target.value}))} style={{ width:'100%' }} placeholder="z.B. Potenzielle Kunden Q2 2026" /></div>
              <div><label style={S.modalLabel}>Beschreibung</label><input value={listForm.description||''} onChange={e => setListForm(f => ({...f,description:e.target.value}))} style={{ width:'100%' }} placeholder="Optional" /></div>
              <div>
                <label style={S.modalLabel}>Farbe</label>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:6 }}>
                  {LIST_COLORS.map(c => <button key={c} onClick={() => setListForm(f => ({...f,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, border:listForm.color===c?'3px solid #111':'3px solid transparent', cursor:'pointer' }} />)}
                </div>
              </div>
            </div>
            <div style={S.modalFoot}>
              <button className="btn btn-secondary" onClick={closeListModal}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveList} disabled={saving||!listForm.name}>{saving?'⏳':'💾 Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Listen zuweisen ── */}
      {assignModal && (
        <div style={S.overlay} onClick={() => setAssignModal(null)}>
          <div style={{ ...S.modalCard, width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <div style={S.modalTitle}>📋 Listen zuweisen</div>
              <button style={S.modalClose} onClick={() => setAssignModal(null)}>✕</button>
            </div>
            <div style={{ padding:'14px 22px' }}>
              <div style={{ fontSize:13, color:'#555', marginBottom:12 }}><strong>{assignModal.name}</strong> zu Listen hinzufügen:</div>
              {lists.length===0 ? (
                <div style={{ textAlign:'center', color:'#aaa', fontSize:13, padding:'12px 0' }}>Noch keine Listen.<br /><button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => { setAssignModal(null); openNewList() }}>+ Neue Liste</button></div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {lists.map(list => {
                    const isIn = getLeadListIds(assignModal).includes(list.id)
                    return (
                      <div key={list.id} onClick={() => toggleListMember(assignModal.id, list.id, isIn)}
                        style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, cursor:'pointer', background:isIn?list.color+'15':'#f8f8f8', border:isIn?'1.5px solid '+list.color:'1.5px solid transparent', transition:'all 0.15s' }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', background:list.color, flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:13, color:isIn?list.color:'#333' }}>{list.name}</div>
                          {list.description && <div style={{ fontSize:11, color:'#888' }}>{list.description}</div>}
                        </div>
                        <span style={{ fontSize:16 }}>{isIn?'✅':'○'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ padding:'10px 22px 16px', textAlign:'right' }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setAssignModal(null); loadAll() }}>Fertig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
