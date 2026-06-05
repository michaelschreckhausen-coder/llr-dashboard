import React from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// AreaTip — Just-in-time-Hinweis beim ersten Betreten eines Bereichs.
//
// Bewusst dezent (Toast unten rechts, kein Backdrop, kein Spotlight): er soll
// helfen, nicht blockieren. Erscheint nur, wenn die Tour schon durch ist und
// der Tip für diese Route noch nicht weggeklickt wurde — die Logik dafür sitzt
// im Layout, diese Komponente rendert nur.
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

export default function AreaTip({ tip, onDismiss }) {
  if (!tip) return null
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 3000,
      width: 320, maxWidth: 'calc(100vw - 40px)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${PRIMARY}`,
      borderRadius: 14,
      boxShadow: '0 10px 32px rgba(15,23,42,0.16)',
      padding: '14px 16px',
      animation: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          💡 {tip.title}
        </div>
        <button onClick={onDismiss} aria-label="Schließen" style={{
          flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 0, marginTop: -2,
        }}>×</button>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)', marginTop: 6 }}>
        {tip.body}
      </div>
      <div style={{ textAlign: 'right', marginTop: 10 }}>
        <button onClick={onDismiss} style={{
          fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: 'none',
          background: 'transparent', color: PRIMARY, cursor: 'pointer', padding: '4px 2px',
        }}>Verstanden</button>
      </div>
    </div>
  )
}
