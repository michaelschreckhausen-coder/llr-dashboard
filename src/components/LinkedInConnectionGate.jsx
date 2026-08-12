// LinkedInConnectionGate — blendet profil-erhobene Daten/Funktionen aus, wenn die
// LinkedIn-Verbindung der aktiven Marke getrennt ist. Statt veralteter Daten (die
// faelschlich „noch verbunden" suggerieren) erscheint ein Hinweis + „Profil verbinden".
// Daten werden NICHT geloescht — nach dem Verbinden ist sofort alles wieder da.
// Muster wie CompanyBrandGate: umschliesst die Seite auf Route-Ebene.
//
// Slice D2 (additiv): optionale `area`-Prop. Ist die Marke verbunden, aber der
// jeweilige LinkedIn-Bereich vom Eigentümer NICHT freigegeben (get_brand_linkedin_caps
// → caps[area]===false), erscheint ein klarer „nicht freigegeben"-Hinweis statt einer
// leeren Seite. Owner/Per-User haben alle Bereiche granted → nie der Hinweis. Reine
// UI-Politur; die DB/EF-Enforcement steht unabhängig.
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Lock } from 'lucide-react'
import EmptyOrb from './EmptyOrb'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useBrandConnection } from '../hooks/useBrandConnection'
import { useBrandLinkedInCaps } from '../hooks/useBrandLinkedInCaps'

// Lokalisierte Bereichs-Labels — identisch zum SharingPicker.
const AREA_LABEL = {
  inbox:      'Postfach & Nachrichten',
  network:    'Prospects & Verbindungen',
  search:     'Suche & Sales Navigator',
  automation: 'Sequenzen & Automatisierung',
  engagement: 'Engagement',
  analytics:  'Analytics & Statistiken',
}

const Orb = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}><EmptyOrb size={92} /></div>
)

export default function LinkedInConnectionGate({ children, area }) {
  const { activeBrandVoice } = useBrandVoice()
  const { loading, connected, accountType } = useBrandConnection()
  const scope = useBrandLinkedInCaps()
  const nav = useNavigate()

  // Solange der Verbindungs-Status laedt: kein Flash der Seite und kein Flash des Gates.
  if (loading) return <Orb />

  // 1) Nicht verbunden → bestehender Verbinden-Hinweis (unveraendert).
  if (!connected) {
    const isCompany = accountType === 'company_page'
    const connectPath = isCompany ? '/company-brand' : '/personal-brand'
    const title = isCompany ? 'Company Page nicht verbunden' : 'LinkedIn-Profil nicht verbunden'
    const body = isCompany
      ? 'Diese Funktion braucht eine aktive Verbindung zur LinkedIn Company Page. Sobald die Seite (über ein administrierendes Profil) wieder verbunden ist, erscheinen hier automatisch alle Daten und Funktionen dieser Marke.'
      : 'Diese Funktion braucht eine aktive Verbindung zu deinem LinkedIn-Profil. Sobald das Profil wieder verbunden ist, erscheinen hier automatisch Postfach, Netzwerk, Anfragen und Analysen dieser Marke. Es gehen keine Daten verloren.'
    return (
      <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 24px' }}>
        <div style={{ padding: '40px 32px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, textAlign: 'center', boxShadow: 'var(--shadow-card, 0 1px 2px rgba(15,23,42,.04))' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <EmptyOrb size={120} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{title}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 500, margin: '0 auto 20px' }}>{body}</div>
          <button type="button" className="lk-btn lk-btn-navy" onClick={() => nav(connectPath)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={16} /> {isCompany ? 'Company Page verbinden' : 'LinkedIn-Profil verbinden'}
          </button>
          {activeBrandVoice?.name && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
              Aktive Marke: <strong>{activeBrandVoice?.brand_name || activeBrandVoice?.name}</strong>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 2) Verbunden, aber dieser Bereich nicht freigegeben → Hinweis statt leerer Seite.
  if (area) {
    if (scope.loading) return <Orb />
    const granted = scope.caps?.[area] === true
    if (!granted) {
      const label = AREA_LABEL[area] || area
      return (
        <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 24px' }}>
          <div style={{ padding: '40px 32px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, textAlign: 'center', boxShadow: 'var(--shadow-card, 0 1px 2px rgba(15,23,42,.04))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--tint-cyan, #EAF8FE)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={40} strokeWidth={1.75} color="var(--wl-primary, #0A6FB0)" />
              </div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              Dieser Bereich ist für dich nicht freigegeben
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 500, margin: '0 auto 20px' }}>
              Der Eigentümer dieser Marke hat sie mit deinem Team geteilt, aber den Bereich „<strong>{label}</strong>" nicht mitgeteilt. Content (Beiträge, Visuals, Markenstimme) bleibt verfügbar. Wende dich an den Marken-Eigentümer, wenn du Zugriff brauchst.
            </div>
            {activeBrandVoice?.name && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Aktive Marke: <strong>{activeBrandVoice?.brand_name || activeBrandVoice?.name}</strong>
              </div>
            )}
          </div>
        </div>
      )
    }
  }

  // 3) Freigegeben (oder kein area verlangt) → Seite normal rendern.
  return children
}
