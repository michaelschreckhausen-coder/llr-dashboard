// src/pages/Visuals.jsx
// Content-Visuals — reine Galerie / Bibliothek.
//
// Erstellen UND Bearbeiten passieren in der Content-Werkstatt (Designer).
// Diese Seite zeigt nur noch die Bibliothek aller KI-Bilder mit:
//   · Grid (BV-gescopet, Suche, Favoriten-Filter, „Alle BVs")
//   · Favoriten umschalten · In Content-Werkstatt öffnen · Download · Löschen
//   · Lightbox · „Zu Beitrag hinzufügen" (Closed-Loop mit Redaktionsplan)
//
// Der frühere In-Page-Generator (Templates/Modelle/generate/editVisual) wurde
// entfernt — die wiederverwendbaren Start-Layouts leben jetzt im Designer
// (src/lib/designTemplates.js).

import React, { useState, useEffect, useRef } from 'react'
import { Image as ImageIcon, Pencil, Pin, Sparkles, Star, Trash2, Upload, X, FileText, FileUp } from 'lucide-react'
import { resizeImageBeforeUpload } from '../lib/imageResize'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sharedBrandVoiceIds, scopeContentByTeamOrSharedBV } from '../lib/teamShares'
import { listTeamVisuals, addImagePageToDesign, signedThumbUrl } from '../lib/contentVisuals'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

