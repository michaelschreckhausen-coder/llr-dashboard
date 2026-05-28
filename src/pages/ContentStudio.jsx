// src/pages/ContentStudio.jsx
// Text-Werkstatt — Rewrite 2026-05-28
//
// Klar struktur:
//   1) Optionaler "Du arbeitest gerade an: [Post-Titel]"-Banner (Anschluss aus Redaktionsplan)
//   2) Mode-Switcher (Voller Post / Hooks / Text verbessern)
//   3) Input-Card (mode-spezifische Felder)
//   4) Brand-Voice-Toggle + Modell-Dropdown + Generate-Button in einer Action-Row
//   5) Ergebnis-Card mit Bearbeiten + LinkedIn-Preview
//   6) Output-Actions: "Zu bestehendem Beitrag hinzufuegen" | "Als neuen Beitrag anlegen" | Kopieren
//
// Brand-Voice + content_history + Memory-Recording bleiben.

import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { recordGeneration } from '../lib/contentMemory'
import MemoryConsentModal, { useMemoryConsent } from '../components/MemoryConsentModal'
import { useModel } from '../context/ModelContext'

const P = 'var(--wl-primary, rgb(49,90,231))'

// ─── LLM-Modelle (für Dropdown — gleiche Werte wie ModelSelector) ──────────
const TEXT_MODELS = [
  { value: 'claude-opus-4-7',     label: '🧠 Claude Opus 4.7 — Best Reasoning',    provider: 'Anthropic' },
  { value: 'claude-sonnet-4-6',   label: '⚡ Claude Sonnet 4.6 — Default',          provider: 'Anthropic' },
  { value: 'claude-haiku-4-5',    label: '🚀 Claude Haiku 4.5 — schnell',          provider: 'Anthropic' },
  { value: 'gpt-5.5',             label: '🎯 GPT 5.5',                              provider: 'OpenAI' },
  { value: 'gpt-5.4',             label: '🎯 GPT 5.4',                              provider: 'OpenAI' },
  { value: 'gpt-5.4-mini',        label: '⚡ GPT 5.4 mini',                         provider: 'OpenAI' },
  { value: 'gemini-2.5-flash',    label: '✨ Gemini 2.5 Flash',                     provider: 'Google' },
  { value: 'mistral-large-latest',  label: '🇪🇺 Mistral Large',                     provider: 'Mistral' },
  { value: 'mistral-medium-latest', label: '🇪🇺 Mistral Medium',                    provider: 'Mistral' },
]

// ─── Prompt-Builder ─────────────────────────────────────────────────────────
function buildSystemPrompt(bv, ignoreBV) {
  if (ignoreBV || !bv) return 'Du bist LinkedIn-Ghostwriter mit B2B-Expertise. Professionell, klar, prägnant. Keine generischen Floskeln. Auf Deutsch.'
  const parts = [
    bv.ai_summary || '',
    bv.personality        ? 'Persönlichkeit: ' + bv.personality : '',
    bv.tone_attributes && bv.tone_attributes.length ? 'Ton: ' + bv.tone_attributes.join(', ') : '',
    bv.formality === 'du' ? 'Ansprache: Du-Form' : bv.formality === 'sie' ? 'Ansprache: Sie-Form' : '',
    bv.word_choice        ? 'Wortwahl: ' + bv.word_choice : '',
    bv.sentence_style     ? 'Satzstruktur: ' + bv.sentence_style : '',
    bv.dos                ? 'DO: ' + bv.dos : '',
    bv.donts              ? 'DONT: ' + bv.donts : '',
    bv.target_audience    ? 'Zielgruppe: ' + bv.target_audience : '',
  ].filter(Boolean).join(' | ')
  return 'Du bist LinkedIn-Ghostwriter. BRAND VOICE (verpflichtend einhalten): ' + parts + ' Schreibe in EXAKT dieser Wortwahl, Satzstruktur, Tonalität. Kein generischer KI-Stil. Auf Deutsch.'
}

