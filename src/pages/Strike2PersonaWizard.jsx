// Strike2PersonaWizard — geführter 8-Schritte-Wizard (Phase 3a).
// SPA-Wizard mit ?step=N (Deep-Link/Back), Auto-Save (debounced 1s) in
// strike2_personas (persona_grunddaten / antworten[tag] / current_step),
// Progress-Bar, Step-Navigation. Step 0+1 voll; 2–7 scaffolded ("in Vorbereitung",
// Phase 3b); Step 8 Review + Generate-Stub (KI = Phase 4).
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { STRIKE2_STEPS, STRIKE2_TOTAL_STEPS, strike2Step } from '../lib/strike2QuestionsCatalog'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const S2 = '#F97316'

// ── Input-Renderer ────────────────────────────────────────────────
function FieldInput({ q, value, onChange }) {
  const base = { width: '100%', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }
  if (q.type === 'text') {
    return <input type="text" value={value || ''} placeholder={q.placeholder || ''} onChange={(e) => onChange(e.target.value)} style={base} />
  }
  if (q.type === 'textarea') {
    return <textarea value={value || ''} placeholder={q.placeholder || ''} onChange={(e) => onChange(e.target.value)} rows={4} style={{ ...base, resize: 'vertical', lineHeight: 1.6 }} />
  }
  if (q.type === 'multiselect') {
    const arr = Array.isArray(value) ? value : []
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(q.options || []).map((opt) => {
          const on = arr.includes(opt)
          return (
            <button key={opt} type="button"
              onClick={() => onChange(on ? arr.filter(x => x !== opt) : [...arr, opt])}
              style={{ border: `1px solid ${on ? S2 : '#CBD5E1'}`, background: on ? '#FFF7ED' : '#fff', color: on ? '#9A3412' : '#475569', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {on ? '✓ ' : ''}{opt}
            </button>
          )
        })}
      </div>
    )
  }
  if (q.type === 'tags') {
    const arr = Array.isArray(value) ? value : []
    const [draft, setDraft] = React.useState('')
    const add = () => { const v = draft.trim(); if (v && !arr.includes(v)) { onChange([...arr, v]); setDraft('') } }
    return (
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: arr.length ? 8 : 0 }}>
          {arr.map((t, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF7ED', color: '#9A3412', borderRadius: 8, padding: '4px 10px', fontSize: 13 }}>
              „{t}"
              <button type="button" onClick={() => onChange(arr.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9A3412', fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <input type="text" value={draft} placeholder={q.placeholder || 'Eintrag + Enter'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
      </div>
    )
  }
  // Fallback (slider/ranked etc. — Phase 3b)
  return <div style={{ fontSize: 12, color: '#94A3B8' }}>Input-Typ „{q.type}" kommt in Kürze.</div>
}

export default function Strike2PersonaWizard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [persona, setPersona] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const personaRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => { personaRef.current = persona }, [persona])

  // Persona laden
  useEffect(() => {
    let m = true
    supabase.from('strike2_personas')
      .select('id, name, status, current_step, persona_grunddaten, antworten')
      .eq('id', id).maybeSingle()
      .then(({ data, error }) => {
        if (!m) return
        if (error || !data) { setNotFound(true); setLoading(false); return }
        setPersona(data); setLoading(false)
      })
    return () => { m = false; if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [id])

  const doSave = useCallback(async () => {
    const p = personaRef.current
    if (!p) return
    setSaving(true)
    const patch = {
      persona_grunddaten: p.persona_grunddaten || {},
      antworten: p.antworten || {},
      current_step: p.current_step ?? 0,
      name: (p.persona_grunddaten && p.persona_grunddaten.name) || p.name || 'Neue Persona',
      status: p.status === 'draft' ? 'in_progress' : p.status,
    }
    const { error } = await supabase.from('strike2_personas').update(patch).eq('id', id)
    setSaving(false)
    if (!error) setSavedAt(Date.now())
  }, [id])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(), 1000)
  }, [doSave])

  const updateField = useCallback((stepDef, key, value) => {
    setPersona((prev) => {
      if (!prev) return prev
      if (stepDef.store === 'grunddaten') {
        return { ...prev, persona_grunddaten: { ...(prev.persona_grunddaten || {}), [key]: value } }
      }
      const tagObj = { ...(((prev.antworten || {})[stepDef.tag]) || {}), [key]: value }
      return { ...prev, antworten: { ...(prev.antworten || {}), [stepDef.tag]: tagObj } }
    })
    scheduleSave()
  }, [scheduleSave])

  const gotoStep = useCallback((n) => {
    const clamped = Math.max(0, Math.min(STRIKE2_TOTAL_STEPS - 1, n))
    setPersona((prev) => prev ? { ...prev, current_step: clamped } : prev)
    setSearchParams({ step: String(clamped) })
    scheduleSave()
    window.scrollTo(0, 0)
  }, [setSearchParams, scheduleSave])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Lädt…</div>
  if (notFound) return (
    <div style={{ padding: '40px 28px', textAlign: 'center' }}>
      <p style={{ color: '#64748B', fontSize: 14 }}>Persona nicht gefunden.</p>
      <Link to="/branding/strike2-personas" style={{ color: PRIMARY, fontSize: 14 }}>← Zurück zur Übersicht</Link>
    </div>
  )

  const stepIdx = Number(searchParams.get('step') ?? persona.current_step ?? 0)
  const step = strike2Step(stepIdx)
  const pct = Math.round((stepIdx / (STRIKE2_TOTAL_STEPS - 1)) * 100)
  const isReview = step.tag === 'REVIEW'
  const stepValues = step.store === 'grunddaten'
    ? (persona.persona_grunddaten || {})
    : ((persona.antworten || {})[step.tag] || {})

  // Required-Validation für Forward-Nav
  const missingRequired = (step.questions || []).some(q => {
    if (!q.required) return false
    const v = stepValues[q.key]
    return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
  })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720, margin: '0 auto' }}>
      <Link to="/branding/strike2-personas" style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>← Übersicht</Link>

      {/* Progress */}
      <div style={{ margin: '14px 0 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 6 }}>
          <span>Schritt {stepIdx + 1} von {STRIKE2_TOTAL_STEPS} · {step.title}</span>
          <span>{saving ? 'Speichert…' : savedAt ? 'Gespeichert ✓' : ''}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: '#FFEDD5', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: S2, transition: 'width 0.3s' }} />
        </div>
      </div>

      <h1 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 4px' }}>{step.title}</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', margin: '0 0 22px' }}>{step.subtitle}</p>

      {/* Body */}
      {isReview ? (
        <ReviewBody persona={persona} onJumpTo={gotoStep} />
      ) : step.questions.length === 0 ? (
        <div style={{ border: '1px dashed #FED7AA', borderRadius: 12, padding: '28px 20px', textAlign: 'center', color: '#9A3412', fontSize: 13.5 }}>
          Dieser Schritt wird gerade vorbereitet. Du kannst ihn vorerst überspringen.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {step.questions.map((q) => (
            <div key={q.key}>
              <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
                {q.label}{q.required ? <span style={{ color: S2 }}> *</span> : null}
              </label>
              <FieldInput q={q} value={stepValues[q.key]} onChange={(v) => updateField(step, q.key, v)} />
            </div>
          ))}
        </div>
      )}

      {/* Footer-Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 28, paddingTop: 18, borderTop: '1px solid #F1F5F9' }}>
        <button type="button" onClick={() => gotoStep(stepIdx - 1)} disabled={stepIdx === 0}
          style={{ border: '0.5px solid #CBD5E1', background: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 500, cursor: stepIdx === 0 ? 'default' : 'pointer', color: '#475569', opacity: stepIdx === 0 ? 0.5 : 1 }}>
          Zurück
        </button>
        <button type="button" onClick={() => { doSave(); navigate('/branding/strike2-personas') }}
          style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#64748B' }}>
          Speichern + Pausieren
        </button>
        {isReview ? (
          <button type="button" onClick={() => alert('Die KI-Generierung der 70 Content-Ideen kommt in Phase 4.')}
            style={{ border: 'none', background: S2, color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            ⚡ 70 Ideen generieren
          </button>
        ) : (
          <button type="button" onClick={() => gotoStep(stepIdx + 1)} disabled={missingRequired} title={missingRequired ? 'Pflichtfeld ausfüllen' : ''}
            style={{ border: 'none', background: missingRequired ? '#CBD5E1' : PRIMARY, color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, cursor: missingRequired ? 'not-allowed' : 'pointer' }}>
            Weiter
          </button>
        )}
      </div>
    </div>
  )
}

// ── Review-Step (8) ───────────────────────────────────────────────
function ReviewBody({ persona, onJumpTo }) {
  const fmt = (v) => Array.isArray(v) ? (v.length ? v.join(', ') : '—') : (v && String(v).trim() ? v : '—')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {STRIKE2_STEPS.filter(s => s.tag !== 'REVIEW' && s.questions.length > 0).map((s) => {
        const vals = s.store === 'grunddaten' ? (persona.persona_grunddaten || {}) : ((persona.antworten || {})[s.tag] || {})
        return (
          <div key={s.tag} style={{ border: '0.5px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 13.5 }}>{s.title}</strong>
              <button type="button" onClick={() => onJumpTo(s.idx)} style={{ border: 'none', background: 'transparent', color: PRIMARY, fontSize: 12, cursor: 'pointer' }}>✎ Bearbeiten</button>
            </div>
            {s.questions.map((q) => (
              <div key={q.key} style={{ fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ color: '#94A3B8' }}>{q.label}: </span>
                <span style={{ color: '#334155' }}>{fmt(vals[q.key])}</span>
              </div>
            ))}
          </div>
        )
      })}
      <div style={{ fontSize: 12, color: '#9A3412', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 14px' }}>
        Schritte 2–7 (INF/BEF/EVA/BEW/Entscheiden/Kunden entwickeln) folgen in Kürze — danach generiert die KI 70 phase-spezifische Content-Ideen.
      </div>
    </div>
  )
}
