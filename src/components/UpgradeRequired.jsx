// UpgradeRequired — der EINE wiederverwendbare "Upgrade nötig"-Zustand (P3 Schritt 4).
// Keyed auf eine Plan-Permission. Genutzt von: PermissionGuard (Route), Layout
// (Sidebar-Lock → Route), und als Muster für Button-Level-Upsells (Sales-Nav).
// Visuell konsistent mit ModuleGuard (🔒-Splash + Upgrade-CTA).

import React from 'react'
import { Link } from 'react-router-dom'
import { useEntitlements } from '../hooks/useEntitlements'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

// Permission-Key → freundliches Label + welcher Tier ihn freischaltet.
const KEY_META = {
  'linkedin.connections':   { label: 'Vernetzungen',          unlocks: 'Sales oder All-in' },
  'linkedin.messages':      { label: 'Nachrichten',           unlocks: 'Sales oder All-in' },
  'linkedin.automation':    { label: 'LinkedIn-Automation',   unlocks: 'Sales oder All-in' },
  'linkedin.engagement':    { label: 'Engagement',            unlocks: 'Sales oder All-in' },
  'linkedin.sales_nav':     { label: 'Sales-Navigator-Sync',  unlocks: 'Sales oder All-in' },
  'linkedin.post_analytics':{ label: 'Post-Analytics',        unlocks: 'Marketing oder All-in' },
  'content.calendar':       { label: 'Redaktionsplan',        unlocks: 'Marketing oder All-in' },
  'content.studio':         { label: 'Content-Werkstatt',     unlocks: 'Marketing oder All-in' },
}

export default function UpgradeRequired({ permissionKey }) {
  const { loading, isTrial, trialDaysLeft, accountStatus, planName } = useEntitlements()

  // Während des ersten Loads nicht sperren — sonst Flash-of-blocked-content (wie ModuleGuard).
  if (loading) return null

  const meta = KEY_META[permissionKey] || { label: 'Diese Funktion', unlocks: 'einem höheren Plan' }

  let contextLine
  if (accountStatus === 'trialing' && trialDaysLeft !== null) {
    contextLine = trialDaysLeft > 0
      ? `Dein aktueller Trial-Plan${planName ? ` (${planName})` : ''} enthält ${meta.label} nicht — noch ${trialDaysLeft} Tage Trial.`
      : 'Dein Trial-Zeitraum ist abgelaufen.'
  } else if (accountStatus === 'past_due') {
    contextLine = 'Deine letzte Zahlung war nicht erfolgreich. Bitte aktualisiere deine Zahlungsdaten.'
  } else if (accountStatus === 'suspended' || accountStatus === 'canceled') {
    contextLine = 'Dein Account ist aktuell nicht aktiv. Wende dich bitte an unser Team.'
  } else {
    contextLine = `${meta.label} ist in deinem aktuellen Plan${planName ? ` (${planName})` : ''} nicht enthalten.`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 18, textAlign: 'center', padding: 32 }}>
      <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(135deg, ' + PRIMARY + '22, ' + PRIMARY + '11)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42 }}>
        🔒
      </div>

      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
        {meta.label} — Upgrade nötig
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.65 }}>
        {contextLine}
        <br />Freischaltbar mit <strong style={{ color: 'var(--text-strong)' }}>{meta.unlocks}</strong>.
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/settings/konto" style={{ padding: '10px 24px', borderRadius: 999, background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 12px rgba(10,111,176,0.25)' }}>
          🚀 Plan ändern
        </Link>
        <Link to="/dashboard" style={{ padding: '10px 24px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Zurück zum Dashboard
        </Link>
      </div>
    </div>
  )
}
