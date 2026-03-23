import React, { useEffect, useState } from 'react'
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

export default function Leads({ session }) {
  const [leads,       setLeads]       = useState([])
  const [lists,       setLists]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState('all')
  const [listFilter,  setListFilter]  = useState('all')
  const [search,      setSearch]      = useState('')
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState({})
  const [saving,      setSaving]      = useState(false)
  const [listModal,   setListModal]   = useState(null)
  const [listForm,    setListForm]    = useState({})
  const [assignModal, setAssignModal] = useState(null)
  const [hoveredRow,  setHoveredRow]  = useState(null)
  const [sortBy,      setSortBy]      = useState('date')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const uid = session.user.id
    const [{ data: ld }, { data: ls }] = await Promise.all([
      supabase.from('leads').select('*, lead_list_members(list_id)').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('lead_lists').select('*, lead_list_members(lead_id)').eq('user_id', uid).order('created_at', { ascending: true }),
    ])
    setLeads(ld || [])
    setLists(ls || [])
    setLoading(false)
  }

  const filtered = leads
    .filter(l => {
      if (filter !== 'all' && l.status !== filter) return false
      if (listFilter !== 'all' && !l.lead_list_members?.some(m => m.list_id === listFilter)) return false
      if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company || '').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
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
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(l => l.map(x => x.id === id ? { ...x, status } : x))
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

  /* ── Inline Styles ── */
  const S = {
    shell:        { display: 'flex', minHeight: '100vh', background: SN.bg, fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" },
    sidebar:      { width: 220, flexShrink: 0, background: SN.sidebar, display: 'flex', flexDirection: 'column', boxShadow: '2px 0 8px rgba(0,0,0,0.2)' },
    sidebarHdr:   { padding: '13px 16px', borderBottom: '1px solid #2d3338', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    sidebarHdrTxt:{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '1.2px' },
    addListBtn:   { background: SN.active, color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
    listItem:     (a, c) => ({ padding: '8px 12px', cursor: 'pointer', borderRadius: 4, margin: '2px 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: a ? (c || SN.active) + '22' : 'transparent', color: a ? (c || SN.active) : SN.sidebarTxt, fontWeight: a ? 700 : 400, borderLeft: a ? '3px solid ' + (c || SN.active) : '3px solid transparent' }),
    main:         { flex: 1, display: 'flex', flexDirection: 'column', background: SN.white },
    headerBar:    { padding: '18px 28px 14px', borderBottom: '1px solid ' + SN.border, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
    h1:           { fontSize: 20, fontWeight: 700, color: SN.textPrimary, margin: 0 },
    subline:      { fontSize: 13, color: SN.textMuted, marginTop: 2 },
    addBtn:       { background: SN.blue, color: '#fff', border: 'none', borderRadius: 20, fontSize: 14, fontWeight: 600, padding: '9px 22px', cursor: 'pointer' },
    filterBar:    { padding: '11px 28px', borderBottom: '1px solid ' + SN.border, display: 'flex', alignItems: 'center', gap: 10, background: '#f9fafb', flexWrap: 'wrap' },
    searchWrap:   { position: 'relative', flex: 1, minWidth: 200 },
    searchInput:  { width: '100%', border: '1.5px solid #c9cdd2', borderRadius: 4, padding: '7px 12px 7px 34px', fontSize: 14, background: SN.white, color: SN.textPrimary, outline: 'none' },
    searchIcon:   { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999', fontSize: 14 },
    pill:         (a) => ({ fontSize: 13, padding: '5px 15px', borderRadius: 16, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (a ? SN.blue : '#c9cdd2'), background: a ? SN.blue : SN.white, color: a ? '#fff' : SN.textPrimary }),
    resultsBar:   { padding: '9px 28px', borderBottom: '1px solid ' + SN.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SN.white },
    sortSelect:   { fontSize: 12, padding: '4px 8px', border: '1px solid #c9cdd2', borderRadius: 4, color: '#333', background: SN.white, cursor: 'pointer', outline: 'none' },
    colHeader:    { display: 'flex', alignItems: 'center', padding: '0 28px', height: 36, background: '#f9fafb', borderBottom: '2px solid ' + SN.border, borderTop: '1px solid ' + SN.border },
    colTxt:       { fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px' },
    row:          (h) => ({ display: 'flex', alignItems: 'center', padding: '0 28px', minHeight: 72, borderBottom: '1px solid ' + SN.border, background: h ? '#f3f2ef' : SN.white, transition: 'background 0.1s', cursor: 'pointer', position: 'relative' }),
    avatar:       { width: 48, height: 48, borderRadius: '50%', border: '2px solid ' + SN.border, flexShrink: 0, objectFit: 'cover', marginRight: 14 },
    avatarPH:     { width: 48, height: 48, borderRadius: '50%', border: '2px solid ' + SN.border, flexShrink: 0, background: '#e8f0fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: SN.blue, marginRight: 14 },
    leadName:     { fontSize: 15, fontWeight: 600, color: SN.blue, marginBottom: 1, display: 'block' },
    leadTitle:    { fontSize: 13, color: '#333', marginBottom: 1 },
    leadCompany:  { fontSize: 13, color: SN.textMuted },
    statusSel:    (s) => ({ fontSize: 12, padding: '5px 10px', borderRadius: 12, border: '1.5px solid ' + (STATUS_STYLE[s]?.border || '#ccc'), color: STATUS_STYLE[s]?.color || '#333', background: STATUS_STYLE[s]?.bg || '#f0f0f0', fontWeight: 600, cursor: 'pointer', outline: 'none' }),
    actionBtn:    (d) => ({ background: 'transparent', border: '1.5px solid ' + (d ? '#f5b8b8' : '#c9cdd2'), color: d ? '#cc1016' : '#555', borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, cursor: 'pointer' }),
    profilBtn:    (h) => ({ opacity: h ? 1 : 0, transition: 'opacity 0.15s', background: SN.blue, color: '#fff', border: 'none', borderRadius: 16, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', marginRight: 8 }),
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

      {/* ── MAIN ── */}
      <div style={S.main}>

        {/* Header */}
        <div style={S.headerBar}>
          <div>
            <h1 style={S.h1}>{activeListName}</h1>
            <div style={S.subline}>{filtered.length} {filtered.length === 1 ? 'Lead' : 'Leads'}</div>
          </div>
          <button style={S.addBtn} onClick={openAdd}>+ Lead hinzufügen</button>
        </div>

        {/* Filter Bar */}
        <div style={S.filterBar}>
          <div style={S.searchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..." style={S.searchInput} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', ...STATUS_OPTIONS].map(s => (
              <button key={s} style={S.pill(filter === s)} onClick={() => setFilter(s)}>
                {s === 'all' ? 'Alle' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Results + Sort */}
        <div style={S.resultsBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: SN.textMuted }}><strong style={{ color: SN.textPrimary }}>{filtered.length}</strong> Ergebnis{filtered.length !== 1 ? 'se' : ''}</span>
            <span style={{ width: 1, height: 16, background: SN.border, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: SN.blue, cursor: 'pointer', fontWeight: 500 }}>Alle auswählen</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: SN.textMuted }}>Sortieren:</span>
            <select style={S.sortSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="date">Zuletzt hinzugefügt</option>
              <option value="name">Name A–Z</option>
              <option value="status">Status</option>
              <option value="company">Unternehmen</option>
            </select>
          </div>
        </div>

        {/* Column Headers */}
        <div style={S.colHeader}>
          <div style={{ width: 36, flexShrink: 0 }} />
          <div style={{ width: 62, flexShrink: 0, marginRight: 14 }} />
          <div style={{ flex: 1, ...S.colTxt }}>Name</div>
          <div style={{ width: 130, flexShrink: 0, paddingRight: 12, ...S.colTxt }}>Liste</div>
          <div style={{ width: 150, flexShrink: 0, paddingRight: 12, ...S.colTxt }}>Status</div>
          <div style={{ width: 90, flexShrink: 0, ...S.colTxt, textAlign: 'right' }}>Hinzugefügt</div>
          <div style={{ width: 140, flexShrink: 0, marginLeft: 16, ...S.colTxt, textAlign: 'right' }}>Aktionen</div>
        </div>

        {/* Lead Rows */}
        {loading ? (
          <div style={{ padding: 40, color: '#aaa', textAlign: 'center' }}>⏳ Lade Leads…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            {leads.length === 0 ? '👥 Noch keine Leads. Speichere deinen ersten Lead über LinkedIn!' : listFilter !== 'all' ? '📋 Diese Liste ist leer.' : 'Keine Treffer.'}
          </div>
        ) : filtered.map(l => {
          const leadLists = lists.filter(list => getLeadListIds(l).includes(list.id))
          const isHov = hoveredRow === l.id
          return (
            <div key={l.id} style={S.row(isHov)} onMouseEnter={() => setHoveredRow(l.id)} onMouseLeave={() => setHoveredRow(null)}>
              <div style={{ width: 36, flexShrink: 0 }}>
                <input type="checkbox" onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, accentColor: SN.blue, cursor: 'pointer' }} />
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

              <div style={{ width: 130, flexShrink: 0, paddingRight: 12, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {leadLists.map(list => (
                  <span key={list.id} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: list.color + '22', color: list.color }}>{list.name}</span>
                ))}
                <button onClick={e => { e.stopPropagation(); setAssignModal(l) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#bbb', padding: 2 }} title="Listen zuweisen">📋</button>
              </div>

              <div style={{ width: 150, flexShrink: 0, paddingRight: 12 }}>
                <select value={l.status} style={S.statusSel(l.status)} onClick={e => e.stopPropagation()} onChange={e => updateStatus(l.id, e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>

              <div style={{ width: 90, flexShrink: 0, fontSize: 12, color: '#999', textAlign: 'right' }}>
                {new Date(l.created_at).toLocaleDateString('de-DE')}
              </div>

              <div style={{ width: 140, flexShrink: 0, marginLeft: 16, display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button style={S.profilBtn(isHov)} onClick={e => { e.stopPropagation(); l.profile_url && window.open(l.profile_url, '_blank') }}>Profil öffnen</button>
                {!isHov && <>
                  {l.profile_url && <a href={l.profile_url} target="_blank" rel="noreferrer" style={{ ...S.actionBtn(false), textDecoration: 'none' }} onClick={e => e.stopPropagation()} title="LinkedIn">↗</a>}
                  <button style={S.actionBtn(false)} onClick={e => { e.stopPropagation(); openEdit(l) }} title="Bearbeiten">✏️</button>
                  <button style={S.actionBtn(true)} onClick={e => { e.stopPropagation(); deleteLead(l.id) }} title="Löschen">🗑</button>
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
              <div style={S.modalTitle}>{modal === 'add' ? 'Lead hinzufügen' : 'Lead bearbeiten'}</div>
              <button style={S.modalClose} onClick={closeModal}>✕</button>
            </div>
            <div style={S.modalBody}>
              {[['name', 'Name *', true], ['company', 'Unternehmen', false], ['headline', 'Position / Headline', false], ['profile_url', 'LinkedIn URL', false]].map(([key, label, req]) => (
                <div key={key}>
                  <label style={S.modalLabel}>{label}</label>
                  <input value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%' }} placeholder={req ? 'Pflichtfeld' : 'Optional'} />
                </div>
              ))}
              <div>
                <label style={S.modalLabel}>Status</label>
                <select value={form.status || 'new'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label style={S.modalLabel}>Notizen</label>
                <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="Persönliche Notizen…" />
              </div>
            </div>
            <div style={S.modalFoot}>
              <button className="btn btn-secondary" onClick={closeModal}>Abbrechen</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>{saving ? '⏳' : '💾 Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Liste ── */}
      {listModal && (
        <div style={S.overlay} onClick={closeListModal}>
          <div style={{ ...S.modalCard, width: 380 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <div style={S.modalTitle}>{listModal === 'new' ? '📋 Neue Liste' : 'Liste bearbeiten'}</div>
              <button style={S.modalClose} onClick={closeListModal}>✕</button>
            </div>
            <div style={S.modalBody}>
              <div>
                <label style={S.modalLabel}>Name *</label>
                <input value={listForm.name || ''} onChange={e => setListForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%' }} placeholder="z.B. Potenzielle Kunden Q2 2026" />
              </div>
              <div>
                <label style={S.modalLabel}>Beschreibung</label>
                <input value={listForm.description || ''} onChange={e => setListForm(f => ({ ...f, description: e.target.value }))} style={{ width: '100%' }} placeholder="Optional" />
              </div>
              <div>
                <label style={S.modalLabel}>Farbe</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                  {LIST_COLORS.map(c => (
                    <button key={c} onClick={() => setListForm(f => ({ ...f, color: c }))} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: listForm.color === c ? '3px solid #111' : '3px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={S.modalFoot}>
              <button className="btn btn-secondary" onClick={closeListModal}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveList} disabled={saving || !listForm.name}>{saving ? '⏳' : '💾 Speichern'}</button>
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
            <div style={{ padding: '14px 22px' }}>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}><strong>{assignModal.name}</strong> zu Listen hinzufügen:</div>
              {lists.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '12px 0' }}>
                  Noch keine Listen.<br />
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => { setAssignModal(null); openNewList() }}>+ Neue Liste</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lists.map(list => {
                    const isIn = getLeadListIds(assignModal).includes(list.id)
                    return (
                      <div key={list.id} onClick={() => toggleListMember(assignModal.id, list.id, isIn)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: isIn ? list.color + '15' : '#f8f8f8', border: isIn ? '1.5px solid ' + list.color : '1.5px solid transparent', transition: 'all 0.15s' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: list.color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: isIn ? list.color : '#333' }}>{list.name}</div>
                          {list.description && <div style={{ fontSize: 11, color: '#888' }}>{list.description}</div>}
                        </div>
                        <span style={{ fontSize: 16 }}>{isIn ? '✅' : '○'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ padding: '10px 22px 16px', textAlign: 'right' }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setAssignModal(null); loadAll() }}>Fertig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
