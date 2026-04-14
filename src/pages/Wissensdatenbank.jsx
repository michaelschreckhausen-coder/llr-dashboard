import React, { useEffect, useState, useRef } from 'react'
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

const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
}

const E0 = { name:'', description:'', content:'', category:'unternehmen', file_url:'', file_type:'', file_name:'' }

const In = ({v,fn,ph,style={}}) => <input value={v||''} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',...style}}/>
const Tx = ({v,fn,r=3,ph}) => <textarea value={v||''} onChange={e=>fn(e.target.value)} rows={r} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',outline:'none'}}/>
const Lb = ({l,h}) => <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>{l}</div>{h&&<div style={{fontSize:11,color:'#aaa',marginBottom:4}}>{h}</div>}</div>
const Sc = ({t,ch}) => <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8ecf0',marginBottom:14}}><div style={{padding:'11px 16px',borderBottom:'1px solid #f0f0f0',fontWeight:700,fontSize:13}}>{t}</div><div style={{padding:'15px 16px',display:'flex',flexDirection:'column',gap:11}}>{ch}</div></div>

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s)
    })
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  const ab = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const c = await page.getTextContent()
    text += c.items.map(item => item.str).join(' ') + '\n\n'
  }
  return text.trim()
}

async function extractExcelText(file) {
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s)
    })
  }
  const ab = await file.arrayBuffer()
  const wb = window.XLSX.read(ab, { type: 'array' })
  let text = ''
  for (const name of wb.SheetNames) {
    text += '## ' + name + '\n' + window.XLSX.utils.sheet_to_csv(wb.Sheets[name]) + '\n\n'
  }
  return text.trim()
}

