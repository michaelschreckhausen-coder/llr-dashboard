// Sponsoring OS — Home (Phase 0 Platzhalter)
// Wird in App.jsx in <ModuleGuard module="sponsoring"> gewrappt. Sobald das
// Addon aktiv ist (account_addons → modules[] enthaelt 'sponsoring'), ist diese
// Seite erreichbar; sonst zeigt ModuleGuard den Lock-Splash.
//
// Die Fachmodule (Rechte, Inventar, Angebote, ...) folgen in Phase 1.

import { Link } from 'react-router-dom'
import { Trophy, Layers, FileText, Activity, Sparkles } from 'lucide-react'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const NEXT = [
  { icon: Layers,   title: 'Rechte & Inventar', desc: 'Stadion, Trikot, Hospitality, Digital — Slots & Auslastung.' },
  { icon: FileText, title: 'Pakete & Angebote',  desc: 'Bronze bis Platin, KI-Paketvorschlag, Angebots-PDF.' },
  { icon: Activity, title: 'Aktivierung',        desc: 'Geplant → Umsetzung → abgeschlossen → reportet.' },
  { icon: Sparkles, title: 'KI-Scoring & GEO',   desc: 'Sponsoren-Fit-Score, Leadgen-Signale, KI-Sichtbarkeit.' },
]

export default function SponsoringHome() {
  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="Sponsoring OS"
        subtitle="Dein Sponsoring Revenue Operating System ist freigeschaltet. Die Fachmodule werden schrittweise ausgerollt — hier ein Ueberblick, was als Naechstes kommt."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {NEXT.map(({ icon: Icon, title, desc }) => (
          <div key={title} style={{
            border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)',
            padding: 20, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-card)',
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
