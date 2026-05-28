// src/pages/ContentStudio.jsx
// Text Werkstatt — Rewrite 2026-05-29
//
// Struktur:
//   1) Optionaler Banner "aus dem Redaktionsplan: [Post-Titel]"
//   2) Mode-Switcher (Voller Post / Text verbessern) — Hooks-Tab entfernt
//   3) Input-Felder (Thema, Ziel, Sonstiger Input bzw. Original-Text)
//   4) Referenz-Medien-Sektion: eigene Uploads ODER vom Linked-Post übernommen
//   5) Action-Row: Zielgruppe-Dropdown + Generate-Button
//   6) Ergebnis-Card mit Output-Actions
//
// Modell kommt aus der Topbar (useModel), nicht hier.
// Brand Voice kommt aus useBrandVoice() — kein Banner mehr (siehe Topbar).

import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { recordGeneration } from '../lib/contentMemory'
import MemoryConsentModal, { useMemoryConsent } from '../components/MemoryConsentModal'
import { useModel } from '../context/ModelContext'

const P = 'var(--wl-primary, rgb(49,90,231))'

// ─── Prompt-Builder ─────────────────────────────────────────────────────────
function buildSystemPrompt(bv) {
  if (!bv) return 'Du bist LinkedIn-Ghostwriter mit B2B-Expertise. Professionell, klar, prägnant. Keine generischen Floskeln. Auf Deutsch.'
  const parts = [
    bv.ai_summary || '',
    bv.personality        ? 'Persönlichkeit: ' + bv.personality : '',
    bv.tone_attributes && bv.tone_attributes.length ? 'Ton: ' + bv.tone_attributes.join(', ') : '',
    bv.formality === 'du' ? 'Ansprache: Du-Form' : bv.formality === 'sie' ? 'Ansprache: Sie-Form' : '',
    bv.word_choice        ? 'Wortwahl: ' + bv.word_choice : '',
    bv.sentence_style     ? 'Satzstruktur: ' + bv.sentence_style : '',
    bv.dos                ? 'DO: ' + bv.dos : '',
    bv.donts              ? 'DONT: ' + bv.donts : '',
  ].filter(Boolean).join(' | ')
  return 'Du bist LinkedIn-Ghostwriter. BRAND VOICE (verpflichtend): ' + parts + ' Schreibe in EXAKT dieser Wortwahl, Satzstruktur, Tonalität. Auf Deutsch.'
}

