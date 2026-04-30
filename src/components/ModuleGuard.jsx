// ModuleGuard — schützt Route-Children, wenn das aktive Plan-Modul fehlt.
// Stil-Konvention: passt sich PlanGate (App.jsx) an, damit das UX-Erlebnis
// bei gesperrten Bereichen konsistent bleibt.

import React from 'react'
import { Link } from 'react-router-dom'
import { useEntitlements } from '../hooks/useEntitlements'
import { MODULES } from '../lib/modules'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

export default function ModuleGuard({ module: moduleKey, children }) {
  const { hasModule, loading, isTrial, trialDaysLeft, accountStatus, planName } = useEntitlements()

  // Während des ersten Loads: nicht sperren — sonst Flash-of-blocked-content
  if (loading) return null

  if (hasModule(moduleKey)) return children

  const meta = MODULES[moduleKey] || { label: moduleKey, description: '' }

  // Kontext für die Erklärung
  let contextLine = null
  if (accountStatus === 'trialing' && trialDaysLeft !== null) {
    contextLine = trialDaysLeft > 0
      ? `Dein aktueller Trial-Plan${planName ? ` (${planName})` : ''} enthält diesen Bereich nicht — noch ${trialDaysLeft} Tage Trial.`
      : `Dein Trial-Zeitraum ist abgelaufen.`
  } else if (accountStatus === 'past_due') {
    contextLine = 'Deine letzte Zahlung war nicht erfolgreich. Bitte aktualisiere deine Zahlungsdaten.'
  } else if (accountStatus === 'suspended' || accountStatus === 'canceled') {
    contextLine = 'Dein Account ist aktuell nicht aktiv. Wende dich bitte an unser Team.'
  } else {
    contextLine = `Dein aktueller Plan${planName ? ` (${planName})` : ''} schaltet diesen Bereich nicht frei.`
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 18,
      textAlign: 'center',
      padding: 32,
    }}>
      <div style={{
        width: 84, height: 84, borderRadius: '50%',
        background: 'linear-gradient(135deg, ' + PRIMARY + '22, ' + PRIMARY + '11)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 42,
      }}>
        🔒
      </div>

      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
        {meta.label} nicht freigeschaltet
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.65 }}>
        {contextLine}
        {meta.description ? <><br />Inhalt dieses Bereichs: {meta.description}.</> : null}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          to="/billing"
          style={{
            padding: '10px 24px',
            borderRadius: 999,
            background: PRIMARY,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(49,90,231,0.25)',
          }}
        >
          🚀 Plan ändern
        </Link>
        <Link
          to="/dashboard"
          style={{
            padding: '10px 24px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Zurück zum Dashboard
        </Link>
      </div>
    </div>
  )
}
