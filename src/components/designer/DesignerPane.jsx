// src/components/designer/DesignerPane.jsx
// Lazy-Wrapper um DesignerCanvas: react-konva (+ konva) werden erst geladen, wenn
// der Designer wirklich geöffnet wird — entlastet den Rest der App. Robust gegen
// Lade-/Laufzeitfehler (Suspense-Fallback + ErrorBoundary).

import React, { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

const DesignerCanvas = React.lazy(() => import('./DesignerCanvas'))

class DesignerErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(err) { try { console.warn('[designer]', err) } catch (_e) {} }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Der Designer ist auf einen Fehler gestoßen</div>
          <div style={{ fontSize: 12, marginBottom: 12 }}>{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={() => this.setState({ error: null })}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
            Erneut versuchen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Fallback() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
      <Loader2 size={16} className="lk-spin" />Designer wird geladen…
    </div>
  )
}

export default function DesignerPane({ visual, teamId, onSaved, onReplaceVisual }) {
  if (!visual) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Kein Bild ausgewählt</div>
          Erstelle im Chat ein Bild (Visual-Modus aktivieren) und öffne es mit „→ in den Designer", oder wähle rechts ein Bild aus der Leiste.
        </div>
      </div>
    )
  }
  return (
    <DesignerErrorBoundary resetKey={visual?.id}>
      <Suspense fallback={<Fallback />}>
        <DesignerCanvas key={visual.id} visual={visual} teamId={teamId} onSaved={onSaved} onReplaceVisual={onReplaceVisual} />
      </Suspense>
    </DesignerErrorBoundary>
  )
}
