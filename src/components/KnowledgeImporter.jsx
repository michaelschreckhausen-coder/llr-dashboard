import React, { useState, useRef, useEffect } from 'react'
import { scrapeLinkedInProfile, formatLinkedInProfileAsText, detectLeadeskExtension } from '../lib/leadeskExtension'
import { supabase } from '../lib/supabase'

// Shared Kontext-Importer für Wissensdatenbank, Brand Voice, Zielgruppen.
// Unterstützt 2 oder 3 Import-Arten:
//   📎 Datei hochladen (PDF, Excel, CSV, Bilder → clientseitige Textextraktion)
//   🔗 Web-URL (serverseitig via extract-url Edge Function)
//   💼 LinkedIn-Profil (optional, technisch auch extract-url, mit Hinweis)
//
// Props:
//   session             — aktuelle Supabase Session (für user_id + Storage-Pfad)
//   storagePrefix       — z.B. "brand-voice", "audience", "knowledge" — wird vor
//                         user-id im Storage-Pfad verwendet
//   showLinkedIn        — boolean, default false — zeigt LinkedIn-Profil-Tab
//   current             — { file_name, file_url, file_type, source_url,
//                          linkedin_template_url } — aktueller Zustand
//   onContentExtracted  — (text, meta) => void — wird aufgerufen, wenn Text
//                         extrahiert wurde. meta = { source, title, description }
//   onMetaChange        — (updates) => void — wird aufgerufen mit Feld-Updates
//                         (file_*, source_url, linkedin_template_url)
//   disabled            — boolean, ganze Komponente deaktivieren

const P = 'var(--wl-primary, rgb(49,90,231))'

const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
}

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

