// Sponsoring OS — Home (Phase 0 Platzhalter)
// Wird in App.jsx in <ModuleGuard module="sponsoring"> gewrappt. Sobald das
// Addon aktiv ist (account_addons → modules[] enthaelt 'sponsoring'), ist diese
// Seite erreichbar; sonst zeigt ModuleGuard den Lock-Splash.
//
// Die Fachmodule (Rechte, Inventar, Angebote, ...) folgen in Phase 1.

import { Link } from 'react-router-dom'
import { Trophy, Layers, FileText, Activity, Sparkles } from 'lucide-react'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

const NEXT = [
  { icon: Layers,   title: 'Rechte & Inventar', desc: 'Stadion, Trikot, Hospitality, Digital — Slots & Auslastung.' },
  { icon: FileText, title: 'Pakete & Angebote',  desc: 'Bronze bis Platin, KI-Paketvorschlag, Angebots-PDF.' },
  { icon: Activity, title: 'Aktivierung',        desc: 'Geplant → Umsetzung → abgeschlossen → reportet.' },
  { icon: Sparkles, title: 'KI-Scoring & GEO',   desc: 'Sponsoren-Fit-Score, Leadgen-Signale, KI-Sichtbarkeit.' },
]

export default function SponsoringHome() {
  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Trophy size={26} color={PRIMARY} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>
          Sponsoring OS
        </h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 28px', maxWidth: 640, lineHeight: 1.6 }}>
        Dein Sponsoring Revenue Operating System ist freigeschaltet. Die Fachmodule werden
        schrittweise ausgerollt — hier ein Ueberblick, was als Naechstes kommt.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {NEXT.map(({ icon: Icon, title, desc }) => (
          <div key={title} style={{
            border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)',
            padding: 20, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <Icon size={22} color={PRIMARY} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <Link to="/marketplace" style={{ fontSize: 13, color: PRIMARY, fontWeight: 600, textDecoration: 'none' }}>
          ← Zum Marketplace
        </Link>
      </div>
    </div>
  )
}
