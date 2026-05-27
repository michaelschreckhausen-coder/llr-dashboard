// src/pages/ContentStudio.jsx
// Text-Werkstatt — einheitlich für LinkedIn-Posts.
// Drei Modi (Voller Post / Hook-Werkstatt / Text verbessern) als Pill-Switcher.
// Container-Pattern + Journal-Header identisch zu Visuals/BrandVoice/Profiltexte.

import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useSearchParams } from 'react-router-dom'
import { recordGeneration } from '../lib/contentMemory'
import MemoryConsentModal, { useMemoryConsent } from '../components/MemoryConsentModal'
import { useModel } from '../context/ModelContext'

// ── Icons ────────────────────────────────────────────────────
const SparkIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const CopyIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const ImproveIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const RefreshIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.01-5.37"/></svg>
const VoiceIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
const HistoryIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>

// ── Prompt-Builder ───────────────────────────────────────────
function buildSystemPrompt(bv, ignoreBV) {
  if (ignoreBV || !bv) return 'Du bist LinkedIn B2B Experte. Professionell, klar, praegnant. Keine generischen Floskeln. Auf Deutsch.'
  const parts = [
    bv.ai_summary || '',
    bv.personality ? 'Persoenlichkeit: ' + bv.personality : '',
    bv.tone_attributes && bv.tone_attributes.length ? 'Ton: ' + bv.tone_attributes.join(', ') : '',
    bv.formality === 'du' ? 'Ansprache: Du-Form' : bv.formality === 'sie' ? 'Ansprache: Sie-Form' : '',
    bv.word_choice ? 'Wortwahl: ' + bv.word_choice : '',
    bv.sentence_style ? 'Satzstruktur: ' + bv.sentence_style : '',
    bv.dos ? 'DO: ' + bv.dos : '',
    bv.donts ? 'DONT: ' + bv.donts : '',
    bv.target_audience ? 'Zielgruppe: ' + bv.target_audience : '',
  ].filter(Boolean).join(' | ')
  return 'Du bist LinkedIn Ghostwriter. BRAND VOICE (VERPFLICHTEND): ' + parts + ' Exakt diese Wortwahl, Satzstruktur und Tonalitaet. Kein generischer AI-Stil. Auf Deutsch.'
}

function buildPostPrompt(f) {
  let s = 'Erstelle einen LinkedIn Post.'
  if (f.topic) s += ' Thema: ' + f.topic + '.'
  if (f.audience) s += ' Zielgruppe: ' + f.audience + '.'
  if (f.goal) s += ' Ziel: ' + f.goal + '.'
  if (f.insight) s += ' Persoenliche Note / Key Insight: ' + f.insight + '.'
  s += ' Struktur: 1. HOOK (1-2 Zeilen Aufmerksamkeit) 2. HAUPTTEIL (Mehrwert, max 3 Punkte) 3. CTA. 150-250 Woerter, Zeilenumbrueche fuer Lesbarkeit. Auf Deutsch.'
  return s
}

