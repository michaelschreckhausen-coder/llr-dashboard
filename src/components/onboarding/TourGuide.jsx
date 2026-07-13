import React, { useState, useLayoutEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOUR_STEPS } from '../../lib/onboardingSteps'

// ─────────────────────────────────────────────────────────────────────────────
// TourGuide — First-Run-Coachmark-Tour.
//
// Zero-Dep: Anker werden per [data-tour-id] gefunden, Position via
// getBoundingClientRect. Spotlight = ein Ring-Div mit riesigem box-shadow, das
// den Rest abdunkelt ("Loch"-Effekt) — kein SVG-Masking nötig.
//
// Robust gegen fehlende Anker: ist ein data-tour-id nicht im DOM (z.B. Section
// durch Plan-Modules ausgeblendet), fällt der Step auf ein zentriertes Modal
// zurück statt die Tour zu blockieren.
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const POPOVER_W = 320

export default function TourGuide({ onFinish }) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)

  const step = TOUR_STEPS[index]
  const isLast = index === TOUR_STEPS.length - 1

  const measure = useCallback(() => {
    if (!step?.anchor) { setRect(null); return }
    const el = document.querySelector(`[data-tour-id="${step.anchor}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  const finish = useCallback(() => { onFinish?.() }, [onFinish])
  const next = useCallback(() => { if (isLast) finish(); else setIndex(i => i + 1) }, [isLast, finish])
  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])

  if (!step) return null

  // ── Popover-Position berechnen ──────────────────────────────────────────────
  const anchored = !!rect
  let popStyle
  if (anchored) {
    const top = Math.min(
      Math.max(12, rect.top + rect.height / 2 - 90),
      window.innerHeight - 220
    )
    // Sidebar liegt links → Popover rechts daneben; falls kein Platz, links.
    const spaceRight = window.innerWidth - rect.right
    const left = spaceRight > POPOVER_W + 24
      ? rect.right + 14
      : Math.max(12, rect.left - POPOVER_W - 14)
    popStyle = { position: 'fixed', top, left, width: POPOVER_W }
  } else {
    popStyle = {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)', width: 380,
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }}>
      {/* Backdrop — bei zentrierten Steps voll, bei anchored unsichtbar (das
          Loch übernimmt der Ring). Klick = überspringen. */}
      {!anchored && (
        <div onClick={finish}
          style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)' }} />
      )}

      {/* Spotlight-Ring um den Anker */}
      {anchored && (
        <div style={{
          position: 'fixed',
          top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12,
          borderRadius: 14,
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
          border: `2px solid ${PRIMARY}`,
          pointerEvents: 'none',
          transition: 'all 0.2s ease',
        }} />
      )}

      {/* Popover */}
      <div style={{
        ...popStyle,
        background: 'var(--surface)',
        borderRadius: 16,
        border: '1px solid var(--border)',
        boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
        padding: 20,
        boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase', color: PRIMARY, marginBottom: 8 }}>
          Schritt {index + 1} von {TOUR_STEPS.length}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)', marginBottom: 18 }}>
          {step.body}
        </div>

        {/* Progress-Dots */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
          {TOUR_STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === index ? 18 : 6, height: 6, borderRadius: 99,
              background: i === index ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.2s ease',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={finish} style={btnGhost}>Tour überspringen</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {index > 0 && <button onClick={prev} style={btnSecondary}>Zurück</button>}
            {isLast && step.cta ? (
              <button onClick={() => { navigate(step.cta.to); finish() }} style={btnPrimary}>
                {step.cta.label}
              </button>
            ) : (
              <button onClick={next} style={btnPrimary}>{isLast ? 'Fertig' : 'Weiter'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const btnBase = {
  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  borderRadius: 10, cursor: 'pointer', padding: '9px 14px',
  transition: 'all 0.15s ease',
}
const btnPrimary = { ...btnBase, border: 'none', background: 'var(--primary)', color: '#fff' }
const btnSecondary = { ...btnBase, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }
const btnGhost = { ...btnBase, border: 'none', background: 'transparent', color: 'var(--text-muted)', padding: '9px 4px' }
