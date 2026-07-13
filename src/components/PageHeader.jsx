// PageHeader — geteiltes Seiten-Kopf-Muster, repliziert den /personal-brand-Header
// (BrandVoice.jsx List-View „Journal-Style-Header"): Caveat-Overline in PB-Akzent,
// großer Titel, graue Subline. Kein Icon.
// Props: overline, title, subtitle (optional), action (optional ReactNode, rechts oben —
//        z.B. ein Refresh-Button).
export default function PageHeader({ overline, title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="lk-eyebrow">{overline}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px', lineHeight: 1.15, fontFamily: 'Inter, sans-serif', color: 'var(--text-primary, #0E1633)' }}>{title}</h1>
        </div>
        {action || null}
      </div>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>{subtitle}</p>}
    </div>
  )
}