function buildPostPrompt(f, audience, referenceMedia) {
  let s = 'Erstelle einen LinkedIn-Post.'
  if (f.topic)         s += ' Thema/Headline: '   + f.topic + '.'
  if (audience)        s += ' Zielgruppe: '       + audience.name + (audience.description ? ' (' + audience.description + ')' : '') + '.'
  if (f.goal)          s += ' Ziel: '             + f.goal + '.'
  if (f.extra_input)   s += ' Weiterer Input / persönliche Note: ' + f.extra_input + '.'
  if (referenceMedia && referenceMedia.length) {
    s += ` Es gibt ${referenceMedia.length} Referenz-${referenceMedia.length === 1 ? 'medium' : 'medien'} (`
    s += referenceMedia.map(m => m.media_type === 'video' ? 'Video' : m.media_type === 'document' ? 'Dokument' : 'Bild').join(', ')
    s += '), nutze sie als inhaltliche Inspiration.'
  }
  s += ' Struktur: 1) HOOK (1-2 Zeilen Aufmerksamkeit) 2) HAUPTTEIL (Mehrwert, max 3 klare Punkte) 3) CTA. 150-280 Wörter, Zeilenumbrüche für Lesbarkeit. Auf Deutsch.'
  return s
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function ContentStudio({ session }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const { model: selectedModel } = useModel()
  const { needsConsent, dismiss: dismissConsent } = useMemoryConsent({ user: session.user })

  // Mode-State (nur noch 2: full + improve)
  const [mode, setMode] = useState('full')
  const [fields, setFields] = useState({})

  // Zielgruppen
  const [audiences, setAudiences] = useState([])
  const [selectedAudienceId, setSelectedAudienceId] = useState('')

  // Referenz-Medien
  const [referenceMedia, setReferenceMedia] = useState([])  // {id, media_type, signed_url, prompt, original_filename, storage_path}
  const [uploadingRef, setUploadingRef] = useState(false)

  // Output-State
  const [result, setResult] = useState('')
  const [aiOriginalText, setAiOriginalText] = useState('')
  const [lastGenerationId, setLastGenerationId] = useState(null)

  // UI-State
  const [generating, setGenerating] = useState(false)
  const [flash, setFlash] = useState(null)
  const [copied, setCopied] = useState(false)

  // Post-Anschluss
  const [linkedPostId, setLinkedPostId] = useState(null)
  const [linkedPost, setLinkedPost] = useState(null)

  // Save-Picker
  const [attachPickerOpen, setAttachPickerOpen] = useState(false)
  const [attachPosts, setAttachPosts] = useState([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')
  const [savedFlash, setSavedFlash] = useState('')

  // ─── Zielgruppen für aktive BV laden ──────────────────────────────────────
  useEffect(() => {
    if (!activeBrandVoice?.id) { setAudiences([]); setSelectedAudienceId(''); return }
    ;(async () => {
      const { data, error } = await supabase
        .from('target_audience_brand_voices')
        .select('target_audiences(id, name, description, is_default)')
        .eq('brand_voice_id', activeBrandVoice.id)
      if (error) { console.warn('[audiences]', error); return }
      const list = (data || []).map(r => r.target_audiences).filter(Boolean)
      list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
      setAudiences(list)
      // Default-Zielgruppe vorauswählen wenn vorhanden
      const def = list.find(a => a.is_default)
      if (def && !selectedAudienceId) setSelectedAudienceId(def.id)
    })()
  }, [activeBrandVoice?.id])

  // ─── Pre-Fill aus URL ─────────────────────────────────────────────────────
  useEffect(() => {
    const post_id = searchParams.get('post_id')
    const forcedMode = searchParams.get('mode')
    if (post_id) {
      setLinkedPostId(post_id)
      ;(async () => {
        const { data: p } = await supabase.from('content_posts')
          .select('id, title, content, topic, status, brand_voice_id, target_audience_id')
          .eq('id', post_id).maybeSingle()
        if (!p) return
        setLinkedPost(p)
        const hasText = (p.content || '').trim().length > 0
        const wantImprove = forcedMode === 'improve' && hasText
        if (wantImprove || hasText) {
          setMode('improve')
          setFields({
            original_text: p.content,
            improve_goal: '',
            topic: p.title || '',
          })
        } else {
          setMode('full')
          setFields({
            topic: p.title || '',
            goal: '',
            extra_input: '',
          })
        }
        if (p.target_audience_id) setSelectedAudienceId(p.target_audience_id)

        // Linked-Post-Medien als Referenzen vorladen
        const { data: cpv } = await supabase
          .from('content_post_visuals')
          .select('visuals(id, media_type, prompt, original_filename, storage_path)')
          .eq('post_id', p.id)
          .order('position', { ascending: true })
        const visuals = (cpv || []).map(r => r.visuals).filter(Boolean)
        const withUrls = await Promise.all(visuals.map(async (v) => {
          const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
          return { ...v, signed_url: signed?.signedUrl || null, fromPost: true }
        }))
        if (withUrls.length) setReferenceMedia(withUrls)
      })()
    } else {
      const topic = searchParams.get('topic')
      const hook  = searchParams.get('hook')
      if (topic || hook) {
        setMode('full')
        setFields({
          topic: topic || '',
          goal: '',
          extra_input: hook ? 'Hook-Vorlage: ' + hook : '',
        })
      }
    }
  }, [searchParams])

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function showFlash(msg, type) { setFlash({ msg, type: type || 'success' }); setTimeout(() => setFlash(null), 3500) }

  function switchMode(next) {
    if (next === mode) return
    setMode(next)
    setAiOriginalText('')
    setLastGenerationId(null)
    if (next === 'improve' && result) {
      setFields(prev => ({ original_text: result, improve_goal: '', topic: prev.topic || '' }))
    } else if (next === 'full' && fields.original_text) {
      setFields(prev => ({ topic: prev.topic || '', goal: '', extra_input: '' }))
    }
  }

  // ─── Referenz-Medien Upload ───────────────────────────────────────────────
  async function uploadReferenceFiles(filesArray) {
    if (!filesArray?.length) return
    if (!activeTeamId) { alert('Kein Team aktiv'); return }
    if (!activeBrandVoice?.id) { alert('Keine Brand Voice aktiv'); return }
    setUploadingRef(true)
    try {
      const newOnes = []
      for (const file of filesArray) {
        if (file.size > 500 * 1024 * 1024) { alert(`${file.name}: max 500 MB`); continue }
        let mediaType = 'document'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) mediaType = 'video'
        else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) mediaType = 'document'
        else if (/\.(mp4|mov|webm|avi)$/i.test(file.name)) mediaType = 'video'
        else if (/\.(png|jpe?g|webp|svg)$/i.test(file.name)) mediaType = 'image'

        const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
        const visualId = crypto.randomUUID()
        const path = `${activeTeamId}/text-refs/${visualId}.${ext}`
        const contentType = file.type
          || (mediaType === 'document' ? 'application/pdf' : mediaType === 'video' ? 'video/mp4' : 'image/jpeg')

        const { error: upErr } = await supabase.storage.from('visuals').upload(path, file, { contentType, upsert: false })
        if (upErr) { console.error('[ref-upload]', upErr); alert(`Upload ${file.name} fehlgeschlagen: ${upErr.message}`); continue }

        const { data: visualRow, error: insErr } = await supabase.from('visuals').insert({
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
        }).select().single()
        if (insErr) { console.error('[ref-insert]', insErr); continue }
        const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(path, 60 * 60 * 24)
        newOnes.push({ ...visualRow, signed_url: signed?.signedUrl })
      }
      if (newOnes.length) setReferenceMedia(prev => [...prev, ...newOnes])
    } finally {
      setUploadingRef(false)
    }
  }

  function removeReferenceMedia(id) {
    setReferenceMedia(prev => prev.filter(r => r.id !== id))
  }

  // ─── Generators ───────────────────────────────────────────────────────────
  async function generatePost() {
    if (!(fields.topic || '').trim()) { showFlash('Bitte ein Thema / Headline angeben', 'error'); return }
    setGenerating(true); setResult('')
    try {
      const audience = audiences.find(a => a.id === selectedAudienceId) || null
      const referenceMediaPaths = referenceMedia.map(r => r.storage_path)
      const { data: d } = await supabase.functions.invoke('generate', {
        body: {
          type: 'content_studio',
          systemPrompt: buildSystemPrompt(activeBrandVoice),
          prompt: buildPostPrompt(fields, audience, referenceMedia),
          template: 'linkedin_post',
          model: selectedModel,
          brand_voice_id: activeBrandVoice?.id || null,
          referenceMediaPaths,
        }
      })
      const text = d?.text || d?.content || ''
      if (!text) { showFlash('Fehler: ' + (d?.error || 'Kein Text erhalten'), 'error'); return }
      setResult(text)
      setAiOriginalText(text)
      await supabase.from('content_history').insert({
        user_id: session.user.id,
        template_id: 'linkedin_post',
        template_label: 'LinkedIn Post',
        input_fields: fields,
        generated_text: text,
        brand_voice_id: activeBrandVoice ? activeBrandVoice.id : null,
        brand_voice_snapshot: activeBrandVoice ? activeBrandVoice.ai_summary : null,
        ignored_brand_voice: false,
      })
      const memRow = await recordGeneration({
        userId: session.user.id, teamId: activeTeamId,
        kind: 'full_post', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        promptInput: { fields, audience: audience?.name, refCount: referenceMedia.length },
        brandVoiceId: activeBrandVoice ? activeBrandVoice.id : null,
        variants: [text],
      })
      if (memRow) setLastGenerationId(memRow.id)
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setGenerating(false)
  }

  async function improveText() {
    const original = fields.original_text || result
    if (!(original || '').trim()) { showFlash('Bitte Originaltext eingeben', 'error'); return }
    setGenerating(true); setResult('')
    try {
      const audience = audiences.find(a => a.id === selectedAudienceId) || null
      const prompt = 'Schreibe in Brand Voice um. Behalte Kernbotschaft. '
        + (audience ? 'Zielgruppe: ' + audience.name + '. ' : '')
        + (fields.improve_goal ? 'Ziel: ' + fields.improve_goal + '. ' : '')
        + 'ORIGINAL: --- ' + original + ' --- Nur den verbesserten Text, keine Erklärung.'
      const { data: d } = await supabase.functions.invoke('generate', {
        body: {
          type:'content_studio',
          systemPrompt: buildSystemPrompt(activeBrandVoice),
          prompt,
          template:'improve',
          model: selectedModel,
          brand_voice_id: activeBrandVoice?.id || null,
          referenceMediaPaths: referenceMedia.map(r => r.storage_path),
        }
      })
      const text = d?.text || d?.content || ''
      if (!text) { showFlash('Fehler: ' + (d?.error || 'Kein Text erhalten'), 'error'); return }
      setResult(text)
      setAiOriginalText(text)
      await supabase.from('content_history').insert({
        user_id: session.user.id,
        template_id:'improve',
        template_label:'Text verbessert',
        input_fields: fields,
        generated_text: text,
        brand_voice_id: activeBrandVoice ? activeBrandVoice.id : null,
        ignored_brand_voice: false,
      })
      const memRow = await recordGeneration({
        userId: session.user.id, teamId: activeTeamId,
        kind:'improve', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        promptInput:{ original, improve_goal: fields.improve_goal || '', audience: audience?.name },
        brandVoiceId: activeBrandVoice ? activeBrandVoice.id : null,
        variants:[text],
      })
      if (memRow) setLastGenerationId(memRow.id)
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setGenerating(false)
  }

  // ─── Save-Actions ─────────────────────────────────────────────────────────
  async function openAttachPicker() {
    setAttachPickerOpen(true); setSavedFlash(''); setAttachLoading(true)
    let q = supabase.from('content_posts')
      .select('id, title, content, status, scheduled_at, brand_voice_id, created_at')
      .neq('status', 'published')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at',   { ascending: false })
      .limit(80)
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data } = await q
    setAttachPosts(data || []); setAttachLoading(false)
  }

  async function attachToPost(targetPost) {
    if (!result.trim()) return
    if (targetPost.content && targetPost.content !== result) {
      if (!confirm('Dieser Beitrag enthält bereits Text. Überschreiben?')) return
    }
    const { error } = await supabase.from('content_posts').update({
      content: result,
      title: targetPost.title || (fields.topic || '').slice(0, 80) || 'Neuer Beitrag',
      status: targetPost.status === 'idee' ? 'draft' : targetPost.status,
    }).eq('id', targetPost.id)
    if (error) { showFlash('Fehler: ' + error.message, 'error'); return }
    if (lastGenerationId && aiOriginalText && aiOriginalText !== result) {
      const { recordEdit } = await import('../lib/contentMemory')
      await recordEdit({
        userId: session.user.id, teamId: activeTeamId, postId: targetPost.id,
        generationId: lastGenerationId, aiText: aiOriginalText, finalText: result,
      })
    }
    setSavedFlash('✅ Text in „' + (targetPost.title || 'Beitrag') + '" eingefügt')
    setTimeout(() => { setAttachPickerOpen(false); setSavedFlash('') }, 1400)
  }

  async function createNewPost() {
    if (!result.trim()) return
    if (!activeBrandVoice?.id) { showFlash('Keine aktive Brand Voice', 'error'); return }
    if (!activeTeamId)         { showFlash('Kein Team aktiv', 'error'); return }
    const title = (fields.topic || result.split('\n')[0] || '').slice(0, 80) || 'Neuer Beitrag'
    const { data: post, error } = await supabase.from('content_posts').insert({
      user_id: session.user.id,
      team_id: activeTeamId,
      workspace: 'personal',
      brand_voice_id: activeBrandVoice.id,
      title,
      content: result,
      platform: 'linkedin',
      status: 'draft',
      topic: fields.topic || null,
      target_audience_id: selectedAudienceId || null,
    }).select().single()
    if (error) { showFlash('Anlegen fehlgeschlagen: ' + error.message, 'error'); return }
    if (post && lastGenerationId && aiOriginalText && aiOriginalText !== result) {
      const { recordEdit } = await import('../lib/contentMemory')
      await recordEdit({
        userId: session.user.id, teamId: activeTeamId, postId: post.id,
        generationId: lastGenerationId, aiText: aiOriginalText, finalText: result,
      })
    }
    showFlash('✅ Neuer Beitrag angelegt — gleich gehts zum Redaktionsplan…')
    setTimeout(() => navigate('/redaktionsplan'), 1000)
  }

  async function saveBackToLinkedPost() {
    if (!result.trim() || !linkedPostId) return
    const { error } = await supabase.from('content_posts').update({
      content: result,
      status: linkedPost?.status === 'idee' ? 'draft' : linkedPost?.status || 'draft',
      target_audience_id: selectedAudienceId || linkedPost?.target_audience_id || null,
    }).eq('id', linkedPostId)
    if (error) { showFlash('Fehler: ' + error.message, 'error'); return }
    if (lastGenerationId && aiOriginalText && aiOriginalText !== result) {
      const { recordEdit } = await import('../lib/contentMemory')
      await recordEdit({
        userId: session.user.id, teamId: activeTeamId, postId: linkedPostId,
        generationId: lastGenerationId, aiText: aiOriginalText, finalText: result,
      })
    }
    showFlash('✅ Text in „' + (linkedPost?.title || 'Beitrag') + '" gespeichert')
    setTimeout(() => navigate('/redaktionsplan'), 900)
  }

  function copyText() { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2500) }

  const filteredAttachPosts = (attachPosts || []).filter(p => {
    if (!attachSearch.trim()) return true
    const s = attachSearch.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {needsConsent && <MemoryConsentModal session={session} onClose={dismissConsent}/>}

      {/* Header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Text</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Text Werkstatt</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:560 }}>
          Schreib einen LinkedIn-Post in deiner Brand Voice — oder verbessere bestehenden Text. Zum Schluss in den Redaktionsplan übernehmen.
        </p>
      </div>

      {/* Linked-Post-Banner */}
      {linkedPostId && linkedPost && (
        <div style={{ padding:'10px 14px', marginBottom:16, borderRadius:10, background:'rgba(49,90,231,0.06)', border:'1px solid rgba(49,90,231,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            <span style={{ fontSize:16 }}>📌</span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color: P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Aus dem Redaktionsplan</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {linkedPost.title || '(ohne Titel)'}
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/redaktionsplan')}
            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            ← Zurück zum Plan
          </button>
        </div>
      )}

      {/* Flash */}
      {flash && (
        <div style={{ padding:'10px 14px', borderRadius:9, marginBottom:14, fontSize:13, fontWeight:600, background: flash.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'error' ? '#991B1B' : '#166534', border:'1px solid ' + (flash.type === 'error' ? '#FCA5A5' : '#BBF7D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Mode-Switcher (Voller Post / Verbessern) */}
      <div style={{ display:'flex', gap:6, marginBottom:14, padding:5, background:'#F1F5F9', borderRadius:12, width:'fit-content' }}>
        {[
          { id:'full',    label:'📝 Voller Post' },
          { id:'improve', label:'✨ Text verbessern' },
        ].map(opt => {
          const isActive = mode === opt.id
          return (
            <button key={opt.id} onClick={() => switchMode(opt.id)}
              style={{
                padding:'7px 16px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
                background: isActive ? '#fff' : 'transparent', color: isActive ? P : '#64748B',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition:'all 0.15s',
              }}>
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Input-Card */}
      <section style={{ background:'var(--surface,#fff)', borderRadius:14, border:'1px solid var(--border)', padding:'18px 20px', marginBottom:16 }}>
        {mode === 'full' && (
          <>
            <Field label="Thema / Headline *" hint={`Worum geht's? z.B. „5 Lehren aus 200 Discovery-Calls"`}>
              <input value={fields.topic || ''} onChange={e => setFields(p => ({ ...p, topic: e.target.value }))}
                placeholder={`z.B. „5 Lehren aus 200 Discovery-Calls"`}
                style={INP}/>
            </Field>
            <Field label="Ziel des Posts (optional)" hint="Was soll der Leser denken/tun?">
              <input value={fields.goal || ''} onChange={e => setFields(p => ({ ...p, goal: e.target.value }))}
                placeholder={`z.B. „Diskussion anstoßen", „DM auslösen", „Position als Thought Leader"`}
                style={INP}/>
            </Field>
            <Field label="Sonstiger Input (optional)" hint="Story, Daten, kontroverse These, persönliche Note">
              <textarea value={fields.extra_input || ''} onChange={e => setFields(p => ({ ...p, extra_input: e.target.value }))}
                rows={3}
                placeholder={`z.B. „Bei 80% lag der Hebel nicht im Pitch, sondern in den ersten 2 Minuten — Erwartungs-Reframing."`}
                style={TEX}/>
            </Field>
          </>
        )}

        {mode === 'improve' && (
          <>
            <Field label="Originaltext *" hint="Der Text der überarbeitet werden soll (in Brand Voice)">
              <textarea value={fields.original_text || ''} onChange={e => setFields(p => ({ ...p, original_text: e.target.value }))}
                rows={8}
                placeholder="Den Originaltext hier einfügen…"
                style={TEX}/>
            </Field>
            <Field label="Verbesserungs-Ziel (optional)" hint={`z.B. „Kürzer", „Stärkerer Hook", „Mehr Story"`}>
              <input value={fields.improve_goal || ''} onChange={e => setFields(p => ({ ...p, improve_goal: e.target.value }))}
                placeholder="z.B. Stärkerer Hook"
                style={INP}/>
            </Field>
          </>
        )}

        {/* Referenz-Medien */}
        <div style={{ marginTop:6, marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>
            Referenz-Medien (optional, max 8)
          </label>
          {referenceMedia.length > 0 && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
              {referenceMedia.map(m => (
                <div key={m.id} style={{ position:'relative', width:84, height:84, borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', background:'#F1F5F9' }}>
                  {m.media_type === 'image' && m.signed_url && (
                    <img src={m.signed_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  )}
                  {m.media_type === 'video' && (
                    <div style={{ position:'relative', width:'100%', height:'100%', background:'#000' }}>
                      {m.signed_url && <video src={m.signed_url} muted preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontSize:18, color:'#fff' }}>▶</span>
                      </div>
                    </div>
                  )}
                  {m.media_type === 'document' && (
                    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:6, background:'linear-gradient(180deg, #F8FAFC 0%, #E5E7EB 100%)' }}>
                      <div style={{ fontSize:24 }}>📑</div>
                      <div style={{ fontSize:8, color:'#666', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>
                        {m.original_filename?.slice(0, 14) || 'PDF'}
                      </div>
                    </div>
                  )}
                  {m.fromPost && (
                    <div style={{ position:'absolute', top:3, left:3, padding:'1px 6px', background:'rgba(49,90,231,0.85)', color:'#fff', fontSize:9, fontWeight:700, borderRadius:4 }}>Post</div>
                  )}
                  <button onClick={() => removeReferenceMedia(m.id)}
                    style={{ position:'absolute', top:3, right:3, width:18, height:18, borderRadius:'50%', border:'none', background:'rgba(220,38,38,0.85)', color:'#fff', cursor:'pointer', fontSize:10, fontWeight:700, lineHeight:1 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {referenceMedia.length < 8 && (
            <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:12, fontWeight:600, cursor: uploadingRef ? 'wait' : 'pointer' }}>
              {uploadingRef ? '⏳ Lade hoch…' : '📎 Datei hochladen'}
              <input type="file" multiple
                accept=".png,.jpg,.jpeg,.webp,.svg,.mp4,.mov,.webm,.avi,.pdf,image/*,video/*,application/pdf"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  e.target.value = ''
                  uploadReferenceFiles(files)
                }}
                disabled={uploadingRef}
                style={{ display:'none' }}/>
            </label>
          )}
        </div>

        {/* Action-Row: Zielgruppe + Generate */}
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', marginTop:6 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 240px', minWidth:200 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Zielgruppe</span>
            <select value={selectedAudienceId} onChange={e => setSelectedAudienceId(e.target.value)}
              style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer', width:'100%' }}>
              <option value="">Keine spezifische Zielgruppe</option>
              {audiences.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' (Default)' : ''}</option>
              ))}
            </select>
            {audiences.length === 0 && activeBrandVoice && (
              <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>
                Keine Zielgruppen für diese BV. Anlegen in <a href="/brand-voice" style={{ color: P }}>Branding</a>.
              </span>
            )}
          </div>
          <button onClick={mode === 'full' ? generatePost : improveText}
            disabled={generating}
            style={{ padding:'10px 22px', borderRadius:9, border:'none', background: generating ? '#94A3B8' : P, color:'#fff', fontSize:13, fontWeight:700, cursor: generating ? 'not-allowed' : 'pointer', display:'inline-flex', alignItems:'center', gap:6, boxShadow:'0 2px 10px rgba(49,90,231,.18)' }}>
            <span>{generating ? '⏳' : '✨'}</span>
            <span>
              {generating ? 'Generiere…' : mode === 'full' ? 'Post generieren' : 'Text verbessern'}
            </span>
          </button>
        </div>
      </section>

      {/* Ergebnis-Card */}
      {result && (
        <section style={{ background:'var(--surface,#fff)', borderRadius:14, border:'1px solid var(--border)', padding:'18px 20px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:10, flexWrap:'wrap' }}>
            <h3 style={{ fontSize:14, fontWeight:700, margin:0 }}>📝 Ergebnis</h3>
            <span style={{ fontSize:11, color: result.length > 2200 ? '#dc2626' : result.length >= 800 && result.length <= 1500 ? '#16a34a' : 'var(--text-muted)' }}>
              {result.length.toLocaleString()} / 3.000 Zeichen
              {result.length > 2200 && ' — zu lang'}
              {result.length >= 800 && result.length <= 1500 && ' — ideal'}
            </span>
          </div>
          <textarea value={result} onChange={e => setResult(e.target.value)}
            rows={Math.max(8, Math.min(20, result.split('\n').length + 2))}
            style={{ ...TEX, fontSize:14, lineHeight:1.65 }}/>

          <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
            {linkedPostId ? (
              <button onClick={saveBackToLinkedPost}
                style={{ padding:'10px 16px', borderRadius:9, border:'none', background: P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(49,90,231,.2)' }}>
                💾 In „{(linkedPost?.title || 'Beitrag').slice(0, 28)}" speichern
              </button>
            ) : (
              <button onClick={createNewPost}
                style={{ padding:'10px 16px', borderRadius:9, border:'none', background: P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(49,90,231,.2)' }}>
                ✨ Als neuen Beitrag anlegen
              </button>
            )}
            <button onClick={openAttachPicker}
              style={{ padding:'10px 16px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              📅 Zu bestehendem Beitrag hinzufügen
            </button>
            <button onClick={copyText}
              style={{ padding:'10px 16px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              {copied ? '✓ Kopiert!' : '📋 Kopieren'}
            </button>
            <button onClick={() => switchMode('improve')}
              disabled={mode === 'improve'}
              style={{ padding:'10px 16px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color: mode === 'improve' ? '#CBD5E1' : 'var(--text-primary)', fontSize:13, fontWeight:600, cursor: mode === 'improve' ? 'not-allowed' : 'pointer' }}>
              ✨ Weiter verbessern
            </button>
          </div>
        </section>
      )}

      {/* Attach-Picker-Modal */}
      {attachPickerOpen && (
        <div onClick={e => e.target === e.currentTarget && setAttachPickerOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:120 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:720, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, margin:0 }}>📅 Text zu Beitrag hinzufügen</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>
                  Wähle einen Beitrag — der Text ersetzt dort den content.
                </p>
              </div>
              <button onClick={() => setAttachPickerOpen(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
            </div>
            <input type="text" value={attachSearch} onChange={e => setAttachSearch(e.target.value)}
              placeholder="🔍 Beitrag suchen…"
              style={{ padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10, flexShrink:0 }}/>
            {savedFlash && (
              <div style={{ marginBottom:10, padding:'10px 14px', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:9, color:'#065F46', fontSize:13, fontWeight:600, flexShrink:0 }}>{savedFlash}</div>
            )}
            <div style={{ overflowY:'auto', flex:1, minHeight:0, marginRight:-8, paddingRight:8 }}>
              {attachLoading && <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)' }}>Lade…</div>}
              {!attachLoading && filteredAttachPosts.length === 0 && (
                <div style={{ padding:'32px 20px', textAlign:'center', background:'var(--surface)', borderRadius:10, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
                  Keine Beiträge gefunden.
                </div>
              )}
              {!attachLoading && filteredAttachPosts.map(p => {
                const statusLabels = { idee:'💡 Idee', draft:'📝 Entwurf', in_review:'👀 Review', approved:'✅ Approved', scheduled:'📅 Geplant', failed:'❌ Fehler' }
                return (
                  <button key={p.id} onClick={() => attachToPost(p)}
                    style={{ width:'100%', textAlign:'left', padding:'12px 14px', marginBottom:8, borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', display:'flex', gap:12, alignItems:'flex-start' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = P}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', padding:'2px 8px', background:'#F1F5F9', borderRadius:6 }}>{statusLabels[p.status] || p.status}</span>
                        {p.content && <span style={{ fontSize:10, color:'#92400E', background:'#FEF3C7', padding:'2px 6px', borderRadius:5, fontWeight:600 }}>hat bereits Text</span>}
                      </div>
                      <div style={{ fontSize:14, fontWeight:600, color:'rgb(20,20,43)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.title || '(ohne Titel)'}
                      </div>
                      {p.content && (
                        <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                          {p.content.slice(0, 180)}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Style-Konstanten ───────────────────────────────────────────────────────
const INP = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border,#E5E7EB)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }
const TEX = { ...INP, resize:'vertical' }

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:5 }}>{hint}</div>}
    </div>
  )
}
