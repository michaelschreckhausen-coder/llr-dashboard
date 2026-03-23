import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = ['new','contacted','replied','converted']
const STATUS_LABELS  = { new:'Neu', contacted:'Kontaktiert', replied:'Geantwortet', converted:'Konvertiert' }
const STATUS_STYLE   = {
  new:       { bg:'#EFF6FF', color:'#1D4ED8', border:'#BFDBFE' },
  contacted: { bg:'#FFFBEB', color:'#92400E', border:'#FDE68A' },
  replied:   { bg:'#ECFDF5', color:'#065F46', border:'#A7F3D0' },
  converted: { bg:'#F5F3FF', color:'#5B21B6', border:'#DDD6FE' },
}
const LIST_COLORS = ['#0A66C2','#10B981','#F59E0B','#EF4444','#8B5CF6','#0891B2','#EC4899','#374151']

/* ── Status Badge ── */
function StatusBadge({ status, onChange }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.new
  return (
    <select value={status} onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{ fontSize:11, padding:'4px 10px', borderRadius:999, border:'1.5px solid '+s.border, color:s.color, background:s.bg, fontWeight:700, cursor:'pointer', outline:'none', appearance:'none', WebkitAppearance:'none' }}>
      {STATUS_OPTIONS.map(o => <option key={o} value={o}>{STATUS_LABELS[o]}</option>)}
    </select>
  )
}

