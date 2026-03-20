import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = ['new','contacted','replied','converted']
const STATUS_LABELS  = { new:'Neu', contacted:'Kontaktiert', replied:'Geantwortet', converted:'Konvertiert' }

export default function Leads({ session }) {
  const [leads,   setLeads]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')
  const [modal,   setModal]   = useState(null) // null | 'add' | lead object
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('leads')
      .select('*').eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }

  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.status !== filter) return false
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) &&
        !(l.company||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function openAdd() { setForm({ status:'new' }); setModal('add') }
  function openEdit(l) { setForm({...l}); setModal(l) }
  function closeModal() { setModal(null); setForm({}) }

  async function save() {
    setSaving(true)
    if (modal === 'add') {
      await supabase.from('leads').insert({ ...form, user_id: session.user.id })
    } else {
      await supabase.from('leads').update(form).eq('id', modal.id)
    }
    await load(); setSaving(false); closeModal()
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

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Leads</h1>
          <div style={{color:'#888',fontSize:14}}>{leads.length} Leads gespeichert</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Lead hinzufügen</button>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Suchen..." style={{flex:'1',minWidth:180}}/>
        <div style={{display:'flex',gap:6}}>
          {['all',...STATUS_OPTIONS].map(s => (
            <button key={s} className={`btn btn-sm ${filter===s?'btn-primary':'btn-secondary'}`}
              onClick={()=>setFilter(s)}>
              {s==='all' ? 'Alle' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Lead cards */}
      {loading ? <div style={{color:'#aaa',padding:20}}>⏳ Lade Leads...</div> :
       filtered.length === 0 ? (
        <div className="card" style={{padding:40,textAlign:'center',color:'#aaa'}}>
          {leads.length === 0 ? '👥 Noch keine Leads. Füge deinen ersten Lead hinzu!' : 'Keine Treffer für diesen Filter.'}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
          {filtered.map(l => (
            <div key={l.id} className="card" style={{padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:12}}>
                <div style={{width:44,height:44,borderRadius:'50%',background:'#e8f0fb',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:'#0a66c2',flexShrink:0}}>
                  {l.name.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{l.name}</div>
                  {l.company  && <div style={{fontSize:12,color:'#666'}}>{l.company}</div>}
                  {l.headline && <div style={{fontSize:11,color:'#888',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.headline}</div>}
                </div>
              </div>

              {l.notes && <div style={{fontSize:12,color:'#555',background:'#f8f8f8',borderRadius:6,padding:'8px 10px',marginBottom:12,lineHeight:1.5}}>{l.notes}</div>}

              <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'space-between'}}>
                <select value={l.status} onChange={e=>updateStatus(l.id,e.target.value)}
                  style={{fontSize:11,padding:'3px 8px',borderRadius:12,fontWeight:700,
                    background: l.status==='new'?'#e8f0fb':l.status==='contacted'?'#fff8e6':l.status==='replied'?'#e6f4ee':'#e6f4ee',
                    color: l.status==='new'?'#0a66c2':l.status==='contacted'?'#b25e09':'#057642',
                    border:'none',cursor:'pointer'}}>
                  {STATUS_OPTIONS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <div style={{display:'flex',gap:6}}>
                  {l.profile_url && <a href={l.profile_url} target="_blank" className="btn btn-sm btn-secondary" style={{padding:'4px 10px'}}>↗ Profil</a>}
                  <button className="btn btn-sm btn-secondary" onClick={()=>openEdit(l)}>✏️</button>
                  <button className="btn btn-sm btn-danger"    onClick={()=>deleteLead(l.id)}>🗑</button>
                </div>
              </div>
              <div style={{fontSize:10,color:'#ccc',marginTop:8}}>{new Date(l.created_at).toLocaleDateString('de-DE')} · {l.source}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div className="card" style={{width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #f0f0f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700,fontSize:16}}>{modal==='add'?'Lead hinzufügen':'Lead bearbeiten'}</div>
              <button onClick={closeModal} style={{background:'none',border:'none',fontSize:20,color:'#888',cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:14}}>
              {[
                ['name','Name *',true],
                ['company','Unternehmen',false],
                ['headline','Titel / Headline',false],
                ['profile_url','LinkedIn Profil URL',false],
              ].map(([key,label,req]) => (
                <div key={key}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>{label}</label>
                  <input value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                    style={{width:'100%'}} placeholder={req?'Pflichtfeld':'Optional'}/>
                </div>
              ))}
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>Status</label>
                <select value={form.status||'new'} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{width:'100%'}}>
                  {STATUS_OPTIONS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>Notizen</label>
                <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  rows={3} style={{width:'100%',resize:'vertical'}} placeholder="Persönliche Notizen zum Lead..."/>
              </div>
            </div>
            <div style={{padding:'14px 22px 20px',display:'flex',justifyContent:'flex-end',gap:10}}>
              <button className="btn btn-secondary" onClick={closeModal}>Abbrechen</button>
              <button className="btn btn-primary"   onClick={save} disabled={saving||!form.name}>
                {saving ? '⏳' : '💾 Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
