import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// AreaTourGuide — geführte Mehrseiten-Tour für einen Bereich.
//
// Erweitert das Spotlight-Prinzip des globalen TourGuide um zwei Dinge:
//   1. Navigation: jeder Step hat eine route. onEnterStep(step) wird beim
//      Step-Wechsel aufgerufen — das Layout navigiert dorthin und hält die
//      passende Sidebar-Sektion auf. So sieht der User die Seite, während der
//      Spotlight den zugehörigen Sidebar-Eintrag hervorhebt.
//   2. Anchor-Polling: nach Navigation/Accordion-Animation ist der Anker erst
//      ein paar Frames später messbar. Wir pollen bis ~2.4s, sonst Fallback auf
//      zentriertes Modal — die Tour blockiert nie.
//
// onFinish = Tour abgeschlossen/übersprungen (Bereich als gesehen markieren).
// onClose  = "Später" (NICHT als gesehen markieren, taucht beim nächsten Mal wieder auf).
//
// onEnterStep wird über ein Ref entkoppelt, damit eine neue Funktions-Identität
// pro Render NICHT den Step-Effekt neu feuert (sonst Navigations-Schleife).
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const POPOVER_W = 340

export default function AreaTourGuide({ tour, onFinish, onClose, onEnterStep }) {
  const navigate = useNavigate()
  const steps = tour?.steps || []
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const pollRef = useRef(null)
  const onEnterRef = useRef(onEnterStep)
  onEnterRef.current = onEnterStep

  const step = steps[index]
  const isLast = index === steps.length - 1

  // Step betreten: Zielseite + Sektion via onEnterStep, dann Anker pollen.
  useEffect(() => {
    if (!step) return
    onEnterRef.current?.(step)
    let tries = 0
    const tick = () => {
      if (!step.anchor) { setRect(null); return }
      const el = document.querySelector(`[data-tour-id="${step.anchor}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 4 && r.height > 4) { setRect(r); return }
      }
      tries++
      if (tries < 40) pollRef.current = setTimeout(tick, 60)
      else setRect(null) // Fallback: zentriert
    }
    setRect(null)
    tick()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Re-measure bei resize/scroll (ohne Polling).
  const measure = useCallback(() => {
    if (!step?.anchor) return
    const el = document.querySelector(`[data-tour-id="${step.anchor}"]`)
    if (el) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) setRect(r) }
  }, [step])
  useLayoutEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  const next = useCallback(() => { if (isLast) onFinish?.(); else setIndex(i => i + 1) }, [isLast, onFinish])
  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])

  if (!step) return null

  const anchored = !!rect
  let popStyle
  if (anchored) {
    const top = Math.min(Math.max(12, rect.top + rect.height / 2 - 96), window.innerHeight - 240)
    const spaceRight = window.innerWidth - rect.right
    const left = spaceRight > POPOVER_W + 24 ? rect.right + 14 : Math.max(12, rect.left - POPOVER_W - 14)
    popStyle = { position: 'fixed', top, left, width: POPOVER_W }
  } else {
    popStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400 }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }}>
      {!anchored && (
        <div onClick={onClose}
          style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)' }} />
      )}

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
          {tour.label} · Schritt {index + 1} von {steps.length}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)', marginBottom: 18 }}>
          {step.body}
        </div>

        <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              width: i === index ? 18 : 6, height: 6, borderRadius: 99,
              background: i === index ? PRIMARY : 'var(--border)',
              transition: 'all 0.2s ease',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={onClose} style={btnGhost}>Später</button>
            <button onClick={() => onFinish?.()} style={btnGhost}>Überspringen</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {index > 0 && <button onClick={prev} style={btnSecondary}>Zurück</button>}
            {isLast && step.cta ? (
              <button onClick={() => { navigate(step.cta.to); onFinish?.() }} style={btnPrimary}>
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
const btnPrimary = { ...btnBase, border: 'none', background: PRIMARY, color: '#fff' }
const btnSecondary = { ...btnBase, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }
const btnGhost = { ...btnBase, border: 'none', background: 'transparent', color: 'var(--text-muted)', padding: '9px 6px' }