const P = 'var(--wl-primary, #0A6FB0)'

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function Visuals({ session, kindFilter = null, embedded = false, allowUpload = false }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, noBrand } = useBrandVoice()

  // Library-State
  const [library, setLibrary]        = useState([])
  const [libLoading, setLibLoading]  = useState(true)
  const [lightbox, setLightbox]      = useState(null)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryShowAllBVs, setLibraryShowAllBVs] = useState(false)
  const [libraryFavOnly, setLibraryFavOnly] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  // "Im Designer öffnen": neues ODER bestehendes Design wählen
  const [designerPick, setDesignerPick] = useState(null)   // Bild-Visual
  const [designs, setDesigns] = useState([])
  const [designsLoading, setDesignsLoading] = useState(false)
  const [designBusy, setDesignBusy] = useState(false)

  // "Zu Post hinzufügen"-Modal
  const [attachModal, setAttachModal] = useState(null)   // visual-object
  const [attachPosts, setAttachPosts] = useState([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')
  const [attachConfirm, setAttachConfirm] = useState('') // success-toast

  // Linked-Post-State (Closed-Loop mit Redaktionsplan)
  const [linkedPostId, setLinkedPostId] = useState(null)
  const [linkedPost, setLinkedPost] = useState(null)

  // ?post_id=<post_id> aus URL: Banner anzeigen (Closed-Loop)
  useEffect(() => {
    const post_id = searchParams.get('post_id')
    if (!post_id) return
    setLinkedPostId(post_id)
    ;(async () => {
      const { data: p } = await supabase.from('content_posts')
        .select('id, title, content, visual_id, brand_voice_id, company_voice_ids, company_voice_id')
        .eq('id', post_id).maybeSingle()
      if (p) setLinkedPost(p)
    })()
  }, [searchParams])

  // ?edit=<visual_id> aus URL: Bild-Bearbeitung passiert jetzt in der
  // Content-Werkstatt (Designer). Wir leiten direkt dorthin um.
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    navigate('/content-studio?visual=' + editId, { replace: true })
  }, [searchParams, navigate])

  // ─── Library ──────────────────────────────────────────────────────────────
  // Nur AI-generierte Bilder (kein model='upload', kein media_type='video|document').
  async function loadLibrary() {
    setLibLoading(true)
    const _sharedBv = await sharedBrandVoiceIds(activeTeamId)
    let q = scopeContentByTeamOrSharedBV(supabase.from('visuals').select('*'), activeTeamId, _sharedBv)
      .eq('is_archived', false)
    if (kindFilter) {
      // Bibliothek: exakt nach Art filtern (Designs bzw. alle Bild-Medien inkl. Uploads).
      // Medien-Bibliothek: generierte Bilder (kind=image) UND alle Uploads (auch PDFs/Docs)
      q = kindFilter === 'image' ? q.or('kind.eq.image,model.eq.upload') : q.eq('kind', kindFilter)
    } else {
      q = q.neq('model', 'upload').or('media_type.is.null,media_type.eq.image')
    }
    q = q
      .order('is_favorite', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(100)
    if (noBrand) q = q.eq('no_brand', true)
    else if (activeBrandVoice?.id && !libraryShowAllBVs) q = q.eq('brand_voice_id', activeBrandVoice.id)
    if (libraryFavOnly) q = q.eq('is_favorite', true)
    if (librarySearch.trim()) q = q.ilike('prompt', '%' + librarySearch.trim() + '%')
    const { data } = await q
    const withUrls = await Promise.all((data || []).map(async (v) => {
      if (v.media_type === 'image') {
        const url = await signedThumbUrl(v.storage_path, { width: 1000, height: 1000, resize: 'contain', quality: 78, expiresIn: 60 * 60 * 24 })
        return { ...v, signed_url: url }
      }
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl || null }
    }))
    setLibrary(withUrls); setLibLoading(false)
  }
  useEffect(() => { if (activeTeamId) loadLibrary() }, [activeTeamId, activeBrandVoice?.id, noBrand, libraryShowAllBVs, libraryFavOnly, librarySearch])

  // ─── Datei-Upload (Bilder, PDFs, docx, xlsx …) → visuals-Bucket + Tabelle ───
  async function uploadFiles(fileList) {
    const arr = Array.from(fileList || [])
    if (!arr.length) return
    if (!activeTeamId) { alert('Kein Team aktiv'); return }
    if (!activeBrandVoice?.id && !noBrand) { alert('Bitte oben eine Marke oder „Ohne Brand" wählen.'); return }
    setUploading(true)
    try {
      for (const file of arr) {
        if (file.size > 100 * 1024 * 1024) { alert(`${file.name}: max 100 MB`); continue }
        let mediaType = 'document'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) mediaType = 'video'
        else if (/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) mediaType = 'image'
        else if (/\.(mp4|mov|webm|avi)$/i.test(file.name)) mediaType = 'video'
        let uploadFile = file
        if (mediaType === 'image') { try { uploadFile = await resizeImageBeforeUpload(file, 1600, 0.85) } catch (_e) {} }
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
        const visualId = crypto.randomUUID()
        const path = `${activeTeamId}/uploads/${visualId}.${ext}`
        const EXT_MIME = { pdf:'application/pdf', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt:'text/plain', csv:'text/csv', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', svg:'image/svg+xml', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm' }
        const contentType = file.type || EXT_MIME[ext] || 'application/octet-stream'
        const { error: upErr } = await supabase.storage.from('visuals').upload(path, uploadFile, { contentType, upsert: false })
        if (upErr) { alert(`Upload ${file.name}: ${upErr.message}`); continue }
        const { error: insErr } = await supabase.from('visuals').insert({
          id: visualId, user_id: session?.user?.id, team_id: activeTeamId, brand_voice_id: noBrand ? null : activeBrandVoice.id, no_brand: noBrand,
          prompt: file.name, resolved_prompt: file.name, aspect_ratio: '1:1', model: 'upload',
          storage_path: path, media_type: mediaType, original_filename: file.name,
          file_size_bytes: file.size, mime_type: file.type,
        })
        if (insErr) alert(`Speichern ${file.name}: ${insErr.message}`)
      }
      await loadLibrary()
    } finally { setUploading(false) }
  }

  // Download via Blob: signed URLs sind cross-origin, das download-Attribut
  // wird vom Browser ignoriert → Bild öffnet sich statt downzuloaden.
  async function downloadImage(visual) {
    try {
      const path = visual?.storage_path
      if (!path) { alert('Kein Storage-Pfad'); return }
      const { data: blob, error } = await supabase.storage.from('visuals').download(path)
      if (error || !blob) { alert('Download fehlgeschlagen: ' + (error?.message || '')); return }
      const ext = (path.split('.').pop() || 'png').toLowerCase()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leadesk-visual-${visual.id}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) {
      alert('Download-Fehler: ' + (e.message || ''))
    }
  }
  async function toggleFavorite(id, cur) {
    setLibrary(prev => prev.map(v => v.id === id ? { ...v, is_favorite: !cur } : v))   // optimistisch
    const { error } = await supabase.from('visuals').update({ is_favorite: !cur }).eq('id', id)
    if (error) {   // Fehlschlag → zurückdrehen + melden (vorher Silent-Fail ohne Fehlerprüfung)
      setLibrary(prev => prev.map(v => v.id === id ? { ...v, is_favorite: cur } : v))
      alert('Favorit konnte nicht gespeichert werden: ' + (error.message || error))
    }
  }
  // Bild im Designer öffnen — erst fragen: neues Design ODER in ein bestehendes (als neue Seite)
  async function openDesignerPicker(v) {
    setDesignerPick(v); setDesigns([]); setDesignsLoading(true)
    const { data } = await listTeamVisuals({ teamId: activeTeamId, brandVoiceId: noBrand ? null : activeBrandVoice?.id, kind: 'design', limit: 100, noBrand })
    setDesigns(data || []); setDesignsLoading(false)
  }
  function openInNewDesign(v) {
    setDesignerPick(null)
    navigate('/content-studio?visual=' + v.id)   // wird als neues Design geöffnet
  }
  async function openInExistingDesign(v, designId) {
    if (designBusy) return
    setDesignBusy(true)
    const { error } = await addImagePageToDesign(designId, v)   // Bild als neue Seite anhängen
    setDesignBusy(false); setDesignerPick(null)
    if (error) { alert('Konnte nicht ins Design übernehmen: ' + (error.message || error)); return }
    navigate('/content-studio?visual=' + designId)
  }
  async function archiveVisual(id) {
    await supabase.from('visuals').update({ is_archived: true }).eq('id', id)
    setLibrary(prev => prev.filter(v => v.id !== id))
  }

  // ─── "Zu Post hinzufügen" ──────────────────────────────────────────────────
  // Wenn von Redaktionsplan kommend → direkt am linkedPost anhängen, kein Modal
  async function quickAttachToLinkedPost(visual) {
    if (!linkedPostId) { openAttachModal(visual); return }
    const { count } = await supabase
      .from('content_post_visuals')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', linkedPostId)
    const { error } = await supabase.from('content_post_visuals').insert({
      post_id: linkedPostId,
      visual_id: visual.id,
      team_id: activeTeamId,
      position: count || 0,
      created_by: session?.user?.id,
    })
    if (error && !String(error.message).includes('duplicate')) {
      alert('Fehler beim Zuordnen: ' + error.message); return
    }
    if (linkedPost && !linkedPost.visual_id) {
      await supabase.from('content_posts').update({ visual_id: visual.id }).eq('id', linkedPostId)
    }
    setAttachConfirm('Bild zugeordnet — zurück zum Beitrag…')
    setTimeout(() => {
      setAttachConfirm('')
      navigate('/redaktionsplan?open=' + linkedPostId)
    }, 900)
  }

  async function openAttachModal(visual) {
    setAttachModal(visual)
    setAttachConfirm('')
    setAttachLoading(true)
    let q = supabase.from('content_posts')
      .select('id, title, content, status, scheduled_at, visual_id, brand_voice_id, created_at')
      .neq('status', 'published')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at',   { ascending: false })
      .limit(80)
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data, error } = await q
    if (error) { console.warn('[attach-posts]', error); setAttachPosts([]); setAttachLoading(false); return }
    setAttachPosts(data || [])
    setAttachLoading(false)
  }

  async function attachVisualToPost(post) {
    if (!attachModal) return
    const { count } = await supabase
      .from('content_post_visuals')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)
    const teamId = post.team_id || activeTeamId
    const { error } = await supabase.from('content_post_visuals').insert({
      post_id: post.id,
      visual_id: attachModal.id,
      team_id: teamId,
      position: count || 0,
      created_by: session?.user?.id,
    })
    if (error && !String(error.message).includes('duplicate')) {
      alert('Fehler beim Zuordnen: ' + error.message); return
    }
    if (!post.visual_id) {
      await supabase.from('content_posts')
        .update({ visual_id: attachModal.id })
        .eq('id', post.id)
    }
    setAttachConfirm('Bild zugeordnet — zurück zum Beitrag…')
    setAttachPosts(prev => prev.map(p => p.id === post.id ? { ...p, visual_id: p.visual_id || attachModal.id } : p))
    setTimeout(() => {
      setAttachModal(null); setAttachConfirm('')
      navigate('/redaktionsplan?open=' + post.id)
    }, 1100)
  }

  const filteredAttachPosts = (attachPosts || []).filter(p => {
    if (!attachSearch.trim()) return true
    const s = attachSearch.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  // ─── "Neuen Beitrag mit Bild anlegen" ─────────────────────────────────────
  async function createPostWithVisual(visual) {
    if (!visual?.id) return
    if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice — bitte oben rechts auswählen.'); return }
    if (!activeTeamId)         { alert('Kein Team aktiv'); return }
    const { data: post, error } = await supabase.from('content_posts').insert({
      user_id: session?.user?.id,
      team_id: activeTeamId,
      brand_voice_id: activeBrandVoice.id,
      title: (visual.prompt || 'Neuer Beitrag mit Bild').slice(0, 80),
      content: '',
      platform: 'linkedin',
      status: 'idee',
      workspace: 'personal',
      visual_id: visual.id,
    }).select().single()
    if (error) { alert('Erstellen fehlgeschlagen: ' + error.message); return }
    await supabase.from('content_post_visuals').insert({
      post_id: post.id,
      visual_id: visual.id,
      team_id: activeTeamId,
      position: 0,
      created_by: session?.user?.id,
    })
    setAttachConfirm('Neuer Beitrag angelegt — wird gleich geöffnet…')
    setTimeout(() => {
      setAttachModal(null); setAttachConfirm('')
      navigate('/redaktionsplan?open=' + post.id)
    }, 1100)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={embedded ? { width:'100%' } : { width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Header — in der Bibliothek (embedded) ausgeblendet, da die Seite ihren eigenen Titel hat */}
      {!embedded && (
      <div style={{ marginBottom:22, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
        <div>
          <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:6 }}>Content · Visuals</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Bilder.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
            Deine Galerie aller KI-Bilder. Erstellen und Bearbeiten passiert in der Content-Werkstatt.
          </p>
        </div>
        <button onClick={() => navigate('/content-studio')}
          style={{ padding:'10px 16px', borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', display:'inline-flex', alignItems:'center', gap:7, boxShadow:'0 2px 10px rgba(10,111,176,.18)' }}>
          <Sparkles size={15} strokeWidth={1.9}/>Neues Bild erstellen
        </button>
      </div>
      )}

      {/* Linked-Post-Banner (Closed-Loop mit Redaktionsplan) */}
      {linkedPostId && linkedPost && (
        <div style={{ padding:'10px 14px', marginBottom:16, borderRadius:10, background:'rgba(10,111,176,0.06)', border:'1px solid rgba(10,111,176,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            <Pin size={16} strokeWidth={1.75} style={{ color:'var(--wl-primary, #0A6FB0)' }} />
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color: P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Aus dem Redaktionsplan</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {linkedPost.title || '(ohne Titel)'} — wähle ein Bild und klicke „Zu Beitrag hinzufügen".
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/redaktionsplan?open=' + linkedPostId)}
            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            ← Zurück zum Beitrag
          </button>
        </div>
      )}

      {/* Library */}
      <section
        onDragOver={allowUpload ? (e => { if (Array.from(e.dataTransfer?.types||[]).includes('Files')) { e.preventDefault(); setDragOver(true) } }) : undefined}
        onDragLeave={allowUpload ? (e => { if (e.currentTarget === e.target) setDragOver(false) }) : undefined}
        onDrop={allowUpload ? (e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files) }) : undefined}
        style={{ position:'relative' }}>
        {allowUpload && dragOver && (
          <div style={{ position:'absolute', inset:-6, zIndex:20, borderRadius:14, background:'rgba(10,111,176,0.07)', border:'2px dashed '+P, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <span style={{ fontSize:14, fontWeight:700, color:P }}>Dateien hier ablegen zum Hochladen</span>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:12 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:0 }}>
            Bibliothek
          </h3>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            {allowUpload && (<>
              <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" style={{ display:'none' }} onChange={e => { uploadFiles(e.target.files); e.target.value='' }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:P, color:'#fff', fontSize:12.5, fontWeight:700, cursor: uploading?'default':'pointer', display:'inline-flex', alignItems:'center', gap:6, opacity: uploading?0.7:1 }}>
                <FileUp size={14} strokeWidth={2}/>{uploading ? 'Lädt…' : 'Dateien hochladen'}
              </button>
            </>)}
            <input type="text" value={librarySearch} onChange={e => setLibrarySearch(e.target.value)}
              placeholder="Prompt durchsuchen…"
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:12, fontFamily:'inherit', outline:'none', minWidth:200 }}/>
            <button onClick={() => setLibraryFavOnly(!libraryFavOnly)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid ' + (libraryFavOnly ? '#F59E0B' : 'var(--border)'), background: libraryFavOnly ? '#FFFBEB' : '#fff', color: libraryFavOnly ? '#92400E' : 'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Star size={13} strokeWidth={1.75}/>Favoriten</span>
            </button>
            <button onClick={() => setLibraryShowAllBVs(!libraryShowAllBVs)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid ' + (libraryShowAllBVs ? P : 'var(--border)'), background: libraryShowAllBVs ? 'rgba(10,111,176,0.06)' : '#fff', color: libraryShowAllBVs ? P : 'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {libraryShowAllBVs ? 'Alle BVs' : '' + (activeBrandVoice?.name?.slice(0,20) || 'Aktive BV')}
            </button>
          </div>
        </div>
        {libLoading && <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade…</div>}
        {!libLoading && library.length === 0 && (
          <div style={{ padding:'40px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
            Noch keine Bilder. Erstelle dein erstes Bild in der Content-Werkstatt.
            <div style={{ marginTop:12 }}>
              <button onClick={() => navigate('/content-studio')}
                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:P, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}>
                <Sparkles size={14} strokeWidth={1.9}/>Zur Content-Werkstatt
              </button>
            </div>
          </div>
        )}
        {!libLoading && library.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:14 }}>
            {library.map(v => (
              <GalleryCard key={v.id} v={v} linkedMode={!!linkedPostId}
                onOpenStudio={() => openDesignerPicker(v)}
                onLightbox={() => setLightbox(v)}
                onDownload={() => downloadImage(v)}
                onAttach={() => quickAttachToLinkedPost(v)}
                onToggleFav={() => toggleFavorite(v.id, v.is_favorite)}
                onDelete={() => { if (window.confirm('Dieses Bild wirklich löschen?')) archiveVisual(v.id) }} />
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:16, maxWidth:'min(95vw, 900px)', maxHeight:'95vh', overflow:'auto', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{lightbox.aspect_ratio} · {lightbox.model}</span>
              <span style={{ flex:1, minWidth:8 }}/>
              <button onClick={() => { openAttachModal(lightbox); setLightbox(null) }}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background: P, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, boxShadow:'0 2px 6px rgba(10,111,176,.25)' }}>
                <ImageIcon size={13} strokeWidth={1.9}/>Zu Beitrag hinzufügen
              </button>
              <button onClick={() => downloadImage(lightbox)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}><Upload size={12} strokeWidth={1.9} style={{ transform:'rotate(180deg)', marginRight:6 }}/>Download</button>
              <button onClick={() => { openDesignerPicker(lightbox); setLightbox(null) }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}><Pencil size={12} strokeWidth={1.75} style={{ marginRight:6 }} />Im Designer öffnen</button>
              <button onClick={() => { archiveVisual(lightbox.id); setLightbox(null) }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#b91c1c', cursor:'pointer', fontSize:12, fontWeight:600 }}><Trash2 size={12} strokeWidth={1.75} style={{ marginRight:6 }} />Löschen</button>
              <button onClick={() => setLightbox(null)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>
            {lightbox.signed_url && (
              <img src={lightbox.signed_url} alt={lightbox.prompt} style={{ maxWidth:'100%', maxHeight:'70vh', display:'block', margin:'0 auto' }}/>
            )}
            <div style={{ padding:'14px 18px', background:'#F8FAFC' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Prompt</div>
              <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.6 }}>{lightbox.prompt}</div>
            </div>
          </div>
        </div>
      )}

      {/* "Im Designer öffnen": neues ODER bestehendes Design (als neue Seite) */}
      {designerPick && (
        <div onClick={() => setDesignerPick(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(2px)', zIndex:400, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'12vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:460, maxWidth:'92vw', maxHeight:'72vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden', textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, padding:'16px 16px 6px' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>Im Designer öffnen</div>
              <button onClick={() => setDesignerPick(null)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex', flexShrink:0 }}><X size={18}/></button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 14px 14px' }}>
              <button onClick={() => openInNewDesign(designerPick)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
                <Sparkles size={15} strokeWidth={2}/>Als neues Design öffnen
              </button>
              <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'2px 2px 6px' }}>In bestehendes Design (als neue Seite)</div>
              {designsLoading ? (
                <div style={{ padding:14, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Lädt…</div>
              ) : designs.length === 0 ? (
                <div style={{ padding:'4px 4px 8px', fontSize:12.5, color:'var(--text-muted)' }}>Noch keine Designs vorhanden.</div>
              ) : designs.map(d => (
                <button key={d.id} onClick={() => openInExistingDesign(designerPick, d.id)} disabled={designBusy} title={d.title || 'Design'}
                  style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor: designBusy ? 'wait' : 'pointer', fontFamily:'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10,111,176,0.07)', color:P }}><ImageIcon size={15} strokeWidth={1.9}/></span>
                  <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.title || 'Unbenanntes Design'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* "Zu Post hinzufügen"-Modal */}
      {attachModal && (
        <div onClick={e => e.target === e.currentTarget && setAttachModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:120 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:720, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>Bild zu Beitrag hinzufügen</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>
                  Wähle einen Beitrag aus dem Redaktionsplan — das Bild wird als Visual zugeordnet.
                  {activeBrandVoice ? ` Beiträge der BV: ${activeBrandVoice.name}.` : ''}
                </p>
              </div>
              <button onClick={() => setAttachModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>

            {/* Preview-Strip mit Mini-Bild des Visuals */}
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, padding:'10px 12px', background:'#F8FAFC', borderRadius:10, flexShrink:0 }}>
              {attachModal.signed_url && (
                <img src={attachModal.signed_url} alt="visual" style={{ width:48, height:48, objectFit:'cover', borderRadius:6, border:'1px solid var(--border)' }}/>
              )}
              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:2 }}>Ausgewähltes Bild</div>
                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachModal.prompt}</div>
              </div>
            </div>

            {/* "Neuer Beitrag mit diesem Bild" */}
            <button onClick={() => createPostWithVisual(attachModal)}
              style={{
                width:'100%', padding:'12px 14px', marginBottom:10, borderRadius:10,
                border:'1.5px dashed ' + P, background:'rgba(10,111,176,0.04)',
                color: P, fontSize:13, fontWeight:700, cursor:'pointer',
                display:'flex', alignItems:'center', gap:8, justifyContent:'center', flexShrink:0,
              }}>
              Neuen Beitrag mit diesem Bild anlegen
            </button>

            {/* Separator */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexShrink:0 }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }}/>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>oder zu bestehendem Beitrag</span>
              <div style={{ flex:1, height:1, background:'var(--border)' }}/>
            </div>

            {/* Search */}
            <input type="text" value={attachSearch} onChange={e => setAttachSearch(e.target.value)}
              placeholder="Beitrag suchen (Titel oder Content)…"
              style={{ padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10, flexShrink:0 }}/>

            {/* Confirm-Toast */}
            {attachConfirm && (
              <div style={{ marginBottom:10, padding:'10px 14px', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:9, color:'#065F46', fontSize:13, fontWeight:600, flexShrink:0 }}>
                {attachConfirm}
              </div>
            )}

            {/* Posts-Liste (scrollable) */}
            <div style={{ overflowY:'auto', flex:1, minHeight:0, marginRight:-8, paddingRight:8 }}>
              {attachLoading && (
                <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade Beiträge…</div>
              )}
              {!attachLoading && filteredAttachPosts.length === 0 && (
                <div style={{ padding:'32px 20px', textAlign:'center', background:'var(--surface)', borderRadius:10, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
                  {attachSearch.trim() ? 'Keine Beiträge mit diesem Suchbegriff.' : 'Keine offenen Beiträge gefunden. Erstelle einen Beitrag im Redaktionsplan.'}
                </div>
              )}
              {!attachLoading && filteredAttachPosts.map(p => {
                const isAlreadyAttached = p.visual_id === attachModal.id
                const hasOtherVisual    = p.visual_id && p.visual_id !== attachModal.id
                const statusLabels = { idee:'Idee', draft:'Entwurf', in_review:'Review', approved:'Approved', scheduled:'Geplant', failed:'Fehler' }
                return (
                  <button key={p.id} onClick={() => attachVisualToPost(p)}
                    disabled={isAlreadyAttached}
                    style={{
                      width:'100%', textAlign:'left', padding:'12px 14px', marginBottom:8, borderRadius:10,
                      border:'1.5px solid ' + (isAlreadyAttached ? '#6EE7B7' : 'var(--border)'),
                      background: isAlreadyAttached ? '#ECFDF5' : '#fff',
                      cursor: isAlreadyAttached ? 'default' : 'pointer',
                      display:'flex', gap:12, alignItems:'flex-start', transition:'all .12s',
                    }}
                    onMouseEnter={e => { if (!isAlreadyAttached) e.currentTarget.style.borderColor = P }}
                    onMouseLeave={e => { if (!isAlreadyAttached) e.currentTarget.style.borderColor = 'var(--border)' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', padding:'2px 8px', background:'#F1F5F9', borderRadius:6 }}>{statusLabels[p.status] || p.status}</span>
                        {p.scheduled_at && (
                          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                            {new Date(p.scheduled_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </span>
                        )}
                        {hasOtherVisual && (
                          <span style={{ fontSize:10, color:'#0891B2', background:'#CFFAFE', padding:'2px 6px', borderRadius:5, fontWeight:600 }} title="Wird als zusätzliches Carousel-Bild hinzugefügt">hat schon Bild(er)</span>
                        )}
                        {isAlreadyAttached && (
                          <span style={{ fontSize:10, color:'#065F46', background:'#D1FAE5', padding:'2px 6px', borderRadius:5, fontWeight:600 }}>Cover-Bild</span>
                        )}
                      </div>
                      <div style={{ fontSize:14, fontWeight:600, color:'rgb(20,20,43)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.title || '(ohne Titel)'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                        {p.content?.slice(0, 180) || '(kein Content)'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', flexShrink:0 }}>
              <button onClick={() => setAttachModal(null)}
                style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Aspect-Ratio CSS-Helfer für Library-Grid
function aspectToCss(ar) {
  const map = {
    '1:1':'1/1', '3:2':'3/2', '2:3':'2/3', '4:3':'4/3', '3:4':'3/4',
    '5:4':'5/4', '4:5':'4/5', '21:9':'21/9', '16:9':'16/9', '9:16':'9/16',
    // Legacy
    '1.91:1':'1.91/1', '4:1':'4/1',
  }
  return map[ar] || '1/1'
}

// ─── Galerie-Karte ──────────────────────────────────────────────────────────
function GalleryCard({ v, linkedMode, onOpenStudio, onLightbox, onDownload, onAttach, onToggleFav, onDelete }) {
  const [hover, setHover] = useState(false)
  const isImage = (v.media_type || 'image') === 'image'
  const fname = v.original_filename || v.prompt || 'Datei'
  const ext = (fname.split('.').pop() || 'DATEI').toUpperCase().slice(0, 5)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'var(--surface)',
        border:'1px solid ' + (v.is_favorite ? '#F59E0B' : 'var(--border)'), boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div onClick={isImage ? onLightbox : onDownload} style={{ cursor:'pointer', aspectRatio: aspectToCss(v.aspect_ratio), background: isImage ? '#0b0b0b' : '#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {isImage
          ? (v.signed_url
              ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              : <div style={{ color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>)
          : <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:14, textAlign:'center' }}>
              <FileText size={38} strokeWidth={1.3} style={{ color:P }}/>
              <span style={{ fontSize:11, fontWeight:800, color:P, letterSpacing:'0.06em' }}>{ext}</span>
              <span style={{ fontSize:11, color:'var(--text-muted)', maxWidth:'92%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fname}</span>
            </div>}
      </div>

      {/* Favorit (immer sichtbar) */}
      <button onClick={e => { e.stopPropagation(); onToggleFav() }}
        title={v.is_favorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
        style={{ position:'absolute', zIndex:2, top:6, right:6, width:28, height:28, borderRadius:'50%', border:'none', background: v.is_favorite ? '#F59E0B' : 'rgba(0,0,0,0.5)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,.3)' }}>
        <Star size={14} strokeWidth={1.75} fill={v.is_favorite ? 'currentColor' : 'none'}/>
      </button>

      {/* Hover-Overlay mit Aktionen */}
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:8, gap:6,
        background:'linear-gradient(0deg, rgba(0,0,0,0.72), rgba(0,0,0,0.05) 55%, transparent)',
        opacity: hover ? 1 : 0, transition:'opacity 0.15s', pointerEvents: hover ? 'auto' : 'none' }}>
        <div style={{ color:'#fff', fontSize:10.5, lineHeight:1.35, maxHeight:42, overflow:'hidden', marginBottom:2 }}>{v.prompt}</div>
        {linkedMode && (
          <button onClick={e => { e.stopPropagation(); onAttach() }}
            style={{ padding:'7px 10px', borderRadius:8, border:'none', background:P, color:'#fff', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            <Pin size={12} strokeWidth={1.9}/>Zu Beitrag hinzufügen
          </button>
        )}
        {isImage && (
        <button onClick={e => { e.stopPropagation(); onOpenStudio() }}
          style={{ padding:'7px 10px', borderRadius:8, border:'none', background: linkedMode ? 'rgba(255,255,255,0.92)' : P, color: linkedMode ? '#111' : '#fff', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <Pencil size={12} strokeWidth={1.9}/>Im Designer öffnen
        </button>
        )}
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={e => { e.stopPropagation(); onDownload() }} title="Herunterladen"
            style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.92)', color:'#111', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            <Upload size={13} strokeWidth={1.9} style={{ transform:'rotate(180deg)' }}/>Download
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} title="Löschen"
            style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'rgba(254,242,242,0.95)', color:'#b91c1c', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <Trash2 size={13} strokeWidth={1.9}/>
          </button>
        </div>
      </div>
    </div>
  )
}
