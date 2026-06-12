// Gate für Features, die es auf LinkedIn nur für PERSONEN gibt (Vernetzungen,
// Nachrichten, SSI). Company Pages haben keine Verbindungen/DMs/SSI — bei
// aktiver Company Brand zeigen wir statt der Seite einen Hinweis.
import React from 'react'
import { Building2 } from 'lucide-react'
import { useBrandVoice } from '../context/BrandVoiceContext'

const FEATURE_COPY = {
  vernetzungen: {
    title: 'Vernetzungen gibt es nur für Personen',
    body: 'LinkedIn Company Pages haben Follower, keine Verbindungen — Vernetzungsanfragen kann nur ein persönliches Profil senden. Wechsle oben rechts auf eine Personal Brand, um Vernetzungen zu verwalten.',
  },
  nachrichten: {
    title: 'Nachrichten gibt es nur für Personen',
    body: 'Direktnachrichten als Company Page sind über die LinkedIn-API nicht verfügbar. Wechsle oben rechts auf eine Personal Brand, um KI-Nachrichten zu erstellen und zu versenden.',
  },
  ssi: {
    title: 'SSI gibt es nur für Personen',
    body: 'Der Social Selling Index ist eine Kennzahl für persönliche Profile — Company Pages haben keinen SSI. Page-Analytics (Follower- und Beitragsstatistiken) sind in Vorbereitung.',
  },
}

export default function CompanyBrandGate({ feature, children }) {
  const { activeBrandVoice } = useBrandVoice()
  if (activeBrandVoice?.account_type !== 'company_page') return children
  const copy = FEATURE_COPY[feature] || FEATURE_COPY.vernetzungen
  return (
    <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 24px' }}>
      <div style={{ padding: '36px 32px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(49,90,231,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Building2 size={26} strokeWidth={1.75} style={{ color: 'var(--wl-primary, rgb(49,90,231))' }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{copy.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
          {copy.body}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>
          Aktive Brand: <strong>{activeBrandVoice?.brand_name || activeBrandVoice?.name}</strong> (Company Brand)
        </div>
      </div>
    </div>
  )
}
