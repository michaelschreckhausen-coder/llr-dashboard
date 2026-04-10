import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'llr_getting_started'

const STEPS = [
  {
    id: 'welcome', icon: '🎯', title: 'Lead Radar kennenlernen',
    description: 'Starte die interaktive Einführung und lerne alle Features kennen.',
    color: 'rgb(49,90,231)', bg: 'rgba(49,90,231,0.08)', border: 'rgba(49,90,231,0.2)',
    action: { label: 'Einführung starten', href: '/onboarding' },
  },
  {
    id: 'first_lead', icon: '👥', title: 'Ersten Lead hinzufügen',
    description: 'Füge deinen ersten LinkedIn-Kontakt als Lead hinzu — manuell oder per Chrome Extension.',
    color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0',
    action: { label: 'Leads öffnen', href: '/leads' },
  },
  {
    id: 'vernetzung', icon: '🤝', title: 'Vernetzungsanfrage senden',
    description: 'Schicke eine erste personalisierte KI-Vernetzungsanfrage an einen Lead.',
    color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE',
    action: { label: 'Vernetzungen öffnen', href: '/vernetzungen' },
  },
  {
    id: 'csv_import', icon: '⬆', title: 'Leads importieren (CSV)',
    description: 'Importiere bestehende Kontakte per CSV. In der Interessenten-Ansicht auf "⬆ CSV Import" klicken.',
    color: '#059669', bg: '#ECFDF5', border: '#A7F3D0',
    action: { label: 'CRM öffnen', href: '/leads' },
  },
  {
    id: 'pipeline', icon: '📊', title: 'Pipeline einrichten',
    description: 'Verschiebe Leads per Drag & Drop zwischen Kanban-Spalten. Reiter umbenennen unter ✏ Reiter. + Button zum direkten Hinzufügen.',
    color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A',
    action: { label: 'Pipeline öffnen', href: '/pipeline' },
  },
  {
    id: 'brand_voice', icon: '🎤', title: 'Brand Voice definieren',
    description: 'Lege deinen Schreibstil fest damit die KI in deiner Stimme schreibt.',
    color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8',
    action: { label: 'Brand Voice öffnen', href: '/brand-voice' },
  },
  {
    id: 'content', icon: '✏️', title: 'Ersten Content generieren',
    description: 'Erstelle deinen ersten LinkedIn-Post mit dem Content Studio.',
    color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC',
    action: { label: 'Content Studio öffnen', href: '/content-studio' },
  },
  {
    id: 'projektmanagement', icon: '📋', title: 'Aufgaben-Board nutzen',
    description: 'Verwalte Sales-Aufgaben im Trello-ähnlichen Board. Labels, Team-Zuweisung und Listen-Ansicht inklusive.',
    color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
    action: { label: 'Aufgaben öffnen', href: '/projekte' },
  },
  {
    id: 'enrichment', icon: '✨', title: 'KI-Enrichment starten',
    description: 'Analysiere alle Leads auf Buying Intent, Pain Points und Use Cases — mit einem Klick.',
    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A',
    action: { label: 'CRM Enrichment öffnen', href: '/crm-enrichment' },
  },
]

export default function GettingStarted() {
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked))
  }, [checked])

  function toggle(id) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const doneCount = Object.values(checked).filter(Boolean).length
  const total = STEPS.length
  const pct = Math.round((doneCount / total) * 100)
  const allDone = doneCount === total

  return (
    <div style={{ maxWidth:740 }}>



      <div style={{
        background: allDone ? 'linear-gradient(135deg,#065F46,#059669)' : 'linear-gradient(135deg,rgb(49,90,231),rgb(49,90,231))',
        borderRadius:16, padding:'22px 28px', marginBottom:20, color:'#fff',
        boxShadow:'0 4px 20px rgba(10,102,194,0.25)', position:'relative', overflow:'hidden'
      }}>
        <div style={{ position:'absolute', right:-30, top:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }}/>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.8)', marginBottom:4 }}>
              {allDone ? '🎉 Alles erledigt! Du bist vollständig eingerichtet.' : 'Fortschritt'}
            </div>
            <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.03em' }}>{doneCount} / {total} Schritte</div>
          </div>
          <div style={{ textAlign:'center', background:'rgba(255,255,255,0.15)', borderRadius:12, padding:'12px 20px', border:'1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ fontSize:26, fontWeight:800 }}>{pct}%</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em' }}>erledigt</div>
          </div>
        </div>
        <div style={{ height:8, background:'rgba(255,255,255,0.2)', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:pct+'%', background:'#fff', borderRadius:999, transition:'width 0.5s ease' }}/>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {STEPS.map((step, idx) => {
          const done = !!checked[step.id]
          return (
            <div key={step.id} style={{
              background:'#fff', borderRadius:12,
              border:'1px solid '+(done ? step.border : '#E5E7EB'),
              padding:'16px 18px', display:'flex', alignItems:'center', gap:14,
              transition:'all 0.2s', opacity: done ? 0.85 : 1,
              boxShadow:'0 1px 3px rgba(15,23,42,0.06)'
            }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{
                  width:44, height:44, borderRadius:10,
                  background: done ? step.bg : 'rgb(238,241,252)',
                  border:'1px solid '+(done ? step.border : '#E5E7EB'),
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:22
                }}>
                  {step.icon}
                </div>
                <div style={{
                  position:'absolute', top:-6, left:-6,
                  width:22, height:22, borderRadius:'50%',
                  background: done ? 'linear-gradient(135deg,#10B981,#059669)' : '#fff',
                  border: done ? 'none' : '2px solid #E2E8F0',
                  display:'flex', alignItems:'center', justifyContent:'center'
                }}>
                  {done && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8' }}>Schritt {idx+1}</span>
                  {done && <span style={{ fontSize:10, fontWeight:700, padding:'1px 8px', borderRadius:999, background:step.bg, color:step.color, border:'1px solid '+step.border }}>✓ Erledigt</span>}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:done?'#94A3B8':'rgb(20,20,43)', textDecoration:done?'line-through':'none' }}>
                  {step.title}
                </div>
                {!done && <div style={{ fontSize:12, color:'#64748B', marginTop:3, lineHeight:1.4 }}>{step.description}</div>}
              </div>

              <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                {!done && (
                  <a href={step.action.href} style={{
                    fontSize:11, fontWeight:700, color:step.color,
                    textDecoration:'none', padding:'6px 12px', borderRadius:8,
                    border:'1px solid '+step.border, background:step.bg, whiteSpace:'nowrap'
                  }}>
                    {step.action.label} ↗
                  </a>
                )}
                <button
                  onClick={() => toggle(step.id)}
                  style={{
                    fontSize:11, fontWeight:700, padding:'6px 12px', borderRadius:8,
                    border:'1px solid '+(done?'#E5E7EB':'#CBD5E1'),
                    background:done?'rgb(238,241,252)':'#fff',
                    color:done?'#94A3B8':'#475569',
                    cursor:'pointer', whiteSpace:'nowrap'
                  }}>
                  {done ? 'Rückgängig' : 'Als erledigt markieren'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {doneCount > 0 && (
        <div style={{ marginTop:16, textAlign:'center' }}>
          <button
            onClick={() => setChecked({})}
            style={{ fontSize:11, color:'#94A3B8', background:'none', border:'none', cursor:'pointer', padding:'6px 12px', textDecoration:'underline' }}>
            Alle zurücksetzen
          </button>
        </div>
      )}
    </div>
  )
}
