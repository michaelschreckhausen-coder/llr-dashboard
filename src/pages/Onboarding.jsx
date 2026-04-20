import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  {
    id: 1,
    icon: '🎯',
    title: 'Willkommen bei Leadesk!',
    subtitle: 'Dein LinkedIn Sales Intelligence Tool',
    description: 'Leadesk hilft dir, LinkedIn-Kontakte systematisch in Kunden zu verwandeln. In wenigen Minuten hast du alles eingerichtet.',
    features: null,
  },
  {
    id: 2,
    icon: '👥',
    title: 'Leads importieren',
    subtitle: 'Schritt 1 von 5 — Sales Suite → Leads',
    description: 'Importiere LinkedIn-Kontakte als Leads. Manuell hinzufügen oder per Chrome Extension direkt von LinkedIn-Profilen. Vergib Status-Labels (Lead → LQL → MQL → SQL) um deinen Funnel zu tracken.',
    features: [
      { icon: '➕', text: 'Manuell hinzufügen' },
      { icon: '🔍', text: 'Chrome Extension für LinkedIn-Import' },
      { icon: '🏷️', text: 'Status: Lead → LQL → MQN → MQL → SQL' },
      { icon: '📋', text: 'Listen für Segmentierung' },
    ],
    cta: { label: 'Ersten Lead hinzufügen', href: '/leads' },
  },
  {
    id: 3,
    icon: '🤝',
    title: 'Vernetzungen managen',
    subtitle: 'Schritt 2 von 5 — Sales Suite → Vernetzungen',
    description: 'Behalte den Überblick über Vernetzungsanfragen. Generiere personalisierte KI-Nachrichten und tracke Akzeptanzraten.',
    features: [
      { icon: '✨', text: 'KI-generierte Vernetzungsnachrichten' },
      { icon: '⏳', text: 'Ausstehende Anfragen tracken' },
      { icon: '✅', text: 'Akzeptanzrate messen' },
      { icon: '📅', text: 'Automatischer Zeitstempel bei Vernetzung' },
    ],
    cta: { label: 'Vernetzungen öffnen', href: '/vernetzungen' },
  },
  {
    id: 4,
    icon: '📊',
    title: 'Pipeline & Reports',
    subtitle: 'Schritt 3 von 5 — Deinen Funnel visualisieren',
    description: 'Die Pipeline zeigt deine Leads als Kanban-Board. Drag & Drop zwischen Lead, LQL, MQL und SQL. Reports zeigen Akzeptanzraten, Lead Scores und AI-Nutzung.',
    features: [
      { icon: '🖥️', text: 'Kanban-Board mit Drag & Drop' },
      { icon: '🔥', text: 'HOT / WARM Lead Scoring automatisch' },
      { icon: '📈', text: 'Reports: 7 / 30 / 90 Tage' },
      { icon: '🌟', text: 'Engagement Score überwachen' },
    ],
    cta: { label: 'Pipeline ansehen', href: '/pipeline' },
  },
  {
    id: 5,
    icon: '🎤',
    title: 'Brand Voice & Content Studio',
    subtitle: 'Schritt 4 von 5 — Branding Suite',
    description: 'Definiere deinen persönlichen Schreibstil in Brand Voice. Content Studio generiert Posts, Kommentare und Nachrichten in deiner Stimme.',
    features: [
      { icon: '🖊️', text: 'Eigenen Schreibstil definieren' },
      { icon: '🤖', text: 'KI generiert in deiner Stimme' },
      { icon: '📝', text: 'Posts, Kommentare, Nachrichten' },
      { icon: '💼', text: 'LinkedIn About-Abschnitt optimieren' },
    ],
    cta: { label: 'Brand Voice einrichten', href: '/brand-voice' },
  },
  {
    id: 6,
    icon: '🎉',
    title: 'Alles bereit!',
    subtitle: 'Du bist startklar',
    description: 'Starte jetzt mit deinen ersten Leads oder richte zunächst deinen Brand Voice ein. Das Dashboard gibt dir jederzeit einen Überblick.',
    features: null,
  },
]

export default function Onboarding({ session }) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const current = STEPS[step]
  const isFirst = step === 0
  const isLast  = step === STEPS.length - 1

  function handleNext() {
    if (isLast) {
      localStorage.setItem('llr_onboarding_done', '1')
      navigate('/')
    } else {
      setStep(s => s + 1)
    }
  }

  function handleSkip() {
    localStorage.setItem('llr_onboarding_done', '1')
    navigate('/')
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#F0F9FF 0%,#F8FAFC 50%,#F5F3FF 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>

      {!isLast && (
        <button onClick={handleSkip} style={{ position:'fixed', top:20, right:24, background:'none', border:'none', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer', padding:'6px 12px', borderRadius:8 }}>
          Überspringen →
        </button>
      )}

      <div style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:20, boxShadow:'0 8px 48px rgba(15,23,42,0.12)', overflow:'hidden' }}>

        {/* Progress Bar */}
        <div style={{ height:4, background:'#F1F5F9' }}>
          <div style={{ height:'100%', background:'linear-gradient(90deg,#0A66C2,#3B82F6)', borderRadius:999, width:((step+1)/STEPS.length*100)+'%', transition:'width 0.4s ease' }}/>
        </div>

        {/* Step dots + counter */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px 0' }}>
          <div style={{ display:'flex', gap:6 }}>
            {STEPS.map((_,i) => (
              <div key={i}
                onClick={() => i < step && setStep(i)}
                style={{ width:i===step?24:8, height:8, borderRadius:999, background:i===step?'#0A66C2':i<step?'#BFDBFE':'#E2E8F0', transition:'all 0.3s', cursor:i<step?'pointer':'default' }}
              />
            ))}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600 }}>{step+1} / {STEPS.length}</div>
        </div>

        {/* Content */}
        <div style={{ padding:'24px 28px 28px' }}>

          {/* Header */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
              <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>
                {current.icon}
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{current.subtitle}</div>
                <h2 style={{ fontSize:22, fontWeight:800, color:'var(--text-strong)', margin:0, letterSpacing:'-0.02em' }}>{current.title}</h2>
              </div>
            </div>
            <p style={{ fontSize:14, color:'#475569', lineHeight:1.7, margin:0 }}>{current.description}</p>
          </div>

          {/* Feature grid */}
          {current.features && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
              {current.features.map((f, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:'var(--surface-muted)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{f.icon}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'#475569', lineHeight:1.3 }}>{f.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Done state */}
          {isLast && (
            <div style={{ textAlign:'center', padding:'16px 0 24px' }}>
              <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:8 }}>Du bist bereit!</div>
              <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.6 }}>
                Starte jetzt mit deinen ersten Leads und baue deinen LinkedIn Sales Funnel auf.
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <button
              onClick={() => step > 0 && setStep(s => s-1)}
              disabled={isFirst}
              style={{ padding:'10px 20px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:isFirst?'not-allowed':'pointer', opacity:isFirst?0.4:1 }}
            >
              ← Zurück
            </button>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {current.cta && (
                <a href={current.cta.href}
                  style={{ padding:'10px 18px', borderRadius:10, border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#1D4ED8', fontSize:13, fontWeight:700, textDecoration:'none', whiteSpace:'nowrap' }}>
                  {current.cta.label} ↗
                </a>
              )}
              <button
                onClick={handleNext}
                style={{ padding:'10px 28px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(10,102,194,0.3)', whiteSpace:'nowrap' }}
              >
                {isLast ? '🚀 Los geht’s!' : 'Weiter →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
