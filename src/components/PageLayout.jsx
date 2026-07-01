// PageLayout — geteilte Layout-Primitive für konsistente Seiten.
// ---------------------------------------------------------------------------
// Verhindert die wiederkehrenden Breiten-/Header-Inkonsistenzen (1100px +
// blaue Caveat-Überschrift), die wir sonst pro Seite inline nachziehen mussten.
//
//   <PageContainer>
//     <PageHeader eyebrow="Deine Aufgaben" title="Alles an einem Ort."
//                 subtitle={<>12 offen · 3 überfällig</>}
//                 actions={<button>+ Neu</button>} />
//     …Seiteninhalt…
//   </PageContainer>

import React from 'react'

const BLUE = '#30A0D0' // Caveat-Eyebrow-Blau (konsistent zu Branding/CRM-Seiten)

export function PageContainer({ children, maxWidth = 1100, padding = '24px 16px 40px', style }) {
  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto', padding, ...style }}>
      {children}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{ fontSize: 20, color: BLUE, fontFamily: '"Caveat", cursive', fontWeight: 600, marginBottom: 2 }}>
            {eyebrow}
          </div>
        )}
        {title && (
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary, #111827)', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--text-muted, #6B7280)', marginTop: 6, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

export default PageContainer
