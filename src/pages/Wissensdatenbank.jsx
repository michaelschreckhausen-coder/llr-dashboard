import React, { useEffect, useState, useRef } from 'react'
import { useTeam } from '../context/TeamContext'
import { scrapeLinkedInProfile, formatLinkedInProfileAsText } from '../lib/leadeskExtension'
import { supabase } from '../lib/supabase'
import EmptyHero from '../components/EmptyHero'
import SectionCard from '../components/SectionCard'

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

const E0 = { name:'', description:'', content:'', category:'unternehmen', file_url:'', file_type:'', file_name:'', source_url:'' }

// ─── Premium-Form-Primitives (lokal) ────────────────────────────────
function In({v,fn,ph,style={},type='text',disabled}) {
  const [focused, setFocused] = useState(false)
  return <input
    type={type} value={v||''} disabled={disabled}
    onChange={e=>fn(e.target.value)} placeholder={ph}
    onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
    style={{ width:'100%', padding:'11px 14px',
      border:'1.5px solid '+(focused?'var(--wl-primary, rgb(49,90,231))':'var(--border, #E5E7EB)'),
      borderRadius:10, fontSize:13.5, boxSizing:'border-box', outline:'none',
      background:'var(--surface, #fff)', color:'var(--text-primary, rgb(20,20,43))',
      boxShadow: focused ? '0 0 0 3px rgba(49,90,231,.10)' : 'none',
      transition:'border-color .15s, box-shadow .15s',
      fontFamily:'inherit', opacity: disabled?.6:1, ...style }}/>
}

function Tx({v,fn,r=3,ph,disabled}) {
  const [focused, setFocused] = useState(false)
  return <textarea
    value={v||''} disabled={disabled}
    onChange={e=>fn(e.target.value)} rows={r} placeholder={ph}
    onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
    style={{ width:'100%', padding:'11px 14px',
      border:'1.5px solid '+(focused?'var(--wl-primary, rgb(49,90,231))':'var(--border, #E5E7EB)'),
      borderRadius:10, fontSize:13.5, lineHeight:1.55, resize:'vertical',
      boxSizing:'border-box', outline:'none',
      background:'var(--surface, #fff)', color:'var(--text-primary, rgb(20,20,43))',
      boxShadow: focused ? '0 0 0 3px rgba(49,90,231,.10)' : 'none',
      transition:'border-color .15s, box-shadow .15s',
      fontFamily:'inherit', opacity: disabled?.6:1 }}/>
}

const Lb = ({l,h}) => (
  <div style={{marginBottom:12}}>
    <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-muted, #6B7280)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>{l}</div>
    {h&&<div style={{fontSize:12,color:'var(--text-soft, #9CA3AF)',lineHeight:1.5}}>{h}</div>}
  </div>
)

