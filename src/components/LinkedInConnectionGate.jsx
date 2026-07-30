// LinkedInConnectionGate — blendet profil-erhobene Daten/Funktionen aus, wenn die
// LinkedIn-Verbindung der aktiven Marke getrennt ist. Statt veralteter Daten (die
// faelschlich „noch verbunden" suggerieren) erscheint ein Hinweis + „Profil verbinden".
// Daten werden NICHT geloescht — nach dem Verbinden ist sofort alles wieder da.
// Muster wie CompanyBrandGate: umschliesst die Seite auf Route-Ebene.
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import EmptyOrb from './EmptyOrb'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useBrandConnection } from '../hooks/useBrandConnection'

export default function LinkedInConnectionGate({ children }) {
  const { activeBrandVoice } = useBrandVoice()
  const { loading, connected, accountType } = useBrandConnection()
  const nav = useNavigate()

  // Solange der Status laedt: kein Flash der Seite und kein Flash des Gates.
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}><EmptyOrb size={92} /></div>
  }
  if (connected) return children

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
