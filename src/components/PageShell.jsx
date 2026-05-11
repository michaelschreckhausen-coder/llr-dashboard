// src/components/PageShell.jsx
// Konsistenter Container fuer alle Branding-Pages.
// Erzwingt einheitliche maxWidth, Padding und Zentrierung.
// Optional mit Hero-Background fuer Premium-Anmutung.

import React from 'react'

export default function PageShell({ children, maxWidth = 1100, hero = false, style = {} }) {
  return (
    <div style={{
      maxWidth,
      margin: '0 auto',
      padding: '28px 24px 60px',
      position: 'relative',
      ...style,
    }}>
      {hero && (
        <div style={{
          position: 'absolute',
          inset: 0,
          height: 260,
          background: 'linear-gradient(180deg, rgba(49,90,231,.05) 0%, rgba(124,58,237,.02) 50%, transparent 100%)',
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