function FileTab({ session, storagePrefix, current, onMetaChange, onContentExtracted, disabled }) {
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
      const path = `${storagePrefix || 'knowledge'}/${session.user.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('knowledge-files').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('knowledge-files').getPublicUrl(path)
      onMetaChange({
        file_url: urlData?.publicUrl || path,
        file_type: fileType,
        file_name: file.name,
        source_url: '',
      })
      setUploading(false); setExtracting(true)
      let text = ''
      if (fileType === 'pdf') text = await extractPdfText(file)
      else if (['xlsx','xls','csv'].includes(fileType)) text = await extractExcelText(file)
      else if (fileType === 'image') text = `[Bild: ${file.name}]\nBeschreibe den Inhalt hier manuell.`
      if (text) onContentExtracted(text, { source: 'file', title: file.name })
    } catch (err) { setError(err.message || 'Upload fehlgeschlagen') }
    finally { setUploading(false); setExtracting(false) }
  }

  const hasFile = current?.file_name && current?.file_url
  if (hasFile) return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--success-soft)', borderRadius:8, border:'1px solid rgba(34,197,94,0.30)' }}>
      <span style={{ fontSize:20 }}>{current.file_type==='pdf'?'📄':current.file_type==='image'?'🖼️':'📊'}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{current.file_name}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{current.file_type==='pdf'?'PDF':current.file_type==='image'?'Bild':'Tabelle'} — Text extrahiert</div>
      </div>
      <button onClick={()=>onMetaChange({file_url:'',file_type:'',file_name:''})} disabled={disabled} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-soft)',fontSize:14}}>×</button>
    </div>
  )

  return (
    <div>
      <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
        onClick={()=>!disabled&&fileRef.current?.click()}
        style={{ border:dragging?`2px dashed ${P}`:'2px dashed var(--border)', borderRadius:10, padding:'24px 16px', textAlign:'center', cursor:disabled?'not-allowed':'pointer', background:dragging?'var(--primary-soft)':'var(--surface-muted)', transition:'all .2s', opacity:disabled?.5:1 }}>
        <input ref={fileRef} type="file" onChange={e=>{const f=e.target.files[0];if(f)handleFile(f)}} style={{display:'none'}} accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"/>
        {uploading ? <div style={{color:P,fontWeight:600}}>⏳ Wird hochgeladen...</div>
         : extracting ? <div style={{color:'#7C3AED',fontWeight:600}}>🔍 Text wird extrahiert...</div>
         : <><div style={{fontSize:28,marginBottom:6}}>📎</div><div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>Datei hierher ziehen oder klicken</div><div style={{fontSize:11,color:'var(--text-soft)',marginTop:4}}>PDF, Excel, CSV, Bilder (max. 10 MB)</div></>}
      </div>
      {error && <div style={{color:'var(--danger)',fontSize:12,marginTop:6}}>{error}</div>}
    </div>
  )
}

function UrlTab({ current, onMetaChange, onContentExtracted, disabled, isLinkedIn }) {
  const initialUrl = isLinkedIn ? (current?.linkedin_template_url || '') : (current?.source_url || '')
  const [url, setUrl] = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const init = isLinkedIn ? (current?.linkedin_template_url || '') : (current?.source_url || '')
    setUrl(init)
  }, [isLinkedIn, current?.source_url, current?.linkedin_template_url])

  async function extract() {
    const trimmed = (url || '').trim()
    if (!trimmed) { setError(isLinkedIn ? 'Bitte LinkedIn-Profil-URL eingeben' : 'Bitte eine URL eingeben'); return }
    if (isLinkedIn && !/linkedin\.com\/in\//i.test(trimmed)) {
      setError('Bitte eine LinkedIn-Profil-URL (linkedin.com/in/...) eingeben')
      return
    }
    setError(''); setSuccess(''); setLoading(true)
    try {
      // LinkedIn → ueber die Chrome-Extension scrapen (Server-Side blockt LinkedIn-Profile).
      if (isLinkedIn) {
        const resp = await scrapeLinkedInProfile(trimmed)
        if (resp?.error) throw new Error(resp.error)
        const profile = resp?.profile
        if (!profile || !profile.name) {
          throw new Error('LinkedIn-Profil konnte nicht extrahiert werden. Bitte einmal in LinkedIn einloggen und nochmal versuchen.')
        }
        const text = formatLinkedInProfileAsText(profile)
        onMetaChange({ linkedin_template_url: resp.sourceUrl || trimmed })
        onContentExtracted(text, {
          source: 'linkedin',
          title: profile.name + (profile.headline ? ' — ' + profile.headline : ''),
          description: profile.headline || '',
          sourceUrl: resp.sourceUrl || trimmed,
          profile,
        })
        setSuccess(`✓ Profil importiert (${text.length.toLocaleString()} Zeichen)`)
        return
      }

      // Andere URLs → bestehende Edge Function nutzen
      const { data, error: fnErr } = await supabase.functions.invoke('extract-url', { body: { url: trimmed } })
      if (fnErr) throw new Error(fnErr.message || 'Extraktion fehlgeschlagen')
      if (data?.error) throw new Error(data.error)
      if (!data?.text || data.text.length < 20) throw new Error('Es konnte kein verwertbarer Text extrahiert werden')

      onMetaChange({
        source_url: data.sourceUrl || trimmed,
        file_url: '', file_type: '', file_name: ''
      })
      onContentExtracted(data.text, { source: 'url', title: data.title, description: data.description, sourceUrl: data.sourceUrl })
      setSuccess(`✓ ${data.textLength.toLocaleString()} Zeichen extrahiert${data.truncated ? ' (gekürzt)' : ''}`)
    } catch (err) {
      setError(err.message || 'Extraktion fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setUrl(''); setError(''); setSuccess('')
    onMetaChange(isLinkedIn ? { linkedin_template_url: '' } : { source_url: '' })
  }

  const storedValue = isLinkedIn ? current?.linkedin_template_url : current?.source_url
  const hasImported = storedValue && !loading

  if (hasImported) return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--success-soft)', borderRadius:8, border:'1px solid rgba(34,197,94,0.30)' }}>
      <span style={{ fontSize:20 }}>{isLinkedIn ? '💼' : '🔗'}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text-primary)' }}>{storedValue}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{isLinkedIn ? 'LinkedIn-Profil' : 'URL'} — Text extrahiert</div>
      </div>
      <button onClick={clear} disabled={disabled} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-soft)',fontSize:14}}>×</button>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', gap:8 }}>
        <input
          value={url}
          onChange={e=>setUrl(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter' && !loading){ e.preventDefault(); extract() } }}
          placeholder={isLinkedIn ? 'https://www.linkedin.com/in/max-mustermann' : 'https://beispiel.de/ueber-uns'}
          disabled={loading || disabled}
          style={{flex:1,padding:'8px 11px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box',background:'var(--surface)',color:'var(--text-primary)'}}
        />
        <button
          onClick={extract}
          disabled={loading || disabled || !url.trim()}
          style={{padding:'8px 18px',background:P,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:(loading||disabled||!url.trim())?'not-allowed':'pointer',opacity:(loading||disabled||!url.trim())?.5:1,whiteSpace:'nowrap'}}
        >
          {loading ? '⏳ Lädt…' : 'Extrahieren'}
        </button>
      </div>
      <div style={{ fontSize:11, color:'var(--text-soft)', marginTop:6 }}>
        {isLinkedIn
          ? 'Das LinkedIn-Profil wird über die Leadesk Chrome-Extension geladen — bitte einmal in LinkedIn einloggen, bevor du importierst. Wir holen Headline, About, aktuelle Position, Branche und Standort. Ohne installierte Extension funktioniert dieser Tab nicht.'
          : 'Die Seite wird serverseitig abgerufen und der Haupttext extrahiert (max. 50.000 Zeichen). Titel und Beschreibung werden ggf. automatisch übernommen.'
        }
      </div>
      {error && <div style={{color:'var(--danger)',fontSize:12,marginTop:6}}>{error}</div>}
      {success && <div style={{color:'var(--success)',fontSize:12,marginTop:6}}>{success}</div>}
    </div>
  )
}

export default function KnowledgeImporter({ session, storagePrefix, showLinkedIn=false, current, onMetaChange, onContentExtracted, disabled }) {
  const initialTab = current?.source_url ? 'url'
    : current?.linkedin_template_url ? 'linkedin'
    : 'file'
  const [tab, setTab] = useState(initialTab)

  useEffect(() => {
    if (current?.source_url) setTab('url')
    else if (current?.linkedin_template_url) setTab('linkedin')
    else setTab('file')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  const tabs = [
    { v:'file', l:'📎 Datei hochladen' },
    { v:'url', l:'🔗 Von URL importieren' },
    ...(showLinkedIn ? [{ v:'linkedin', l:'💼 LinkedIn-Profil' }] : []),
  ]

  // Premium-Tab-Bar (Pills) plus fixe min-height fuer konsistente Card-Groesse
  // beim Tab-Wechsel (Datei/URL/LinkedIn).
  return (
    <div>
      <div style={{
        display:'flex',
        gap:5,
        padding:5,
        background:'var(--surface-muted, #F4F5F8)',
        border:'1px solid var(--border, #E5E7EB)',
        borderRadius:12,
        marginBottom:16,
        flexWrap:'wrap',
      }}>
        {tabs.map(t => {
          const isActive = tab===t.v
          return (
            <button key={t.v} onClick={()=>setTab(t.v)} disabled={disabled} style={{
              flex:1,
              minWidth:120,
              padding:'9px 14px',
              background: isActive ? 'var(--surface, #fff)' : 'transparent',
              border:'none',
              borderRadius:9,
              color: isActive ? P : 'var(--text-muted)',
              cursor:disabled?'not-allowed':'pointer',
              fontSize:12.5,
              fontWeight: isActive ? 700 : 500,
              fontFamily:'inherit',
              boxShadow: isActive ? '0 2px 6px rgba(15,23,42,.06)' : 'none',
              transition:'all .15s',
            }}>{t.l}</button>
          )
        })}
      </div>
      <div style={{ minHeight: 360 }}>
        {tab === 'file' && <FileTab session={session} storagePrefix={storagePrefix} current={current} onMetaChange={onMetaChange} onContentExtracted={onContentExtracted} disabled={disabled} />}
        {tab === 'url' && <UrlTab current={current} onMetaChange={onMetaChange} onContentExtracted={onContentExtracted} disabled={disabled} isLinkedIn={false} />}
        {tab === 'linkedin' && <UrlTab current={current} onMetaChange={onMetaChange} onContentExtracted={onContentExtracted} disabled={disabled} isLinkedIn={true} />}
      </div>
    </div>
  )
}
