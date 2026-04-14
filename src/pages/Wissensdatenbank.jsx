import React, { useEffect, useState } from 'react'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'

const P = 'var(--wl-primary, rgb(49,90,231))'

const CATEGORIES = [
  { v:'unternehmen',      l:'Unternehmen',       icon:'🏢', d:'Firmenprofil, Geschichte, USPs' },
  { v:'produkt',          l:'Produkt / Service',  icon:'📦', d:'Features, Vorteile, Pricing' },
  { v:'case_studies',     l:'Case Studies',        icon:'📊', d:'Kundenerfolge, Referenzprojekte' },
  { v:'branchenwissen',   l:'Branchenwissen',      icon:'🎓', d:'Markt-Insights, Trends, Statistiken' },
  { v:'wettbewerber',     l:'Wettbewerber',        icon:'⚔️', d:'Konkurrenzanalyse, Differenzierung' },
  { v:'referenzen',       l:'Referenzen',          icon:'⭐', d:'Testimonials, Bewertungen' },
  { v:'linkedin_strategie',l:'LinkedIn-Strategie', icon:'💡', d:'Content-Pläne, Best Practices' },
  { v:'sonstiges',        l:'Sonstiges',           icon:'📄', d:'Alles andere' },
]

const E0 = { name:'', description:'', content:'', category:'unternehmen' }

