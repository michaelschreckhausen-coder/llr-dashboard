import React, { useState, useEffect, useCallback } from 'react'
import { useModel } from '../context/ModelContext'
import { useResponsive } from '../hooks/useResponsive'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

// ─── Konstanten ──────────────────────────────────────────────────────────────
const PLATFORMS = {
  linkedin: { label: 'LinkedIn', color: '#0A66C2', bg: '#EFF6FF', icon: '💼' },
}

const STATUS = {
  idee:      { label: '💡 Idee',           color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', bucket: 'ideen' },
  draft:     { label: '✏️ Entwurf',        color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', bucket: 'in_arbeit' },
  in_review: { label: '👁️ Review',         color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', bucket: 'in_arbeit' },
  approved:  { label: '✅ Freigegeben',    color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', bucket: 'in_arbeit' },
  scheduled: { label: '📅 Geplant',        color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', bucket: 'in_arbeit' },
  published: { label: '🚀 Veröffentlicht', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', bucket: 'veroeffentlicht' },
  analyzed:  { label: '📊 Analysiert',     color: '#7C2D12', bg: '#FEF3C7', border: '#FCD34D', bucket: 'veroeffentlicht' },
  failed:    { label: '⚠️ Fehler',         color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', bucket: 'in_arbeit' },
}

const BUCKETS = [
  { key: 'ideen',           label: '💡 Ideen',          status_default: 'idee',     desc: 'Noch zu entwickeln' },
  { key: 'in_arbeit',       label: '🛠️ In Arbeit',      status_default: 'draft',    desc: 'Entwurf, Review, Geplant' },
  { key: 'veroeffentlicht', label: '🚀 Veröffentlicht', status_default: 'published',desc: 'Live auf LinkedIn' },
]

const WORKSPACES = {
  personal:     { label: '👤 Mein Profil',  desc: 'Für dein LinkedIn-Profil' },
  company:      { label: '🏢 Company Page', desc: 'Team-shared, Unternehmensseite' },
  team_support: { label: '👥 Team-Support', desc: 'Posts wo dich Teammitglieder brauchen' },
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function getCalendarDays(year, month) {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startDow = (first.getDay() + 6) % 7 // Mo=0
  const days = []
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1)
    days.push({ date: d, current: false })
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push({ date: new Date(year, month, i), current: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - last.getDate() - startDow + 1)
    days.push({ date: d, current: false })
  }
  return days
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function relativeDate(d) {
  if (!d) return '—'
  const diff = Math.round((new Date(d) - new Date()) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  if (diff === -1) return 'Gestern'
  if (diff > 0) return `in ${diff}d`
  return `vor ${Math.abs(diff)}d`
}

// ─── Simple Status-Buckets für die UI ─────────────────────────────────────
// DB-Status bleibt unverändert (8 Werte), Anzeige mappt auf 4 simple Buckets.
const STATUS_SIMPLE = {
  idee:      { label: 'Idee',           color: '#64748B', dot: '#94A3B8' },
  draft:     { label: 'Entwurf',        color: '#9A7B0A', dot: '#F59E0B' },
  in_review: { label: 'Entwurf',        color: '#9A7B0A', dot: '#F59E0B' },
  approved:  { label: 'Entwurf',        color: '#9A7B0A', dot: '#F59E0B' },
  scheduled: { label: 'Geplant',        color: '#1d4ed8', dot: '#3B82F6' },
  published: { label: 'Veröffentlicht', color: '#047857', dot: '#10B981' },
  analyzed:  { label: 'Veröffentlicht', color: '#047857', dot: '#10B981' },
  failed:    { label: 'Fehler',         color: '#b91c1c', dot: '#EF4444' },
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, onClick, compact, showBVBadge }) {
  const sts = STATUS_SIMPLE[post.status] || STATUS_SIMPLE.idee
  const hasContent = !!(post.content || '').trim()
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('postId', post.id)}
      onClick={() => onClick(post)}
      style={{
        background:'var(--surface,#fff)',
        borderRadius: compact ? 8 : 12,
        border:'1px solid var(--border,#E5E7EB)',
        padding: compact ? '8px 12px' : '14px 16px',
        cursor:'pointer', transition:'all 0.15s', marginBottom: compact ? 6 : 10,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = 'rgba(49,90,231,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border,#E5E7EB)' }}>
      {/* Status + BV-Badge */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: compact ? 4 : 8 }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background: sts.dot, flexShrink:0 }}/>
        <span style={{ fontSize:11, fontWeight:600, color: sts.color }}>{sts.label}</span>
        {showBVBadge && post.bv_name && (
          <span style={{ marginLeft:'auto', fontSize:10, fontWeight:600, color:'var(--text-muted)', background:'#F1F5F9', padding:'2px 7px', borderRadius:5, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {post.bv_name}
          </span>
        )}
      </div>
      {/* Titel */}
      <div style={{
        fontSize: compact ? 13 : 14, fontWeight:600, color:'rgb(20,20,43)',
        lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis',
        display:'-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient:'vertical',
      }}>{post.title || '(Kein Titel)'}</div>
      {/* Content-Preview (klein, nur wenn vorhanden) */}
      {!compact && hasContent && (
        <div style={{
          fontSize:12, color:'var(--text-muted)', marginTop:6, lineHeight:1.5,
          overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box',
          WebkitLineClamp:2, WebkitBoxOrient:'vertical',
        }}>{post.content}</div>
      )}
      {/* Datum */}
      {!compact && post.scheduled_at && (
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
          {new Date(post.scheduled_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
          {' · '}<span style={{ color: new Date(post.scheduled_at) < new Date() && post.status !== 'published' ? '#ef4444' : 'var(--text-muted)' }}>
            {relativeDate(post.scheduled_at)}
          </span>
        </div>
      )}
      {/* Queue-Status nur wenn aktiv */}
      {!compact && post.publish_queue_status && ['pending','in_progress','failed'].includes(post.publish_queue_status) && (
        <div style={{ fontSize:10, marginTop:6, fontWeight:600, color:
            post.publish_queue_status === 'pending'     ? '#9A7B0A' :
            post.publish_queue_status === 'in_progress' ? '#1d4ed8' :
            '#b91c1c' }}>
          {post.publish_queue_status === 'pending'     && '⏳ Auto-Publish geplant'}
          {post.publish_queue_status === 'in_progress' && '🚀 Wird gepostet…'}
          {post.publish_queue_status === 'failed'      && '⚠️ Auto-Publish fehlgeschlagen'}
        </div>
      )}
    </div>
  )
}

// ─── PostModal ────────────────────────────────────────────────────────────────
function PostModal({ post, onClose, onSave, onDelete, session, activeTeamId, members, workspace, selectedModel, activeBrandVoice, navigate }) {
  const isNew = !post?.id
  const [form, setForm] = useState({
    title: '', content: '', platform: 'linkedin', status: 'idee',
    notes: '', assignee_id: '', reviewer_id: '',
    // brand_voice_id ist NOT NULL in DB — fallback auf aktive BV bei neuen Posts
    brand_voice_id: post?.brand_voice_id || activeBrandVoice?.id || '',
    target_audience_id: '', hook: '', topic: '',
    workspace: workspace,
    team_id: activeTeamId,
    ...post,
    tags: Array.isArray(post?.tags) ? post.tags.join(', ') : (post?.tags || ''),
    scheduled_at: post?.scheduled_at ? post.scheduled_at.slice(0,16) : '',
  })
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [generatingVisual, setGeneratingVisual] = useState(false)
  const [postVisual, setPostVisual] = useState(null)  // signed_url + visual_id wenn schon gesetzt

  // Load post's visual (if any)
  useEffect(() => {
    if (!post?.visual_id) { setPostVisual(null); return }
    supabase.from('visuals').select('*').eq('id', post.visual_id).maybeSingle().then(async ({ data }) => {
      if (!data) return
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(data.storage_path, 60 * 60 * 24)
      setPostVisual({ ...data, signed_url: signed?.signedUrl })
    })
  }, [post?.visual_id])

  async function generateVisualForPost() {
    if (!form.content?.trim() || !activeTeamId) return
    setGeneratingVisual(true)
    try {
      // Use LLM to extract a visual prompt from the post text
      const { data: promptData } = await supabase.functions.invoke('generate', {
        body: { type: 'visual_prompt', prompt: 'Extrahiere aus diesem LinkedIn-Post einen kurzen Visual-Prompt fuer einen Bildgenerator. Beschreibe was visuell zu sehen ist (Personen, Szenerie, Stimmung, Komposition). Max 50 Wörter, kein Vorwort, kein Anfuehrungszeichen, einfach den Prompt:\n\n' + form.content.slice(0, 2000), userId: session.user.id, model: 'claude-sonnet-4-6' }
      })
      const visualPrompt = (promptData?.text || promptData?.result || form.content.slice(0, 200)).trim()

      // Get active brand voice
      const { data: bv } = await supabase.from('brand_voices').select('id').eq('is_active', true).maybeSingle()

      // Generate image
      const { data: imgData, error: imgErr } = await supabase.functions.invoke('generate-image', {
        body: { prompt: visualPrompt, aspectRatio: '1:1', variants: 1, brandVoiceId: bv?.id, postId: post?.id || null }
      })
      if (imgErr) throw imgErr
      const v = imgData?.visuals?.[0]
      if (v) {
        // Update post with visual_id (only if post is saved)
        if (post?.id) {
          await supabase.from('content_posts').update({ visual_id: v.id }).eq('id', post.id)
        }
        upd('visual_id', v.id)
        setPostVisual(v)
      }
    } catch (e) {
      console.error('[generateVisualForPost]', e)
      alert('Fehler bei Bild-Generierung: ' + (e.message || 'Unbekannt'))
    } finally {
      setGeneratingVisual(false)
    }
  }

  // Load Comments
  useEffect(() => {
    if (!post?.id) return
    setCommentsLoading(true)
    supabase.from('content_post_comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true }).then(({ data }) => {
      setComments(data || [])
      setCommentsLoading(false)
    })
  }, [post?.id])

  // Kommentar-Mentions: wer in der Comment-Textarea per @ getaggt wurde
  // → wird beim Senden des Kommentars in content_post_mentions persistiert
  // (gleiche Tabelle wie Post-Mentions, damit CRM/Aufgaben-Sicht alles auf einmal sieht)
  const [commentMentions, setCommentMentions] = useState([])
  const [commentMentionPickerOpen, setCommentMentionPickerOpen] = useState(false)

  function addCommentMention(member) {
    if (commentMentions.some(x => x.user_id === member.user_id)) {
      setCommentMentionPickerOpen(false); return
    }
    const label = memberLabel(member)
    setCommentMentions(prev => [...prev, { user_id: member.user_id, label }])
    const insert = '@' + label.replace(/\s+/g, '')
    const sep = (newComment || '').endsWith(' ') || !newComment ? '' : ' '
    setNewComment((newComment || '') + sep + insert + ' ')
    setCommentMentionPickerOpen(false)
  }

  async function addComment() {
    if (!newComment.trim() || !post?.id) return
    const { data } = await supabase.from('content_post_comments').insert({
      post_id: post.id, user_id: session.user.id, team_id: activeTeamId,
      body: newComment.trim()
    }).select().single()
    if (data) { setComments(p => [...p, data]); setNewComment('') }
    // Aus dem Kommentar getaggte User auch in content_post_mentions persistieren
    // (Idempotent dank Unique-Constraint auf post_id+user_id)
    if (commentMentions.length) {
      const rows = commentMentions
        .filter(cm => !originalMentionUserIds.includes(cm.user_id) && !mentions.some(m => m.user_id === cm.user_id))
        .map(cm => ({ post_id: post.id, user_id: cm.user_id, team_id: activeTeamId, created_by: session.user.id }))
      if (rows.length) {
        const { error } = await supabase.from('content_post_mentions').insert(rows)
        if (!error) {
          // Lokale Mentions-Liste mitnachziehen, damit sie als zugeordnete Team-Mitglieder erscheinen
          setMentions(prev => [...prev, ...commentMentions.filter(cm => !prev.some(p => p.user_id === cm.user_id))])
          setOriginalMentionUserIds(ids => [...ids, ...rows.map(r => r.user_id)])
        }
      }
      setCommentMentions([])
    }
  }

  const [saving, setSaving] = useState(false)
  const [improving, setImproving] = useState(false)
  const [charCount, setCharCount] = useState(form.content?.length || 0)
  // LinkedIn-Vorschau hinter Toggle + BV-Daten (kein hardcoded "Michael Schreck")
  const [showPreview, setShowPreview] = useState(false)
  const [previewBV, setPreviewBV] = useState(null)
  // BV-Profil laden basierend auf form.brand_voice_id (für LinkedIn-Vorschau)
  useEffect(() => {
    if (!form.brand_voice_id) { setPreviewBV(null); return }
    supabase.from('brand_voices')
      .select('id, name, linkedin_display_name, linkedin_avatar_url, linkedin_url, linkedin_member_id')
      .eq('id', form.brand_voice_id).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('[preview-bv]', error)
        setPreviewBV(data || null)
      })
  }, [form.brand_voice_id])

  // ─── Mentions (@-Erwähnungen von Team-Membern) ──────────────────────────
  // Lokale UI-Liste; wird beim Save in content_post_mentions gesynct.
  // Shape: [{ user_id, label }]
  const [mentions, setMentions] = useState([])
  const [originalMentionUserIds, setOriginalMentionUserIds] = useState([])  // beim Load gesetzt
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false)

  // Mention-Member-Liste: ALLE Team-Member inkl. self
  const mentionableMembers = members || []
  function memberLabel(m) {
    // TeamContext liefert m.profile = { full_name, email, avatar_url }
    return m.profile?.full_name?.trim()
      || m.profile?.email
      || m.email
      || m.user_id?.slice(0, 8)
      || '?'
  }
  function memberAvatarUrl(m) {
    return m.profile?.avatar_url || null
  }
  function memberInitials(m) {
    const label = memberLabel(m)
    return label.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  }

  // Load existing mentions wenn Post bekannt ist
  useEffect(() => {
    if (!post?.id) { setMentions([]); setOriginalMentionUserIds([]); return }
    ;(async () => {
      const { data } = await supabase.from('content_post_mentions')
        .select('user_id')
        .eq('post_id', post.id)
      const ids = (data || []).map(r => r.user_id)
      setOriginalMentionUserIds(ids)
      // Zugehörige Labels aus members-Liste
      const list = ids.map(uid => {
        const m = (members || []).find(x => x.user_id === uid)
        return { user_id: uid, label: m ? memberLabel(m) : uid.slice(0, 8) }
      })
      setMentions(list)
    })()
  }, [post?.id, members?.length])

  function addMention(member) {
    if (mentions.some(x => x.user_id === member.user_id)) return
    const label = memberLabel(member)
    setMentions(prev => [...prev, { user_id: member.user_id, label }])
    // Im Textfeld @Name anfügen
    const insert = '@' + label.replace(/\s+/g, '')
    const sep = (form.content || '').endsWith(' ') || !form.content ? '' : ' '
    upd('content', (form.content || '') + sep + insert + ' ')
    setMentionPickerOpen(false)
  }
  function removeMention(userId) {
    setMentions(prev => prev.filter(x => x.user_id !== userId))
  }

  // Helper: Post speichern (falls neu/dirty) → Navigate zu Textwerkstatt
  // mode: 'auto' | 'improve' — mode-Param wird in der URL übergeben
  async function jumpToTextStudio(mode = 'auto') {
    let postId = post?.id
    if (!postId) {
      if (!form.title?.trim()) { alert('Titel zuerst ausfüllen.'); return }
      setSaving(true)
      const { data: newPost, error } = await supabase.from('content_posts').insert({
        user_id: session.user.id,
        team_id: form.team_id || activeTeamId,
        workspace: form.workspace || workspace,
        brand_voice_id: form.brand_voice_id || activeBrandVoice?.id || null,
        title: form.title.trim(),
        content: form.content || '',
        platform: 'linkedin',
        status: form.status || 'idee',
      }).select().single()
      setSaving(false)
      if (error) { alert('Speichern fehlgeschlagen: ' + error.message); return }
      postId = newPost.id
      if (onSave) onSave(newPost)
    } else if (form.content !== post.content || form.title !== post.title) {
      await supabase.from('content_posts').update({
        title: form.title, content: form.content,
      }).eq('id', postId)
    }
    const params = new URLSearchParams({ post_id: postId })
    if (mode === 'improve') params.set('mode', 'improve')
    if (navigate) navigate('/content-studio?' + params.toString())
    onClose()
  }

  // Mention-Sync nach Save: Diff zwischen original und current Mentions
  async function syncMentions(postId) {
    if (!postId) return
    const currentIds = mentions.map(m => m.user_id)
    const toAdd    = currentIds.filter(uid => !originalMentionUserIds.includes(uid))
    const toRemove = originalMentionUserIds.filter(uid => !currentIds.includes(uid))
    if (toAdd.length) {
      const rows = toAdd.map(uid => ({
        post_id: postId, user_id: uid, team_id: activeTeamId, created_by: session.user.id,
      }))
      const { error } = await supabase.from('content_post_mentions').insert(rows)
      if (error) console.warn('[mention-insert]', error)
    }
    if (toRemove.length) {
      const { error } = await supabase.from('content_post_mentions')
        .delete()
        .eq('post_id', postId)
        .in('user_id', toRemove)
      if (error) console.warn('[mention-delete]', error)
    }
    setOriginalMentionUserIds(currentIds)
  }

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const plt = PLATFORMS[form.platform] || PLATFORMS.linkedin

  const CHAR_LIMITS = { linkedin: 3000 }
  const limit = CHAR_LIMITS[form.platform]

  async function save() {
    setSaving(true)
    const user = session.user
    const payload = {
      ...form,
      user_id: user.id,
      team_id: form.team_id || activeTeamId,
      workspace: form.workspace || workspace,
      tags: typeof form.tags === 'string' ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : (form.tags || []),
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    }
    delete payload.id
    // Embed-Felder die nur im UI sind raus
    delete payload.post_publish_queue
    delete payload.publish_queue_status
    delete payload.publish_queue_error
    delete payload.publish_queue_attempts
    delete payload.bv_name
    // Empty-String FK-Felder zu null konvertieren (sonst FK-violation)
    if (!payload.assignee_id)          payload.assignee_id = null
    if (!payload.reviewer_id)          payload.reviewer_id = null
    if (!payload.brand_voice_id)       payload.brand_voice_id = activeBrandVoice?.id || null
    if (!payload.target_audience_id)   payload.target_audience_id = null
    if (!payload.lead_id)              payload.lead_id = null
    if (!payload.parent_idea_id)       payload.parent_idea_id = null
    if (!payload.visual_id)            payload.visual_id = null
    // brand_voice_id ist NOT NULL — Hard-Stopp
    if (!payload.brand_voice_id) {
      setSaving(false)
      alert('Keine aktive Brand Voice. Bitte oben rechts eine Brand Voice auswählen.')
      return
    }
    if (!payload.team_id) {
      setSaving(false)
      alert('Kein aktives Team — bitte einloggen / Team-Setup prüfen.')
      return
    }
    let result
    if (isNew) {
      result = await supabase.from('content_posts').insert(payload).select().single()
    } else {
      result = await supabase.from('content_posts').update(payload).eq('id', post.id).select().single()
    }
    setSaving(false)
    if (result.error) {
      console.error('[postmodal-save]', result.error, payload)
      alert('Speichern fehlgeschlagen: ' + result.error.message)
      return
    }
    // Mentions in content_post_mentions syncen
    await syncMentions(result.data.id)
    onSave(result.data)
  }

  const pltOptions = Object.entries(PLATFORMS)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--surface)', borderRadius:20, width:'100%', maxWidth:920, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 0', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22 }}>{plt.icon}</span>
          <div style={{ flex:1 }}>
            <input value={form.title} onChange={e => upd('title', e.target.value)}
              placeholder="Titel / Thema des Beitrags…"
              style={{ width:'100%', border:'none', outline:'none', fontSize:18, fontWeight:700, color:'rgb(20,20,43)', background:'transparent' }}/>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>

          {/* Left — Content */}
          <div>
            {/* Platform Pills (nur sichtbar bei mehr als 1 Platform) */}
            {pltOptions.length > 1 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                {pltOptions.map(([k, v]) => (
                  <button key={k} onClick={() => upd('platform', k)}
                    style={{ padding:'5px 12px', borderRadius:99, border:`1.5px solid ${form.platform===k?v.color:'#E5E7EB'}`,
                      background: form.platform===k ? v.bg : '#fff', color: form.platform===k ? v.color : '#64748B',
                      fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ position:'relative' }}>
              <textarea value={form.content}
                onChange={e => { upd('content', e.target.value); setCharCount(e.target.value.length) }}
                placeholder={(form.content?.trim() ? '' : `${plt.icon} Schreibe deinen ${plt.label}-Beitrag hier…\n\nTipps:\n• Starte mit einem starken Hook\n• Nutze Zeilenumbrüche für Lesbarkeit\n• Füge einen Call-to-Action ein`)}
                rows={12}
                style={{ width:'100%', padding:'14px', paddingTop: form.content?.trim() ? 48 : 14, borderRadius:12, border:'1.5px solid #E5E7EB',
                  fontSize:14, lineHeight:1.7, resize:'vertical', outline:'none', boxSizing:'border-box',
                  fontFamily:'inherit', color:'rgb(20,20,43)', transition:'border 0.15s' }}
                onFocus={e => e.target.style.borderColor = plt.color}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'}/>

              {/* Inline Textwerkstatt-Buttons */}
              {!form.content?.trim() ? (
                /* Empty-State: prominenter zentrierter Button als Overlay-Card */
                <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding:'14px 18px', background:'rgba(255,255,255,0.92)', borderRadius:14, boxShadow:'0 4px 18px rgba(15,23,42,0.06)', maxWidth:'88%' }}>
                  <button type="button" onClick={() => jumpToTextStudio('auto')}
                    style={{ pointerEvents:'auto', padding:'10px 18px', borderRadius:9, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, boxShadow:'0 2px 10px rgba(49,90,231,.25)', whiteSpace:'nowrap' }}>
                    ✨ In Textwerkstatt schreiben →
                  </button>
                  <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', lineHeight:1.4 }}>
                    oder direkt hier tippen
                  </div>
                </div>
              ) : (
                /* Has-Text: kleine Pill-Toolbar oben rechts im Textfeld */
                <div style={{ position:'absolute', top:8, right:10, display:'flex', gap:6, zIndex:2 }}>
                  <button type="button" onClick={() => jumpToTextStudio('improve')}
                    title="Text in der Textwerkstatt verbessern"
                    style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid rgba(49,90,231,0.25)', background:'rgba(49,90,231,0.06)', color:'var(--wl-primary, rgb(49,90,231))', fontSize:11, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
                    🪄 Text verbessern
                  </button>
                  <button type="button" onClick={() => jumpToTextStudio('auto')}
                    title="In der Textwerkstatt öffnen"
                    style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                    ✨ Textwerkstatt
                  </button>
                </div>
              )}
              <div style={{ position:'absolute', bottom:8, right:10, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                {/* Fortschrittsbalken */}
                {charCount > 0 && (() => {
                  const pct = Math.min(charCount / limit * 100, 100)
                  const ideal = charCount >= 800 && charCount <= 1500
                  const tooShort = charCount < 300
                  const tooLong = charCount > 2200
                  const color = tooLong ? '#ef4444' : ideal ? '#22c55e' : '#f59e0b'
                  return (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                      <div style={{ width:80, height:4, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:99, transition:'width 0.2s,background 0.2s' }}/>
                      </div>
                      <div style={{ fontSize:10, fontWeight:700, color }}>
                        {tooShort ? '⚡ Zu kurz' : tooLong ? '✂️ Zu lang' : ideal ? '✅ Ideal' : '👍 OK'} · {charCount.toLocaleString()}
                      </div>
                    </div>
                  )
                })()}
                {charCount === 0 && <div style={{ fontSize:10, color:'#CBD5E1' }}>0 / 3.000</div>}
              </div>
            </div>

            {/* Visual — minimaler Anzeige- + Wechsel-Bereich, Generierung passiert in /visuals */}
            <div style={{ marginTop:18 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Bild zum Post</label>
              {postVisual ? (
                <div style={{ position:'relative', borderRadius:10, overflow:'hidden', border:'1px solid var(--border)' }}>
                  <img src={postVisual.signed_url} alt={postVisual.prompt} style={{ width:'100%', display:'block' }}/>
                  <div style={{ padding:'8px 10px', background:'#F8FAFC', fontSize:11, borderTop:'1px solid var(--border)', display:'flex', gap:6 }}>
                    <button onClick={() => { if (navigate) navigate('/visuals'); onClose() }}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:11 }}>
                      🖼️ In Visuals öffnen
                    </button>
                    <button onClick={() => { upd('visual_id', null); setPostVisual(null); if (post?.id) supabase.from('content_posts').update({ visual_id: null }).eq('id', post.id) }}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:11, color:'#dc2626' }}>
                      Entfernen
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { if (navigate) navigate('/visuals'); onClose() }}
                  style={{ width:'100%', padding:'12px 16px', borderRadius:10, border:'1.5px dashed var(--border)', background:'#FAFAFA', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  🖼️ Bild in Visuals erstellen → zurück zum Beitrag zuordnen
                </button>
              )}
            </div>

          </div>

          {/* Right — Metadaten */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Status — 3 Board-Phasen (Idee / In Arbeit / Veröffentlicht) */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Status</label>
              {(() => {
                // Mapper: DB-Status → Board-Phase
                const bucket = form.status === 'idee' ? 'idee'
                  : ['published','analyzed'].includes(form.status) ? 'published'
                  : 'draft'  // draft, in_review, approved, scheduled, failed → In Arbeit
                const opts = [
                  { value: 'idee',      label: '💡 Idee' },
                  { value: 'draft',     label: '🛠️ In Arbeit' },
                  { value: 'published', label: '🚀 Veröffentlicht' },
                ]
                const cur = opts.find(o => o.value === bucket) || opts[1]
                const borderColor = bucket === 'idee' ? '#E2E8F0' : bucket === 'published' ? '#A7F3D0' : '#FDE68A'
                const bg = bucket === 'idee' ? '#F8FAFC' : bucket === 'published' ? '#ECFDF5' : '#FFFBEB'
                const color = bucket === 'idee' ? '#64748B' : bucket === 'published' ? '#047857' : '#9A7B0A'
                return (
                  <>
                    <select value={bucket} onChange={e => upd('status', e.target.value)}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${borderColor}`, background: bg, color, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}>
                      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {form.status === 'scheduled' && (
                      <div style={{ fontSize:11, color:'#1d4ed8', marginTop:6, lineHeight:1.4 }}>
                        📅 Auto-Publish geplant — wird zum Zeitpunkt automatisch veröffentlicht.
                      </div>
                    )}
                    {form.status === 'failed' && (
                      <div style={{ fontSize:11, color:'#b91c1c', marginTop:6, lineHeight:1.4 }}>
                        ⚠️ Letztes Posten fehlgeschlagen — siehe Console / Edge-Function-Log.
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Geplant für — IMMER sichtbar */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>📅 Geplant für</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={e => upd('scheduled_at', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, outline:'none', boxSizing:'border-box', color:'rgb(20,20,43)' }}/>
            </div>

            {/* Zugeordnete Team-Mitglieder */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>👥 Zugeordnete Team-Mitglieder</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
                {mentions.length === 0 && (
                  <span style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic' }}>Niemand zugeordnet</span>
                )}
                {mentions.map(m => (
                  <span key={m.user_id} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:600, background:'rgba(49,90,231,0.08)', color:'var(--wl-primary, rgb(49,90,231))', border:'1px solid rgba(49,90,231,0.2)' }}>
                    @{m.label}
                    <button type="button" onClick={() => removeMention(m.user_id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', fontSize:11, padding:0, lineHeight:1 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ position:'relative' }}>
                <button type="button" onClick={() => setMentionPickerOpen(o => !o)}
                  disabled={mentionableMembers.length === 0}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, color: mentionableMembers.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: mentionableMembers.length === 0 ? 'not-allowed' : 'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                  {mentionableMembers.length === 0 ? 'Keine Team-Mitglieder verfügbar' : '+ Mitglied zuordnen'}
                </button>
                {mentionPickerOpen && mentionableMembers.length > 0 && (
                  <>
                    <div onClick={() => setMentionPickerOpen(false)} style={{ position:'fixed', inset:0, zIndex:90 }}/>
                    <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:9, boxShadow:'0 10px 30px rgba(0,0,0,.12)', maxHeight:240, overflowY:'auto', padding:5 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', padding:'6px 8px 2px' }}>Team-Mitglied wählen</div>
                      {mentionableMembers.map(m => {
                        const already = mentions.some(x => x.user_id === m.user_id)
                        const avatar = memberAvatarUrl(m)
                        return (
                          <button key={m.user_id} type="button" disabled={already}
                            onClick={() => addMention(m)}
                            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor: already ? 'default' : 'pointer', fontSize:12, color: already ? 'var(--text-muted)' : 'var(--text-primary)', background:'transparent', border:'none', textAlign:'left' }}
                            onMouseEnter={e => { if (!already) e.currentTarget.style.background='#F8FAFC' }}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                            {avatar ? (
                              <img src={avatar} alt={memberLabel(m)} style={{ width:22, height:22, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                            ) : (
                              <span style={{ width:22, height:22, borderRadius:'50%', background:'linear-gradient(135deg, rgb(49,90,231), #8b5cf6)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>{memberInitials(m)}</span>
                            )}
                            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{memberLabel(m)}{m.user_id === session.user.id ? ' (du)' : ''}</span>
                            {already && <span style={{ fontSize:10, color:'#94A3B8' }}>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tags entfernt — Karten waren überladen */}

            {/* Notizen (intern, immer sichtbar) */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>📝 Notizen</label>
              <textarea value={form.notes || ''} onChange={e => upd('notes', e.target.value)}
                placeholder="Recherche-Quellen, Ideen, Anmerkungen…" rows={3}
                style={{ width:'100%', padding:'9px 10px', borderRadius:9, border:'1.5px solid #E5E7EB',
                  fontSize:12, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit',
                  color:'rgb(20,20,43)', background:'#FAFAFA' }}/>
            </div>

            {/* Team-Kommentare — nur für existing posts */}
            {!isNew && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>💬 Team-Kommentare ({comments.length})</label>
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:200, overflowY:'auto', marginBottom:8 }}>
                  {commentsLoading && <div style={{ fontSize:11, color:'var(--text-muted)' }}>Lade…</div>}
                  {!commentsLoading && comments.length === 0 && (
                    <div style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic', padding:'8px 10px', background:'#F8FAFC', borderRadius:7 }}>
                      Noch keine Kommentare. Stell eine Frage ans Team oder bitte um Feedback.
                    </div>
                  )}
                  {comments.map(c => {
                    const author = (members || []).find(m => m.user_id === c.user_id)
                    const authorLabel = author ? memberLabel(author) : (c.user_id?.slice(0,8) || '?')
                    return (
                      <div key={c.id} style={{ padding:'8px 10px', background:'#F8FAFC', borderRadius:7, borderLeft:'3px solid rgba(49,90,231,0.3)' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:3 }}>
                          {authorLabel}
                          {' · '}
                          {new Date(c.created_at).toLocaleString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </div>
                        <div style={{ fontSize:12, color:'rgb(20,20,43)', lineHeight:1.45, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{c.body}</div>
                      </div>
                    )
                  })}
                </div>
                {/* Kommentar-Eingabe mit @-Picker */}
                <div style={{ position:'relative' }}>
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    placeholder="Kommentar ans Team — nutze @ um jemanden zu erwähnen…"
                    rows={2}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #E5E7EB', fontSize:12, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
                  <div style={{ display:'flex', gap:6, marginTop:6, alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ position:'relative' }}>
                      <button type="button" onClick={() => setCommentMentionPickerOpen(o => !o)}
                        disabled={mentionableMembers.length === 0}
                        style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, color: mentionableMembers.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: mentionableMembers.length === 0 ? 'not-allowed' : 'pointer' }}>
                        @ erwähnen
                      </button>
                      {commentMentionPickerOpen && (
                        <>
                          <div onClick={() => setCommentMentionPickerOpen(false)} style={{ position:'fixed', inset:0, zIndex:90 }}/>
                          <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:9, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:220, maxHeight:200, overflowY:'auto', padding:5 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', padding:'6px 8px 2px' }}>Person erwähnen</div>
                            {mentionableMembers.map(m => {
                              const avatar = memberAvatarUrl(m)
                              return (
                                <button key={m.user_id} type="button" onClick={() => addCommentMention(m)}
                                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontSize:12, color:'var(--text-primary)', background:'transparent', border:'none', textAlign:'left' }}
                                  onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                  {avatar ? (
                                    <img src={avatar} alt={memberLabel(m)} style={{ width:20, height:20, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                                  ) : (
                                    <span style={{ width:20, height:20, borderRadius:'50%', background:'linear-gradient(135deg, rgb(49,90,231), #8b5cf6)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>{memberInitials(m)}</span>
                                  )}
                                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{memberLabel(m)}{m.user_id === session.user.id ? ' (du)' : ''}</span>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    <button onClick={addComment} disabled={!newComment.trim()}
                      style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:7, border:'none', background: newComment.trim() ? 'var(--wl-primary, rgb(49,90,231))' : '#CBD5E1', color:'#fff', fontSize:11, fontWeight:700, cursor: newComment.trim() ? 'pointer' : 'not-allowed', whiteSpace:'nowrap' }}>
                      Senden
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Team & Kontext — nur advanced und wenn Team > 1 */}
            {showAdvanced && (members?.length || 0) > 1 && <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>👥 Team & Kontext</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <select value={form.workspace || 'personal'} onChange={e => upd('workspace', e.target.value)}
                  style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:12, background:'#fff', cursor:'pointer' }}>
                  <option value="personal">👤 Mein Profil</option>
                  <option value="company">🏢 Company Page</option>
                  <option value="team_support">👥 Team-Support</option>
                </select>
                <select value={form.assignee_id || ''} onChange={e => upd('assignee_id', e.target.value)}
                  style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:12, background:'#fff', cursor:'pointer' }}>
                  <option value="">Assignee wählen…</option>
                  {(members || []).map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.email || m.user_id}</option>
                  ))}
                </select>
                <select value={form.reviewer_id || ''} onChange={e => upd('reviewer_id', e.target.value)}
                  style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:12, background:'#fff', cursor:'pointer' }}>
                  <option value="">Reviewer wählen…</option>
                  {(members || []).map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.email || m.user_id}</option>
                  ))}
                </select>
              </div>
            </div>}

            {/* LinkedIn-Vorschau hinter Toggle, mit BV-Daten */}
            {form.content && (() => {
              const dispName = previewBV?.linkedin_display_name || previewBV?.name || 'Brand Voice'
              const avatarUrl = previewBV?.linkedin_avatar_url || null
              const headline  = previewBV?.headline || previewBV?.name || ''
              const initials = (dispName || 'BV').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'BV'
              return (
                <div>
                  <button onClick={() => setShowPreview(s => !s)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {showPreview ? '🔼 Vorschau verbergen' : '👁️ LinkedIn-Vorschau anzeigen'}
                  </button>
                  {showPreview && (
                    <div style={{ marginTop:8, border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--surface)' }}>
                      <div style={{ padding:'10px 12px 6px', background:'#F3F2EF', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:10, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.05em' }}>💼 LinkedIn-Vorschau</span>
                      </div>
                      <div style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={dispName} style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                          ) : (
                            <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>{initials}</div>
                          )}
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dispName}</div>
                            {headline && <div style={{ fontSize:11, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{headline}</div>}
                            <div style={{ fontSize:10, color:'#999' }}>
                              {form.scheduled_at ? new Date(form.scheduled_at).toLocaleString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Jetzt'} · 🌐
                            </div>
                          </div>
                          <div style={{ color:'#0A66C2', fontSize:20, fontWeight:300 }}>…</div>
                        </div>
                        <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.65, whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:240, overflow:'auto' }}>
                          {form.content.slice(0,1200)}{form.content.length > 1200 ? '…mehr' : ''}
                        </div>
                        <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', display:'flex', gap:16 }}>
                          {['👍 Gefällt mir','💬 Kommentieren','↗️ Teilen'].map(a => (
                            <span key={a} style={{ fontSize:11, color:'#666', fontWeight:600 }}>{a}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

{/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, alignItems:'center' }}>
          {!isNew && (
            <button onClick={() => { if (window.confirm('Beitrag löschen?')) onDelete(post.id) }}
              style={{ padding:'9px 16px', borderRadius:10, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              🗑 Löschen
            </button>
          )}
          <div style={{ flex:1 }}/>
          {!isNew && (
            <button onClick={async () => {
              const uid = session.user.id
              const { data: dup } = await supabase.from('content_posts').insert({
                ...form,
                id: undefined,
                user_id: uid,
                title: form.title + ' (Kopie)',
                status: 'idee',
                tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean),
                scheduled_at: null,
              }).select().single()
              if (dup) { onSave(dup); }
            }} style={{ padding:'9px 16px', borderRadius:10, border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#1d4ed8', fontSize:13, cursor:'pointer' }}>
              📋 Duplizieren
            </button>
          )}
          {form.content && form.status !== 'published' && (() => {
            const hasSchedule = !!form.scheduled_at
            const future = hasSchedule && new Date(form.scheduled_at) > new Date()
            return (
              <button onClick={async () => {
                if (!post?.id) { alert('Bitte zuerst speichern.'); return }
                if (future) {
                  // Auto-Publish einplanen via Queue
                  if (!window.confirm(`Auto-Publish einplanen für ${new Date(form.scheduled_at).toLocaleString('de-DE')}? Der Worker postet dann automatisch.`)) return
                  setSaving(true)
                  try {
                    // Existierenden pending-Queue-Eintrag (falls vorhanden) ersetzen
                    await supabase.from('post_publish_queue').delete().eq('post_id', post.id).eq('status', 'pending')
                    const { error } = await supabase.from('post_publish_queue').insert({
                      post_id: post.id,
                      team_id: activeTeamId,
                      scheduled_for: new Date(form.scheduled_at).toISOString(),
                      status: 'pending',
                    })
                    if (error) throw error
                    upd('status', 'scheduled')
                    setTimeout(() => save(), 100)
                  } catch (e) {
                    alert('Einplanen fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                  } finally { setSaving(false) }
                  return
                }
                // Sofort posten
                if (!window.confirm('Jetzt sofort auf LinkedIn posten?\n\nText wird über die offizielle LinkedIn-Posts-API veröffentlicht.')) return
                setSaving(true)
                try {
                  const { data, error } = await supabase.functions.invoke('linkedin-publish-post', { body: { post_id: post.id } })
                  if (error) throw error
                  if (data?.error) throw new Error(data.error)
                  if (data?.success && data?.linkedin_post_url) {
                    upd('status', 'published')
                    upd('published_at', new Date().toISOString())
                    upd('linkedin_post_url', data.linkedin_post_url)
                    alert('✅ Live auf LinkedIn!')
                    setTimeout(() => save(), 100)
                  } else {
                    alert('Posten fehlgeschlagen: ' + (data?.error || 'Unbekannte Antwort'))
                  }
                } catch (e) {
                  alert('Posten fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                } finally { setSaving(false) }
              }} disabled={saving} style={{ padding:'9px 16px', borderRadius:10, border:'none', background: saving ? '#94A3B8' : '#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor: saving ? 'wait' : 'pointer', display:'flex', alignItems:'center', gap:5 }}>
                {future ? '📅 Auto-Publish einplanen' : '🚀 Jetzt auf LinkedIn posten'}
              </button>
            )
          })()}
          {form.linkedin_post_url && (
            <a href={form.linkedin_post_url} target="_blank" rel="noreferrer"
              style={{ padding:'9px 14px', borderRadius:10, border:'1px solid #BBF7D0', background:'#F0FDF4', color:'#065F46', fontSize:13, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, textDecoration:'none' }}>
              ✓ Post öffnen
            </a>
          )}
          {form.content && (
            <button onClick={() => { navigator.clipboard.writeText(form.content); alert('✅ Text kopiert!') }}
              style={{ padding:'9px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'var(--surface-muted)', color:'#475569', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              📋 Kopieren
            </button>
          )}
          <button onClick={onClose} style={{ padding:'9px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface-muted)', color:'var(--text-muted)', fontSize:13, cursor:'pointer' }}>
            Abbrechen
          </button>
          <button onClick={save} disabled={saving}
            style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? '⏳ Speichere…' : isNew ? '+ Erstellen' : '💾 Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Redaktionsplan({ session }) {
  const { isMobile } = useResponsive()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { activeTeamId, members } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [posts, setPosts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('kanban')  // kanban | kalender | liste
  const [modal, setModal]         = useState(null)      // null | {} | post
  const [workspace, setWorkspace] = useState('personal') // personal | company | team_support
  const [calDate, setCalDate]     = useState(new Date())
  const [search, setSearch]       = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [improving, setImproving] = useState(false)
  const [showBrainstorm, setShowBrainstorm] = useState(false)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()

  // BV-Multi-Picker: Default nur die aktive BV; User kann mehrere ankreuzen
  const [availableBVs, setAvailableBVs]   = useState([])
  const [selectedBVIds, setSelectedBVIds] = useState([])
  const [bvPickerOpen, setBvPickerOpen]   = useState(false)

  // Verfügbare BVs des Users laden (für den Multi-Picker)
  useEffect(() => {
    if (!session?.user?.id || !activeTeamId) return
    supabase.from('brand_voices')
      .select('id, name')
      .order('updated_at', { ascending: false })
      .then(({ data }) => setAvailableBVs(data || []))
  }, [session?.user?.id, activeTeamId])

  // Wenn aktive BV wechselt → Selection auf diese eine zurücksetzen
  useEffect(() => {
    if (activeBrandVoice?.id) setSelectedBVIds([activeBrandVoice.id])
  }, [activeBrandVoice?.id])

  const [brainstormIdeas, setBrainstormIdeas] = useState([])
  const [brainstormTopic, setBrainstormTopic] = useState('')
  const [brainstormSelected, setBrainstormSelected] = useState(new Set())
  const [brainstormCount, setBrainstormCount]       = useState(6)

  async function generateIdeas(customTopic = '') {
    setGenerating(true)
    setBrainstormIdeas([])
    setBrainstormSelected(new Set())
    try {
      // BV-volles Profil laden (alle relevanten Felder)
      let bv = null
      if (activeBrandVoice?.id) {
        const { data } = await supabase.from('brand_voices')
          .select('id, name, ai_summary, target_audience, mission, tone, values, expertise, content_pillars, voice_description')
          .eq('id', activeBrandVoice.id).maybeSingle()
        bv = data
      }

      // Letzte echte Posts dieser BV als Few-Shot (besser als generischer Memory-Pool)
      let bvPosts = []
      if (bv?.id) {
        const { data: posts } = await supabase.from('content_posts')
          .select('title, content, status')
          .eq('brand_voice_id', bv.id)
          .in('status', ['published','approved','scheduled','draft'])
          .not('content', 'is', null)
          .order('created_at', { ascending: false })
          .limit(6)
        bvPosts = (posts || []).filter(p => (p.content || '').length > 50)
      }

      // Prompt-Aufbau: striktes Headline-Only-Schema, BV-Persona als System-Kontext
      let prompt = ''
      if (bv) {
        prompt += `BRAND-VOICE-KONTEXT (du schreibst für genau diese Person/Marke — NICHT generisch):\n`
        if (bv.name)              prompt += `Name: ${bv.name}\n`
        if (bv.target_audience)   prompt += `Zielgruppe: ${bv.target_audience}\n`
        if (bv.mission)           prompt += `Mission: ${bv.mission}\n`
        if (bv.voice_description) prompt += `Stimme/Tonalität: ${bv.voice_description}\n`
        if (bv.tone)              prompt += `Tonfall: ${bv.tone}\n`
        if (bv.expertise)         prompt += `Expertise: ${bv.expertise}\n`
        if (bv.values)            prompt += `Werte: ${bv.values}\n`
        if (bv.content_pillars)   prompt += `Content-Pillars: ${bv.content_pillars}\n`
        if (bv.ai_summary)        prompt += `\nKern-Zusammenfassung dieser Brand Voice:\n${bv.ai_summary}\n`
        prompt += `\n`
      }

      if (bvPosts.length) {
        prompt += `BISHERIGE POSTS DIESER BRAND VOICE (NUR als Stil-Referenz, NICHT kopieren — neue Ideen müssen sich anders anfühlen):\n`
        bvPosts.forEach((p, i) => {
          prompt += `\nPost ${i+1}:\n`
          if (p.title) prompt += `Titel: ${p.title}\n`
          prompt += `${(p.content || '').slice(0, 400)}\n`
        })
        prompt += `\n`
      }

      prompt += `AUFGABE:\nGeneriere ${brainstormCount} LinkedIn-Post-Themen, exakt in dieser Brand-Voice (nicht generisch, nicht "Sales-Berater"-Floskeln). Nur Themen-Headlines — keine ausgearbeiteten Texte, keine Strategie-Briefings.\n\n`

      if (customTopic) prompt += `SCHWERPUNKT: ${customTopic}\n\n`

      prompt += `Mische diese Themen-Arten:\n`
      prompt += `- Persönliche Story/Erfahrung\n- Kontroverse These\n- Konkreter Praxis-Tipp\n- Beobachtung aus der Branche\n- Reframing einer verbreiteten Meinung\n- Lernmoment / Fehler-Aha\n\n`

      prompt += `Antworte NUR mit JSON-Array (kein Markdown, kein Kommentar drumherum):\n`
      prompt += `[{"title":"Die Post-Headline (max 80 Zeichen, im Brand-Voice-Stil)","hook":"Optional 1-Satz-Aufhänger (max 120 Zeichen)"}]\n`
      prompt += `\nKEIN angle-Feld, KEINE Strategie-Texte, KEINE Erklärungen. Nur title + hook.`

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type: 'content_brainstorm', prompt, userId: session.user.id, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
      })
      if (fnErr) throw fnErr
      const text = fnData?.text || fnData?.result || '[]'
      const clean = text.replace(/```json|```/g,'').trim()
      const m = clean.match(/\[[\s\S]*\]/)
      const ideas = JSON.parse(m ? m[0] : clean)
      // Strip alle Felder ausser title + hook, falls Modell sich verschluckt
      const cleaned = (ideas || []).slice(0, brainstormCount).map(idea => ({
        title: (idea.title || idea.headline || '').toString().trim(),
        hook:  (idea.hook  || '').toString().trim(),
      })).filter(i => i.title)
      setBrainstormIdeas(cleaned)
      // Memory: protokolliere die Brainstorm-Generation
      try {
        const { recordGeneration } = await import('../lib/contentMemory')
        await recordGeneration({
          userId: session.user.id, teamId: activeTeamId,
          kind: 'brainstorm', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
          promptInput: { topic: customTopic || null, hasBV: !!bv, bvPostsUsed: bvPosts.length },
          resolvedPrompt: prompt,
          brandVoiceId: bv?.id || null,
          variants: cleaned,
        })
      } catch (memErr) { console.warn('[brainstorm-memory]', memErr.message) }
    } catch(e) {
      setBrainstormIdeas([{ title:'Fehler beim Generieren', hook: e.message || 'Bitte nochmal versuchen.' }])
    }
    setGenerating(false)
  }

  async function adoptSelectedIdeas() {
    const uid = session.user.id
    const toCreate = brainstormIdeas.filter((_, i) => brainstormSelected.has(i))
    if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice — bitte oben rechts auswählen.'); return }
    if (!activeTeamId)         { alert('Kein Team aktiv'); return }
    const created = []
    for (const idea of toCreate) {
      // Leere Idee-Karte: NUR title, content komplett leer, kein hook/angle übernommen
      const { data: post, error: insErr } = await supabase.from('content_posts').insert({
        user_id: uid, team_id: activeTeamId, workspace,
        brand_voice_id: activeBrandVoice.id,
        title: idea.title || 'Neue Idee',
        content: '',
        platform: 'linkedin', status: 'idee',
      }).select().single()
      if (insErr) { console.error('[adopt-idea]', insErr); continue }
      if (post) { setPosts(prev => [post, ...prev]); created.push(post) }
    }
    setShowBrainstorm(false)
    setBrainstormIdeas([])
    setBrainstormSelected(new Set())
    setBrainstormTopic('')
  }

  useEffect(() => {
    if (activeTeamId) loadPosts()
    const leadId   = searchParams.get('lead')
    const leadName = searchParams.get('name')
    const company  = searchParams.get('company')
    if (leadId && leadName) {
      openNew({
        title: `Post über ${leadName}${company ? ' – ' + company : ''}`,
        content: `Ich hatte heute ein inspirierendes Gespräch mit ${leadName}${company ? ' von ' + company : ''}.

[Dein Erlebnis / Erkenntnis aus dem Gespräch]

Was mich besonders beeindruckt hat:
→ [Punkt 1]
→ [Punkt 2]

Danke für den Austausch! 🤝`,
        platform: 'linkedin',
        status: 'draft',
        lead_id: leadId,
      })
    }
  }, [])

  async function loadPosts() {
    setLoading(true)
    let q = supabase.from('content_posts')
      .select('*, post_publish_queue ( status, scheduled_for, attempts, error_message, last_response_status, created_at )')
      .order('created_at', { ascending: false })
    // BV-Multi-Filter: ausgewählte BVs
    if (selectedBVIds.length > 0) q = q.in('brand_voice_id', selectedBVIds)
    if (workspace === 'team_support') {
      q = q.or(`assignee_id.eq.${session.user.id},reviewer_id.eq.${session.user.id}`).neq('user_id', session.user.id)
    } else {
      q = q.eq('workspace', workspace)
    }
    const { data } = await q
    const bvNameMap = Object.fromEntries((availableBVs || []).map(b => [b.id, b.name]))
    const flattened = (data || []).map(p => {
      const queue = Array.isArray(p.post_publish_queue) ? p.post_publish_queue : []
      const latest = queue.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      return {
        ...p,
        publish_queue_status: latest?.status || null,
        publish_queue_error: latest?.error_message || null,
        publish_queue_attempts: latest?.attempts || 0,
        bv_name: bvNameMap[p.brand_voice_id] || null,
      }
    })
    setPosts(flattened)
    setLoading(false)
  }

  // Re-load wenn sich BV-Selection / Team / Workspace / BV-Liste ändert
  useEffect(() => { if (activeTeamId && selectedBVIds.length > 0) loadPosts() }, [selectedBVIds.join(','), activeTeamId, workspace, availableBVs.length])

    function openNew(defaults = {}) { setModal({ ...defaults }) }
  function openEdit(post) { setModal(post) }
  function closeModal() { setModal(null) }

  function handleSave(saved) {
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    closeModal()
  }

  async function handleDelete(id) {
    await supabase.from('content_posts').delete().eq('id', id)
    setPosts(prev => prev.filter(p => p.id !== id))
    closeModal()
  }

  // Gefilterte Posts (nur noch Suche)
  const filtered = posts.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  // Sind mehrere BVs ausgewählt? Dann BV-Badges auf Karten anzeigen.
  const showBVBadges = selectedBVIds.length > 1

  // ── Kalender ──
  const calYear  = calDate.getFullYear()
  const calMonth = calDate.getMonth()
  const calDays  = getCalendarDays(calYear, calMonth)
  const today    = new Date()

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>

      {/* Header */}
      <div style={{ padding:'0 0 20px', display:'flex', flexDirection:'column', gap:16, flexShrink:0 }}>

        {/* Workspace-Switch — nur sichtbar wenn Team > 1 Mitglied */}
        {(members?.length || 0) > 1 && <div style={{ display:'flex', gap:6, background:'#F1F5F9', padding:4, borderRadius:12, alignSelf:'flex-start' }}>
          {Object.entries(WORKSPACES).map(([k, v]) => (
            <button key={k} onClick={() => setWorkspace(k)}
              title={v.desc}
              style={{ padding:'7px 16px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
                background: workspace===k ? 'var(--surface)' : 'transparent',
                color: workspace===k ? 'var(--wl-primary, rgb(49,90,231))' : '#64748B',
                boxShadow: workspace===k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition:'all 0.15s' }}>
              {v.label}
            </button>
          ))}
        </div>}

        {/* Toolbar — nur sichtbar wenn Posts existieren */}
        {posts.length > 0 && <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>

          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Beiträge suchen…"
              style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:10, border:'1.5px solid #E5E7EB',
                fontSize:13, outline:'none', boxSizing:'border-box' }}/>
          </div>

          {/* Brand-Voice-Picker (Multi-Select-Dropdown) */}
          <div style={{ position:'relative' }}>
            <button onClick={() => setBvPickerOpen(o => !o)}
              style={{ padding:'7px 12px', borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <span>👤</span>
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
                <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:260, maxWidth:340, maxHeight:360, overflowY:'auto', padding:6 }}>
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

          {/* View Toggle */}
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:10, padding:3, gap:2 }}>
            {[['kanban','⊞ Board'],['woche','📆 Woche'],['kalender','📅 Monat'],['liste','☰ Liste']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding:'6px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                  background: view===v ? '#fff' : 'transparent', color: view===v ? 'var(--wl-primary, rgb(49,90,231))' : '#64748B',
                  boxShadow: view===v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition:'all 0.15s' }}>
                {l}
              </button>
            ))}
          </div>

          {/* Brainstorm Button (Primary CTA) */}
          <button onClick={() => setShowBrainstorm(true)}
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(49,90,231,0.3)', background:'rgba(49,90,231,0.06)', color:'var(--wl-primary, rgb(49,90,231))',
              fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
            🧠 Brainstormen
          </button>

          {/* Neu Button */}
          <button onClick={() => openNew()}
            style={{ padding:'8px 18px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff',
              fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
              boxShadow:'0 2px 8px rgba(49,90,231,0.3)', whiteSpace:'nowrap' }}>
            ✍️ Neuer Beitrag
          </button>
        </div>}
      </div>


      {/* ── VORLAGEN PANEL ── */}
      {showTemplates && (
        <div style={{ background:'var(--surface)', border:'1.5px solid #E5E7EB', borderRadius:16, padding:20, marginBottom:16, flexShrink:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)', marginBottom:12 }}>📋 Content-Vorlagen</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
            {[
              { title:'💡 Thought Leadership', platform:'linkedin', content:'Eine Erkenntnis, die meine Perspektive auf [Thema] verändert hat:\n\n[Kernaussage]\n\nWas ich daraus gelernt habe:\n→ [Punkt 1]\n→ [Punkt 2]\n→ [Punkt 3]\n\nDeine Meinung?', status:'idee' },
              { title:'📊 Daten & Insights', platform:'linkedin', content:'[X]% der [Zielgruppe] kämpfen mit [Problem].\n\nHier ist, was hilft:\n\n1. [Lösung 1]\n2. [Lösung 2]\n3. [Lösung 3]\n\nWelche Erfahrung hast du?', status:'idee' },
              { title:'🎯 Problem-Lösung', platform:'linkedin', content:'Das größte Missverständnis über [Thema]:\n\n❌ Was die meisten denken: [Irrglauben]\n✅ Was stimmt: [Wahrheit]\n\nDer Unterschied:\n[Erklärung]\n\nWie siehst du das?', status:'idee' },
              { title:'📖 Story & Erfahrung', platform:'linkedin', content:'Vor [X] Monaten hatte ich ein Gespräch, das alles verändert hat.\n\n[Situation]\n\nDie Lektion:\n[Kernaussage]\n\nSeitdem mache ich es so:\n[Tipp]', status:'idee' },
              { title:'🔥 Kontroverser Hook', platform:'linkedin', content:'Unpopuläre Meinung: [These]\n\nIch weiß, das klingt hart. Aber:\n\n[Begründung 1]\n[Begründung 2]\n[Begründung 3]\n\nBin ich der Einzige?', status:'idee' },
              { title:'📊 Engagement Frage', platform:'linkedin', content:'Eine Frage, die mich beschäftigt:\n\n[Frage]\n\nMeine Meinung: [Deine Perspektive]\n\nWas denkst du? 👇', status:'idee' },
            ].map((tmpl, i) => (
              <div key={i} onClick={() => { openNew(tmpl); setShowTemplates(false) }}
                style={{ padding:'12px 14px', borderRadius:12, border:'1.5px solid #E5E7EB', cursor:'pointer',
                  borderLeft:`3px solid ${(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).color}`, transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background='#F8FAFC'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>{tmpl.title}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).icon} {(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMPTY-STATE HERO (wenn keine Posts existieren) ── */}
      {!loading && posts.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          textAlign: 'center',
          minHeight: 480,
        }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>📅</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'rgb(20,20,43)', margin: '0 0 10px', lineHeight: 1.25 }}>
            Plane deinen ersten LinkedIn-Post
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.6, margin: '0 0 28px' }}>
            Hier wird dein Redaktionsplan aufgebaut. Lass dir Ideen von der KI vorschlagen oder leg direkt mit einem ersten Entwurf los.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => setShowBrainstorm(true)}
              style={{
                padding: '14px 26px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, rgb(49,90,231), #8B5CF6)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(49,90,231,0.28)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}>
              <span style={{ fontSize: 18 }}>🧠</span>
              Mit KI brainstormen
            </button>
            <button onClick={() => openNew()}
              style={{
                padding: '14px 22px',
                borderRadius: 12,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}>
              <span>✍️</span>
              Manuell anlegen
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 32, maxWidth: 420 }}>
            💡 Tipp: Die KI nutzt deine Brand Voice + bisherige Top-Posts und schlägt dir 6 personalisierte Ideen vor.
          </p>
        </div>
      )}

      {/* ── KANBAN VIEW (nur wenn Posts existieren) ── */}
      {!loading && posts.length > 0 && view === 'kanban' && (
        <div style={{ flex:1, overflowX:'auto', overflowY:'hidden' }}>
          <div style={{ display:'flex', gap:16, height:'100%', minWidth: BUCKETS.length * 320 + 'px' }}>
            {BUCKETS.map(b => {
              const statusKeys = Object.entries(STATUS).filter(([k, v]) => v.bucket === b.key).map(([k]) => k)
              const cols = filtered.filter(p => statusKeys.includes(p.status))
              const bucketColor = b.key === 'ideen' ? '#64748B' : b.key === 'in_arbeit' ? '#D97706' : '#059669'
              return (
                <div key={b.key}
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => {
                    e.preventDefault()
                    const postId = e.dataTransfer.getData('postId')
                    if (!postId) return
                    await supabase.from('content_posts').update({ status: b.status_default }).eq('id', postId)
                    setPosts(prev => prev.map(p => p.id===postId ? {...p, status:b.status_default} : p))
                  }}
                  style={{ flex:1, minWidth:300, display:'flex', flexDirection:'column', background:'var(--surface-muted)',
                  borderRadius:16, border:'1px solid var(--border)', overflow:'hidden' }}>
                  {/* Bucket Header */}
                  <div style={{ padding:'14px 16px', borderBottom:'2px solid #E5E7EB', background:'var(--surface)',
                    display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14, fontWeight:800, color: bucketColor }}>{b.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, background: bucketColor + '20', color: bucketColor, borderRadius:99, padding:'1px 8px' }}>{cols.length}</span>
                      </div>
                      <span style={{ fontSize:10, color:'var(--text-muted)' }}>{b.desc}</span>
                    </div>
                    <button onClick={() => openNew({ status: b.status_default })}
                      style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18,
                        lineHeight:1, borderRadius:6, padding:'2px 6px' }}
                      title="Neuer Beitrag"
                      onMouseEnter={e => e.currentTarget.style.color = bucketColor}
                      onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}>+</button>
                  </div>
                  {/* Cards */}
                  <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
                    {cols.length === 0 && (
                      <div style={{ textAlign:'center', padding:'30px 12px', color:'#CBD5E1', fontSize:12 }}>
                        Noch nichts hier
                      </div>
                    )}
                    {cols.map(p => <PostCard key={p.id} post={p} onClick={openEdit} showBVBadge={showBVBadges} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* ── WOCHEN VIEW ── */}
      {!loading && posts.length > 0 && view === 'woche' && (() => {
        // Aktuelle Woche Mo-So
        const now = new Date()
        const dow = (now.getDay() + 6) % 7 // Mo=0
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow); weekStart.setHours(0,0,0,0)
        const weekDays = Array.from({length:7}, (_,i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate()+i); return d })
        return (
          <div style={{ flex:1, display:'flex', gap:10, overflowX:'auto', minHeight:0 }}>
            {weekDays.map((day, i) => {
              const dayPosts = filtered.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day))
              const isToday  = isSameDay(day, new Date())
              return (
                <div key={i} style={{ flex:1, minWidth:140, display:'flex', flexDirection:'column',
                  background: isToday ? '#EFF6FF' : '#F8FAFC', borderRadius:14,
                  border: isToday ? '2px solid rgb(49,90,231)' : '1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', background: isToday ? 'var(--wl-primary, rgb(49,90,231))' : '#fff' }}>
                    <div style={{ fontSize:11, fontWeight:800, color: isToday ? 'rgba(255,255,255,0.7)' : '#94A3B8', textTransform:'uppercase' }}>{DAYS[i]}</div>
                    <div style={{ fontSize:18, fontWeight:800, color: isToday ? '#fff' : 'rgb(20,20,43)' }}>{day.getDate()}</div>
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                    {dayPosts.map(p => <PostCard key={p.id} post={p} onClick={openEdit} compact showBVBadge={showBVBadges} />)}
                    <button onClick={() => openNew({ scheduled_at: day.toISOString().slice(0,10)+'T09:00' })}
                      style={{ width:'100%', padding:'4px', borderRadius:6, border:'1px dashed #CBD5E1',
                        background:'none', color:'var(--text-muted)', fontSize:11, cursor:'pointer', marginTop:4 }}>
                      + Beitrag
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── KALENDER VIEW ── */}
      {!loading && posts.length > 0 && view === 'kalender' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
          {/* Monat Navigation */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexShrink:0 }}>
            <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:16 }}>‹</button>
            <div style={{ fontSize:18, fontWeight:800, color:'rgb(20,20,43)', flex:1, textAlign:'center' }}>
              {MONTHS[calMonth]} {calYear}
            </div>
            <button onClick={() => setCalDate(new Date())}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:12, fontWeight:600 }}>Heute</button>
            <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:16 }}>›</button>
          </div>

          {/* Wochentage Header */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2, flexShrink:0 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--text-muted)', padding:'6px 0', textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>

          {/* Kalender-Grid */}
          <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridTemplateRows:`repeat(${calDays.length/7},1fr)`, gap:2, minHeight:0 }}>
            {calDays.map((day, i) => {
              const dayPosts = filtered.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day.date))
              const isToday  = isSameDay(day.date, today)
              const isPast   = day.date < today && !isSameDay(day.date, today)
              return (
                <div key={i}
                  style={{ background: !day.current ? '#FAFAFA' : (()=>{ const d=day.date.getDay(); return (d===2||d===3||d===4)?'#FAFFF4':'#fff' })(), borderRadius:10,
                    border: isToday ? '2px solid rgb(49,90,231)' : (()=>{ const d=day.date.getDay(); return (d===2||d===3||d===4)?'1px solid #A7F3D0':'1px solid #E5E7EB' })(),
                    padding:'6px', overflow:'hidden', cursor:'pointer', minHeight:80,
                    opacity: !day.current ? 0.5 : 1 }}
                  onClick={() => openNew({ scheduled_at: day.date.toISOString().slice(0,16) })}>
                  <div style={{ fontSize:11, fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'var(--wl-primary, rgb(49,90,231))' : isPast ? '#94A3B8' : 'rgb(20,20,43)',
                    marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                    {isToday && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--wl-primary, rgb(49,90,231))', display:'inline-block' }}/>}
                    {day.date.getDate()}
                  </div>
                  {dayPosts.slice(0,3).map(p => (
                    <div key={p.id} onClick={e => { e.stopPropagation(); openEdit(p) }}
                      style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, marginBottom:2,
                        background: (PLATFORMS[p.platform]||PLATFORMS.linkedin).bg,
                        color: (PLATFORMS[p.platform]||PLATFORMS.linkedin).color,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                      {(PLATFORMS[p.platform]||PLATFORMS.linkedin).icon} {p.title || '(Kein Titel)'}
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div style={{ fontSize:9, color:'var(--text-muted)', fontWeight:600 }}>+{dayPosts.length-3} weitere</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── LISTE VIEW ── */}
      {!loading && posts.length > 0 && view === 'liste' && (
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Lädt…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'#CBD5E1' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✍️</div>
              <div style={{ fontSize:16, fontWeight:700 }}>Noch keine Beiträge</div>
              <div style={{ fontSize:13, marginTop:8 }}>Erstelle deinen ersten Content-Plan</div>
              <button onClick={() => openNew()}
                style={{ marginTop:16, padding:'10px 20px', borderRadius:10, border:'none',
                  background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontWeight:700, cursor:'pointer' }}>
                ✍️ Ersten Beitrag erstellen
              </button>
            </div>
          )}
          {filtered.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--surface-muted)' }}>
                  {['Plattform','Titel','Status','Geplant für','Tags'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700,
                      color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const plt = PLATFORMS[p.platform] || PLATFORMS.linkedin
                  const sts = STATUS[p.status] || STATUS.idee
                  return (
                    <tr key={p.id} onClick={() => openEdit(p)}
                      style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontSize:12, fontWeight:700, color: plt.color, background: plt.bg,
                          padding:'3px 10px', borderRadius:99, border:`1px solid ${plt.color}30` }}>
                          {plt.icon} {plt.label}
                        </span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:13, fontWeight:600, color:'rgb(20,20,43)', maxWidth:300 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.title || '(Kein Titel)'}
                        </div>
                        {p.content && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.content.slice(0,80)}…</div>}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color: sts.color, background: sts.bg,
                          padding:'3px 10px', borderRadius:99, border:`1px solid ${sts.border}` }}>{sts.label}</span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                        {p.scheduled_at ? (
                          <>
                            <span>{new Date(p.scheduled_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</span>
                            <span style={{ marginLeft:6, color: new Date(p.scheduled_at) < new Date() && p.status !== 'published' ? '#ef4444' : '#94A3B8', fontWeight:600 }}>
                              {relativeDate(p.scheduled_at)}
                            </span>
                          </>
                        ) : <span style={{ color:'#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {(p.tags||[]).slice(0,3).map(t => (
                            <span key={t} style={{ fontSize:10, padding:'1px 7px', borderRadius:99,
                              background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE', fontWeight:600 }}>#{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <PostModal post={modal} onClose={closeModal} onSave={handleSave} onDelete={handleDelete} session={session} activeTeamId={activeTeamId} members={members} workspace={workspace} selectedModel={selectedModel} activeBrandVoice={activeBrandVoice} navigate={navigate} />
      )}

      {/* ── BRAINSTORM-MODAL ── */}
      {showBrainstorm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => e.target === e.currentTarget && setShowBrainstorm(false)}>
          <div style={{ background:'var(--surface)', borderRadius:18, width:'100%', maxWidth:780, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'18px 22px 14px', background:'linear-gradient(135deg, rgba(49,90,231,.08), rgba(124,58,237,.06))' }}>
              <div style={{ fontSize:11, color:'var(--wl-primary, rgb(49,90,231))', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>🧠 Brainstorming-Session</div>
              <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>Was möchtest du heute posten?</h2>
              <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.5 }}>
                Lass dir Ideen passend zu deiner Brand Voice generieren. Die KI nutzt deinen Markenkontext und deine bisherigen Top-Posts.
              </p>
              <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
                <input value={brainstormTopic} onChange={e => setBrainstormTopic(e.target.value)}
                  placeholder="Schwerpunkt-Thema (optional, z.B. 'Vertrauen aufbauen', 'KI im Sales')"
                  style={{ flex:'1 1 240px', minWidth:200, padding:'9px 12px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:13, outline:'none', background:'var(--surface)' }}/>
                <select value={brainstormCount} onChange={e => setBrainstormCount(parseInt(e.target.value, 10))}
                  style={{ padding:'9px 10px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:13, background:'var(--surface)', cursor:'pointer', fontFamily:'inherit' }}>
                  {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n} Ideen</option>)}
                </select>
                <button onClick={() => generateIdeas(brainstormTopic.trim())} disabled={generating}
                  style={{ padding:'9px 16px', borderRadius:9, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:generating?'wait':'pointer', whiteSpace:'nowrap' }}>
                  {generating ? '⏳ Generiere…' : '🪄 Generieren'}
                </button>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'14px 22px' }}>
              {brainstormIdeas.length === 0 && !generating && (
                <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                  💡 Klick auf <strong>"Generieren"</strong> oben für {brainstormCount} frische Post-Ideen.
                </div>
              )}
              {generating && brainstormIdeas.length === 0 && (
                <div style={{ padding:'60px 20px', textAlign:'center' }}>
                  <div style={{ display:'inline-block', width:48, height:48, border:'4px solid #E2E8F0', borderTopColor:'var(--wl-primary, rgb(49,90,231))', borderRadius:'50%', animation:'spin 0.9s linear infinite' }}/>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <div style={{ marginTop:18, fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>
                    Generiere 6 Ideen für dich...
                  </div>
                  <div style={{ marginTop:6, fontSize:12, color:'var(--text-muted)' }}>
                    Das dauert etwa 10-15 Sekunden. Die KI berücksichtigt dabei deine Brand Voice + bisherige Top-Posts.
                  </div>
                </div>
              )}
              {brainstormIdeas.map((idea, i) => {
                const selected = brainstormSelected.has(i)
                return (
                  <div key={i} onClick={() => {
                      setBrainstormSelected(prev => {
                        const s = new Set(prev)
                        if (s.has(i)) s.delete(i); else s.add(i)
                        return s
                      })
                    }}
                    style={{ marginBottom:10, padding:'12px 14px', borderRadius:12,
                      border: '2px solid ' + (selected ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--border)'),
                      background: selected ? 'rgba(49,90,231,.04)' : 'var(--surface)',
                      cursor:'pointer', transition:'all .15s', display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:24, height:24, borderRadius:6, border: '2px solid ' + (selected ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--border)'), background: selected ? 'var(--wl-primary, rgb(49,90,231))' : 'transparent', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, marginTop:2 }}>
                      {selected ? '✓' : ''}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4, lineHeight:1.35 }}>{idea.title}</div>
                      {idea.hook && <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{idea.hook}</div>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                {brainstormSelected.size} von {brainstormIdeas.length} ausgewählt
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowBrainstorm(false)}
                  style={{ padding:'9px 16px', borderRadius:9, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:13, cursor:'pointer' }}>
                  Abbrechen
                </button>
                <button onClick={adoptSelectedIdeas} disabled={brainstormSelected.size === 0}
                  style={{ padding:'9px 18px', borderRadius:9, border:'none', background: brainstormSelected.size === 0 ? '#CBD5E1' : 'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor: brainstormSelected.size === 0 ? 'not-allowed' : 'pointer' }}>
                  💡 {brainstormSelected.size > 0 ? brainstormSelected.size + ' Idee' + (brainstormSelected.size === 1 ? '' : 'n') + ' übernehmen' : 'Auswählen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
