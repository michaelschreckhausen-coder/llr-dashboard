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

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, onClick, compact }) {
  const plt = PLATFORMS[post.platform] || PLATFORMS.linkedin
  const sts = STATUS[post.status]      || STATUS.idee
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('postId', post.id)}
      onClick={() => onClick(post)}
      style={{ background:'var(--surface)', borderRadius: compact ? 8 : 12, border:'1px solid var(--border)',
        padding: compact ? '6px 10px' : '12px 14px', cursor:'pointer', transition:'all 0.15s',
        borderLeft:`3px solid ${plt.color}`, marginBottom: compact ? 4 : 8,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: compact ? 2 : 6 }}>
        <span style={{ fontSize: compact ? 11 : 13 }}>{plt.icon}</span>
        <span style={{ fontSize: compact ? 10 : 11, fontWeight:700, color: plt.color }}>{plt.label}</span>
        <span style={{ marginLeft:'auto', fontSize: compact ? 9 : 10, fontWeight:700,
          color: sts.color, background: sts.bg, border:`1px solid ${sts.border}`,
          borderRadius:99, padding:'1px 6px' }}>{sts.label}</span>
      </div>
      <div style={{ fontSize: compact ? 11 : 13, fontWeight:600, color:'rgb(20,20,43)',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        lineHeight:1.4 }}>{post.title || '(Kein Titel)'}</div>
      {!compact && post.scheduled_at && (
        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>
          📅 {new Date(post.scheduled_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
          {' · '}<span style={{ color: new Date(post.scheduled_at) < new Date() && post.status !== 'published' ? '#ef4444' : '#94A3B8' }}>
            {relativeDate(post.scheduled_at)}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── PostModal ────────────────────────────────────────────────────────────────
function PostModal({ post, onClose, onSave, onDelete, session, activeTeamId, members, workspace, selectedModel }) {
  const isNew = !post?.id
  const [form, setForm] = useState({
    title: '', content: '', platform: 'linkedin', status: 'idee',
    notes: '', assignee_id: '', reviewer_id: '', brand_voice_id: '', target_audience_id: '', hook: '', topic: '',
    workspace: workspace,
    team_id: activeTeamId,
    ...post,
    tags: Array.isArray(post?.tags) ? post.tags.join(', ') : (post?.tags || ''),
    scheduled_at: post?.scheduled_at ? post.scheduled_at.slice(0,16) : '',
  })
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(true)
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

  async function addComment() {
    if (!newComment.trim() || !post?.id) return
    const { data } = await supabase.from('content_post_comments').insert({
      post_id: post.id, user_id: session.user.id, team_id: activeTeamId,
      body: newComment.trim()
    }).select().single()
    if (data) { setComments(p => [...p, data]); setNewComment('') }
  }

  const [saving, setSaving] = useState(false)
  const [improving, setImproving] = useState(false)
  const [charCount, setCharCount] = useState(form.content?.length || 0)

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
    // Inputs die nur im UI existieren entfernen (kein DB-column)
    delete payload.id
    // Empty-String FK-Felder zu null konvertieren (sonst FK-violation)
    if (!payload.assignee_id) payload.assignee_id = null
    if (!payload.reviewer_id) payload.reviewer_id = null
    if (!payload.brand_voice_id) payload.brand_voice_id = null
    if (!payload.target_audience_id) payload.target_audience_id = null
    let result
    if (isNew) {
      result = await supabase.from('content_posts').insert(payload).select().single()
    } else {
      result = await supabase.from('content_posts').update(payload).eq('id', post.id).select().single()
    }
    setSaving(false)
    if (!result.error) onSave(result.data)
  }

  const pltOptions = Object.entries(PLATFORMS)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--surface)', borderRadius:20, width:'100%', maxWidth:760, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>

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
        <div style={{ flex:1, overflow:'auto', padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 280px', gap:20 }}>

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

            {/* Content Textarea */}
            {/* KI-Werkzeuge — nur sichtbar wenn Content da ist */}
            {form.content && form.content.trim().length >= 50 && <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
              {['🪄 Verbessern','💪 Stärker','✂️ Kürzer','🎯 Hook schärfen'].map(action => (
                <button key={action} disabled={improving || !form.content.trim()}
                  onClick={async () => {
                    if (!form.content.trim()) return
                    setImproving(true)
                    const prompts = {
                      '🪄 Verbessern': `Verbessere diesen LinkedIn-Post. Behalte den Inhalt und Stil, mache ihn aber ansprechender und professioneller. Gib nur den überarbeiteten Text zurück, ohne Erklärung:

${form.content}`,
                      '💪 Stärker': `Mache diesen LinkedIn-Post wirkungsvoller und überzeugender. Stärkere Sprache, klarere Botschaft. Nur der Text:

${form.content}`,
                      '✂️ Kürzer': `Kürze diesen LinkedIn-Post auf das Wesentliche (max. 150 Wörter). Nur der gekürzte Text:

${form.content}`,
                      '🎯 Hook schärfen': `Verbessere nur den ersten Satz/Absatz dieses LinkedIn-Posts zu einem unwiderstehlichen Hook. Behalte den Rest. Nur der vollständige überarbeitete Text:

${form.content}`,
                    }
                    try {
                      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
                        body: { type: 'content_post', prompt: prompts[action], userId: session.user.id, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
                      })
                      if (fnErr) throw fnErr
                      const text = fnData?.text || fnData?.result || ''
                      if (text) { upd('content', text); setCharCount(text.length) }
                    } catch(e) {}
                    setImproving(false)
                  }}
                  style={{ padding:'4px 10px', borderRadius:7, border:'1.5px solid #E5E7EB',
                    background: improving ? '#F8FAFC' : '#fff', color: improving ? '#CBD5E1' : '#475569',
                    fontSize:11, fontWeight:600, cursor: improving || !form.content.trim() ? 'not-allowed' : 'pointer',
                    opacity: !form.content.trim() ? 0.5 : 1, transition:'all 0.12s' }}
                  onMouseEnter={e => { if (!improving && form.content.trim()) e.currentTarget.style.borderColor='var(--wl-primary, rgb(49,90,231))' }}
                  onMouseLeave={e => e.currentTarget.style.borderColor='#E5E7EB'}>
                  {improving ? '⏳' : action}
                </button>
              ))}
            </div>}

            <div style={{ position:'relative' }}>
              <textarea value={form.content}
                onChange={e => { upd('content', e.target.value); setCharCount(e.target.value.length) }}
                placeholder={`${plt.icon} Schreibe deinen ${plt.label}-Beitrag hier…\n\nTipps:\n• Starte mit einem starken Hook\n• Nutze Zeilenumbrüche für Lesbarkeit\n• Füge einen Call-to-Action ein`}
                rows={12}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'1.5px solid #E5E7EB',
                  fontSize:14, lineHeight:1.7, resize:'vertical', outline:'none', boxSizing:'border-box',
                  fontFamily:'inherit', color:'rgb(20,20,43)', transition:'border 0.15s' }}
                onFocus={e => e.target.style.borderColor = plt.color}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'}/>
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

            {/* Notes — nur advanced */}
            {showAdvanced && <div style={{ marginTop:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Interne Notizen</label>
              <textarea value={form.notes} onChange={e => upd('notes', e.target.value)}
                placeholder="Recherche-Quellen, Ideen, Anmerkungen…" rows={3}
                style={{ width:'100%', marginTop:4, padding:'10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit',
                  color:'rgb(20,20,43)', background:'#FAFAFA' }}/>
            </div>}

            {/* Visual */}
            {form.content && (
              <div style={{ marginTop:18 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>🖼️ Bild zum Post</label>
                {postVisual ? (
                  <div style={{ position:'relative', borderRadius:10, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={postVisual.signed_url} alt={postVisual.prompt} style={{ width:'100%', display:'block' }}/>
                    <div style={{ padding:'8px 10px', background:'#F8FAFC', fontSize:11, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
                      <button onClick={generateVisualForPost} disabled={generatingVisual}
                        style={{ marginRight:6, padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'#fff', cursor: generatingVisual ? 'wait' : 'pointer', fontSize:11 }}>
                        🔄 Neu generieren
                      </button>
                      <button onClick={() => { upd('visual_id', null); setPostVisual(null); if (post?.id) supabase.from('content_posts').update({ visual_id: null }).eq('id', post.id) }}
                        style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:11, color:'#dc2626' }}>
                        🗑️ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={generateVisualForPost} disabled={generatingVisual || !form.content?.trim()}
                    style={{ width:'100%', padding:'14px 16px', borderRadius:10, border:'1.5px dashed var(--border)', background:'rgba(124,58,237,0.04)', color:'#7C3AED', fontSize:13, fontWeight:600, cursor: generatingVisual ? 'wait' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    {generatingVisual ? '⏳ Generiere Bild...' : '🪄 Bild zum Post generieren'}
                  </button>
                )}
              </div>
            )}

            {/* Team-Kommentare (nur fuer existing posts) */}
            {!isNew && (
              <div style={{ marginTop:18 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>💬 Team-Kommentare ({comments.length})</label>
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:240, overflowY:'auto', marginBottom:8 }}>
                  {commentsLoading && <div style={{ fontSize:12, color:'var(--text-muted)' }}>Lade…</div>}
                  {!commentsLoading && comments.length === 0 && (
                    <div style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic', padding:'10px 12px', background:'#F8FAFC', borderRadius:8 }}>
                      Noch keine Kommentare. Stell eine Frage ans Team oder bitte um Feedback.
                    </div>
                  )}
                  {comments.map(c => (
                    <div key={c.id} style={{ padding:'10px 12px', background:'#F8FAFC', borderRadius:8, borderLeft:'3px solid rgba(49,90,231,0.3)' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:4 }}>
                        {(members || []).find(m => m.user_id === c.user_id)?.email || c.user_id.slice(0,8)}
                        {' · '}
                        {new Date(c.created_at).toLocaleString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>
                      <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    placeholder="Kommentar oder Feedback ans Team…"
                    rows={2}
                    style={{ flex:1, padding:'10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
                  <button onClick={addComment} disabled={!newComment.trim()}
                    style={{ padding:'8px 14px', borderRadius:8, border:'none', background: newComment.trim() ? 'var(--wl-primary, rgb(49,90,231))' : '#CBD5E1', color:'#fff', fontSize:12, fontWeight:700, cursor: newComment.trim() ? 'pointer' : 'not-allowed', whiteSpace:'nowrap' }}>
                    Senden
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right — Metadaten */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Status — kompakter Select statt 8 Buttons */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Status</label>
              <select value={form.status} onChange={e => upd('status', e.target.value)}
                style={{
                  width:'100%', padding:'10px 12px', borderRadius:10,
                  border:`1.5px solid ${STATUS[form.status]?.border || '#E5E7EB'}`,
                  background: STATUS[form.status]?.bg || '#fff',
                  color: STATUS[form.status]?.color || 'var(--text-primary)',
                  fontSize:13, fontWeight:600, cursor:'pointer',
                  fontFamily:'inherit', outline:'none', boxSizing:'border-box',
                }}>
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Geplant für — nur sichtbar in advanced view oder wenn schon Datum gesetzt */}
            {(showAdvanced || form.scheduled_at) && <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>📅 Geplant für</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={e => upd('scheduled_at', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, outline:'none', boxSizing:'border-box', color:'rgb(20,20,43)' }}/>
              <div style={{ marginTop:8, padding:'8px 10px', background:'#F0FDF4', borderRadius:8, border:'1px solid #A7F3D0' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#065F46', marginBottom:4 }}>💡 Beste Zeiten für LinkedIn</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {[
                    { label:'Di 08:00', val:'08:00' },
                    { label:'Mi 12:00', val:'12:00' },
                    { label:'Do 17:00', val:'17:00' },
                    { label:'Di 07:30', val:'07:30' },
                  ].map(t => {
                    const nextDay = (dow) => { const d = new Date(); const diff = (dow - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate()+diff); return d.toISOString().slice(0,10) }
                    const dayMap = { 'Di':2, 'Mi':3, 'Do':4 }
                    const day = t.label.slice(0,2)
                    const dateStr = nextDay(dayMap[day]) + 'T' + t.val
                    return (
                      <button key={t.label} onClick={() => upd('scheduled_at', dateStr)}
                        style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, border:'1px solid #6EE7B7', background:'var(--surface)', color:'#065F46', cursor:'pointer' }}>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>}

            {/* Tags — nur advanced */}
            {showAdvanced && <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>🏷️ Tags</label>
                <button onClick={async () => {
                  if (!form.content.trim()) return
                  setImproving(true)
                  try {
                    const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
                      body: { type: 'content_post', prompt: `Schlage 8 relevante LinkedIn-Hashtags für diesen Post vor. Nur die Hashtags kommagetrennt ohne # Zeichen, keine anderen Texte:\n\n${form.content}`, userId: session.user.id, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
                    })
                    if (fnErr) throw fnErr
                    const tags = (fnData?.text || fnData?.result || '').replace(/#/g,'').trim()
                    if (tags) upd('tags', form.tags ? form.tags + ', ' + tags : tags)
                  } catch(e) {}
                  setImproving(false)
                }} disabled={improving || !form.content.trim()}
                  style={{ fontSize:10, fontWeight:700, color:'var(--wl-primary, rgb(49,90,231))', background:'rgba(49,90,231,0.07)', border:'1px solid rgba(49,90,231,0.2)', borderRadius:6, padding:'2px 8px', cursor: improving||!form.content.trim() ? 'not-allowed':'pointer', opacity: !form.content.trim()?0.5:1 }}>
                  ✨ KI-Vorschläge
                </button>
              </div>
              <input value={form.tags} onChange={e => upd('tags', e.target.value)}
                placeholder="b2b, sales, linkedin (kommagetrennt)"
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, outline:'none', boxSizing:'border-box', color:'rgb(20,20,43)' }}/>
              {form.tags && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                  {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} onClick={() => upd('tags', form.tags.split(',').map(x=>x.trim()).filter(x=>x!==t).join(', '))}
                      style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, cursor:'pointer',
                      background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE' }} title="Klick zum Entfernen">#{t} ×</span>
                  ))}
                </div>
              )}
            </div>}

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

            {/* LinkedIn Card Vorschau */}
            {form.content && (
              <div style={{ border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--surface)' }}>
                <div style={{ padding:'10px 12px 6px', background:'#F3F2EF', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.05em' }}>💼 LinkedIn-Vorschau</span>
                </div>
                <div style={{ padding:'12px 14px' }}>
                  {/* Profil-Zeile */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>MS</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>Michael Schreck</div>
                      <div style={{ fontSize:11, color:'#666' }}>Sales Intelligence · Leadesk</div>
                      <div style={{ fontSize:10, color:'#999' }}>Jetzt · 🌐</div>
                    </div>
                    <div style={{ marginLeft:'auto', color:'#0A66C2', fontSize:20, fontWeight:300 }}>…</div>
                  </div>
                  {/* Content */}
                  <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.65, whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:180, overflow:'auto' }}>
                    {form.content.slice(0,600)}{form.content.length > 600 ? '…mehr' : ''}
                  </div>
                  {/* Reactions */}
                  <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', display:'flex', gap:16 }}>
                    {['👍 Gefällt mir','💬 Kommentieren','↗️ Teilen'].map(a => (
                      <span key={a} style={{ fontSize:11, color:'#666', fontWeight:600 }}>{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
          {form.content && form.status !== 'published' && (
            <button onClick={async () => {
              await navigator.clipboard.writeText(form.content)
              window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank')
              // optimistisch: warte 3s und frage nach URL
              setTimeout(() => {
                const url = window.prompt('Text ist kopiert + LinkedIn ist offen. Wenn du gepostet hast: bitte URL des Posts hier einfügen (oder leer lassen):', '')
                if (url && url.trim()) {
                  upd('linkedin_post_url', url.trim())
                  upd('status', 'published')
                  upd('published_at', new Date().toISOString())
                  setTimeout(() => save(), 100)
                }
              }, 2500)
            }} style={{ padding:'9px 16px', borderRadius:10, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              🚀 Auf LinkedIn posten
            </button>
          )}
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
  const [filter, setFilter]       = useState('all')     // all | platform
  const [calDate, setCalDate]     = useState(new Date())
  const [search, setSearch]       = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [improving, setImproving] = useState(false)
  const [showBrainstorm, setShowBrainstorm] = useState(false)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()

  const [brainstormIdeas, setBrainstormIdeas] = useState([])
  const [brainstormTopic, setBrainstormTopic] = useState('')
  const [brainstormSelected, setBrainstormSelected] = useState(new Set())

  async function generateIdeas(customTopic = '') {
    setGenerating(true)
    setBrainstormIdeas([])
    setBrainstormSelected(new Set())
    try {
      // Memory: hole bisherige hochperformende Ideen als Kontext (Few-Shot)
      const { getFewShotExamples } = await import('../lib/contentMemory')
      const examples = await getFewShotExamples({
        userId: session.user.id, teamId: activeTeamId, kind: 'brainstorm', limit: 3
      })

      // Aktive Brand Voice laden
      const { data: bv } = await supabase.from('brand_voices').select('name, ai_summary, target_audience, mission').eq('is_active', true).limit(1).maybeSingle()

      let prompt = 'Generiere 6 kreative LinkedIn-Post-Ideen.'
      if (bv?.name) {
        prompt += ` Brand-Kontext: ${bv.name}.`
        if (bv.target_audience) prompt += ` Zielgruppe: ${bv.target_audience}.`
        if (bv.mission) prompt += ` Mission: ${bv.mission}.`
      }
      if (customTopic) prompt += ` Schwerpunkt-Thema: ${customTopic}.`
      prompt += ' Themen-Mix: Thought Leadership, persoenliche Erfahrungen, konkrete Tipps, kontroverse Thesen, Story-driven.'
      if (examples.length) {
        prompt += '\n\nBeispiele aus der Vergangenheit die gut funktioniert haben (als Inspiration fuer den Stil, NICHT 1:1 kopieren):\n'
        prompt += examples.slice(0, 3).map((e, i) => `${i+1}. ${e.slice(0, 200)}`).join('\n')
      }
      prompt += '\n\nAntworte NUR mit JSON-Array: [{"title":"prägnanter Titel","hook":"erster Satz/Hook fuer den Post","angle":"kurze Beschreibung der Stossrichtung"}, ...]'

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type: 'content_brainstorm', prompt, userId: session.user.id, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
      })
      if (fnErr) throw fnErr
      const text = fnData?.text || fnData?.result || '[]'
      const clean = text.replace(/```json|```/g,'').trim()
      const m = clean.match(/\[[\s\S]*\]/)
      const ideas = JSON.parse(m ? m[0] : clean)
      setBrainstormIdeas(ideas.slice(0, 6))
      // Memory: protokolliere die Brainstorm-Generation
      const { recordGeneration } = await import('../lib/contentMemory')
      await recordGeneration({
        userId: session.user.id, teamId: activeTeamId,
        kind: 'brainstorm', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        promptInput: { topic: customTopic || null, hasBV: !!bv },
        resolvedPrompt: prompt,
        brandVoiceId: bv?.id || null,
        variants: ideas,
      })
    } catch(e) {
      setBrainstormIdeas([{title:'Fehler beim Generieren', hook: e.message || 'Bitte nochmal versuchen.', angle:''}])
    }
    setGenerating(false)
  }

  async function adoptSelectedIdeas() {
    const uid = session.user.id
    const toCreate = brainstormIdeas.filter((_, i) => brainstormSelected.has(i))
    const created = []
    for (const idea of toCreate) {
      const { data: post } = await supabase.from('content_posts').insert({
        user_id: uid, team_id: activeTeamId, workspace,
        brand_voice_id: activeBrandVoice?.id,
        title: idea.title, content: idea.hook || '',
        topic: idea.angle || null,
        hook: idea.hook || null,
        platform: 'linkedin', status: 'idee'
      }).select().single()
      if (post) { setPosts(prev => [post, ...prev]); created.push(post) }
    }
    setShowBrainstorm(false)
    setBrainstormIdeas([])
    setBrainstormSelected(new Set())
    setBrainstormTopic('')

    // Closed Loop: bei genau 1 Idee direkt zur Text-Werkstatt navigieren mit Pre-Fill
    if (created.length === 1) {
      const idea = toCreate[0]
      const params = new URLSearchParams({
        topic: idea.title || '',
        angle: idea.angle || '',
        hook: idea.hook || '',
        post_id: created[0].id,
      })
      navigate('/content-studio?' + params.toString())
    }
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
    let q = supabase.from('content_posts').select('*').order('created_at', { ascending: false })
    if (workspace === 'team_support') {
      // Team-Support = Posts wo ich Reviewer/Assignee bin und Owner ein anderer ist
      q = q.or(`assignee_id.eq.${session.user.id},reviewer_id.eq.${session.user.id}`).neq('user_id', session.user.id)
    } else {
      q = q.eq('workspace', workspace)
    }
    const { data } = await q
    setPosts(data || [])
    setLoading(false)
  }

  // Re-load when workspace changes
  useEffect(() => { if (activeTeamId && activeBrandVoice?.id) loadPosts() }, [activeBrandVoice?.id, activeTeamId])

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

  // Gefilterte Posts
  const filtered = posts.filter(p => {
    if (filter !== 'all' && p.platform !== filter) return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.content.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // KPIs
  const kpis = {
    total: posts.length,
    geplant: posts.filter(p => p.status === 'scheduled').length,
    veroeffentlicht: posts.filter(p => p.status === 'published').length,
    diese_woche: posts.filter(p => {
      if (!p.scheduled_at) return false
      const d = new Date(p.scheduled_at)
      const now = new Date()
      const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7)
      return d >= now && d <= weekEnd
    }).length,
  }

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

        {/* KPI Strip — nur sichtbar wenn schon Beitraege existieren */}
        {kpis.total > 0 && <div style={{ display:'flex', gap:12 }}>
          {[
            { label:'Gesamt',         val: kpis.total,           icon:'📝', color:'var(--text-muted)' },
            { label:'Diese Woche',    val: kpis.diese_woche,     icon:'📅', color:'#2563EB' },
            { label:'Geplant',        val: kpis.geplant,         icon:'🕐', color:'#D97706' },
            { label:'Veröffentlicht', val: kpis.veroeffentlicht, icon:'✅', color:'#059669' },
          ].map(k => (
            <div key={k.label} style={{ background:'var(--surface)', borderRadius:14, padding:'12px 16px', border:'1px solid var(--border)',
              flex:1, display:'flex', alignItems:'center', gap:10, boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize:20 }}>{k.icon}</span>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color: k.color, lineHeight:1 }}>{k.val}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>{k.label}</div>
              </div>
            </div>
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

          {/* Platform Filter */}
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={() => setFilter('all')}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer',
                borderColor: filter==='all' ? 'var(--wl-primary, rgb(49,90,231))' : '#E5E7EB',
                background: filter==='all' ? 'var(--wl-primary, rgb(49,90,231))' : '#fff',
                color: filter==='all' ? '#fff' : '#64748B' }}>Alle</button>
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{ padding:'6px 10px', borderRadius:8, border:`1.5px solid ${filter===k?v.color:'#E5E7EB'}`,
                  background: filter===k ? v.bg : '#fff', color: filter===k ? v.color : '#64748B',
                  fontSize:12, fontWeight: filter===k ? 700 : 400, cursor:'pointer' }}>
                {v.icon}
              </button>
            ))}
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
                    {cols.map(p => <PostCard key={p.id} post={p} onClick={openEdit} />)}
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
                    {dayPosts.map(p => <PostCard key={p.id} post={p} onClick={openEdit} compact />)}
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
        <PostModal post={modal} onClose={closeModal} onSave={handleSave} onDelete={handleDelete} session={session} activeTeamId={activeTeamId} members={members} workspace={workspace} selectedModel={selectedModel} />
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
                Lass dir 6 Ideen passend zu deiner Brand Voice generieren. Die KI nutzt deinen Markenkontext und (falls aktiviert) deine bisherigen Top-Posts.
              </p>
              <div style={{ marginTop:12, display:'flex', gap:8 }}>
                <input value={brainstormTopic} onChange={e => setBrainstormTopic(e.target.value)}
                  placeholder="Schwerpunkt-Thema (optional, z.B. 'Vertrauen aufbauen', 'KI im Sales')"
                  style={{ flex:1, padding:'9px 12px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:13, outline:'none', background:'var(--surface)' }}/>
                <button onClick={() => generateIdeas(brainstormTopic.trim())} disabled={generating}
                  style={{ padding:'9px 16px', borderRadius:9, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:generating?'wait':'pointer', whiteSpace:'nowrap' }}>
                  {generating ? '⏳ Generiere…' : '🪄 Ideen generieren'}
                </button>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'14px 22px' }}>
              {brainstormIdeas.length === 0 && !generating && (
                <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                  💡 Klick auf <strong>"Ideen generieren"</strong> oben für 6 frische Post-Ideen.
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
                      <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>{idea.title}</div>
                      {idea.hook && <div style={{ fontSize:13, color:'rgb(60,60,90)', lineHeight:1.5, fontStyle:'italic' }}>"{idea.hook}"</div>}
                      {idea.angle && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>{idea.angle}</div>}
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
