// src/pages/Media.jsx
// Medien-Bibliothek: alle eigenen Uploads (Bilder, Videos, PDFs) zentral.
// Unterscheidet sich von /visuals (das nur AI-generierte Bilder zeigt).

import React, { useState, useEffect, useRef } from 'react'
import { User, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resizeImageBeforeUpload } from '../lib/imageResize'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

const P = 'var(--wl-primary, rgb(49,90,231))'

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

  // BV-Multi-Picker (wie im Redaktionsplan)
  const [availableBVs, setAvailableBVs]   = useState([])
  const [selectedBVIds, setSelectedBVIds] = useState([])
  const [bvPickerOpen, setBvPickerOpen]   = useState(false)

  // Attach-Modal (wie in Visuals)
  const [attachModal, setAttachModal] = useState(null)  // visual-object des zu verknüpfenden Mediums
  const [attachPosts, setAttachPosts] = useState([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')
  const [attachConfirm, setAttachConfirm] = useState('')

  // Verfügbare BVs laden
  useEffect(() => {
    if (!session?.user?.id || !activeTeamId) return
    supabase.from('brand_voices')
      .select('id, name')
      .order('updated_at', { ascending: false })
      .then(({ data }) => setAvailableBVs(data || []))
  }, [session?.user?.id, activeTeamId])

  // Bei BV-Wechsel: Selection zurücksetzen
  useEffect(() => {
    if (activeBrandVoice?.id) setSelectedBVIds([activeBrandVoice.id])
  }, [activeBrandVoice?.id])

  async function loadItems() {
    setLoading(true)
    let q = supabase.from('visuals').select('*')
      .eq('team_id', activeTeamId)
      .eq('is_archived', false)
      .eq('model', 'upload')
      .order('created_at', { ascending: false })
      .limit(120)
    if (selectedBVIds.length > 0) q = q.in('brand_voice_id', selectedBVIds)
    if (typeFilter !== 'all') q = q.eq('media_type', typeFilter)
    if (search.trim()) q = q.ilike('prompt', '%' + search.trim() + '%')
    const { data } = await q
    const bvNameMap = Object.fromEntries((availableBVs || []).map(b => [b.id, b.name]))
    const withUrls = await Promise.all((data || []).map(async (v) => {
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl || null, bv_name: bvNameMap[v.brand_voice_id] || null }
    }))
    setItems(withUrls); setLoading(false)
  }
  useEffect(() => { if (activeTeamId && selectedBVIds.length > 0) loadItems() }, [activeTeamId, selectedBVIds.join(','), typeFilter, search, availableBVs.length])

  const showBVBadges = selectedBVIds.length > 1

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
    // Bei Multi-BV: alle ausgewählten BVs, sonst nur die BV des Mediums
    if (selectedBVIds.length > 0) q = q.in('brand_voice_id', selectedBVIds)
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
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Medien</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Medien.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
          Eigene Uploads (Bilder, Videos, PDFs) — werden in Beiträgen als Carousel-Slides oder als Anhang verwendet.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Suche nach Dateiname…"
          style={{ flex:'1 1 240px', minWidth:200, padding:'8px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', outline:'none' }}/>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
          <option value="all">Alle Typen</option>
          <option value="image">Bilder</option>
          <option value="video">▶ Videos</option>
          <option value="document">Dokumente</option>
        </select>

        {/* BV-Multi-Picker (gleicher Style wie im Redaktionsplan) */}
        <div style={{ position:'relative' }}>
          <button onClick={() => setBvPickerOpen(o => !o)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <span><User size={14} strokeWidth={1.75}/></span>
            <span>
              {selectedBVIds.length === 0 ? 'Keine BV' :
               selectedBVIds.length === 1 ? (availableBVs.find(b => b.id === selectedBVIds[0])?.name || 'BV').slice(0, 24) :
               selectedBVIds.length + ' Brand Voices'}
            </span>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>▼</span>
          </button>
          {bvPickerOpen && (
            <>
              <div onClick={() => setBvPickerOpen(false)} style={{ position:'fixed', inset:0, zIndex:90 }}/>
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:260, maxWidth:340, maxHeight:360, overflowY:'auto', padding:6 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', padding:'8px 10px 4px' }}>Brand Voices anzeigen</div>
                {availableBVs.map(b => {
                  const checked = selectedBVIds.includes(b.id)
                  return (
                    <label key={b.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:7, cursor:'pointer', fontSize:13, color:'var(--text-primary)' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        setSelectedBVIds(prev => prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id])
                      }} style={{ cursor:'pointer' }}/>
                      <span style={{ flex:1 }}>{b.name}</span>
                    </label>
                  )
                })}
                {availableBVs.length === 0 && (
                  <div style={{ padding:12, fontSize:12, color:'var(--text-muted)' }}>Keine Brand Voices verfügbar.</div>
                )}
                <div style={{ display:'flex', gap:6, borderTop:'1px solid var(--border)', padding:'8px 6px 4px', marginTop:4 }}>
                  <button onClick={() => setSelectedBVIds(availableBVs.map(b => b.id))}
                    style={{ flex:1, padding:'5px 8px', fontSize:11, fontWeight:600, border:'1px solid var(--border)', borderRadius:6, background:'#fff', cursor:'pointer', color:'var(--text-primary)' }}>Alle</button>
                  <button onClick={() => setSelectedBVIds(activeBrandVoice?.id ? [activeBrandVoice.id] : [])}
                    style={{ flex:1, padding:'5px 8px', fontSize:11, fontWeight:600, border:'1px solid var(--border)', borderRadius:6, background:'#fff', cursor:'pointer', color:'var(--text-primary)' }}>Nur aktive</button>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ flex:1 }}/>
        <button type="button" onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ padding:'9px 16px', borderRadius:9, border:'none', background: uploading ? '#94A3B8' : P, color:'#fff', fontSize:13, fontWeight:700, cursor: uploading ? 'wait' : 'pointer', display:'inline-flex', alignItems:'center', gap:5, boxShadow: uploading ? 'none' : '0 2px 10px rgba(49,90,231,.18)' }}>
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
          <p style={{ fontSize:13, margin:0, lineHeight:1.5 }}>Lade Bilder, Videos oder PDFs hoch — sie stehen dann im Redaktionsplan und in der Text-Werkstatt als Referenzen zur Verfügung.</p>
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
              {showBVBadges && v.bv_name && (
                <div style={{ position:'absolute', top:6, right:6, padding:'2px 7px', background:'rgba(255,255,255,0.92)', color:'var(--text-primary)', fontSize:10, fontWeight:600, borderRadius:5, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {v.bv_name}
                </div>
              )}
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
              <button onClick={() => openAttachModal(lightbox)}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background: P, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, boxShadow:'0 2px 6px rgba(49,90,231,.25)' }}>
                📅 Zu Beitrag hinzufügen
              </button>
              <button onClick={() => downloadItem(lightbox)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>⬇ Download</button>
              {lightbox.media_type === 'document' && (
                <button onClick={() => window.open(lightbox.signed_url, '_blank', 'noopener')} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>Öffnen</button>
              )}
              <button onClick={() => archiveItem(lightbox.id)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#b91c1c', cursor:'pointer', fontSize:12, fontWeight:600 }}>Entfernen</button>
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
              style={{ width:'100%', padding:'12px 14px', marginBottom:10, borderRadius:10, border:'1.5px dashed ' + P, background:'rgba(49,90,231,0.04)', color: P, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8, justifyContent:'center', flexShrink:0 }}>
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
