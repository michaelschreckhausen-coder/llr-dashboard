import React from 'react'
import { useEntitlements } from '../hooks/useEntitlements'

const NAVY = 'var(--wl-primary, rgb(0,48,96))'

/**
 * TrialBanner (Phase 5 Block 3.5 refactor)
 *
 * Zeigt im Layout-Header einen schmalen Streifen mit Plan-/Trial-/Lizenz-Status.
 *
 * Datenquelle: useEntitlements() → public.get_my_entitlements() RPC, account-zentrisch.
 * Vorher: profiles.{plan_id, subscription_status, trial_ends_at} (stale/falsch).
 *
 * 4 Banner-Varianten:
 *   suspended → Account gesperrt/canceled
 *   expired   → Trial oder Lizenz abgelaufen (earliest wins)
 *   trial     → Im Trial, Tage verbleibend
 *   license   → Manuelle Lizenz mit plan_expires_at, Tage verbleibend
 *
 * Banner versteckt bei:
 *   - loading || !data (Orphan oder noch nicht geladen)
 *   - plan_managed_by === 'stripe' (Stripe-Domain, eigener Status-Pfad)
 *   - keine Expiry (plan_expires_at und trial_ends_at beide NULL = unbegrenzt)
 *
 * granted_via wird hier NICHT gelesen — Provenance ist nur fuer Badges
 * in /billing relevant, Banner-Heuristik geht ueber plan_managed_by + Daten.
 */
export default function TrialBanner() {
  const { data, loading } = useEntitlements()

  if (loading || !data) return null
  if (data.account_status === 'suspended' || data.account_status === 'canceled') {
    return <Banner mode="suspended" />
  }
  if (data.plan_managed_by === 'stripe') return null

  const now = Date.now()
  const expires = data.plan_expires_at ? new Date(data.plan_expires_at).getTime() : null
  const trial   = data.trial_ends_at   ? new Date(data.trial_ends_at).getTime()   : null

  if (expires === null && trial === null) return null

  // earliest wins (z.B. wenn beide gesetzt sind)
  const earliest = Math.min(expires ?? Infinity, trial ?? Infinity)
  if (earliest < now) {
    return <Banner mode="expired" planName={data.plan_name} />
  }

  const days = Math.max(0, Math.ceil((earliest - now) / (1000 * 60 * 60 * 24)))
  // Wenn beide gesetzt und trial frueher: Trial-Banner. Sonst License-Banner.
  const isTrialActive = trial !== null && trial === earliest
  if (isTrialActive) {
    return <Banner mode="trial" days={days} planName={data.plan_name} />
  }
  return <Banner mode="license" days={days} planName={data.plan_name} expiresAt={data.plan_expires_at} />
}

function Banner({ mode, days, planName, expiresAt }) {
  const isExpired   = mode === 'expired'
  const isSuspended = mode === 'suspended'
  const isTrial     = mode === 'trial'
  const isLicense   = mode === 'license'

  const bg =
    isExpired || isSuspended
      ? 'linear-gradient(90deg, #B91C1C 0%, #991B1B 100%)'
      : `linear-gradient(90deg, ${NAVY} 0%, #002040 100%)`

  let title = ''
  let sub   = ''
  let cta   = 'Upgrade →'

  if (isSuspended) {
    title = 'Dein Account ist gesperrt.'
    sub   = 'Bitte kontaktiere den Support.'
    cta   = 'Support kontaktieren'
  } else if (isExpired) {
    title = planName
      ? `Lizenz für ${planName} ist abgelaufen.`
      : 'Dein Plan ist abgelaufen.'
    sub   = 'Für vollen Zugriff bitte einen Plan wählen.'
    cta   = 'Jetzt aktivieren'
  } else if (isTrial) {
    title = days === 0
      ? 'Dein Trial endet heute.'
      : days === 1
        ? `Noch 1 Tag Trial${planName ? ` (${planName})` : ''}.`
        : `Noch ${days} Tage Trial${planName ? ` (${planName})` : ''}.`
    sub   = 'Keine Kreditkarte — jederzeit upgraden.'
  } else if (isLicense) {
    const expiryStr = expiresAt
      ? new Date(expiresAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : ''
    title = `${planName || 'Plan'} läuft am ${expiryStr} ab.`
    sub   = days <= 7 ? 'Bitte rechtzeitig verlängern.' : ''
    cta   = 'Plan verwalten'
  }

  return (
    <div style={{
      background: bg, color: '#fff', padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 16, fontSize: 13, lineHeight: 1.3, flexWrap: 'wrap',
      borderBottom: '1px solid rgba(0,0,0,0.15)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>
          {isSuspended ? '🚫' : isExpired ? '⏰' : isTrial ? '✨' : '📅'}
        </span>
        <b style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</b>
        {sub && <span style={{ opacity: 0.85 }}>· {sub}</span>}
      </span>
      <a
        href="/settings/konto"
        style={{
          background: '#fff',
          color: isExpired || isSuspended ? '#B91C1C' : NAVY,
          padding: '6px 14px',
          borderRadius: 99,
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          letterSpacing: '-0.01em',
        }}
      >
        {cta}
      </a>
    </div>
  )
}
