// src/pages/Media.jsx
// Medien-Bibliothek: alle eigenen Uploads (Bilder, Videos, PDFs) zentral.
// Unterscheidet sich von /visuals (das nur AI-generierte Bilder zeigt).

import React, { useState, useEffect, useRef } from 'react'
import { User, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sharedBrandVoiceIds, scopeContentByTeamOrSharedBV } from '../lib/teamShares'
import { resizeImageBeforeUpload } from '../lib/imageResize'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

const P = 'var(--wl-primary, #0A6FB0)'

export default function Media({ session }) {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()

  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox]   = useState(null)
  const fileInputRef = useRef(null)


  // Attach-Modal (wie in Visuals)
  const [attachModal, setAttachModal] = useState(null)  // visual-object des zu verknüpfenden Mediums
  const [attachPosts, setAttachPosts] = useState([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')
  const [attachConfirm, setAttachConfirm] = useState('')

  async function loadItems() {
    if (!activeBrandVoice?.id) { setItems([]); setLoading(false); return }
    setLoading(true)
    const q2 = search.trim().toLowerCase()

    // 1) Uploads + generierte Visuals (visuals-Tabelle)
    let visualItems = []
    if (typeFilter !== 'identity') {
      const _sharedBv = await sharedBrandVoiceIds(activeTeamId)
      let q = scopeContentByTeamOrSharedBV(supabase.from('visuals').select('*'), activeTeamId, _sharedBv)
        .eq('is_archived', false)
        .eq('brand_voice_id', activeBrandVoice.id)
        .order('created_at', { ascending: false })
        .limit(240)
      if (typeFilter === 'generated') q = q.neq('model', 'upload').or('media_type.is.null,media_type.eq.image')
      else if (typeFilter === 'upload') q = q.eq('model', 'upload')
      else if (typeFilter === 'video') q = q.eq('media_type', 'video')
      else if (typeFilter === 'document') q = q.eq('media_type', 'document')
      if (q2) q = q.ilike('prompt', '%' + q2 + '%')
      const { data } = await q
      visualItems = await Promise.all((data || []).map(async (v) => {
        let signedUrl = null
        if (v.media_type === 'image') {
          const { data: t } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24, { transform: { width: 1000, height: 1000, resize: 'contain', quality: 78 } })
          signedUrl = t?.signedUrl || null
        }
        if (!signedUrl) { const { data: s } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24); signedUrl = s?.signedUrl || null }
        return { ...v, signed_url: signedUrl }
      }))
    }

    // 2) Visuelle Identität (Bilder am Brand-Voice-Datensatz: Personen, Logos, Favicons, CI)
    let identityItems = []
    if (typeFilter === 'all' || typeFilter === 'identity') {
      const { data: bv } = await supabase.from('brand_voices')
        .select('hero_image_paths, ci_image_paths, logo_paths, favicon_paths')
        .eq('id', activeBrandVoice.id).maybeSingle()
      const groups = [['hero_image_paths','Person'], ['logo_paths','Logo'], ['favicon_paths','Favicon'], ['ci_image_paths','CI / Referenz']]
      const raw = []
      for (const [field, kind] of groups) {
        const arr = Array.isArray(bv?.[field]) ? bv[field] : []
        for (const path of arr) raw.push({ path, kind })
      }
      const filtered = q2 ? raw.filter(r => r.kind.toLowerCase().includes(q2)) : raw
      identityItems = await Promise.all(filtered.map(async ({ path, kind }) => {
        let signedUrl = null
        const { data: t } = await supabase.storage.from('visuals').createSignedUrl(path, 60 * 60 * 24, { transform: { width: 1000, height: 1000, resize: 'contain', quality: 78 } })
        signedUrl = t?.signedUrl || null
        if (!signedUrl) { const { data: s } = await supabase.storage.from('visuals').createSignedUrl(path, 60 * 60 * 24); signedUrl = s?.signedUrl || null }
        return { id: 'identity:' + path, identity: true, identity_kind: kind, storage_path: path, signed_url: signedUrl, media_type: 'image', model: 'identity', original_filename: 'Identität · ' + kind }
      }))
    }

    setItems([...identityItems, ...visualItems]); setLoading(false)
  }
  useEffect(() => { if (activeTeamId && activeBrandVoice?.id) loadItems() }, [activeTeamId, activeBrandVoice?.id, typeFilter, search])

  async function uploadFiles(filesArray) {
    if (!filesArray?.length) return
    if (!activeTeamId)         { alert('Kein Team aktiv'); return }
    if (!activeBrandVoice?.id) { alert('Keine Brand Voice aktiv'); return }
    setUploading(true)
    try {
      for (const file of filesArray) {
        if (file.size > 500 * 1024 * 1024) { alert(`${file.name}: max 500 MB`); continue }
        let mediaType = 'document'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) mediaType = 'video'
        else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) mediaType = 'document'
        else if (/\.(mp4|mov|webm|avi)$/i.test(file.name)) mediaType = 'video'
        else if (/\.(png|jpe?g|webp|svg)$/i.test(file.name)) mediaType = 'image'

        let uploadFile = file
        if (mediaType === 'image') {
          try { uploadFile = await resizeImageBeforeUpload(file, 1500, 0.85) } catch (e) { console.warn('[upload-resize]', e.message) }
        }
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
        const visualId = crypto.randomUUID()
        const path = `${activeTeamId}/uploads/${visualId}.${ext}`
        const contentType = file.type
          || (mediaType === 'document' ? 'application/pdf' : mediaType === 'video' ? 'video/mp4' : 'image/jpeg')

        const { error: upErr } = await supabase.storage.from('visuals').upload(path, uploadFile, { contentType, upsert: false })
        if (upErr) { console.error('[media-upload]', upErr); alert(`Upload ${file.name}: ${upErr.message}`); continue }
        const { error: insErr } = await supabase.from('visuals').insert({
          id: visualId,
          user_id: session.user.id,
          team_id: activeTeamId,
          brand_voice_id: activeBrandVoice.id,
          prompt: file.name,
          resolved_prompt: file.name,
          aspect_ratio: '1:1',
          model: 'upload',
          storage_path: path,
          media_type: mediaType,
          original_filename: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
        })
        if (insErr) console.error('[media-insert]', insErr)
      }
      loadItems()
    } finally {
      setUploading(false)
    }
  }

  async function downloadItem(v) {
    try {
      const { data: blob } = await supabase.storage.from('visuals').download(v.storage_path)
      if (!blob) return
      const ext = (v.storage_path.split('.').pop() || 'bin').toLowerCase()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = v.original_filename || `media-${v.id}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) { alert('Download fehlgeschlagen: ' + e.message) }
  }

  async function archiveItem(id) {
    if (!confirm('Datei aus der Bibliothek entfernen?')) return
    await supabase.from('visuals').update({ is_archived: true }).eq('id', id)
    setItems(prev => prev.filter(x => x.id !== id))
    setLightbox(null)
  }

  // ─── "Zu Beitrag hinzufügen" ──────────────────────────────────────────────
  async function openAttachModal(v) {
    setAttachModal(v); setAttachConfirm(''); setAttachLoading(true); setLightbox(null)
    let q = supabase.from('content_posts')
      .select('id, title, content, status, scheduled_at, visual_id, brand_voice_id, created_at')
      .neq('status', 'published')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at',   { ascending: false })
      .limit(80)
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    else if (v?.brand_voice_id)  q = q.eq('brand_voice_id', v.brand_voice_id)
    const { data } = await q
    setAttachPosts(data || []); setAttachLoading(false)
  }

  async function attachMediaToPost(post) {
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
    // Cover setzen wenn Post noch keines hat
    if (!post.visual_id) {
      await supabase.from('content_posts').update({ visual_id: attachModal.id }).eq('id', post.id)
    }
    setAttachConfirm(`${labelType(attachModal)} zugeordnet — zurück zum Beitrag…`)
    setAttachPosts(prev => prev.map(p => p.id === post.id ? { ...p, visual_id: p.visual_id || attachModal.id } : p))
    setTimeout(() => {
      setAttachModal(null); setAttachConfirm('')
      navigate('/redaktionsplan?open=' + post.id)
    }, 1100)
  }

  async function createPostWithMedia(v) {
    if (!v?.id) return
    if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice'); return }
    if (!activeTeamId)         { alert('Kein Team aktiv'); return }
    const title = (v.original_filename || 'Neuer Beitrag mit Medium').replace(/\.[^.]+$/, '').slice(0, 80)
    const { data: post, error } = await supabase.from('content_posts').insert({
      user_id: session?.user?.id,
      team_id: activeTeamId,
      brand_voice_id: activeBrandVoice.id,
      title,
      content: '',
      platform: 'linkedin',
      status: 'idee',
      workspace: 'personal',
      visual_id: v.id,
    }).select().single()
    if (error) { alert('Erstellen fehlgeschlagen: ' + error.message); return }
    await supabase.from('content_post_visuals').insert({
      post_id: post.id, visual_id: v.id, team_id: activeTeamId, position: 0, created_by: session?.user?.id,
    })
    setAttachConfirm('Neuer Beitrag angelegt — gleich gehts zum Redaktionsplan…')
    setTimeout(() => { setAttachModal(null); setAttachConfirm(''); navigate('/redaktionsplan?open=' + post.id) }, 1100)
  }

  function labelType(v) {
    return v?.media_type === 'video' ? 'Video' : v?.media_type === 'document' ? 'PDF' : 'Bild'
  }

  const filteredAttachPosts = (attachPosts || []).filter(p => {
    if (!attachSearch.trim()) return true
    const s = attachSearch.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  return (
    <div style={{ width:'100%', maxWidth:1200, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom:22 }}>
        <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:6 }}>Content · Medien</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Medien.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
          Alle Medien dieser Brand an einem Ort — Uploads (Bilder, Videos, PDFs) und KI-generierte Visuals.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Suche nach Dateiname…"
          style={{ flex:'1 1 240px', minWidth:200, padding:'8px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', outline:'none' }}/>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
          <option value="all">Alle Medien</option>
          <option value="identity">Visuelle Identität</option>
          <option value="generated">Generiert</option>
          <option value="upload">Uploads</option>
          <option value="video">Videos</option>
          <option value="document">PDFs</option>
        </select>

        <div style={{ flex:1 }}/>
        <button className="lk-btn lk-btn-primary" type="button" onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
          {uploading ? 'Lade hoch…' : 'Datei hochladen'}
        </button>
        <input ref={fileInputRef} type="file" multiple
          accept=".png,.jpg,.jpeg,.webp,.svg,.mp4,.mov,.webm,.avi,.pdf,image/*,video/*,application/pdf"
          onChange={e => {
            const files = Array.from(e.target.files || [])
            e.target.value = ''
            uploadFiles(files)
          }}
          style={{ position:'absolute', left:'-9999px', width:1, height:1, opacity:0, pointerEvents:'none' }}/>
      </div>

      {/* Grid */}
      {loading && <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)' }}>Lade…</div>}
      {!loading && items.length === 0 && (
        <div style={{ padding:'60px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)' }}>
          <div style={{ fontSize:48, marginBottom:14 }}>📁</div>
          <h2 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:'0 0 6px' }}>Noch keine Medien</h2>
          <p style={{ fontSize:13, margin:0, lineHeight:1.5 }}>Lade Bilder, Videos oder PDFs hoch — sie stehen dann im Redaktionsplan und in der Content-Werkstatt als Referenzen zur Verfügung.</p>
        </div>
      )}
      {!loading && items.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
          {items.map(v => (
            <div key={v.id} onClick={() => setLightbox(v)}
              style={{ position:'relative', borderRadius:10, overflow:'hidden', background:'var(--surface)', border:'1px solid var(--border)', cursor:'pointer', aspectRatio:'1/1' }}>
              {v.media_type === 'image' && v.signed_url && (
                <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              )}
              {v.media_type === 'video' && (
                <div style={{ position:'relative', width:'100%', height:'100%', background:'#000' }}>
                  {v.signed_url && <video src={v.signed_url} muted preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                    <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid rgba(255,255,255,0.95)' }}>
                      <span style={{ fontSize:20, color:'#fff', marginLeft:2 }}>▶</span>
                    </div>
                  </div>
                </div>
              )}
              {v.media_type === 'document' && (
                <div style={{ width:'100%', height:'100%', background:'linear-gradient(180deg, #F8FAFC 0%, #E5E7EB 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:10 }}>
                  <div style={{ fontSize:32 }}>📄</div>
                  <div style={{ fontSize:9, fontWeight:600, color:'rgb(20,20,43)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%', lineHeight:1.2 }}>
                    {v.original_filename || 'PDF'}
                  </div>
                </div>
              )}
              <div style={{ position:'absolute', top:6, left:6, padding:'2px 6px', background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:9, fontWeight:700, borderRadius:4, textTransform:'uppercase' }}>
                {v.media_type === 'video' ? 'Video' : v.media_type === 'document' ? 'PDF' : 'Bild'}
              </div>
              {v.identity ? (
                <div style={{ position:'absolute', top:6, right:6, padding:'2px 7px', background:'rgba(217,119,6,0.95)', color:'#fff', fontSize:9, fontWeight:700, borderRadius:5, textTransform:'uppercase' }}>
                  Identität
                </div>
              ) : v.model !== 'upload' ? (
                <div style={{ position:'absolute', top:6, right:6, padding:'2px 7px', background:'rgba(10,111,176,0.92)', color:'#fff', fontSize:9, fontWeight:700, borderRadius:5, textTransform:'uppercase' }}>
                  Generiert
                </div>
              ) : null}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'6px 8px', background:'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)', color:'#fff', fontSize:10, lineHeight:1.3, maxHeight:34, overflow:'hidden' }}>
                {v.original_filename || v.prompt}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:14, maxWidth:'min(95vw, 900px)', maxHeight:'95vh', overflow:'auto', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lightbox.original_filename || lightbox.prompt}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {labelType(lightbox)} · {lightbox.file_size_bytes ? (lightbox.file_size_bytes / 1024 / 1024).toFixed(1) + ' MB' : ''}
                </div>
              </div>
              {!lightbox.identity && (
                <button className="lk-btn lk-btn-cta" onClick={() => openAttachModal(lightbox)}
                  style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  📅 Zu Beitrag hinzufügen
                </button>
              )}
              <button className="lk-btn lk-btn-ghost" onClick={() => downloadItem(lightbox)} >⬇ Download</button>
              {lightbox.media_type === 'document' && (
                <button className="lk-btn lk-btn-ghost" onClick={() => window.open(lightbox.signed_url, '_blank', 'noopener')} >Öffnen</button>
              )}
              {!lightbox.identity && (
                <button onClick={() => archiveItem(lightbox.id)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#b91c1c', cursor:'pointer', fontSize:12, fontWeight:600 }}>Entfernen</button>
              )}
              <button onClick={() => setLightbox(null)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>
            {lightbox.media_type === 'image' && lightbox.signed_url && (
              <img src={lightbox.signed_url} alt={lightbox.prompt} style={{ maxWidth:'100%', maxHeight:'70vh', display:'block', margin:'0 auto' }}/>
            )}
            {lightbox.media_type === 'video' && lightbox.signed_url && (
              <video src={lightbox.signed_url} controls autoPlay style={{ maxWidth:'100%', maxHeight:'70vh', display:'block', margin:'0 auto', background:'#000' }}/>
            )}
            {lightbox.media_type === 'document' && (
              <div style={{ padding:'40px 24px', textAlign:'center' }}>
                <div style={{ fontSize:64, marginBottom:14 }}>📄</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>{lightbox.original_filename}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                  PDF{lightbox.file_size_bytes ? ` · ${(lightbox.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attach-Modal: "Zu Beitrag hinzufügen" */}
      {attachModal && (
        <div onClick={e => e.target === e.currentTarget && setAttachModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:1100 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:720, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, margin:0 }}>{labelType(attachModal)} zu Beitrag hinzufügen</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>
                  Wähle einen Beitrag — das Medium wird als Carousel-Slide oder Anhang zugeordnet.
                </p>
              </div>
              <button onClick={() => setAttachModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>

            {/* Preview */}
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, padding:'10px 12px', background:'#F8FAFC', borderRadius:10, flexShrink:0 }}>
              <div style={{ width:48, height:48, borderRadius:6, overflow:'hidden', background:'#000', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {attachModal.media_type === 'image' && attachModal.signed_url && (
                  <img src={attachModal.signed_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                )}
                {attachModal.media_type === 'video' && (
                  <span style={{ color:'#fff', fontSize:18 }}>▶</span>
                )}
                {attachModal.media_type === 'document' && (
                  <span style={{ fontSize:22 }}>📄</span>
                )}
              </div>
              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:2 }}>{labelType(attachModal)}</div>
                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachModal.original_filename || attachModal.prompt}</div>
              </div>
            </div>

            {/* Neuer Beitrag mit Medium */}
            <button onClick={() => createPostWithMedia(attachModal)}
              style={{ width:'100%', padding:'12px 14px', marginBottom:10, borderRadius:10, border:'1.5px dashed ' + P, background:'rgba(10,111,176,0.04)', color: P, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8, justifyContent:'center', flexShrink:0 }}>
              ✨ Neuen Beitrag mit diesem {labelType(attachModal)} anlegen
            </button>

            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexShrink:0 }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }}/>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>oder zu bestehendem Beitrag</span>
              <div style={{ flex:1, height:1, background:'var(--border)' }}/>
            </div>

            <input type="text" value={attachSearch} onChange={e => setAttachSearch(e.target.value)}
              placeholder="Beitrag suchen…"
              style={{ padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10, flexShrink:0 }}/>

            {attachConfirm && (
              <div style={{ marginBottom:10, padding:'10px 14px', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:9, color:'#065F46', fontSize:13, fontWeight:600, flexShrink:0 }}>{attachConfirm}</div>
            )}

            <div style={{ overflowY:'auto', flex:1, minHeight:0 }}>
              {attachLoading && <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)' }}>Lade Beiträge…</div>}
              {!attachLoading && filteredAttachPosts.length === 0 && (
                <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13, background:'#F8FAFC', borderRadius:10 }}>
                  {attachSearch.trim() ? 'Keine Beiträge mit diesem Suchbegriff.' : 'Keine offenen Beiträge. Erstelle einen Beitrag im Redaktionsplan.'}
                </div>
              )}
              {!attachLoading && filteredAttachPosts.map(p => {
                const statusLabels = { idee:'Idee', draft:'Entwurf', in_review:'Review', approved:'Approved', scheduled:'Eingeplant', failed:'Fehler' }
                const hasOther = p.visual_id && p.visual_id !== attachModal.id
                return (
                  <button key={p.id} onClick={() => attachMediaToPost(p)}
                    style={{ width:'100%', textAlign:'left', padding:'12px 14px', marginBottom:8, borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', display:'flex', gap:12, alignItems:'flex-start' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = P}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', padding:'2px 8px', background:'#F1F5F9', borderRadius:6 }}>{statusLabels[p.status] || p.status}</span>
                        {p.scheduled_at && (
                          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                            {new Date(p.scheduled_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </span>
                        )}
                        {hasOther && (
                          <span style={{ fontSize:10, color:'#0891B2', background:'#CFFAFE', padding:'2px 6px', borderRadius:5, fontWeight:600 }} title="Wird als zusätzliches Carousel-Element hinzugefügt">hat schon Medium</span>
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
              <button className="lk-btn lk-btn-ghost" onClick={() => setAttachModal(null)}
                >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
