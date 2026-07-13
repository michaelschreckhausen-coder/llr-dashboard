// src/components/PageShell.jsx
// Konsistenter Container fuer alle Branding-Pages.
// Erzwingt EXAKT die gleiche Breite wie BV-Liste/Editor:
//   width: '100%', maxWidth: 1100, padding: '24px 16px 40px'
// Optional mit Hero-Background fuer Premium-Anmutung.

import React from 'react'

export default function PageShell({ children, maxWidth = 1100, hero = false, style = {} }) {
  return (
    <div style={{
      width: '100%',
      maxWidth,
      margin: '0 auto',
      padding: '24px 16px 40px',
      position: 'relative',
      ...style,
    }}>
      {hero && (
        <div style={{
          position: 'absolute',
          inset: 0,
          height: 260,
          background: 'linear-gradient(180deg, rgba(10,111,176,.05) 0%, rgba(0,48,96,.02) 50%, transparent 100%)',
          borderRadius: 24,
          zIndex: 0,
          pointerEvents: 'none',
        }}/>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