const Sc = ({t,ch}) => (
  <section style={{
    background:'var(--surface, #fff)',
    borderRadius:14,
    border:'1px solid var(--border, #E5E7EB)',
    marginBottom:16,
    overflow:'hidden',
    boxShadow:'0 1px 3px rgba(15,23,42,.04)'
  }}>
    <header style={{padding:'14px 20px',borderBottom:'1px solid var(--border-soft, #F1F5F9)',fontWeight:700,fontSize:14,color:'var(--text-primary)',letterSpacing:'-.1px'}}>{t}</header>
    <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>{ch}</div>
  </section>
)

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
      const path = `knowledge/${session.user.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('knowledge-files').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('knowledge-files').getPublicUrl(path)
      onUpdate({ file_url: urlData?.publicUrl || path, file_type: fileType, file_name: file.name, source_url: '', name: edit.name || file.name.replace(/\.[^/.]+$/, '') })
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

function UrlImport({ edit, onUpdate, onExtractedText }) {
  const [url, setUrl] = useState(edit.source_url || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function extract() {
    const trimmed = (url || '').trim()
    if (!trimmed) { setError('Bitte eine URL eingeben'); return }
    setError(''); setSuccess(''); setLoading(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('extract-url', { body: { url: trimmed } })
      if (fnErr) throw new Error(fnErr.message || 'Extraktion fehlgeschlagen')
      if (data?.error) throw new Error(data.error)
      if (!data?.text || data.text.length < 20) throw new Error('Es konnte kein verwertbarer Text extrahiert werden')

      const updates = { source_url: data.sourceUrl || trimmed, file_url:'', file_type:'', file_name:'' }
      if (!edit.name && data.title) updates.name = data.title.slice(0, 120)
      if (!edit.description && data.description) updates.description = data.description.slice(0, 300)
      onUpdate(updates)
      onExtractedText(data.text)
      setSuccess(`✓ ${data.textLength.toLocaleString()} Zeichen extrahiert${data.truncated ? ' (gekürzt)' : ''}`)
    } catch (err) {
      setError(err.message || 'Extraktion fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setUrl(''); setError(''); setSuccess('')
    onUpdate({ source_url: '' })
  }

  const hasImported = edit.source_url && !loading
  return (
    <div>
      {hasImported ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#f0fdf4', borderRadius:8, border:'1px solid #bbf7d0' }}>
          <span style={{ fontSize:20 }}>🔗</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{edit.source_url}</div>
            <div style={{ fontSize:11, color:'#666' }}>URL — Text extrahiert</div>
          </div>
          <button onClick={clear} style={{background:'none',border:'none',cursor:'pointer',color:'#aaa',fontSize:14}}>×</button>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={url}
              onChange={e=>setUrl(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter' && !loading){ e.preventDefault(); extract() } }}
              placeholder="https://beispiel.de/ueber-uns"
              disabled={loading}
              style={{flex:1,padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}
            />
            <button
              onClick={extract}
              disabled={loading || !url.trim()}
              style={{padding:'8px 18px',background:P,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:loading||!url.trim()?'not-allowed':'pointer',opacity:loading||!url.trim()?.5:1,whiteSpace:'nowrap'}}
            >
              {loading ? '⏳ Lädt…' : 'Extrahieren'}
            </button>
          </div>
          <div style={{ fontSize:11, color:'#888', marginTop:6 }}>
            Die Seite wird serverseitig abgerufen und der Haupttext extrahiert (max. 50.000 Zeichen). Titel und Beschreibung werden ggf. automatisch übernommen.
          </div>
        </>
      )}
      {error && <div style={{color:'#e53e3e',fontSize:12,marginTop:6}}>{error}</div>}
      {success && <div style={{color:'#16a34a',fontSize:12,marginTop:6}}>{success}</div>}
    </div>
  )
}

function LinkedInImport({ edit, onUpdate, onExtractedText }) {
  const [url, setUrl] = useState(edit.linkedin_template_url || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function extract() {
    const trimmed = (url || '').trim()
    if (!trimmed) { setError('Bitte eine LinkedIn-Profil-URL eingeben'); return }
    if (!/linkedin\.com\/in\//i.test(trimmed)) {
      setError('Bitte eine LinkedIn-Profil-URL (linkedin.com/in/...) eingeben')
      return
    }
    setError(''); setSuccess(''); setLoading(true)
    try {
      const resp = await scrapeLinkedInProfile(trimmed)
      if (resp?.error) throw new Error(resp.error)
      const profile = resp?.profile
      if (!profile || !profile.name) {
        throw new Error('LinkedIn-Profil konnte nicht extrahiert werden. Bitte einmal in LinkedIn einloggen und nochmal versuchen.')
      }
      const text = formatLinkedInProfileAsText(profile)
      const updates = { linkedin_template_url: resp.sourceUrl || trimmed, source_url:'', file_url:'', file_type:'', file_name:'' }
      if (!edit.name && profile.name) updates.name = profile.name.slice(0, 120)
      if (!edit.description && profile.headline) updates.description = profile.headline.slice(0, 300)
      onUpdate(updates)
      onExtractedText(text)
      setSuccess(`✓ Profil importiert (${text.length.toLocaleString()} Zeichen)`)
    } catch (err) {
      setError(err.message || 'Import fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setUrl(''); setError(''); setSuccess('')
    onUpdate({ linkedin_template_url: '' })
  }

  const hasImported = edit.linkedin_template_url && !loading
  return (
    <div>
      {hasImported ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#f0fdf4', borderRadius:8, border:'1px solid #bbf7d0' }}>
          <span style={{ fontSize:20 }}>💼</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{edit.linkedin_template_url}</div>
            <div style={{ fontSize:11, color:'#666' }}>LinkedIn-Profil — Daten extrahiert</div>
          </div>
          <button onClick={clear} style={{background:'none',border:'none',cursor:'pointer',color:'#aaa',fontSize:14}}>×</button>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={url}
              onChange={e=>setUrl(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter' && !loading){ e.preventDefault(); extract() } }}
              placeholder="https://www.linkedin.com/in/max-mustermann"
              disabled={loading}
              style={{flex:1,padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}
            />
            <button
              onClick={extract}
              disabled={loading || !url.trim()}
              style={{padding:'8px 18px',background:P,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:loading||!url.trim()?'not-allowed':'pointer',opacity:loading||!url.trim()?.5:1,whiteSpace:'nowrap'}}
            >
              {loading ? '⏳ Lädt…' : 'Profil importieren'}
            </button>
          </div>
          <div style={{ fontSize:11, color:'#888', marginTop:6 }}>
            Wir öffnen das Profil im Hintergrund über die Leadesk Chrome-Extension und lesen Headline, About, aktuelle Position, Branche und Standort. Bitte einmal in LinkedIn eingeloggt sein, bevor du importierst.
          </div>
        </>
      )}
      {error && <div style={{color:'#e53e3e',fontSize:12,marginTop:6}}>{error}</div>}
      {success && <div style={{color:'#16a34a',fontSize:12,marginTop:6}}>{success}</div>}
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
  const [importTab, setImportTab] = useState('file')

  useEffect(() => { load() }, [session])
  useEffect(() => { if (edit) setImportTab(edit.source_url ? 'url' : 'file') }, [edit?.id])

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

  if (view === 'list') {
    if (loading) return <div style={{textAlign:'center',color:'var(--text-muted)',padding:60}}>Laden…</div>

    // Empty-State: Hero
    if (items.length === 0) return (
      <div style={{ maxWidth:900, margin:'0 auto', padding:'12px 16px' }}>
        <EmptyHero
          eyebrow="Schritt 3 · Branding"
          title="Gib der KI deine Quellen"
          subtitle="Lade Unternehmensdokumente, Case Studies, Branchen-Insights oder LinkedIn-Profile hoch. Die KI nutzt das Wissen als Faktenbasis für jeden generierten Text — keine erfundenen Zahlen mehr."
          primaryLabel="📚 Wissen hinzufügen"
          onPrimary={()=>{setEdit({...E0,user_id:session.user.id});setView('editor')}}
          helperText="PDF, Excel, CSV, Bilder, Web-URLs oder LinkedIn-Profile — alles wird automatisch analysiert."
        />
      </div>
    )

    // List-View mit Inhalten
    return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'24px 16px 40px' }}>
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:13, color:P, fontFamily:'Georgia, "Times New Roman", serif', fontStyle:'italic', marginBottom:6 }}>Branding · Schritt 3 von 3</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Wissensbasis.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>Faktenmaterial für die KI — Dokumente, URLs, LinkedIn-Profile. Fließt automatisch in alle generierten Inhalte ein.</p>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' }}>
        <button onClick={()=>{setEdit({...E0,user_id:session.user.id});setView('editor')}} style={{padding:'10px 20px',background:P,color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',boxShadow:'0 2px 8px rgba(49,90,231,.18)'}}>+ Wissen hinzufügen</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Suchen..." style={{padding:'8px 14px',border:'1.5px solid var(--border)',borderRadius:10,fontSize:13,width:220}}/>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
        <button onClick={()=>setFilter('alle')} style={{padding:'5px 12px',borderRadius:20,border:filter==='alle'?`1.5px solid ${P}`:'1.5px solid #dde3ea',background:filter==='alle'?P:'#fff',color:filter==='alle'?'#fff':'#666',fontSize:12,cursor:'pointer',fontWeight:filter==='alle'?600:400}}>Alle ({items.length})</button>
        {CATEGORIES.map(c => { const cnt=counts[c.v]||0; if(cnt===0&&filter!==c.v) return null; return <button key={c.v} onClick={()=>setFilter(c.v)} style={{padding:'5px 12px',borderRadius:20,border:filter===c.v?`1.5px solid ${P}`:'1.5px solid #dde3ea',background:filter===c.v?P:'#fff',color:filter===c.v?'#fff':'#666',fontSize:12,cursor:'pointer',fontWeight:filter===c.v?600:400}}>{c.icon} {c.l} ({cnt})</button> })}
      </div>
      {filtered.length === 0 ? (
        <div style={{textAlign:'center',color:'#888',padding:40}}>{items.length===0?'Noch kein Wissen hinterlegt. Füge dein erstes Kontextdokument hinzu!':'Keine Einträge für diesen Filter.'}</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(v => { const cat=catInfo(v.category); return (
            <div key={v.id} style={{background:'var(--surface)',borderRadius:10,border:'1.5px solid #e8ecf0',padding:'12px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={()=>{setEdit(v);setView('editor')}}>
              <div style={{fontSize:20,width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8f9fa',borderRadius:8}}>{cat.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontWeight:600,fontSize:14}}>{v.name}</span>
                  {v.file_name && <span style={{fontSize:10,background:'#e0f2fe',color:'#0369a1',padding:'1px 6px',borderRadius:4}}>📎 {v.file_type==='pdf'?'PDF':v.file_type==='image'?'Bild':'Tabelle'}</span>}
                  {v.source_url && <span style={{fontSize:10,background:'#ede9fe',color:'#6d28d9',padding:'1px 6px',borderRadius:4}}>🔗 URL</span>}
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
  }

  if (!edit) return null
  return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'24px 16px 0' }}>
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}>
        <button onClick={()=>{setView('list');setEdit(null)}} style={{background:'transparent', border:'1.5px solid var(--border)', borderRadius:10, width:36, height:36, fontSize:16, cursor:'pointer', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center'}}>←</button>
        <div style={{flex:1}}>
          <div style={{ fontSize:13, color:P, fontFamily:'Georgia, "Times New Roman", serif', fontStyle:'italic', marginBottom:2 }}>Branding · Schritt 3 von 3</div>
          <div style={{ fontSize:22, fontWeight:700, letterSpacing:'-.2px', lineHeight:1.2 }}>{edit.id?'Wissen bearbeiten':'Neues Wissen hinzufügen'}</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Faktenmaterial für die KI — Dokument, URL oder LinkedIn-Profil</div>
        </div>
      </div>
      <SectionCard icon="📥" color="brand" title="Kontext importieren" subtitle="Datei, URL oder LinkedIn-Profil — die KI extrahiert den Text automatisch">
        <div style={{display:'flex',gap:4,borderBottom:'1.5px solid #e8ecf0',marginBottom:4}}>
          {[{v:'file',l:'📎 Datei hochladen'},{v:'url',l:'🔗 Von URL importieren'},{v:'linkedin',l:'💼 LinkedIn-Profil'}].map(t => (
            <button key={t.v} onClick={()=>setImportTab(t.v)} style={{padding:'8px 14px',background:'none',border:'none',borderBottom:importTab===t.v?`2px solid ${P}`:'2px solid transparent',marginBottom:-1.5,color:importTab===t.v?P:'#888',cursor:'pointer',fontSize:12,fontWeight:importTab===t.v?700:500}}>{t.l}</button>
          ))}
        </div>
        {importTab === 'file' && (<>
          <Lb l="Datei-Upload" h="PDF, Excel, CSV oder Bild hochladen — Text wird automatisch extrahiert"/>
          <FileUpload session={session} edit={edit} onUpdate={uMulti} onExtractedText={text => u('content', (edit.content ? edit.content+'\n\n---\n\n' : '')+text)}/>
        </>)}
        {importTab === 'url' && (<>
          <Lb l="URL-Import" h="z.B. Über-uns-Seite oder Landing-Page — Haupttext wird serverseitig extrahiert"/>
          <UrlImport edit={edit} onUpdate={uMulti} onExtractedText={text => u('content', (edit.content ? edit.content+'\n\n---\n\n' : '')+text)}/>
        </>)}
        {importTab === 'linkedin' && (<>
          <Lb l="LinkedIn-Profil" h="Über die Leadesk Chrome-Extension — Headline, About und Position eines LinkedIn-Profils als Kontext"/>
          <LinkedInImport edit={edit} onUpdate={uMulti} onExtractedText={text => u('content', (edit.content ? edit.content+'\n\n---\n\n' : '')+text)}/>
        </>)}
      </SectionCard>
      <SectionCard icon="📋" color="blue" title="Grundlagen" subtitle="Name und Beschreibung des Wissens-Eintrags">
        <Lb l="Name" h="Kurzer, beschreibender Titel"/>
        <In v={edit.name} fn={v=>u('name',v)} ph="z.B. Unternehmensprofil entrenous GmbH"/>
        <Lb l="Beschreibung (optional)"/>
        <In v={edit.description} fn={v=>u('description',v)} ph="Kurze Beschreibung des Inhalts"/>
      </SectionCard>
      <SectionCard icon="🏷️" color="purple" title="Kategorie" subtitle="In welche Wissens-Kategorie gehört dieser Eintrag">
        <Lb l="Art des Wissens"/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:8}}>
          {CATEGORIES.map(c => <button key={c.v} onClick={()=>u('category',c.v)} style={{padding:'10px 12px',borderRadius:8,border:edit.category===c.v?`2px solid ${P}`:'1.5px solid #dde3ea',background:edit.category===c.v?'rgba(49,90,231,0.06)':'#fff',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:18}}>{c.icon}</span><div><div style={{fontWeight:600,fontSize:12}}>{c.l}</div><div style={{fontSize:10,color:'#888'}}>{c.d}</div></div>
          </button>)}
        </div>
      </SectionCard>
      <SectionCard icon="📄" color="amber" title="Inhalt" subtitle="Der eigentliche Wissens-Text, der in die KI fließt">
        <Lb l="Wissens-Inhalt" h="Manuell eingeben oder aus hochgeladener Datei extrahiert"/>
        <Tx v={edit.content} fn={v=>u('content',v)} r={14} ph="Wissen eingeben oder Dokument oben hochladen..."/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#aaa'}}>
          <span>{(edit.content||'').length.toLocaleString()} / 20.000 Zeichen</span>
          {(edit.content||'').length > 20000 && <span style={{color:'#e53e3e'}}>⚠️ Max überschritten</span>}
        </div>
      </SectionCard>
      <div style={{ position:'sticky', bottom:0, background:'var(--surface, #fff)', borderTop:'1.5px solid var(--border, #E5E7EB)', padding:'14px 0', marginTop:24, display:'flex', gap:10, justifyContent:'space-between', alignItems:'center', boxShadow:'0 -4px 14px rgba(15,23,42,.05)', zIndex:5 }}>
        <button onClick={()=>{setView('list');setEdit(null)}} style={{ padding:'11px 20px', background:'transparent', border:'1.5px solid var(--border, #E5E7EB)', borderRadius:10, fontSize:13.5, cursor:'pointer', color:'var(--text-muted)', fontFamily:'inherit', fontWeight:500 }}>Abbrechen</button>
        <button onClick={save} disabled={!edit.name?.trim()} style={{ padding:'12px 26px', background:edit.name?.trim()?P:'#94A3B8', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:edit.name?.trim()?'pointer':'not-allowed', boxShadow:edit.name?.trim()?'0 2px 10px rgba(49,90,231,.25)':'none', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit', opacity:edit.name?.trim()?1:.8 }}>
          <span>💾</span><span>Speichern</span>
        </button>
      </div>
    </div>
  )
}