function FileUpload({ session, edit, onUpdate, onExtractedText }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function handleFile(file) {
    const fileType = ACCEPTED_TYPES[file.type]
    if (!fileType) { setError('Dateityp nicht unterstützt. Erlaubt: PDF, Excel, CSV, Bilder'); return }
    if (file.size > 10485760) { setError('Datei zu groß (max. 10 MB)'); return }
    setError(''); setUploading(true)
    try {
      const path = `${session.user.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('knowledge-files').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('knowledge-files').getPublicUrl(path)
      onUpdate({ file_url: urlData?.publicUrl || path, file_type: fileType, file_name: file.name, name: edit.name || file.name.replace(/\.[^/.]+$/, '') })
      setUploading(false); setExtracting(true)
      let text = ''
      if (fileType === 'pdf') text = await extractPdfText(file)
      else if (['xlsx','xls','csv'].includes(fileType)) text = await extractExcelText(file)
      else if (fileType === 'image') text = `[Bild: ${file.name}]\nBeschreibe den Inhalt hier manuell.`
      if (text) onExtractedText(text)
    } catch (err) { setError(err.message || 'Upload fehlgeschlagen') }
    finally { setUploading(false); setExtracting(false) }
  }

  const hasFile = edit.file_name && edit.file_url
  return (
    <div>
      {hasFile ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#f0fdf4', borderRadius:8, border:'1px solid #bbf7d0' }}>
          <span style={{ fontSize:20 }}>{edit.file_type==='pdf'?'📄':edit.file_type==='image'?'🖼️':'📊'}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600 }}>{edit.file_name}</div>
            <div style={{ fontSize:11, color:'#666' }}>{edit.file_type==='pdf'?'PDF':edit.file_type==='image'?'Bild':'Tabelle'} — Text extrahiert</div>
          </div>
          <button onClick={()=>onUpdate({file_url:'',file_type:'',file_name:''})} style={{background:'none',border:'none',cursor:'pointer',color:'#aaa',fontSize:14}}>×</button>
        </div>
      ) : (
        <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
          onClick={()=>fileRef.current?.click()}
          style={{ border:dragging?`2px dashed ${P}`:'2px dashed #dde3ea', borderRadius:10, padding:'24px 16px', textAlign:'center', cursor:'pointer', background:dragging?'rgba(49,90,231,0.04)':'#fafbfc', transition:'all .2s' }}>
          <input ref={fileRef} type="file" onChange={e=>{const f=e.target.files[0];if(f)handleFile(f)}} style={{display:'none'}} accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"/>
          {uploading ? <div style={{color:P,fontWeight:600}}>⏳ Wird hochgeladen...</div>
           : extracting ? <div style={{color:'#7C3AED',fontWeight:600}}>🔍 Text wird extrahiert...</div>
           : <><div style={{fontSize:28,marginBottom:6}}>📎</div><div style={{fontSize:13,fontWeight:600,color:'#555'}}>Datei hierher ziehen oder klicken</div><div style={{fontSize:11,color:'#aaa',marginTop:4}}>PDF, Excel, CSV, Bilder (max. 10 MB)</div></>}
        </div>
      )}
      {error && <div style={{color:'#e53e3e',fontSize:12,marginTop:6}}>{error}</div>}
    </div>
  )
}

export default function Wissensdatenbank({ session }) {
  const { team } = useTeam()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [edit, setEdit] = useState(null)
  const [filter, setFilter] = useState('alle')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [session])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('knowledge_base').select('*')
      .or(`user_id.eq.${session.user.id},is_shared.eq.true`)
      .order('created_at', { ascending: false })
    setItems(data || []); setLoading(false)
  }

  async function save() {
    const { id, created_at, ...rest } = edit
    rest.updated_at = new Date().toISOString()
    if (id) { await supabase.from('knowledge_base').update(rest).eq('id', id) }
    else { rest.user_id = session.user.id; const { data } = await supabase.from('knowledge_base').insert(rest).select().single(); if (data) setEdit(data) }
    await load()
    setView('list')
    setEdit(null)
  }

  async function remove(id) {
    if (!confirm('Wissenseintrag wirklich löschen?')) return
    await supabase.from('knowledge_base').delete().eq('id', id); load()
  }

  function u(field, val) { setEdit(prev => ({...prev, [field]:val})) }
  function uMulti(updates) { setEdit(prev => ({...prev, ...updates})) }
  const catInfo = (cat) => CATEGORIES.find(c => c.v === cat) || CATEGORIES[CATEGORIES.length - 1]
  const filtered = items.filter(i => {
    if (filter !== 'alle' && i.category !== filter) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.description||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const counts = {}; items.forEach(i => { counts[i.category] = (counts[i.category] || 0) + 1 })

  if (view === 'list') return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ background:'linear-gradient(135deg, rgba(49,90,231,0.06), rgba(124,58,237,0.06))', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>📚 Wissensbasis</div>
        <div style={{ fontSize:12, color:'#666' }}>Hinterlege Kontext-Wissen — es fließt automatisch in alle KI-generierten Inhalte ein.</div>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <button onClick={()=>{setEdit({...E0,user_id:session.user.id});setView('editor')}} style={{padding:'10px 20px',background:P,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Wissen hinzufügen</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Suchen..." style={{padding:'8px 14px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,width:220}}/>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
        <button onClick={()=>setFilter('alle')} style={{padding:'5px 12px',borderRadius:20,border:filter==='alle'?`1.5px solid ${P}`:'1.5px solid #dde3ea',background:filter==='alle'?P:'#fff',color:filter==='alle'?'#fff':'#666',fontSize:12,cursor:'pointer',fontWeight:filter==='alle'?600:400}}>Alle ({items.length})</button>
        {CATEGORIES.map(c => { const cnt=counts[c.v]||0; if(cnt===0&&filter!==c.v) return null; return <button key={c.v} onClick={()=>setFilter(c.v)} style={{padding:'5px 12px',borderRadius:20,border:filter===c.v?`1.5px solid ${P}`:'1.5px solid #dde3ea',background:filter===c.v?P:'#fff',color:filter===c.v?'#fff':'#666',fontSize:12,cursor:'pointer',fontWeight:filter===c.v?600:400}}>{c.icon} {c.l} ({cnt})</button> })}
      </div>
      {loading ? <div style={{textAlign:'center',color:'#888'}}>Laden...</div> : filtered.length === 0 ? (
        <div style={{textAlign:'center',color:'#888',padding:40}}>{items.length===0?'Noch kein Wissen hinterlegt. Füge dein erstes Kontextdokument hinzu!':'Keine Einträge für diesen Filter.'}</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(v => { const cat=catInfo(v.category); return (
            <div key={v.id} style={{background:'#fff',borderRadius:10,border:'1.5px solid #e8ecf0',padding:'12px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={()=>{setEdit(v);setView('editor')}}>
              <div style={{fontSize:20,width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8f9fa',borderRadius:8}}>{cat.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontWeight:600,fontSize:14}}>{v.name}</span>
                  {v.file_name && <span style={{fontSize:10,background:'#e0f2fe',color:'#0369a1',padding:'1px 6px',borderRadius:4}}>📎 {v.file_type==='pdf'?'PDF':v.file_type==='image'?'Bild':'Tabelle'}</span>}
                </div>
                {v.description && <div style={{fontSize:12,color:'#888',marginTop:2}}>{v.description.slice(0,80)}{v.description.length>80?'…':''}</div>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:10,background:'#f0f0f0',padding:'3px 8px',borderRadius:6,color:'#666'}}>{cat.l}</span>
                <span style={{fontSize:10,color:'#aaa'}}>{v.content?(v.content.length>1000?Math.round(v.content.length/1000)+'k':v.content.length)+' Zeichen':''}</span>
                <button onClick={e=>{e.stopPropagation();remove(v.id)}} style={{background:'none',border:'none',cursor:'pointer',color:'#ccc',fontSize:14}}>🗑</button>
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )

  if (!edit) return null
  return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <button onClick={()=>{setView('list');setEdit(null)}} style={{background:'none',border:'none',fontSize:18,cursor:'pointer'}}>←</button>
        <span style={{fontSize:18,fontWeight:700}}>{edit.id?'Wissen bearbeiten':'Neues Wissen hinzufügen'}</span>
      </div>
      <Sc t="📎 Dokument hochladen (optional)" ch={<>
        <Lb l="Datei-Upload" h="PDF, Excel, CSV oder Bild hochladen — Text wird automatisch extrahiert"/>
        <FileUpload session={session} edit={edit} onUpdate={uMulti} onExtractedText={text => u('content', (edit.content ? edit.content+'\n\n---\n\n' : '')+text)}/>
      </>}/>
      <Sc t="Grundlagen" ch={<>
        <Lb l="Name" h="Kurzer, beschreibender Titel"/>
        <In v={edit.name} fn={v=>u('name',v)} ph="z.B. Unternehmensprofil entrenous GmbH"/>
        <Lb l="Beschreibung (optional)"/>
        <In v={edit.description} fn={v=>u('description',v)} ph="Kurze Beschreibung des Inhalts"/>
      </>}/>
      <Sc t="Kategorie" ch={<>
        <Lb l="Art des Wissens"/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:8}}>
          {CATEGORIES.map(c => <button key={c.v} onClick={()=>u('category',c.v)} style={{padding:'10px 12px',borderRadius:8,border:edit.category===c.v?`2px solid ${P}`:'1.5px solid #dde3ea',background:edit.category===c.v?'rgba(49,90,231,0.06)':'#fff',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:18}}>{c.icon}</span><div><div style={{fontWeight:600,fontSize:12}}>{c.l}</div><div style={{fontSize:10,color:'#888'}}>{c.d}</div></div>
          </button>)}
        </div>
      </>}/>
      <Sc t="Inhalt" ch={<>
        <Lb l="Wissens-Inhalt" h="Manuell eingeben oder aus hochgeladener Datei extrahiert"/>
        <Tx v={edit.content} fn={v=>u('content',v)} r={14} ph="Wissen eingeben oder Dokument oben hochladen..."/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#aaa'}}>
          <span>{(edit.content||'').length.toLocaleString()} / 20.000 Zeichen</span>
          {(edit.content||'').length > 20000 && <span style={{color:'#e53e3e'}}>⚠️ Max überschritten</span>}
        </div>
      </>}/>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:20,paddingBottom:20}}>
        <button onClick={()=>{setView('list');setEdit(null)}} style={{padding:'10px 24px',background:'none',border:'none',fontSize:14,cursor:'pointer',color:'#888'}}>Abbrechen</button>
        <button onClick={save} disabled={!edit.name?.trim()} style={{padding:'10px 28px',background:P,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',opacity:edit.name?.trim()?1:.5}}>💾 Speichern</button>
      </div>
    </div>
  )
}
