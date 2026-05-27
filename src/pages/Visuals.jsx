// src/pages/Visuals.jsx
// Content-Visuals-Werkstatt — Gemini 2.5 Flash Image ("Nano Banana") Integration.
// Generator (oben) + Library-Grid (unten).
//
// Brand-Visual-DNA wird automatisch aus der aktiven Brand Voice gezogen.

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

const ASPECT_RATIOS = [
  { id: '1:1',    label: '⬜ Feed',          desc: 'Quadratisch — Standard LinkedIn-Feed', dim: 1024, w: 80, h: 80 },
  { id: '4:5',    label: '📱 Mobile-Hoch',   desc: 'Portrait — auf Handy dominant',         dim: 1024, w: 64, h: 80 },
  { id: '1.91:1', label: '🖼️ Link-Vorschau', desc: 'Quer — fuer Link-Posts',                dim: 1024, w: 96, h: 50 },
  { id: '4:1',    label: '📰 Banner',         desc: 'Breit — fuer Profil oder Newsletter',  dim: 1024, w: 120, h: 30 },
]

const P = 'var(--wl-primary, rgb(49,90,231))'


// Phase 2e — LinkedIn-Visual-Templates
const VISUAL_TEMPLATES = [
  {
    id: 'quote',
    label: '📜 Zitat-Karte',
    desc: 'Statement im Brand-Stil',
    aspectRatio: '1:1',
    fields: [
      { name: 'quote', label: 'Zitat', type: 'textarea', placeholder: 'Das Statement / der Satz, der im Bild steht...', required: true },
      { name: 'author', label: 'Author', placeholder: 'Optional — wer hat es gesagt' },
    ],
    buildPrompt: (f, bv) => 'Erstelle eine elegante Zitat-Karte für LinkedIn. Im Bild groß und gut lesbar: "' + (f.quote || '') + '"' + (f.author ? '\nAttribution: ' + f.author : '') + '. Visueller Stil: ' + (bv?.visual_style_description || 'professionell, modern, klare Typografie') + '. Format: hochwertige Typografie, brand-passend, minimal aber wirkungsvoll. KEIN Logo oder zusätzliche Elemente — nur Text und Hintergrund.',
  },
  {
    id: 'stats',
    label: '📊 Stats-Visualisierung',
    desc: 'Eine Zahl mit Kontext',
    aspectRatio: '1:1',
    fields: [
      { name: 'number', label: 'Die Hauptzahl', placeholder: 'z.B. 87%, 3,2x, €1.4M', required: true },
      { name: 'context', label: 'Kontext (kurz)', type: 'textarea', placeholder: 'Was zeigt diese Zahl? z.B. "der B2B-Käufer recherchieren online vor dem ersten Sales-Call"', required: true },
    ],
    buildPrompt: (f, bv) => 'Erstelle eine Stats-Visualization für LinkedIn. Sehr großes prominentes Element: "' + (f.number || '') + '". Darunter klein und ergänzend: "' + (f.context || '') + '". Visueller Stil: ' + (bv?.visual_style_description || 'datenfokussiert, professionell, modern') + '. Format: starke Hierarchie, Zahl dominiert, klar lesbar.',
  },
  {
    id: 'carousel_hero',
    label: '🎯 Carousel-Hero',
    desc: 'Erste Slide eines Carousels',
    aspectRatio: '4:5',
    fields: [
      { name: 'title', label: 'Titel', placeholder: 'z.B. "5 Tipps für besseres LinkedIn-Marketing"', required: true },
      { name: 'hook', label: 'Hook / Untertitel', type: 'textarea', placeholder: 'Optional — Der Spannungsaufbau zum Weiter-Swipen' },
    ],
    buildPrompt: (f, bv) => 'Erstelle eine LinkedIn-Carousel-Hero-Slide (erste Slide). Sehr großer auffälliger Titel: "' + (f.title || '') + '"' + (f.hook ? '\nUntertitel kleiner: "' + f.hook + '"' : '') + '. Visueller Stil: ' + (bv?.visual_style_description || 'modern, professionell, neugierig machend') + '. Format: starker visueller Hook der zum Weiter-Swipen einlädt, klare Hierarchie, mobile-optimiert.',
  },
  {
    id: 'personal_brand',
    label: '👤 Personal-Brand-Portrait',
    desc: 'Du in einer Szene (nutzt Hero-Image)',
    aspectRatio: '1:1',
    requiresBVHero: true,
    fields: [
      { name: 'scene', label: 'Szenerie', type: 'textarea', placeholder: 'z.B. "auf einer Konferenz-Bühne präsentierend"', required: true },
      { name: 'mood', label: 'Stimmung', placeholder: 'z.B. selbstbewusst, professionell, dynamisch' },
    ],
    buildPrompt: (f, bv) => 'Erstelle ein Personal-Branding-Portrait. Die Person aus den Reference-Bildern wird abgebildet. Szenerie: ' + (f.scene || '') + '. Stimmung: ' + (f.mood || 'selbstbewusst, professionell') + '. Format: photorealistisch, hochwertig, LinkedIn-ready, Kopf+Schultern oder Halbtotale.',
  },
  {
    id: 'event',
    label: '📅 Event-Announcement',
    desc: 'Webinar, Veranstaltung, Launch',
    aspectRatio: '1:1',
    fields: [
      { name: 'event_title', label: 'Event-Titel', placeholder: 'z.B. "Live-Webinar: KI im B2B-Vertrieb"', required: true },
      { name: 'date_time', label: 'Datum + Uhrzeit', placeholder: 'z.B. "Do, 5. Juni · 18:00"', required: true },
      { name: 'context', label: 'Kurzbeschreibung', type: 'textarea', placeholder: 'Worum geht es?' },
    ],
    buildPrompt: (f, bv) => 'Erstelle ein Event-Announcement-Bild für LinkedIn. Event-Titel groß: "' + (f.event_title || '') + '". Datum/Zeit prominent: "' + (f.date_time || '') + '"' + (f.context ? '. Kontext: ' + f.context : '') + '. Visueller Stil: ' + (bv?.visual_style_description || 'einladend, professionell, klar') + '. Format: Eyecatcher, sofortige Erkennbarkeit dass es ein Event ist.',
  },
  {
    id: 'before_after',
    label: '🔀 Before / After',
    desc: 'Vergleich vorher / nachher',
    aspectRatio: '1:1',
    fields: [
      { name: 'before', label: 'Vorher / Problem', type: 'textarea', placeholder: 'z.B. "Cold-Outreach: 2% Response-Rate"', required: true },
      { name: 'after', label: 'Nachher / Lösung', type: 'textarea', placeholder: 'z.B. "Mit Brand-Voice-Personalisierung: 18%"', required: true },
    ],
    buildPrompt: (f, bv) => 'Erstelle ein Before/After-Vergleichsbild für LinkedIn. Format Split-Screen oder klare Gegenüberstellung. Links/Oben (Vorher): "' + (f.before || '') + '". Rechts/Unten (Nachher): "' + (f.after || '') + '". Visueller Stil: ' + (bv?.visual_style_description || 'klarer Kontrast, professionell') + '. Format: dramatischer Vergleich, sofort verständlich.',
  },
]

