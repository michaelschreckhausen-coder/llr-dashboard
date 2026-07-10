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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 26, height: 3, borderRadius: 2, background: 'var(--grad, linear-gradient(120deg,#16A8DC,#0A6FB0,#003060))', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.7px', textTransform: 'uppercase', color: 'var(--primary, #003060)', fontFamily: 'Inter, sans-serif' }}>
              {eyebrow}
            </span>
          </div>
        )}
        {title && (
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary, #0E1633)', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.15, fontFamily: 'Inter, sans-serif' }}>
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