function buildPostPrompt(f) {
  let s = 'Erstelle einen LinkedIn-Post.'
  if (f.topic)    s += ' Thema/Headline: ' + f.topic + '.'
  if (f.audience) s += ' Zielgruppe: '    + f.audience + '.'
  if (f.goal)     s += ' Ziel: '          + f.goal + '.'
  if (f.insight)  s += ' Persönliche Note / Key Insight: ' + f.insight + '.'
  s += ' Struktur: 1) HOOK (1-2 Zeilen Aufmerksamkeit) 2) HAUPTTEIL (Mehrwert, max 3 klare Punkte) 3) CTA. 150-280 Wörter, Zeilenumbrüche für Lesbarkeit. Auf Deutsch.'
  return s
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function ContentStudio({ session }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const { model: selectedModel, setModel: setSelectedModel } = useModel()
  const { needsConsent, dismiss: dismissConsent } = useMemoryConsent({ user: session.user })

  // Mode-State
  const [mode, setMode] = useState('full')  // full | hooks | improve
  const [fields, setFields] = useState({})

  // Output-State
  const [result, setResult] = useState('')
  const [hookVariants, setHookVariants] = useState([])
  const [aiOriginalText, setAiOriginalText] = useState('')
  const [lastGenerationId, setLastGenerationId] = useState(null)

  // UI-State
  const [generating, setGenerating] = useState(false)
  const [ignoreBV, setIgnoreBV] = useState(false)
  const [flash, setFlash] = useState(null)
  const [copied, setCopied] = useState(false)

  // Post-Anschluss aus Redaktionsplan (?post_id=X)
  const [linkedPostId, setLinkedPostId] = useState(null)
  const [linkedPost, setLinkedPost] = useState(null)

  // Save-Picker (für "Zu bestehendem Beitrag hinzufügen")
  const [attachPickerOpen, setAttachPickerOpen] = useState(false)
  const [attachPosts, setAttachPosts] = useState([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')
  const [savedFlash, setSavedFlash] = useState('')

  // ─── Pre-Fill aus URL-Params ──────────────────────────────────────────────
  useEffect(() => {
    const post_id = searchParams.get('post_id')
    if (post_id) {
      setLinkedPostId(post_id)
      // Post laden + Modus voreinstellen
      ;(async () => {
        const { data: p } = await supabase.from('content_posts')
          .select('id, title, content, topic, status, brand_voice_id')
          .eq('id', post_id).maybeSingle()
        if (!p) return
        setLinkedPost(p)
        if ((p.content || '').trim()) {
          // Schon Text vorhanden → Verbessern
          setMode('improve')
          setFields({
            original_text: p.content,
            improve_goal: '',
            topic: p.title || '',
          })
        } else {
          // Nur Titel → Vollen Post bauen
          setMode('full')
          setFields({
            topic: p.title || '',
            audience: '',
            goal: '',
            insight: '',
          })
        }
      })()
    } else {
      // Legacy-Pre-Fill (aus altem Brainstorming-Flow)
      const topic = searchParams.get('topic')
      const hook  = searchParams.get('hook')
      if (topic || hook) {
        setMode('full')
        setFields({
          topic: topic || '',
          audience: '',
          goal: '',
          insight: hook ? 'Hook-Vorlage: ' + hook : '',
        })
      }
    }
  }, [searchParams])

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function showFlash(msg, type) { setFlash({ msg, type: type || 'success' }); setTimeout(() => setFlash(null), 3500) }

  function switchMode(next) {
    if (next === mode) return
    setMode(next)
    setHookVariants([])
    setLastGenerationId(null)
    setAiOriginalText('')
    if (next === 'improve' && result) {
      setFields(prev => ({ original_text: result, improve_goal: '', topic: prev.topic || '' }))
    } else if (next === 'full' && fields.original_text) {
      setFields(prev => ({ ...prev, original_text: undefined, improve_goal: undefined }))
    } else if (next === 'hooks') {
      setFields(prev => ({ topic: prev.topic || '' }))
    }
  }

  // ─── Generators ───────────────────────────────────────────────────────────
  async function generatePost() {
    if (!(fields.topic || '').trim()) { showFlash('Bitte ein Thema / Headline angeben', 'error'); return }
    setGenerating(true); setResult('')
    try {
      const { data: d } = await supabase.functions.invoke('generate', {
        body: {
          type: 'content_studio',
          systemPrompt: buildSystemPrompt(activeBrandVoice, ignoreBV),
          prompt: buildPostPrompt(fields),
          template: 'linkedin_post',
          model: selectedModel,
          brand_voice_id: activeBrandVoice?.id || null,
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
        brand_voice_snapshot: ignoreBV ? null : (activeBrandVoice ? activeBrandVoice.ai_summary : null),
        ignored_brand_voice: ignoreBV,
      })
      const memRow = await recordGeneration({
        userId: session.user.id, teamId: activeTeamId,
        kind: 'full_post', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        promptInput: { fields, ignoreBV },
        brandVoiceId: activeBrandVoice ? activeBrandVoice.id : null,
        variants: [text],
      })
      if (memRow) setLastGenerationId(memRow.id)
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setGenerating(false)
  }

  async function generateHooks() {
    if (!(fields.topic || '').trim()) { showFlash('Bitte ein Thema angeben', 'error'); return }
    setGenerating(true); setHookVariants([])
    try {
      const prompt = `Generiere 6 unterschiedliche Hooks (jeweils erste 1-2 Zeilen eines LinkedIn-Posts) zum Thema: "${fields.topic.trim()}".

Variiere die Hook-Typen:
1. Provokante These
2. Konkrete Zahl/Statistik
3. Persönliche Anekdote / Story-Opening
4. Frage an den Leser
5. Kontroverser/Ungewöhnlicher Take
6. Storytelling mit Cliffhanger

Antworte NUR mit einem JSON-Array von 6 Strings (kein Markdown, kein Vorwort): ["Hook1", "Hook2", ...]
Auf Deutsch, max 2 Sätze pro Hook, kein zusätzlicher Kontext.`
      const { data } = await supabase.functions.invoke('generate', {
        body: { type:'content_studio', systemPrompt: buildSystemPrompt(activeBrandVoice, ignoreBV), prompt, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
      })
      const text = data?.text || data?.result || '[]'
      const clean = text.replace(/```json|```/g, '').trim()
      const m = clean.match(/\[[\s\S]*\]/)
      const hooks = JSON.parse(m ? m[0] : clean)
      setHookVariants(hooks.slice(0, 6))
      const memRow = await recordGeneration({
        userId: session.user.id, teamId: activeTeamId,
        kind:'hook', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        promptInput:{ topic: fields.topic.trim() },
        brandVoiceId: activeBrandVoice ? activeBrandVoice.id : null,
        variants: hooks,
      })
      if (memRow) setLastGenerationId(memRow.id)
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setGenerating(false)
  }

  async function pickHook(idx) {
    setResult(hookVariants[idx])
    setAiOriginalText(hookVariants[idx])
    if (lastGenerationId) {
      const { recordPickedVariant } = await import('../lib/contentMemory')
      await recordPickedVariant(lastGenerationId, idx)
    }
    showFlash('Hook übernommen — jetzt kannst du ihn weiterbearbeiten')
  }

  async function improveText() {
    const original = fields.original_text || result
    if (!(original || '').trim()) { showFlash('Bitte Originaltext eingeben', 'error'); return }
    if (!activeBrandVoice && !ignoreBV) { showFlash('Keine Brand Voice — Toggle setzen oder BV anlegen', 'error'); return }
    setGenerating(true); setResult('')
    try {
      const prompt = 'Schreibe in Brand Voice um. Behalte Kernbotschaft. '
        + (fields.improve_goal ? 'Ziel: ' + fields.improve_goal + '. ' : '')
        + 'ORIGINAL: --- ' + original + ' --- Nur den verbesserten Text, keine Erklärung.'
      const { data: d } = await supabase.functions.invoke('generate', {
        body: { type:'content_studio', systemPrompt: buildSystemPrompt(activeBrandVoice, ignoreBV), prompt, template:'improve', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
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
        ignored_brand_voice: ignoreBV,
      })
      const memRow = await recordGeneration({
        userId: session.user.id, teamId: activeTeamId,
        kind:'improve', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        promptInput:{ original, improve_goal: fields.improve_goal || '', ignoreBV },
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
    setAttachPickerOpen(true)
    setSavedFlash('')
    setAttachLoading(true)
    let q = supabase.from('content_posts')
      .select('id, title, content, status, scheduled_at, brand_voice_id, created_at')
      .neq('status', 'published')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at',   { ascending: false })
      .limit(80)
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data } = await q
    setAttachPosts(data || [])
    setAttachLoading(false)
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
    // Memory-Recording: Edit-Log
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

  // ─── Render ───────────────────────────────────────────────────────────────
  const filteredAttachPosts = (attachPosts || []).filter(p => {
    if (!attachSearch.trim()) return true
    const s = attachSearch.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {needsConsent && <MemoryConsentModal session={session} onClose={dismissConsent}/>}

      {/* Header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Textwerkstatt</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Dein nächster Post-Text.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:560 }}>
          Schreib einen LinkedIn-Post in deiner Brand Voice — oder lass dir Hook-Varianten geben oder bestehenden Text verbessern. Zum Schluss in den Redaktionsplan übernehmen.
        </p>
      </div>

      {/* Linked-Post-Banner: wenn du aus dem Redaktionsplan kommst */}
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

      {/* Brand-Voice-Banner */}
      {!activeBrandVoice ? (
        <div style={{ padding:'12px 16px', borderRadius:10, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:18 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#92400E' }}>Keine Brand Voice aktiv — </span>
          <a href="/brand-voice" style={{ color: P, fontWeight:700 }}>Brand Voice erstellen</a>
        </div>
      ) : (
        <div style={{ padding:'10px 14px', borderRadius:10, background: ignoreBV ? '#F8FAFC' : '#F0FDF4', border:'1px solid ' + (ignoreBV ? 'var(--border)' : '#BBF7D0'), marginBottom:18, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ fontSize:12, color: ignoreBV ? '#475569' : '#166534' }}>
            {ignoreBV ? '🎙️ Brand Voice deaktiviert — Standard-B2B-Stil' : `🎙️ Brand Voice aktiv: ${activeBrandVoice.name}`}
          </div>
          <button onClick={() => setIgnoreBV(!ignoreBV)}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:7, border:'1px solid ' + (ignoreBV ? 'var(--border)' : '#86EFAC'), background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', color: ignoreBV ? '#475569' : '#166534' }}>
            <span style={{ display:'inline-block', width:26, height:14, borderRadius:8, background: ignoreBV ? '#CBD5E1' : '#22C55E', position:'relative', flexShrink:0 }}>
              <span style={{ position:'absolute', top:2, left: ignoreBV ? 2 : 14, width:10, height:10, borderRadius:'50%', background:'#fff', transition:'left .12s' }}/>
            </span>
            {ignoreBV ? 'Brand Voice ein' : 'Brand Voice aus'}
          </button>
        </div>
      )}

      {/* Flash */}
      {flash && (
        <div style={{ padding:'10px 14px', borderRadius:9, marginBottom:14, fontSize:13, fontWeight:600, background: flash.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'error' ? '#991B1B' : '#166534', border:'1px solid ' + (flash.type === 'error' ? '#FCA5A5' : '#BBF7D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Mode-Switcher */}
      <div style={{ display:'flex', gap:6, marginBottom:14, padding:5, background:'#F1F5F9', borderRadius:12, width:'fit-content' }}>
        {[
          { id:'full',    label:'📝 Voller Post' },
          { id:'hooks',   label:'🎯 Hooks' },
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
            <Field label="Zielgruppe (optional)" hint="An wen geht der Post?">
              <input value={fields.audience || ''} onChange={e => setFields(p => ({ ...p, audience: e.target.value }))}
                placeholder="z.B. B2B-Sales-Leader im DACH-Mittelstand"
                style={INP}/>
            </Field>
            <Field label="Ziel des Posts (optional)" hint="Was soll der Leser denken/tun?">
              <input value={fields.goal || ''} onChange={e => setFields(p => ({ ...p, goal: e.target.value }))}
                placeholder={`z.B. „Diskussion anstoßen", „DM auslösen", „Position als Thought Leader"`}
                style={INP}/>
            </Field>
            <Field label="Key-Insight / persönliche Note (optional)" hint="Eigene Geschichte, Daten, kontroverse These">
              <textarea value={fields.insight || ''} onChange={e => setFields(p => ({ ...p, insight: e.target.value }))}
                rows={3}
                placeholder={`z.B. „Bei 80% lag der Hebel nicht im Pitch, sondern in den ersten 2 Minuten — Erwartungs-Reframing."`}
                style={TEX}/>
            </Field>
          </>
        )}

        {mode === 'hooks' && (
          <Field label="Thema *" hint="Wofür sollen Hooks generiert werden?">
            <input value={fields.topic || ''} onChange={e => setFields(p => ({ ...p, topic: e.target.value }))}
              placeholder={`z.B. „Cold-Outreach in 2026" oder „Warum die meisten Sales-Trainings nichts bringen"`}
              style={INP}/>
          </Field>
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

        {/* Action-Row: Modell + Generate */}
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginTop:8, flexWrap:'wrap' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 220px', minWidth:200 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Modell</span>
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
              style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer', width:'100%' }}>
              {['Anthropic','OpenAI','Google','Mistral'].map(prov => (
                <optgroup key={prov} label={prov}>
                  {TEXT_MODELS.filter(m => m.provider === prov).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button onClick={mode === 'full' ? generatePost : mode === 'hooks' ? generateHooks : improveText}
            disabled={generating}
            style={{ padding:'10px 22px', borderRadius:9, border:'none', background: generating ? '#94A3B8' : P, color:'#fff', fontSize:13, fontWeight:700, cursor: generating ? 'not-allowed' : 'pointer', display:'inline-flex', alignItems:'center', gap:6, boxShadow:'0 2px 10px rgba(49,90,231,.18)' }}>
            <span>{generating ? '⏳' : '✨'}</span>
            <span>
              {generating ? 'Generiere…' :
               mode === 'full' ? 'Post generieren' :
               mode === 'hooks' ? '6 Hooks generieren' :
               'Text verbessern'}
            </span>
          </button>
        </div>
      </section>

      {/* Hook-Varianten (nur Hooks-Mode) */}
      {mode === 'hooks' && hookVariants.length > 0 && (
        <section style={{ marginBottom:16 }}>
          <h3 style={{ fontSize:14, fontWeight:700, margin:'0 0 10px' }}>Hook-Varianten — klick zum Übernehmen</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:8 }}>
            {hookVariants.map((h, i) => (
              <button key={i} onClick={() => pickHook(i)}
                style={{ textAlign:'left', padding:'12px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, color:'var(--text-primary)', lineHeight:1.5, transition:'all .12s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.background = 'rgba(49,90,231,0.03)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff' }}>
                <div style={{ fontSize:10, fontWeight:700, color: P, textTransform:'uppercase', marginBottom:4 }}>Variante {i+1}</div>
                <div>{h}</div>
              </button>
            ))}
          </div>
        </section>
      )}

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

          {/* Output-Action-Row */}
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
                  Wähle einen Beitrag aus dem Redaktionsplan — der Text ersetzt dort den content.
                  {activeBrandVoice ? ` Beiträge der BV: ${activeBrandVoice.name}.` : ''}
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
