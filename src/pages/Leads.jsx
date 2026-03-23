import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = ['new','contacted','replied','converted']
const STATUS_LABELS  = { new:'Neu', contacted:'Kontaktiert', replied:'Geantwortet', converted:'Konvertiert' }
const LIST_COLORS = ['#0a66c2','#057642','#b25e09','#cc1016','#7c3aed','#0891b2','#be185d','#374151']

export default function Leads({ session }) {
  const [leads,      setLeads]      = useState([])
  const [lists,      setLists]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [listFilter, setListFilter] = useState('all')
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(null)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [listModal,  setListModal]  = useState(null)
  const [listForm,   setListForm]   = useState({})
  const [assignModal,setAssignModal]= useState(null)

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

  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.status !== filter) return false
    if (listFilter !== 'all' && !l.lead_list_members?.some(m => m.list_id === listFilter)) return false
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function openAdd()    { setForm({ status:'new' }); setModal('add') }
  function openEdit(l)  { setForm({...l});            setModal(l) }
  function closeModal() { setModal(null); setForm({}) }

  async function save() {
    setSaving(true)
    if (modal === 'add') await supabase.from('leads').insert({ ...form, user_id: session.user.id })
    else                  await supabase.from('leads').update(form).eq('id', modal.id)
    await loadAll(); setSaving(false); closeModal()
  }

  async function deleteLead(id) {
    if (!confirm('Lead wirklich löschen?')) return
    await supabase.from('leads').delete().eq('id', id)
    setLeads(l => l.filter(x => x.id !== id))
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(l => l.map(x => x.id === id ? {...x, status} : x))
  }

  function openNewList()    { setListForm({ color: LIST_COLORS[0] }); setListModal('new') }
  function openEditList(l)  { setListForm({...l});                     setListModal(l) }
  function closeListModal() { setListModal(null); setListForm({}) }

  async function saveList() {
    setSaving(true)
    if (listModal === 'new') await supabase.from('lead_lists').insert({ ...listForm, user_id: session.user.id })
    else                      await supabase.from('lead_lists').update(listForm).eq('id', listModal.id)
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
    else       await supabase.from('lead_list_members').insert({ lead_id: leadId, list_id: listId })
    await loadAll()
  }

  const getLeadListIds = (lead) => lead.lead_list_members?.map(m => m.list_id) || []

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{ width:220, flexShrink:0, borderRight:'1px solid #eee', background:'#fafafa', paddingTop:8 }}>
        <div style={{ padding:'10px 14px 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.5px' }}>Listen</div>
          <button onClick={openNewList} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#0a66c2', lineHeight:1 }}>+</button>
        </div>
        <div onClick={() => setListFilter('all')} style={{ padding:'7px 14px', cursor:'pointer', borderRadius:6, margin:'2px 6px', background:listFilter==='all'?'#e8f0fb':'transparent', color:listFilter==='all'?'#0a66c2':'#555', fontWeight:listFilter==='all'?700:400, fontSize:13, display:'flex', justifyContent:'space-between' }}>
          <span>📋 Alle Leads</span><span style={{ fontSize:11, color:'#aaa' }}>{leads.length}</span>
        </div>
        {lists.map(list => {
          const isActive = listFilter === list.id
          return (
            <div key={list.id} onClick={() => setListFilter(list.id)}
              style={{ padding:'7px 14px', cursor:'pointer', borderRadius:6, margin:'2px 6px', display:'flex', justifyContent:'space-between', alignItems:'center', background:isActive?list.color+'22':'transparent', color:isActive?list.color:'#555', fontWeight:isActive?700:400, fontSize:13, borderLeft:isActive?`3px solid ${list.color}`:'3px solid transparent' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:list.color, flexShrink:0 }}/>
                {list.name}
              </span>
              <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#aaa' }}>{list.lead_list_members?.length||0}</span>
                <button onClick={e=>{e.stopPropagation();openEditList(list)}} style={{ background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#bbb' }}>✏️</button>
                <button onClick={e=>{e.stopPropagation();deleteList(list.id)}} style={{ background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#bbb' }}>🗑</button>
              </div>
            </div>
          )
        })}
        {lists.length === 0 && <div style={{ padding:'10px 14px', fontSize:12, color:'#bbb', lineHeight:1.5 }}>Noch keine Listen.<br/>Klicke + um eine zu erstellen.</div>}
      </aside>

      <div style={{ flex:1, padding:'28px 24px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>{listFilter==='all'?'Alle Leads':(lists.find(l=>l.id===listFilter)?.name||'Leads')}</h1>
            <div style={{ color:'#888', fontSize:14 }}>{filtered.length} Leads</div>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ Lead hinzufügen</button>
        </div>

        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Suchen..." style={{ flex:1, minWidth:180 }}/>
          <div style={{ display:'flex', gap:6 }}>
            {['all',...STATUS_OPTIONS].map(s => (
              <button key={s} className={`btn btn-sm ${filter===s?'btn-primary':'btn-secondary'}`} onClick={()=>setFilter(s)}>{s==='all'?'Alle':STATUS_LABELS[s]}</button>
            ))}
          </div>
        </div>

        {loading ? <div style={{color:'#aaa',padding:20}}>⏳ Lade Leads...</div> : filtered.length===0 ? (
          <div className="card" style={{ padding:40, textAlign:'center', color:'#aaa' }}>
            {leads.length===0?'👥 Noch keine Leads. Speichere deinen ersten Lead über LinkedIn!':listFilter!=='all'?'📋 Diese Liste ist leer. Füge Leads über das 📋 Icon hinzu.':'Keine Treffer.'}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
            {filtered.map(l => {
              const leadListIds = getLeadListIds(l)
              const leadLists   = lists.filter(list => leadListIds.includes(list.id))
              return (
                <div key={l.id} className="card" style={{ padding:'16px 18px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'#e8f0fb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#0a66c2', flexShrink:0, overflow:'hidden' }}>
                      {l.avatar_url ? <img src={l.avatar_url} style={{width:40,height:40,objectFit:'cover'}} onError={e=>e.target.style.display='none'}/> : l.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</div>
                      {l.company  && <div style={{ fontSize:11, color:'#666' }}>{l.company}</div>}
                      {l.headline && <div style={{ fontSize:11, color:'#888', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.headline}</div>}
                    </div>
                    <button onClick={()=>setAssignModal(l)} title="Listen zuweisen" style={{ background:'none', border:'none', cursor:'pointer', fontSize:15, color:'#bbb', flexShrink:0 }}>📋</button>
                  </div>
                  {leadLists.length>0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                      {leadLists.map(list => <span key={list.id} style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700, background:list.color+'22', color:list.color }}>{list.name}</span>)}
                    </div>
                  )}
                  {l.notes && <div style={{ fontSize:11, color:'#555', background:'#f8f8f8', borderRadius:6, padding:'6px 8px', marginBottom:8, lineHeight:1.4 }}>{l.notes.slice(0,120)}{l.notes.length>120?'…':''}</div>}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <select value={l.status} onChange={e=>updateStatus(l.id,e.target.value)} style={{ fontSize:11, padding:'3px 7px', borderRadius:12, fontWeight:700, border:'none', cursor:'pointer', background:l.status==='new'?'#e8f0fb':l.status==='contacted'?'#fff8e6':'#e6f4ee', color:l.status==='new'?'#0a66c2':l.status==='contacted'?'#b25e09':'#057642' }}>
                      {STATUS_OPTIONS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <div style={{ display:'flex', gap:4 }}>
                      {l.profile_url && <a href={l.profile_url} target="_blank" className="btn btn-sm btn-secondary" style={{padding:'3px 8px',fontSize:11}}>↗</a>}
                      <button className="btn btn-sm btn-secondary" onClick={()=>openEdit(l)} style={{padding:'3px 8px',fontSize:11}}>✏️</button>
                      <button className="btn btn-sm btn-danger"    onClick={()=>deleteLead(l.id)} style={{padding:'3px 8px',fontSize:11}}>🗑</button>
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:'#ccc', marginTop:6 }}>{new Date(l.created_at).toLocaleDateString('de-DE')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:460, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{modal==='add'?'Lead hinzufügen':'Lead bearbeiten'}</div>
              <button onClick={closeModal} style={{ background:'none', border:'none', fontSize:20, color:'#888', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              {[['name','Name *',true],['company','Unternehmen',false],['headline','Position',false],['profile_url','LinkedIn URL',false]].map(([key,label,req]) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#555', marginBottom:4 }}>{label}</label>
                  <input value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:'100%' }} placeholder={req?'Pflichtfeld':'Optional'}/>
                </div>
              ))}
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#555', marginBottom:4 }}>Status</label>
                <select value={form.status||'new'} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{ width:'100%' }}>
                  {STATUS_OPTIONS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#555', marginBottom:4 }}>Notizen</label>
                <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} style={{ width:'100%', resize:'vertical' }} placeholder="Persönliche Notizen..."/>
              </div>
            </div>
            <div style={{ padding:'12px 20px 18px', display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button className="btn btn-secondary" onClick={closeModal}>Abbrechen</button>
              <button className="btn btn-primary" onClick={save} disabled={saving||!form.name}>{saving?'⏳':'💾 Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {listModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:380, maxWidth:'95vw' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{listModal==='new'?'📋 Neue Liste erstellen':'Liste bearbeiten'}</div>
              <button onClick={closeListModal} style={{ background:'none', border:'none', fontSize:20, color:'#888', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#555', marginBottom:4 }}>Name *</label>
                <input value={listForm.name||''} onChange={e=>setListForm(f=>({...f,name:e.target.value}))} style={{ width:'100%' }} placeholder="z.B. Potenzielle Kunden Q2 2026"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#555', marginBottom:4 }}>Beschreibung</label>
                <input value={listForm.description||''} onChange={e=>setListForm(f=>({...f,description:e.target.value}))} style={{ width:'100%' }} placeholder="Optional"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#555', marginBottom:10 }}>Farbe</label>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {LIST_COLORS.map(c => (
                    <button key={c} onClick={()=>setListForm(f=>({...f,color:c}))}
                      style={{ width:30, height:30, borderRadius:'50%', background:c, border:listForm.color===c?'3px solid #111':'3px solid transparent', cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding:'12px 20px 18px', display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button className="btn btn-secondary" onClick={closeListModal}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveList} disabled={saving||!listForm.name}>{saving?'⏳':'💾 Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {assignModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:360, maxWidth:'95vw' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:15 }}>📋 Listen zuweisen</div>
              <button onClick={()=>setAssignModal(null)} style={{ background:'none', border:'none', fontSize:20, color:'#888', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'14px 20px' }}>
              <div style={{ fontSize:13, color:'#555', marginBottom:12 }}><strong>{assignModal.name}</strong> zu Listen hinzufügen:</div>
              {lists.length===0 ? (
                <div style={{ textAlign:'center', color:'#aaa', fontSize:13, padding:'12px 0' }}>
                  Noch keine Listen.<br/>
                  <button className="btn btn-primary btn-sm" style={{marginTop:8}} onClick={()=>{setAssignModal(null);openNewList()}}>+ Neue Liste erstellen</button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {lists.map(list => {
                    const isIn = getLeadListIds(assignModal).includes(list.id)
                    return (
                      <div key={list.id} onClick={()=>toggleListMember(assignModal.id,list.id,isIn)}
                        style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, cursor:'pointer', background:isIn?list.color+'15':'#f8f8f8', border:isIn?`1.5px solid ${list.color}`:'1.5px solid transparent', transition:'all 0.15s' }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', background:list.color, flexShrink:0 }}/>
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
            <div style={{ padding:'10px 20px 16px', textAlign:'right' }}>
              <button className="btn btn-primary btn-sm" onClick={()=>{setAssignModal(null);loadAll()}}>Fertig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