// ─── Helper-Komponenten ────────────────────────────────────────────────────────
const In = ({v,fn,ph,style={}}) => <input value={v||''} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',...style}}/>
const Tx = ({v,fn,r=3,ph}) => <textarea value={v||''} onChange={e=>fn(e.target.value)} rows={r} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',outline:'none'}}/>
const Lb = ({l,h}) => <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>{l}</div>{h&&<div style={{fontSize:11,color:'#aaa',marginBottom:4}}>{h}</div>}</div>
const Sc = ({t,ch}) => <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8ecf0',marginBottom:14}}><div style={{padding:'11px 16px',borderBottom:'1px solid #f0f0f0',fontWeight:700,fontSize:13}}>{t}</div><div style={{padding:'15px 16px',display:'flex',flexDirection:'column',gap:11}}>{ch}</div></div>

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function Wissensdatenbank({ session }) {
  const { team } = useTeam()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')  // list | editor
  const [edit, setEdit] = useState(null)
  const [filter, setFilter] = useState('alle')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [session])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('knowledge_base').select('*')
      .or(`user_id.eq.${session.user.id},is_shared.eq.true`)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function save() {
    const { id, created_at, ...rest } = edit
    rest.updated_at = new Date().toISOString()
    if (id) {
      await supabase.from('knowledge_base').update(rest).eq('id', id)
    } else {
      rest.user_id = session.user.id
      const { data } = await supabase.from('knowledge_base').insert(rest).select().single()
      if (data) setEdit(data)
    }
    load()
  }

  async function remove(id) {
    if (!confirm('Wissenseintrag wirklich löschen?')) return
    await supabase.from('knowledge_base').delete().eq('id', id)
    load()
  }

  function u(field, val) { setEdit(prev => ({...prev, [field]:val})) }

  const catInfo = (cat) => CATEGORIES.find(c => c.v === cat) || CATEGORIES[CATEGORIES.length - 1]

  const filtered = items.filter(i => {
    if (filter !== 'alle' && i.category !== filter) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.description||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Count per category
  const counts = {}
  items.forEach(i => { counts[i.category] = (counts[i.category] || 0) + 1 })

  // ─── List View ──────────────────────────────────────
  if (view === 'list') return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg, rgba(49,90,231,0.06), rgba(124,58,237,0.06))', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>📚 Wissensbasis</div>
        <div style={{ fontSize:12, color:'#666' }}>Hinterlege Kontext-Wissen — es fließt automatisch in alle KI-generierten Inhalte ein.</div>
      </div>

      {/* Actions + Search */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor') }}
          style={{ padding:'10px 20px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
          + Wissen hinzufügen
        </button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Suchen..."
          style={{ padding:'8px 14px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:13, width:220 }}/>
      </div>

      {/* Category Filter Pills */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
        <button onClick={()=>setFilter('alle')}
          style={{ padding:'5px 12px', borderRadius:20, border: filter==='alle' ? `1.5px solid ${P}` : '1.5px solid #dde3ea', background: filter==='alle' ? P : '#fff', color: filter==='alle' ? '#fff' : '#666', fontSize:12, cursor:'pointer', fontWeight: filter==='alle' ? 600 : 400 }}>
          Alle ({items.length})
        </button>
        {CATEGORIES.map(c => {
          const cnt = counts[c.v] || 0
          if (cnt === 0 && filter !== c.v) return null
          return (
            <button key={c.v} onClick={()=>setFilter(c.v)}
              style={{ padding:'5px 12px', borderRadius:20, border: filter===c.v ? `1.5px solid ${P}` : '1.5px solid #dde3ea', background: filter===c.v ? P : '#fff', color: filter===c.v ? '#fff' : '#666', fontSize:12, cursor:'pointer', fontWeight: filter===c.v ? 600 : 400 }}>
              {c.icon} {c.l} ({cnt})
            </button>
          )
        })}
      </div>

      {/* List */}
      {loading ? <div style={{textAlign:'center',color:'#888'}}>Laden...</div> : filtered.length === 0 ? (
        <div style={{ textAlign:'center', color:'#888', padding:40 }}>
          {items.length === 0 ? 'Noch kein Wissen hinterlegt. Füge dein erstes Kontextdokument hinzu!' : 'Keine Einträge für diesen Filter.'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(v => {
            const cat = catInfo(v.category)
            return (
              <div key={v.id} style={{ background:'#fff', borderRadius:10, border:'1.5px solid #e8ecf0', padding:'12px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                onClick={()=>{ setEdit(v); setView('editor') }}>
                <div style={{ fontSize:20, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f9fa', borderRadius:8 }}>{cat.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{v.name}</div>
                  {v.description && <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{v.description.slice(0,80)}{v.description.length>80?'…':''}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, background:'#f0f0f0', padding:'3px 8px', borderRadius:6, color:'#666' }}>{cat.l}</span>
                  <span style={{ fontSize:10, color:'#aaa' }}>{v.content ? (v.content.length > 1000 ? Math.round(v.content.length/1000)+'k' : v.content.length) + ' Zeichen' : ''}</span>
                  <button onClick={(e)=>{ e.stopPropagation(); remove(v.id) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:14 }}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─── Editor View ────────────────────────────────────
  if (!edit) return null

  return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer' }}>←</button>
        <span style={{ fontSize:18, fontWeight:700 }}>{edit.id ? 'Wissen bearbeiten' : 'Neues Wissen hinzufügen'}</span>
      </div>

      <Sc t="Grundlagen" ch={<>
        <Lb l="Name" h="Kurzer, beschreibender Titel"/>
        <In v={edit.name} fn={v=>u('name',v)} ph="z.B. Unternehmensprofil entrenous GmbH"/>
        <Lb l="Beschreibung (optional)" h="Worum geht es in diesem Dokument?"/>
        <In v={edit.description} fn={v=>u('description',v)} ph="Kurze Beschreibung des Inhalts"/>
      </>}/>

      <Sc t="Kategorie" ch={<>
        <Lb l="Art des Wissens"/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
          {CATEGORIES.map(c => (
            <button key={c.v} onClick={()=>u('category',c.v)}
              style={{ padding:'10px 12px', borderRadius:8, border: edit.category===c.v ? `2px solid ${P}` : '1.5px solid #dde3ea', background: edit.category===c.v ? 'rgba(49,90,231,0.06)' : '#fff', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>{c.icon}</span>
              <div>
                <div style={{ fontWeight:600, fontSize:12 }}>{c.l}</div>
                <div style={{ fontSize:10, color:'#888' }}>{c.d}</div>
              </div>
            </button>
          ))}
        </div>
      </>}/>

      <Sc t="Inhalt" ch={<>
        <Lb l="Wissens-Inhalt" h="Füge den vollständigen Text ein — bis zu 20.000 Zeichen"/>
        <Tx v={edit.content} fn={v=>u('content',v)} r={14} ph="Füge hier das Wissen ein, das die KI als Kontext verwenden soll.&#10;&#10;z.B. Unternehmensbeschreibung, Produktdetails, Case Studies, Branchenwissen...&#10;&#10;Je detaillierter und strukturierter, desto besser werden die generierten Inhalte."/>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#aaa' }}>
          <span>{(edit.content||'').length.toLocaleString()} / 20.000 Zeichen</span>
          {(edit.content||'').length > 20000 && <span style={{ color:'#e53e3e' }}>⚠️ Maximale Länge überschritten</span>}
        </div>
      </>}/>

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:20, paddingBottom:20 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ padding:'10px 24px', background:'none', border:'none', fontSize:14, cursor:'pointer', color:'#888' }}>Abbrechen</button>
        <button onClick={save} disabled={!edit.name?.trim()} style={{ padding:'10px 28px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:edit.name?.trim()?1:.5 }}>
          💾 Speichern
        </button>
      </div>
    </div>
  )
}