// ── Brand-Voice-Banner ───────────────────────────────────────
function BrandVoiceBanner({ bv, ignoreBV, onToggle }) {
  if (!bv) return (
    <div style={{ padding:'12px 16px', borderRadius:10, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:18 }}>
      <span style={{ fontSize:13, fontWeight:700, color:'#92400E' }}>Keine Brand Voice aktiv — </span>
      <a href="/brand-voice" style={{ color:'var(--wl-primary, rgb(49,90,231))', fontWeight:700 }}>Brand Voice erstellen</a>
    </div>
  )
  return (
    <div style={{ padding:'12px 16px', borderRadius:10, background: ignoreBV ? 'rgb(238,241,252)' : '#F0FDF4', border:'1px solid ' + (ignoreBV ? '#E5E7EB' : '#BBF7D0'), marginBottom:18, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
        <VoiceIcon/>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color: ignoreBV ? '#475569' : '#166534', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {ignoreBV ? 'Brand Voice deaktiviert' : 'Brand Voice aktiv: ' + bv.name}
          </div>
          <div style={{ fontSize:11, color: ignoreBV ? '#94A3B8' : '#059669' }}>
            {ignoreBV ? 'Standard B2B-Stil' : 'Text wird in deiner Brand Voice generiert'}
          </div>
        </div>
      </div>
      <div onClick={onToggle} title={ignoreBV ? 'Brand Voice anwenden' : 'Brand Voice ignorieren'} style={{ width:36, height:20, borderRadius:999, background: ignoreBV ? '#E5E7EB' : '#22C55E', position:'relative', cursor:'pointer', flexShrink:0 }}>
        <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left: ignoreBV ? 2 : 18, boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
      </div>
    </div>
  )
}

// ── Field-Primitives ─────────────────────────────────────────
const inp = { width:'100%', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none', transition:'border-color .12s' }
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:5 }}>{hint}</div>}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────
export default function ContentStudio({ session }) {
  const [mode, setMode]         = useState('full')   // 'full' | 'hooks' | 'improve'
  const [fields, setFields]     = useState({})       // topic, audience, goal, insight (full) | topic (hooks) | original_text, improve_goal (improve)
  const [result, setResult]     = useState('')
  const [hookVariants, setHookVariants] = useState([])

  const [generating, setGen]    = useState(false)
  const [hookGenerating, setHookGen] = useState(false)
  const [improving, setImp]     = useState(false)

  const { model: selectedModel, setModel: setSelectedModel } = useModel()
  const [copied, setCopied]     = useState(false)
  const [ignoreBV, setIgnoreBV] = useState(false)

  const [history, setHistory]   = useState([])
  const [showHist, setShowHist] = useState(false)
  const [flash, setFlash]       = useState(null)

  const [savingToPlan, setSavingToPlan] = useState(false)
  const [savedFlash, setSavedFlash]     = useState(false)
  const [linkedPostId, setLinkedPostId] = useState(null)
  const [lastGenerationId, setLastGenerationId] = useState(null)
  const [aiOriginalText, setAiOriginalText]     = useState('')

  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const { needsConsent, dismiss: dismissConsent } = useMemoryConsent({ user: session.user })
  const [searchParams] = useSearchParams()

  // Pre-Fill aus URL-Params (wenn aus Brainstorm-Modal kommend)
  useEffect(() => {
    const topic = searchParams.get('topic')
    const angle = searchParams.get('angle')
    const hook  = searchParams.get('hook')
    const post_id = searchParams.get('post_id')
    if (topic || angle || hook) {
      setMode('full')
      setFields({
        topic: topic || '',
        audience: '',
        goal: '',
        insight: hook ? `Hook-Vorlage aus Brainstorming: ${hook}` : (angle || ''),
      })
      if (post_id) setLinkedPostId(post_id)
    }
  }, [searchParams])

  // Mode-Wechsel: reset Fields + Result (außer wenn nur Hook gepickt wurde)
  function switchMode(next) {
    if (next === mode) return
    setMode(next)
    setFields({})
    setResult('')
    setHookVariants([])
    setLastGenerationId(null)
    setAiOriginalText('')
  }

  // History laden
  const loadHist = useCallback(async () => {
    let q = supabase.from('content_history').select('*').eq('user_id', session.user.id).order('created_at', { ascending:false }).limit(20)
    // BV-Filter
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data } = await q
    setHistory(data || [])
  }, [session.user.id, activeBrandVoice?.id])
  useEffect(() => { loadHist() }, [loadHist])

  const showFlash = (msg, type) => { setFlash({ msg, type: type || 'success' }); setTimeout(() => setFlash(null), 3500) }

  // ── Generate: Voller Post ───────────────────────────────
  async function generatePost() {
    if (!fields.topic || !fields.topic.trim()) { showFlash('Bitte ein Thema angeben', 'error'); return }
    setGen(true); setResult('')
    try {
      const { data: d } = await supabase.functions.invoke('generate', {
        body: {
          type: 'content_studio',
          systemPrompt: buildSystemPrompt(activeBrandVoice, ignoreBV),
          prompt: buildPostPrompt(fields),
          template: 'linkedin_post',
          model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
        }
      })
      const text = d?.text || d?.content || ''
      if (text) {
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
        loadHist()
      } else {
        showFlash('Fehler: ' + (d?.error || 'Kein Text erhalten'), 'error')
      }
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setGen(false)
  }

  // ── Generate: Hooks ─────────────────────────────────────
  async function generateHooks() {
    if (!fields.topic || !fields.topic.trim()) { showFlash('Bitte ein Thema angeben', 'error'); return }
    setHookGen(true); setHookVariants([])
    try {
      const prompt = `Generiere 6 unterschiedliche Hooks (jeweils erste 1-2 Zeilen eines LinkedIn-Posts) zum Thema: "${fields.topic.trim()}".

Variiere die Hook-Typen:
1. Provokante These
2. Konkrete Zahl/Statistik
3. Persoenliche Anekdote / Story-Opening
4. Frage an den Leser
5. Kontroverser/Ungewoehnlicher Take
6. Storytelling mit Cliffhanger

Antworte NUR mit einem JSON-Array von 6 Strings (kein Markdown, kein Vorwort): ["Hook1", "Hook2", ...]
Auf Deutsch, max 2 Saetze pro Hook, kein zusaetzlicher Kontext.`

      const { data, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'content_studio', systemPrompt: buildSystemPrompt(activeBrandVoice, ignoreBV), prompt, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null, content_kind:'hook' }
      })
      if (fnErr) throw fnErr
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
      setHookVariants([])
      showFlash('Fehler beim Generieren: ' + (e.message || 'Unbekannt'), 'error')
    }
    setHookGen(false)
  }

  async function pickHook(idx) {
    setResult(hookVariants[idx])
    setAiOriginalText(hookVariants[idx])
    if (lastGenerationId) {
      const { recordPickedVariant } = await import('../lib/contentMemory')
      await recordPickedVariant(lastGenerationId, idx)
    }
    showFlash('Hook übernommen — du kannst ihn jetzt weiterbearbeiten')
  }

  // ── Improve ─────────────────────────────────────────────
  async function improveText() {
    const original = fields.original_text || result
    if (!original || !original.trim()) { showFlash('Bitte Originaltext eingeben', 'error'); return }
    if (!activeBrandVoice && !ignoreBV) { showFlash('Keine Brand Voice — Deaktiviere den Brand-Voice-Schalter oder leg eine BV an', 'error'); return }
    setImp(true); setResult('')
    try {
      const prompt = 'Schreibe in Brand Voice um. Behalte Kernbotschaft. '
        + (fields.improve_goal ? 'Ziel: ' + fields.improve_goal + '. ' : '')
        + 'ORIGINAL: --- ' + original + ' --- Nur den verbesserten Text.'
      const { data: d } = await supabase.functions.invoke('generate', {
        body: { type:'content_studio', systemPrompt: buildSystemPrompt(activeBrandVoice, ignoreBV), prompt, template:'improve', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
      })
      const text = d?.text || d?.content || ''
      if (text) {
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
        loadHist()
      } else {
        showFlash('Fehler: ' + (d?.error || 'Kein Text erhalten'), 'error')
      }
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setImp(false)
  }

  // ── Improve im Result-Block (zweiter Pass) ──────────────
  async function improveResult() {
    if (!result.trim() || !activeBrandVoice) { showFlash(result.trim() ? 'Keine Brand Voice' : 'Kein Text', 'error'); return }
    setImp(true)
    try {
      const { data: d } = await supabase.functions.invoke('generate', {
        body: { type:'content_studio', systemPrompt: buildSystemPrompt(activeBrandVoice, false), prompt:'Schreibe in Brand Voice um. Behalte Kernbotschaft. ORIGINAL: --- ' + result + ' --- Nur den verbesserten Text.', template:'improve', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
      })
      const text = d?.text || d?.content || ''
      if (text) { setResult(text); showFlash('Text verbessert') }
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setImp(false)
  }

  // ── Save to Redaktionsplan ──────────────────────────────
  async function saveToPlan(targetStatus = 'draft') {
    if (!result.trim() || !activeTeamId) return
    setSavingToPlan(true)
    try {
      const titlePart = fields?.topic || (result.split('\n')[0] || '').slice(0, 60)
      const payload = {
        user_id: session.user.id,
        team_id: activeTeamId,
        workspace: 'personal',
        title: titlePart || '(Ohne Titel)',
        content: result,
        platform: 'linkedin',
        status: targetStatus,
        topic: fields?.topic || null,
        brand_voice_id: activeBrandVoice?.id,
      }
      let post = null
      if (linkedPostId) {
        const { data } = await supabase.from('content_posts').update(payload).eq('id', linkedPostId).select().single()
        post = data
      } else {
        const { data } = await supabase.from('content_posts').insert(payload).select().single()
        post = data
      }
      if (post && lastGenerationId && aiOriginalText && aiOriginalText !== result) {
        const { recordEdit } = await import('../lib/contentMemory')
        await recordEdit({
          userId: session.user.id, teamId: activeTeamId, postId: post.id,
          generationId: lastGenerationId,
          aiText: aiOriginalText, finalText: result,
        })
      }
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (e) {
      console.error('[saveToPlan]', e)
      showFlash('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'), 'error')
    }
    setSavingToPlan(false)
  }

  const copy = () => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  const P = 'var(--wl-primary, rgb(49,90,231))'

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {needsConsent && <MemoryConsentModal session={session} onClose={dismissConsent}/>}

      {/* Journal-Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:20, flexWrap:'wrap', marginBottom:22 }}>
        <div style={{ flex:'1 1 auto', minWidth:280 }}>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Text</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--text-primary, rgb(20,20,43))' }}>Dein nächster Post.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:560 }}>
            Schreib einen LinkedIn-Post in deiner Brand Voice — oder lass dir nur Hook-Varianten geben oder bestehenden Text verbessern.
          </p>
        </div>
        <button onClick={() => setShowHist(!showHist)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', fontSize:12, fontWeight:600, color:'#475569', cursor:'pointer' }}>
          <HistoryIcon/> Verlauf ({history.length})
        </button>
      </div>

      {/* Brand-Voice-Banner */}
      <BrandVoiceBanner bv={activeBrandVoice} ignoreBV={ignoreBV} onToggle={() => setIgnoreBV(!ignoreBV)}/>

      {/* Flash */}
      {flash && (
        <div style={{ padding:'10px 16px', borderRadius:9, marginBottom:16, fontSize:13, fontWeight:600, background: flash.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'error' ? '#991B1B' : '#166534', border:'1px solid ' + (flash.type === 'error' ? '#FCA5A5' : '#BBF7D0') }}>
          {flash.type === 'error' ? 'Fehler: ' : '✓ '}{flash.msg}
        </div>
      )}

      {/* Mode-Switcher (Pills) */}
      <div style={{ display:'flex', gap:6, marginBottom:18, padding:5, background:'#F1F5F9', borderRadius:12, width:'fit-content' }}>
        {[
          { id:'full',    label:'📝 Voller Post',   desc:'Kompletten LinkedIn-Post in deiner Brand Voice' },
          { id:'hooks',   label:'🎯 Hook-Werkstatt', desc:'6 Hook-Varianten zur Auswahl' },
          { id:'improve', label:'✨ Text verbessern', desc:'Bestehenden Text in Brand Voice umschreiben' },
        ].map(m => (
          <button key={m.id} onClick={() => switchMode(m.id)} title={m.desc}
            style={{
              padding:'9px 16px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
              background: mode === m.id ? '#fff' : 'transparent',
              color: mode === m.id ? P : '#64748B',
              boxShadow: mode === m.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s',
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Mode: Voller Post ─────────────────────────────── */}
      {mode === 'full' && (
        <section style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'20px 22px', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>📝</span> Voller Post
            </h3>          </div>

          <Field label="Thema *" hint="Worüber willst du schreiben?">
            <input value={fields.topic || ''} onChange={e => setFields(f => ({ ...f, topic: e.target.value }))} placeholder="z.B. KI im Vertrieb, eigenes Coaching, neues Feature" style={inp}/>
          </Field>
          <Field label="Zielgruppe" hint="Wen sprichst du an?">
            <input value={fields.audience || ''} onChange={e => setFields(f => ({ ...f, audience: e.target.value }))} placeholder="z.B. B2B Sales Manager DACH" style={inp}/>
          </Field>
          <Field label="Ziel" hint="Was willst du erreichen?">
            <input value={fields.goal || ''} onChange={e => setFields(f => ({ ...f, goal: e.target.value }))} placeholder="z.B. neue Leads / Reichweite / Position als Experte" style={inp}/>
          </Field>
          <Field label="Persönliche Note" hint="Eigenes Erlebnis, Aha-Moment, konkrete Zahl (optional)">
            <textarea value={fields.insight || ''} onChange={e => setFields(f => ({ ...f, insight: e.target.value }))} placeholder='z.B. „Letzte Woche hat ein Kunde …"'
              rows={3} style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
          </Field>

          <button onClick={generatePost} disabled={generating || !fields.topic?.trim()}
            style={{
              marginTop:6, width:'100%', padding:'12px', borderRadius:999, border:'none',
              background: generating || !fields.topic?.trim() ? '#94A3B8' : 'linear-gradient(135deg,rgb(49,90,231),#8B5CF6)',
              color:'#fff', fontSize:14, fontWeight:700,
              cursor: generating || !fields.topic?.trim() ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow: generating || !fields.topic?.trim() ? 'none' : '0 4px 14px rgba(49,90,231,0.25)',
            }}>
            {generating ? 'Generiere Post …' : <><SparkIcon/> Jetzt generieren</>}
          </button>
        </section>
      )}

      {/* ── Mode: Hook-Werkstatt ──────────────────────────── */}
      {mode === 'hooks' && (
        <section style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'20px 22px', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>🎯</span> Hook-Werkstatt
            </h3>          </div>

          <Field label="Thema *" hint="Worüber willst du einen Post schreiben?">
            <input value={fields.topic || ''} onChange={e => setFields(f => ({ ...f, topic: e.target.value }))}
              placeholder="z.B. KI im Vertrieb, Cold Calls sind tot, eigene Methode"
              style={inp}/>
          </Field>

          <button onClick={generateHooks} disabled={hookGenerating || !fields.topic?.trim()}
            style={{
              padding:'11px 22px', borderRadius:999, border:'none',
              background: hookGenerating || !fields.topic?.trim() ? '#94A3B8' : 'linear-gradient(135deg,rgb(49,90,231),#8B5CF6)',
              color:'#fff', fontSize:13, fontWeight:700,
              cursor: hookGenerating || !fields.topic?.trim() ? 'not-allowed' : 'pointer',
              display:'inline-flex', alignItems:'center', gap:8,
              boxShadow: hookGenerating || !fields.topic?.trim() ? 'none' : '0 4px 14px rgba(49,90,231,0.25)',
            }}>
            {hookGenerating ? '⏳ Generiere 6 Hooks …' : <><SparkIcon/> 6 Hook-Varianten generieren</>}
          </button>

          {hookVariants.length > 0 && (
            <div style={{ marginTop:18, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>
                Klick auf einen Hook um ihn als Start für deinen Post zu nutzen:
              </div>
              {hookVariants.map((h, i) => (
                <button key={i} onClick={() => pickHook(i)}
                  style={{ textAlign:'left', padding:'12px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', transition:'all .15s', fontSize:13, lineHeight:1.5, color:'rgb(20,20,43)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.background = 'rgba(49,90,231,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff' }}>
                  <span style={{ display:'inline-block', minWidth:28, fontSize:11, fontWeight:700, color:'var(--text-muted)' }}>#{i+1}</span>
                  {h}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Mode: Text verbessern ─────────────────────────── */}
      {mode === 'improve' && (
        <section style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'20px 22px', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>✨</span> Text verbessern
            </h3>          </div>

          <Field label="Original-Text *" hint="Fertiger oder halbfertiger Post den die KI in deiner Brand Voice umschreiben soll">
            <textarea value={fields.original_text || ''} onChange={e => setFields(f => ({ ...f, original_text: e.target.value }))}
              placeholder="Hier Original-Text einfügen …"
              rows={6} style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
          </Field>
          <Field label="Ziel (optional)" hint='z.B. „stärkerer Hook", „kürzere Sätze", „mehr Mehrwert"'>

            <input value={fields.improve_goal || ''} onChange={e => setFields(f => ({ ...f, improve_goal: e.target.value }))}
              placeholder="z.B. Hook schärfer machen, Position aktiver formulieren"
              style={inp}/>
          </Field>

          <button onClick={improveText} disabled={improving || !(fields.original_text?.trim())}
            style={{
              marginTop:6, width:'100%', padding:'12px', borderRadius:999, border:'none',
              background: improving || !(fields.original_text?.trim()) ? '#94A3B8' : 'linear-gradient(135deg,#7C3AED,#A855F7)',
              color:'#fff', fontSize:14, fontWeight:700,
              cursor: improving || !(fields.original_text?.trim()) ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow: improving || !(fields.original_text?.trim()) ? 'none' : '0 4px 14px rgba(124,58,237,0.25)',
            }}>
            {improving ? 'Verbessere …' : <><ImproveIcon/> Text verbessern</>}
          </button>
        </section>
      )}

      {/* ── Result (alle Modi) ───────────────────────────── */}
      {result && (
        <section style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden', marginBottom:18 }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#FAFAFA', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
              Generierter Text
              {activeBrandVoice && !ignoreBV && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'rgba(49,90,231,0.08)', color:P, border:'1px solid #BFDBFE' }}>
                  Brand Voice
                </span>
              )}
            </div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {activeBrandVoice && !ignoreBV && (
                <button onClick={improveResult} disabled={improving}
                  style={{ padding:'5px 12px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#7C3AED,#A855F7)', color:'#fff', fontSize:11, fontWeight:700, cursor:improving?'wait':'pointer', display:'flex', alignItems:'center', gap:5 }}>
                  <ImproveIcon/>{improving ? 'Verbessere …' : 'Improve mit Brand Voice'}
                </button>
              )}
              {mode === 'full' && (
                <button onClick={generatePost} disabled={generating}
                  style={{ padding:'5px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'#475569', fontSize:11, fontWeight:600, cursor:generating?'wait':'pointer', display:'flex', alignItems:'center', gap:5 }}>
                  <RefreshIcon/> Neu generieren
                </button>
              )}
              <button onClick={copy}
                style={{ padding:'5px 12px', borderRadius:8, border:'1px solid ' + (copied?'#BBF7D0':'#E5E7EB'), background: copied?'#F0FDF4':'#fff', color: copied?'#166534':'#475569', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                <CopyIcon/>{copied ? 'Kopiert!' : 'Kopieren'}
              </button>
              <button onClick={() => saveToPlan('draft')} disabled={savingToPlan || !result.trim()}
                style={{ padding:'5px 12px', borderRadius:8, border:'1px solid ' + (savedFlash?'#A7F3D0':'rgba(49,90,231,0.3)'), background: savedFlash?'#ECFDF5':'rgba(49,90,231,0.07)', color: savedFlash?'#065F46':P, fontSize:11, fontWeight:700, cursor: savingToPlan?'wait':'pointer', display:'flex', alignItems:'center', gap:5 }}>
                {savingToPlan ? '⏳ Speichere …' : savedFlash ? '✓ Im Plan!' : '📅 In Redaktionsplan'}
              </button>
            </div>
          </div>
          <div style={{ padding:'18px 20px' }}>
            <textarea value={result} onChange={e => setResult(e.target.value)}
              style={{ width:'100%', minHeight:240, border:'none', outline:'none', fontSize:14, lineHeight:1.7, fontFamily:'inherit', resize:'vertical', color:'rgb(20,20,43)', background:'transparent', boxSizing:'border-box' }}/>
          </div>
          <div style={{ padding:'8px 16px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F8FAFC' }}>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>
              {result.split(/\s+/).filter(Boolean).length} Wörter · {result.length} Zeichen
            </span>
            <button onClick={copy} style={{ fontSize:11, color:P, fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>
              Für LinkedIn kopieren
            </button>
          </div>
        </section>
      )}

      {/* ── History (collapsible) ────────────────────────── */}
      {showHist && (
        <section style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontWeight:700, fontSize:14 }}>Verlauf</div>
          {history.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Noch keine Texte generiert</div>
          ) : (
            <div style={{ maxHeight:480, overflowY:'auto' }}>
              {history.map(h => (
                <div key={h.id} style={{ padding:'14px 18px', borderBottom:'1px solid #F8FAFC', cursor:'pointer' }} onClick={() => { setResult(h.generated_text); setShowHist(false) }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'rgba(49,90,231,0.08)', color:P }}>{h.template_label}</span>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(h.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                  <div style={{ fontSize:13, color:'#475569', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{h.generated_text}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