export default function Visuals({ session }) {
  const { activeTeamId } = useTeam()

  // Generator-State
  const [prompt, setPrompt]           = useState('')
  const [aspectRatio, setAspect]      = useState('1:1')
  const [variants, setVariants]       = useState(2)
  const [referenceFiles, setReferenceFiles] = useState([]) // [{file, previewUrl, path}]
  const [uploadingRef, setUploadingRef] = useState(false)
  // Phase 2c — Edit-Modal
  const [editModal, setEditModal] = useState(null) // null oder Visual-Object
  const [editPrompt, setEditPrompt] = useState('')
  const [editing, setEditing] = useState(false)
  // Phase 2d — Aspect-Ratio im Edit
  const [editAspect, setEditAspect] = useState('1:1')
  // Phase 2f — Library-Search + Filter
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryShowAllBVs, setLibraryShowAllBVs] = useState(false)
  const [libraryFavOnly, setLibraryFavOnly] = useState(false)
  // Phase 2e — Template-Picker
  const [templatePicker, setTemplatePicker] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [templateFields, setTemplateFields] = useState({})
  const [model, setModel]             = useState('gpt-image-1-mini') // Default: günstigster Provider
  const [generating, setGenerating]   = useState(false)
  const [error, setError]             = useState('')
  const [results, setResults]         = useState([])  // last generation

  // Library-State
  const [library, setLibrary]         = useState([])
  const [libLoading, setLibLoading]   = useState(true)
  const [lightbox, setLightbox]       = useState(null)

  // Brand Voices aus globalem Context
  const { activeBrandVoice } = useBrandVoice()


  // Reference-Image-Upload: Datei → Storage → Path
  async function uploadReference(file) {
    if (!file) return null
    if (!activeTeamId) { alert('Kein Team aktiv'); return null }
    if (file.size > 20 * 1024 * 1024) { alert('Datei zu groß (max 20 MB)'); return null }
    setUploadingRef(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const safeExt = ['png','jpg','jpeg','webp'].includes(ext) ? ext : 'png'
      const path = `${activeTeamId}/references/${crypto.randomUUID()}.${safeExt}`
      const { error: upErr } = await supabase.storage.from('visuals').upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { alert('Upload fehlgeschlagen: ' + upErr.message); return null }
      const previewUrl = URL.createObjectURL(file)
      return { file, previewUrl, path }
    } finally {
      setUploadingRef(false)
    }
  }

  async function addReferenceFiles(files) {
    const arr = Array.from(files || [])
    const remaining = 14 - referenceFiles.length
    if (remaining <= 0) { alert('Max 14 Referenzbilder'); return }
    const toUpload = arr.slice(0, remaining)
    const uploaded = []
    for (const f of toUpload) {
      const r = await uploadReference(f)
      if (r) uploaded.push(r)
    }
    setReferenceFiles(prev => [...prev, ...uploaded])
  }

  function removeReference(idx) {
    setReferenceFiles(prev => prev.filter((_, i) => i !== idx))
  }


  // Phase 2e — Template anwenden: generiert Prompt + füllt UI + startet generate
  function applyTemplate() {
    if (!activeTemplate) return
    const tpl = VISUAL_TEMPLATES.find(t => t.id === activeTemplate)
    if (!tpl) return
    // Required-Felder prüfen
    const missing = tpl.fields.filter(f => f.required && !templateFields[f.name]?.trim())
    if (missing.length) { alert('Bitte ausfüllen: ' + missing.map(f => f.label).join(', ')); return }
    const resolvedPrompt = tpl.buildPrompt(templateFields, activeBrandVoice)
    setPrompt(resolvedPrompt)
    setAspect(tpl.aspectRatio)
    setTemplatePicker(false)
    setActiveTemplate(null)
    setTemplateFields({})
    // Kleiner Delay damit State commits → dann generate auslösen
    setTimeout(() => {
      // generate() ist defined in scope — direct call
      generate()
    }, 50)
  }

  // Library laden — mit BV-Filter, Search, Favoriten-Filter
  async function loadLibrary() {
    setLibLoading(true)
    let q = supabase.from('visuals')
      .select('*')
      .eq('is_archived', false)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
    // BV-Filter (außer wenn User explizit "alle BVs" aktiviert hat)
    if (activeBrandVoice?.id && !libraryShowAllBVs) q = q.eq('brand_voice_id', activeBrandVoice.id)
    // Favoriten-Filter
    if (libraryFavOnly) q = q.eq('is_favorite', true)
    // Prompt-Search
    if (librarySearch.trim()) q = q.ilike('prompt', '%' + librarySearch.trim() + '%')
    const { data } = await q
    // Signed-URLs in einem Rutsch
    const withUrls = await Promise.all((data || []).map(async (v) => {
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl || null }
    }))
    setLibrary(withUrls)
    setLibLoading(false)
  }
  useEffect(() => { if (activeTeamId) loadLibrary() }, [activeTeamId, activeBrandVoice?.id, libraryShowAllBVs, libraryFavOnly, librarySearch])

  async function generate() {
    if (!prompt.trim()) { setError('Bitte einen Prompt eingeben.'); return }
    setError(''); setGenerating(true); setResults([])
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: prompt.trim(),
          aspectRatio,
          variants,
          brandVoiceId: activeBrandVoice?.id || null,
          model,
          referenceImagePaths: referenceFiles.map(r => r.path),
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setResults(data?.visuals || [])
      // Reference-Files nach erfolgreichem Generate leeren (transient)
      setReferenceFiles([])
      // Library im Hintergrund neu laden
      loadLibrary()
    } catch (e) {
      setError('Fehler: ' + (e.message || 'Generierung fehlgeschlagen'))
    } finally {
      setGenerating(false)
    }
  }


  // Phase 2c — Bestehendes Bild editieren
  async function editVisual() {
    if (!editModal) return
    if (!editPrompt.trim() && editAspect === editModal.aspect_ratio) return  // nichts zu tun
    setEditing(true)
    try {
      // Phase 2d — wenn Aspect-Ratio sich ändert, Outpaint-Hint in Prompt einfügen
      const isOutpaint = editAspect !== editModal.aspect_ratio
      const effectivePrompt = isOutpaint
        ? `Erweitere das Referenzbild auf das neue Aspect-Ratio ${editAspect}. Fülle die neuen Bildbereiche stilistisch konsistent zum Original. ${editPrompt.trim()}`
        : editPrompt.trim()
      const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: effectivePrompt,
          aspectRatio: editAspect,
          variants: 1,
          brandVoiceId: activeBrandVoice?.id || null,
          model: 'gemini-2.5-flash-image',  // Only Nano Banana supports image edits
          referenceImagePaths: [editModal.storage_path],
          parentVisualId: editModal.id,
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      // Library neu laden, Modal schließen
      loadLibrary()
      setEditModal(null)
      setEditPrompt('')
    } catch (e) {
      alert('Edit fehlgeschlagen: ' + (e.message || 'Unbekannt'))
    } finally {
      setEditing(false)
    }
  }

  function downloadImage(url, filename = 'visual.png') {
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
  }


  // Phase 2f — Favoriten-Toggle
  async function toggleFavorite(visualId, currentValue) {
    await supabase.from('visuals').update({ is_favorite: !currentValue }).eq('id', visualId)
    setLibrary(prev => prev.map(v => v.id === visualId ? { ...v, is_favorite: !currentValue } : v))
  }

  async function archiveVisual(id) {
    await supabase.from('visuals').update({ is_archived: true }).eq('id', id)
    setLibrary(prev => prev.filter(v => v.id !== id))
  }

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Style-Header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Visuals</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Bilder.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
          KI-Bilder im Markenstil — automatisch passend zu Brand Voice und LinkedIn-Format.
        </p>
      </div>

      {/* Generator-Card */}
      <section style={{
        background:'var(--surface,#fff)', borderRadius:14, border:'1px solid var(--border,#E5E7EB)',
        padding:'18px 20px', marginBottom:24, boxShadow:'0 1px 3px rgba(15,23,42,.04)'
      }}>
        <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 14px' }}>
          🪄 Neues Bild generieren
        </h3>

        {/* Phase 2e — Template-Button */}
        <div style={{ marginBottom:10, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={() => setTemplatePicker(true)}
            style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', cursor:'pointer', fontSize:13, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6 }}>
            📋 Aus Template starten
          </button>
        </div>

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="z.B. Frau am Schreibtisch, denkt nach, warmes Licht von links, moderner Büro-Hintergrund"
          rows={3}
          style={{
            width:'100%', padding:'12px 14px', borderRadius:10,
            border:'1.5px solid var(--border,#E5E7EB)', fontSize:14,
            resize:'vertical', outline:'none', boxSizing:'border-box',
            fontFamily:'inherit', marginBottom:14,
          }}
        />

        {/* Reference-Images (Phase 2a) */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>
            Referenzbilder (optional, max 14)
          </label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {referenceFiles.map((r, i) => (
              <div key={i} style={{ position:'relative', width:70, height:70 }}>
                <img src={r.previewUrl} alt="ref" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }}/>
                <button type="button" onClick={() => removeReference(i)}
                  style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', border:'none', background:'#ef4444', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', lineHeight:1 }}>✕</button>
              </div>
            ))}
            {referenceFiles.length < 14 && (
              <label style={{ width:70, height:70, borderRadius:8, border:'1.5px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor: uploadingRef ? 'wait' : 'pointer', flexDirection:'column', gap:2, fontSize:11, color:'var(--text-muted)', background:'#FAFAFA' }}>
                {uploadingRef ? '⏳' : '＋'}
                <span style={{ fontSize:9 }}>{uploadingRef ? 'Lade…' : 'Upload'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => addReferenceFiles(e.target.files)} style={{ display:'none' }}/>
              </label>
            )}
          </div>
          {activeBrandVoice && (
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:6 }}>
              💡 Brand-Voice-Hero-Images werden automatisch als Referenz mitgesendet. Hier zusätzliche temporäre Referenzen.
            </div>
          )}
        </div>

        {/* Variants nur — BV kommt aus Topbar */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Varianten</label>
          <input type="range" min={1} max={4} value={variants} onChange={e => setVariants(parseInt(e.target.value, 10))}
            style={{ width:'100%', maxWidth:400 }}/>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
            {variants} {variants === 1 ? 'Variante' : 'Varianten'}{activeBrandVoice ? ' · Stil aus ' + activeBrandVoice.name : ''}
          </div>
        </div>

        {/* Aspect-Ratio Chips */}
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>LinkedIn-Format</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {ASPECT_RATIOS.map(ar => (
              <button key={ar.id} onClick={() => setAspect(ar.id)}
                style={{
                  padding:'8px 14px', borderRadius:10, fontSize:13, fontWeight:600,
                  border: '1.5px solid ' + (aspectRatio === ar.id ? P : 'var(--border,#E5E7EB)'),
                  background: aspectRatio === ar.id ? 'rgba(49,90,231,0.07)' : '#fff',
                  color: aspectRatio === ar.id ? P : 'var(--text-muted)',
                  cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                  transition:'all .15s',
                }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', textAlign:'left' }}>
                  <span>{ar.label}</span>
                  <span style={{ fontSize:10, opacity:.7, fontWeight:500, marginTop:1 }}>{ar.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:10, color:'#b91c1c', fontSize:13 }}>
            {error}
          </div>
        )}

        {/* Generate Button */}
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          {/* Model-Selector mit Cost-Hinweis */}
      <div style={{ marginTop:14, marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em' }}>Modell</label>
        <select value={model} onChange={e => setModel(e.target.value)}
          style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
          <option value="gpt-image-1-mini">⚡ GPT Image Mini — ~$0.005/Bild (schnell)</option>
          <option value="gpt-image-1">🎨 GPT Image — ~$0.04/Bild (Qualität)</option>
          <option value="gemini-2.5-flash-image">🍌 Gemini Nano Banana — ~$0.039/Bild (braucht Google Billing)</option>
        </select>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>Default: Mini (günstig &amp; schnell)</span>
      </div>

      <button onClick={generate} disabled={generating || !prompt.trim()}
            style={{
              padding:'12px 28px', borderRadius:10, border:'none',
              background: generating || !prompt.trim() ? '#94A3B8' : P,
              color:'#fff', fontSize:14, fontWeight:700, cursor: generating || !prompt.trim() ? 'not-allowed' : 'pointer',
              boxShadow: generating ? 'none' : '0 2px 10px rgba(49,90,231,.25)',
              display:'inline-flex', alignItems:'center', gap:8,
            }}>
            <span>{generating ? '⏳' : '🪄'}</span>
            <span>{generating ? `Generiere ${variants} ${variants === 1 ? 'Bild' : 'Bilder'}…` : `Generieren`}</span>
          </button>
        </div>
      </section>

      {/* Letzte Generation — Resultate */}
      {results.length > 0 && (
        <section style={{ marginBottom:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px' }}>
            ✨ Eben generiert
          </h3>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(results.length, 4)}, 1fr)`, gap:12 }}>
            {results.map(v => (
              <ResultCard key={v.id} v={v} onLightbox={() => setLightbox(v)} onDownload={() => downloadImage(v.signed_url, `${v.id}.png`)} onEdit={() => { setEditModal(v); setEditPrompt('') }} />
            ))}
          </div>
        </section>
      )}

      {/* Library-Grid */}
      <section>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:12 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:0 }}>
            📚 Bibliothek
          </h3>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <input type="text" value={librarySearch} onChange={e => setLibrarySearch(e.target.value)}
              placeholder="🔍 Prompt durchsuchen…"
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:12, fontFamily:'inherit', outline:'none', minWidth:200 }}/>
            <button onClick={() => setLibraryFavOnly(!libraryFavOnly)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid ' + (libraryFavOnly ? '#F59E0B' : 'var(--border)'), background: libraryFavOnly ? '#FFFBEB' : '#fff', color: libraryFavOnly ? '#92400E' : 'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              ★ Nur Favoriten
            </button>
            <button onClick={() => setLibraryShowAllBVs(!libraryShowAllBVs)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid ' + (libraryShowAllBVs ? P : 'var(--border)'), background: libraryShowAllBVs ? 'rgba(49,90,231,0.06)' : '#fff', color: libraryShowAllBVs ? P : 'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {libraryShowAllBVs ? '🌐 Alle BVs' : '👤 ' + (activeBrandVoice?.name?.slice(0,20) || 'Aktive BV')}
            </button>
          </div>
        </div>
        {libLoading && (
          <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade…</div>
        )}
        {!libLoading && library.length === 0 && (
          <div style={{ padding:'40px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
            Noch keine Bilder. Generiere oben dein erstes Visual.
          </div>
        )}
        {!libLoading && library.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
            {library.map(v => (
              <div key={v.id} onClick={() => setLightbox(v)}
                style={{ position:'relative', borderRadius:10, overflow:'hidden', background:'var(--surface)', border:'1px solid ' + (v.is_favorite ? '#F59E0B' : 'var(--border)'), cursor:'pointer', aspectRatio: v.aspect_ratio === '1.91:1' ? '1.91/1' : v.aspect_ratio === '4:5' ? '4/5' : v.aspect_ratio === '4:1' ? '4/1' : '1/1' }}>
                {v.signed_url
                  ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
                }
                {/* Favorit-Stern oben rechts */}
                <button onClick={e => { e.stopPropagation(); toggleFavorite(v.id, v.is_favorite) }}
                  title={v.is_favorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
                  style={{ position:'absolute', top:6, right:6, width:28, height:28, borderRadius:'50%', border:'none', background: v.is_favorite ? '#F59E0B' : 'rgba(0,0,0,0.5)', color:'#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, boxShadow:'0 1px 4px rgba(0,0,0,.3)' }}>
                  {v.is_favorite ? '★' : '☆'}
                </button>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'6px 8px', background:'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)', color:'#fff', fontSize:10, lineHeight:1.3, maxHeight:42, overflow:'hidden' }}>
                  {v.prompt}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:16, maxWidth:'min(95vw, 900px)', maxHeight:'95vh', overflow:'auto', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{lightbox.aspect_ratio} · {lightbox.model}</span>
              <span style={{ flex:1 }}/>
              <button onClick={() => downloadImage(lightbox.signed_url, `${lightbox.id}.png`)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>⬇ Download</button>
              <button onClick={() => { setEditModal(lightbox); setEditPrompt(''); setEditAspect(lightbox.aspect_ratio || '1:1'); setLightbox(null) }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>✏️ Bearbeiten</button>
              <button onClick={() => { archiveVisual(lightbox.id); setLightbox(null) }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#b91c1c', cursor:'pointer', fontSize:12, fontWeight:600 }}>🗑️ Löschen</button>
              <button onClick={() => setLightbox(null)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
            </div>
            {lightbox.signed_url && (
              <img src={lightbox.signed_url} alt={lightbox.prompt} style={{ maxWidth:'100%', maxHeight:'70vh', display:'block', margin:'0 auto' }}/>
            )}
            <div style={{ padding:'14px 18px', background:'#F8FAFC' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Prompt</div>
              <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.6 }}>{lightbox.prompt}</div>
              {lightbox.resolved_prompt && lightbox.resolved_prompt !== lightbox.prompt && (
                <details style={{ marginTop:10 }}>
                  <summary style={{ fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>Voll-Prompt anzeigen</summary>
                  <pre style={{ marginTop:6, padding:10, background:'#fff', borderRadius:6, fontSize:11, whiteSpace:'pre-wrap', fontFamily:'inherit', color:'var(--text-muted)' }}>{lightbox.resolved_prompt}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Phase 2c — Edit-Modal */}
      {editModal && (
        <div onClick={e => e.target === e.currentTarget && setEditModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:100 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:680, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>✏️ Bild bearbeiten</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>Beschreibe was geändert werden soll — Nano Banana editiert das Original mit deinem Prompt.</p>
              </div>
              <button onClick={() => setEditModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
            </div>
            {editModal.signed_url && (
              <img src={editModal.signed_url} alt={editModal.prompt} style={{ width:'100%', maxHeight:280, objectFit:'contain', borderRadius:10, marginBottom:14, background:'#F8FAFC' }}/>
            )}
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Aspect-Ratio (Outpaint, falls anders als Original)</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {['1:1','4:5','1.91:1','4:1'].map(ar => (
                <button key={ar} onClick={() => setEditAspect(ar)}
                  style={{ padding:'5px 12px', borderRadius:8, border:'1.5px solid ' + (editAspect === ar ? P : 'var(--border)'), background: editAspect === ar ? 'rgba(49,90,231,0.08)' : '#fff', color: editAspect === ar ? P : 'var(--text-primary)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {ar}{ar === editModal.aspect_ratio ? ' (Original)' : ''}
                </button>
              ))}
            </div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Was soll geändert werden?</label>
            <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={3}
              placeholder='z.B. "ändere Hintergrund zu einer Konferenz-Bühne" oder "füge eine Brille hinzu" — bei Aspect-Wechsel auch leer lassen geht (nur Outpainten)'
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none' }}/>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              <button onClick={() => setEditModal(null)}
                style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Abbrechen
              </button>
              <button onClick={editVisual} disabled={editing || (!editPrompt.trim() && editAspect === editModal.aspect_ratio)}
                style={{ padding:'9px 16px', borderRadius:8, border:'none', background: editing || (!editPrompt.trim() && editAspect === editModal.aspect_ratio) ? '#CBD5E1' : P, color:'#fff', cursor: editing || (!editPrompt.trim() && editAspect === editModal.aspect_ratio) ? 'wait' : 'pointer', fontSize:13, fontWeight:700 }}>
                {editing ? '⏳ Bearbeite…' : '✨ Bearbeiten mit Nano Banana'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2e — Template-Picker */}
      {templatePicker && (
        <div onClick={e => e.target === e.currentTarget && setTemplatePicker(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:100 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:760, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>📋 LinkedIn-Visual-Templates</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>Vordefinierte Layouts für häufige LinkedIn-Post-Bilder. Wähle eines und fülle die Felder.</p>
              </div>
              <button onClick={() => { setTemplatePicker(false); setActiveTemplate(null); setTemplateFields({}) }} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
            </div>

            {!activeTemplate ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>
                {VISUAL_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setActiveTemplate(t.id)}
                    style={{ textAlign:'left', padding:'14px 16px', borderRadius:12, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', transition:'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.background = 'rgba(49,90,231,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>{t.label}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>{t.desc}</div>
                    {t.requiresBVHero && (
                      <div style={{ fontSize:10, color:'#0891B2', fontWeight:600, marginTop:6 }}>💡 nutzt BV-Hero-Image</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              (() => {
                const tpl = VISUAL_TEMPLATES.find(t => t.id === activeTemplate)
                if (!tpl) return null
                return (
                  <>
                    <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:14 }}>
                      {tpl.label} — fülle die Felder aus:
                    </div>
                    {tpl.fields.map(f => (
                      <div key={f.name} style={{ marginBottom:12 }}>
                        <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:5 }}>
                          {f.label}{f.required ? ' *' : ' (optional)'}
                        </label>
                        {f.type === 'textarea' ? (
                          <textarea value={templateFields[f.name] || ''} onChange={e => setTemplateFields(p => ({ ...p, [f.name]: e.target.value }))}
                            placeholder={f.placeholder} rows={3}
                            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none' }}/>
                        ) : (
                          <input value={templateFields[f.name] || ''} onChange={e => setTemplateFields(p => ({ ...p, [f.name]: e.target.value }))}
                            placeholder={f.placeholder}
                            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}/>
                        )}
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop:18 }}>
                      <button onClick={() => { setActiveTemplate(null); setTemplateFields({}) }}
                        style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                        ← Zurück
                      </button>
                      <button onClick={applyTemplate}
                        style={{ padding:'9px 22px', borderRadius:8, border:'none', background: P, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                        ✨ Bild generieren
                      </button>
                    </div>
                  </>
                )
              })()
            )}
          </div>
        </div>
      )}

    </div>
  )
}

function ResultCard({ v, onLightbox, onDownload, onEdit }) {
  const ratio = v.aspect_ratio === '1.91:1' ? '1.91/1' : v.aspect_ratio === '4:5' ? '4/5' : v.aspect_ratio === '4:1' ? '4/1' : '1/1'
  return (
    <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'var(--surface)', border:'1px solid var(--border)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div onClick={onLightbox} style={{ cursor:'pointer', aspectRatio: ratio }}>
        {v.signed_url
          ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
        }
      </div>
      <div style={{ padding:8, display:'flex', gap:6 }}>
        <button onClick={onDownload}
          style={{ flex:1, padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
          ⬇ Download
        </button>
        {onEdit && (
          <button onClick={onEdit} title="Bearbeiten"
            style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            ✏️
          </button>
        )}
        <button onClick={onLightbox} title="Vollbild"
          style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
          🔍
        </button>
      </div>
    </div>
  )
}