/* ── Modal wrapper ── */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 20px 60px rgba(15,23,42,0.15)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#94A3B8', fontSize:18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── SearchBar ── */
function SearchBar({ leads, onResults }) {
  const [query,         setQuery]         = useState('')
  const [titleFilter,   setTitleFilter]   = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [showFilters,   setShowFilters]   = useState(false)

  const chips = [
    ...(titleFilter   ? [{ label:'Titel: '+titleFilter,              clear:()=>setTitleFilter('') }]   : []),
    ...(companyFilter ? [{ label:'Firma: '+companyFilter,            clear:()=>setCompanyFilter('') }] : []),
    ...(statusFilter  ? [{ label:'Status: '+STATUS_LABELS[statusFilter], clear:()=>setStatusFilter('') }] : []),
  ]

  useEffect(() => {
    const q = query.toLowerCase()
    onResults(leads.filter(l => {
      const mQ = !q || l.name.toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q) || (l.headline||'').toLowerCase().includes(q)
      const mT = !titleFilter   || (l.headline||'').toLowerCase().includes(titleFilter.toLowerCase())
      const mC = !companyFilter || (l.company||'').toLowerCase().includes(companyFilter.toLowerCase())
      const mS = !statusFilter  || l.status === statusFilter
      return mQ && mT && mC && mS
    }))
  }, [query, titleFilter, companyFilter, statusFilter, leads])

  const hasFilters = query || titleFilter || companyFilter || statusFilter
  const clearAll   = () => { setQuery(''); setTitleFilter(''); setCompanyFilter(''); setStatusFilter('') }

  const inpStyle = { padding:'8px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Inter,sans-serif' }

  return (
    <div style={{ background:'#fff', borderBottom:'1px solid #E2E8F0', padding:'12px 20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {/* Search input */}
        <div style={{ position:'relative', flex:1, maxWidth:480 }}>
          <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Name, Unternehmen oder Stichwort…"
            style={{ ...inpStyle, width:'100%', paddingLeft:36, paddingRight: query?32:12 }}
            onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
          {query && <button onClick={() => setQuery('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:16, lineHeight:1, padding:2 }}>✕</button>}
        </div>
        {/* Filter button */}
        <button onClick={() => setShowFilters(f => !f)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', border:'1.5px solid '+(showFilters||chips.length?'#0A66C2':'#E2E8F0'), background:showFilters||chips.length?'#EFF6FF':'transparent', color:showFilters||chips.length?'#0A66C2':'#64748B', transition:'all 0.15s' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filter
          {chips.length > 0 && <span style={{ background:'#0A66C2', color:'#fff', borderRadius:'50%', width:16, height:16, fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{chips.length}</span>}
        </button>
        {hasFilters && <button onClick={clearAll} style={{ fontSize:12, color:'#EF4444', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Zurücksetzen</button>}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:12, paddingTop:12, borderTop:'1px solid #F1F5F9' }}>
          {[['Titel/Position', titleFilter, setTitleFilter,'z.B. CEO, Manager…'],['Unternehmen', companyFilter, setCompanyFilter, 'z.B. Firma GmbH…']].map(([label, val, setter, ph]) => (
            <div key={label} style={{ display:'flex', flexDirection:'column', gap:4, minWidth:180 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</label>
              <input value={val} onChange={e => setter(e.target.value)} placeholder={ph} style={{ ...inpStyle }}
                onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
            </div>
          ))}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em' }}>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inpStyle, cursor:'pointer', minWidth:150 }}
              onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}>
              <option value="">Alle Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Active chips */}
      {chips.length > 0 && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:10 }}>
          <span style={{ fontSize:11, color:'#94A3B8', fontWeight:600 }}>Aktiv:</span>
          {chips.map((chip, i) => (
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, background:'#EFF6FF', color:'#1D4ED8', fontSize:12, fontWeight:600, border:'1px solid #BFDBFE' }}>
              {chip.label}
              <button onClick={chip.clear} style={{ background:'none', border:'none', cursor:'pointer', color:'#1D4ED8', fontSize:13, lineHeight:1, padding:0, display:'flex' }}>✕</button>
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
    const [{ data:ld }, { data:ls }] = await Promise.all([
      supabase.from('leads').select('*, lead_list_members(list_id)').eq('user_id', uid).order('created_at', { ascending:false }),
      supabase.from('lead_lists').select('*, lead_list_members(lead_id)').eq('user_id', uid).order('created_at', { ascending:true }),
    ])
    setLeads(ld || [])
    setFiltered(ld || [])
    setLists(ls || [])
    setLoading(false)
  }

  const visibleLeads = filtered
    .filter(l => listFilter === 'all' || l.lead_list_members?.some(m => m.list_id === listFilter))
    .sort((a, b) => {
      if (sortBy === 'name')    return a.name.localeCompare(b.name)
      if (sortBy === 'company') return (a.company||'').localeCompare(b.company||'')
      if (sortBy === 'status')  return STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const openAdd  = () => { setForm({ status:'new' }); setModal('add') }
  const openEdit = (l) => { setForm({...l}); setModal(l) }
  const closeModal = () => { setModal(null); setForm({}) }

  async function save() {
    setSaving(true)
    if (modal === 'add') await supabase.from('leads').insert({ ...form, user_id:session.user.id })
    else await supabase.from('leads').update(form).eq('id', modal.id)
    await loadAll(); setSaving(false); closeModal()
  }

  async function deleteLead(id) {
    if (!confirm('Lead löschen?')) return
    await supabase.from('leads').delete().eq('id', id)
    setLeads(l => l.filter(x => x.id !== id))
    setFiltered(l => l.filter(x => x.id !== id))
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(l => l.map(x => x.id===id ? {...x,status} : x))
    setFiltered(l => l.map(x => x.id===id ? {...x,status} : x))
  }

  const openNewList  = () => { setListForm({ color:LIST_COLORS[0] }); setListModal('new') }
  const openEditList = (l) => { setListForm({...l}); setListModal(l) }
  const closeListModal = () => { setListModal(null); setListForm({}) }

  async function saveList() {
    setSaving(true)
    if (listModal === 'new') await supabase.from('lead_lists').insert({ ...listForm, user_id:session.user.id })
    else await supabase.from('lead_lists').update(listForm).eq('id', listModal.id)
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
    else await supabase.from('lead_list_members').insert({ lead_id:leadId, list_id:listId })
    await loadAll()
  }

  const getLeadListIds  = (lead) => lead.lead_list_members?.map(m => m.list_id) || []
  const activeListName  = listFilter === 'all' ? 'Alle Leads' : (lists.find(l => l.id===listFilter)?.name || 'Leads')
  const activeListColor = lists.find(l => l.id===listFilter)?.color

  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', transition:'border 0.15s' }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden', margin:'-28px -32px', background:'#F1F5F9' }}>

      {/* ── LEFT SIDEBAR (Lists) ── */}
      <aside style={{ width:220, flexShrink:0, background:'#fff', borderRight:'1px solid #E2E8F0', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em' }}>Listen</span>
          <button onClick={openNewList} title="Neue Liste"
            style={{ width:24, height:24, borderRadius:6, background:'#0A66C2', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:16, lineHeight:1 }}>+</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'6px 8px' }}>
          {/* All leads item */}
          <div onClick={() => setListFilter('all')}
            style={{ padding:'8px 12px', cursor:'pointer', borderRadius:8, marginBottom:2, display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:listFilter==='all'?700:500, color:listFilter==='all'?'#0A66C2':'#475569', background:listFilter==='all'?'#EFF6FF':'transparent', borderLeft:'3px solid '+(listFilter==='all'?'#0A66C2':'transparent'), transition:'all 0.12s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span style={{ flex:1 }}>Alle Leads</span>
            <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:999, background:listFilter==='all'?'#BFDBFE':'#F1F5F9', color:listFilter==='all'?'#1D4ED8':'#64748B' }}>{leads.length}</span>
          </div>
          {/* Individual lists */}
          {lists.map(list => (
            <div key={list.id} onClick={() => setListFilter(list.id)}
              style={{ padding:'8px 12px', cursor:'pointer', borderRadius:8, marginBottom:2, display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:listFilter===list.id?700:500, color:listFilter===list.id?list.color:'#475569', background:listFilter===list.id?list.color+'18':'transparent', borderLeft:'3px solid '+(listFilter===list.id?list.color:'transparent'), transition:'all 0.12s' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:list.color, flexShrink:0 }}/>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{list.name}</span>
              <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#94A3B8', fontWeight:600 }}>{list.lead_list_members?.length || 0}</span>
                <button onClick={e => { e.stopPropagation(); openEditList(list) }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#CBD5E1', padding:2, borderRadius:4 }}>✏️</button>
                <button onClick={e => { e.stopPropagation(); deleteList(list.id) }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#CBD5E1', padding:2, borderRadius:4 }}>🗑</button>
              </div>
            </div>
          ))}
          {lists.length === 0 && <div style={{ padding:'12px', fontSize:12, color:'#94A3B8', lineHeight:1.6 }}>Noch keine Listen.<br/>Klicke + um eine zu erstellen.</div>}
        </div>
      </aside>

      {/* ── MAIN PANEL ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Top bar */}
        <div style={{ background:'#fff', borderBottom:'1px solid #E2E8F0', padding:'0 20px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {listFilter !== 'all' && activeListColor && <div style={{ width:10, height:10, borderRadius:'50%', background:activeListColor }}/>}
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{activeListName}</span>
            <span style={{ fontSize:13, color:'#94A3B8', fontWeight:500 }}>({visibleLeads.length} {visibleLeads.length===1?'Lead':'Leads'})</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>Sortieren:</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', cursor:'pointer', outline:'none' }}>
                <option value="date">Neueste zuerst</option>
                <option value="name">Name A–Z</option>
                <option value="status">Status</option>
                <option value="company">Unternehmen</option>
              </select>
            </div>
            <button onClick={openAdd}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 3px rgba(10,102,194,0.3)', transition:'all 0.18s' }}
              onMouseOver={e => { e.currentTarget.style.background='#0958A8'; e.currentTarget.style.transform='translateY(-1px)'; }}
              onMouseOut={e => { e.currentTarget.style.background='#0A66C2'; e.currentTarget.style.transform='translateY(0)'; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Lead hinzufügen
            </button>
          </div>
        </div>

        {/* Search bar */}
        <SearchBar leads={leads} onResults={setFiltered}/>

        {/* Column headers */}
        <div style={{ background:'#F8FAFC', borderBottom:'1px solid #E2E8F0', padding:'0 20px', height:36, display:'flex', alignItems:'center', flexShrink:0 }}>
          <div style={{ width:32, flexShrink:0 }}/>
          <div style={{ width:50, flexShrink:0 }}/>
          <div style={{ flex:1, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>Name & Unternehmen</div>
          <div style={{ width:120, flexShrink:0, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>Liste</div>
          <div style={{ width:140, flexShrink:0, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>Status</div>
          <div style={{ width:90, flexShrink:0, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'right' }}>Datum</div>
          <div style={{ width:130, flexShrink:0, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'right' }}>Aktionen</div>
        </div>

        {/* Lead rows */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ padding:48, textAlign:'center', color:'#94A3B8', fontSize:14 }}>⏳ Lade Leads…</div>
          ) : visibleLeads.length === 0 ? (
            <div style={{ padding:48, textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:15, fontWeight:700, color:'#475569', marginBottom:6 }}>Keine Ergebnisse</div>
              <div style={{ fontSize:13, color:'#94A3B8', maxWidth:300, margin:'0 auto' }}>
                {leads.length===0 ? 'Noch keine Leads. Füge deinen ersten Lead hinzu!' : 'Versuche andere Suchbegriffe oder Filter.'}
              </div>
            </div>
          ) : visibleLeads.map(l => {
            const leadLists = lists.filter(list => getLeadListIds(l).includes(list.id))
            const isHov = hoveredRow === l.id
            return (
              <div key={l.id}
                style={{ display:'flex', alignItems:'center', padding:'0 20px', minHeight:68, borderBottom:'1px solid #F1F5F9', background:isHov?'#F8FAFC':'#fff', transition:'background 0.12s', cursor:'pointer' }}
                onMouseEnter={() => setHoveredRow(l.id)}
                onMouseLeave={() => setHoveredRow(null)}>
                {/* Checkbox */}
                <div style={{ width:32, flexShrink:0 }}>
                  <input type="checkbox" onClick={e => e.stopPropagation()} style={{ width:14, height:14, accentColor:'#0A66C2', cursor:'pointer' }}/>
                </div>
                {/* Avatar */}
                <div style={{ width:50, flexShrink:0 }}>
                  {l.avatar_url
                    ? <img src={l.avatar_url} style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover', border:'2px solid #E2E8F0' }} onError={e => e.target.style.display='none'}/>
                    : <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', border:'2px solid #E2E8F0' }}>
                        {l.name.charAt(0).toUpperCase()}
                      </div>
                  }
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0A66C2', marginBottom:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</div>
                  {l.headline && <div style={{ fontSize:12, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.headline}</div>}
                  {l.company  && <div style={{ fontSize:12, color:'#94A3B8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.company}</div>}
                </div>
                {/* Lists */}
                <div style={{ width:120, flexShrink:0, display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
                  {leadLists.map(list => (
                    <span key={list.id} style={{ padding:'2px 7px', borderRadius:999, fontSize:10, fontWeight:700, background:list.color+'18', color:list.color, border:'1px solid '+list.color+'33' }}>{list.name}</span>
                  ))}
                  <button onClick={e => { e.stopPropagation(); setAssignModal(l) }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#CBD5E1', padding:2, borderRadius:4 }} title="Listen zuweisen">📋</button>
                </div>
                {/* Status */}
                <div style={{ width:140, flexShrink:0 }}>
                  <StatusBadge status={l.status} onChange={s => updateStatus(l.id, s)}/>
                </div>
                {/* Date */}
                <div style={{ width:90, flexShrink:0, fontSize:11, color:'#94A3B8', fontWeight:500, textAlign:'right' }}>
                  {new Date(l.created_at).toLocaleDateString('de-DE')}
                </div>
                {/* Actions */}
                <div style={{ width:130, flexShrink:0, display:'flex', gap:5, justifyContent:'flex-end', alignItems:'center' }}>
                  {isHov && l.profile_url && (
                    <a href={l.profile_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:11, fontWeight:700, cursor:'pointer', textDecoration:'none', whiteSpace:'nowrap', boxShadow:'0 1px 3px rgba(10,102,194,0.3)' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                      Profil
                    </a>
                  )}
                  <button onClick={e => { e.stopPropagation(); openEdit(l) }}
                    style={{ width:30, height:30, borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#64748B', transition:'all 0.12s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor='#0A66C2'; e.currentTarget.style.color='#0A66C2'; e.currentTarget.style.background='#EFF6FF'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.color='#64748B'; e.currentTarget.style.background='transparent'; }}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); deleteLead(l.id) }}
                    style={{ width:30, height:30, borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#94A3B8', transition:'all 0.12s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor='#FCA5A5'; e.currentTarget.style.color='#EF4444'; e.currentTarget.style.background='#FEF2F2'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.color='#94A3B8'; e.currentTarget.style.background='transparent'; }}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MODAL: Lead add/edit ── */}
      {modal && (
        <Modal title={modal==='add'?'Lead hinzufügen':'Lead bearbeiten'} onClose={closeModal}>
          <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>
            {[['name','Name *',true],['company','Unternehmen',false],['headline','Position / Headline',false],['profile_url','LinkedIn URL',false]].map(([key,label,req]) => (
              <div key={key}>
                <label style={lbl}>{label}</label>
                <input value={form[key]||''} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} style={inp} placeholder={req?'Pflichtfeld':'Optional'}
                  onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
              </div>
            ))}
            <div>
              <label style={lbl}>Status</label>
              <select value={form.status||'new'} onChange={e => setForm(f => ({...f,status:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Notizen</label>
              <textarea value={form.notes||''} onChange={e => setForm(f => ({...f,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical', lineHeight:1.5 }} placeholder="Persönliche Notizen…"
                onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
            </div>
          </div>
          <div style={{ padding:'12px 22px 18px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
            <button onClick={closeModal} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={save} disabled={saving||!form.name}
              style={{ padding:'8px 20px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:!form.name?0.5:1, display:'flex', alignItems:'center', gap:6 }}>
              {saving?'⏳':'💾 Speichern'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Liste ── */}
      {listModal && (
        <Modal title={listModal==='new'?'Neue Liste erstellen':'Liste bearbeiten'} onClose={closeListModal} width={380}>
          <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input value={listForm.name||''} onChange={e => setListForm(f => ({...f,name:e.target.value}))} style={inp} placeholder="z.B. Potenzielle Kunden Q2"
                onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
            </div>
            <div>
              <label style={lbl}>Beschreibung</label>
              <input value={listForm.description||''} onChange={e => setListForm(f => ({...f,description:e.target.value}))} style={inp} placeholder="Optional"
                onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
            </div>
            <div>
              <label style={lbl}>Farbe</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:6 }}>
                {LIST_COLORS.map(c => (
                  <button key={c} onClick={() => setListForm(f => ({...f,color:c}))}
                    style={{ width:28, height:28, borderRadius:'50%', background:c, border:listForm.color===c?'3px solid #0F172A':'3px solid transparent', cursor:'pointer', transition:'border 0.15s' }}/>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding:'12px 22px 18px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
            <button onClick={closeListModal} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={saveList} disabled={saving||!listForm.name}
              style={{ padding:'8px 20px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:!listForm.name?0.5:1 }}>
              {saving?'⏳':'💾 Speichern'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Listen zuweisen ── */}
      {assignModal && (
        <Modal title="Listen zuweisen" onClose={() => setAssignModal(null)} width={360}>
          <div style={{ padding:'14px 22px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#F8FAFC', borderRadius:8, marginBottom:14, border:'1px solid #E2E8F0' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                {assignModal.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:'#0F172A' }}>{assignModal.name}</div>
                {assignModal.company && <div style={{ fontSize:12, color:'#94A3B8' }}>{assignModal.company}</div>}
              </div>
            </div>
            {lists.length === 0 ? (
              <div style={{ textAlign:'center', color:'#94A3B8', fontSize:13, padding:'12px 0' }}>
                Noch keine Listen.<br/>
                <button onClick={() => { setAssignModal(null); openNewList() }}
                  style={{ marginTop:8, padding:'6px 16px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Neue Liste</button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {lists.map(list => {
                  const isIn = getLeadListIds(assignModal).includes(list.id)
                  return (
                    <div key={list.id} onClick={() => toggleListMember(assignModal.id, list.id, isIn)}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, cursor:'pointer', background:isIn?list.color+'12':'#F8FAFC', border:'1.5px solid '+(isIn?list.color+'50':'#E2E8F0'), transition:'all 0.15s' }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:list.color, flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:13, color:isIn?list.color:'#0F172A' }}>{list.name}</div>
                        {list.description && <div style={{ fontSize:11, color:'#94A3B8' }}>{list.description}</div>}
                      </div>
                      <div style={{ width:20, height:20, borderRadius:'50%', border:'2px solid '+(isIn?list.color:'#CBD5E1'), background:isIn?list.color:'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                        {isIn && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div style={{ padding:'10px 22px 18px', textAlign:'right', borderTop:'1px solid #F1F5F9' }}>
            <button onClick={() => { setAssignModal(null); loadAll() }}
              style={{ padding:'8px 20px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>Fertig</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
