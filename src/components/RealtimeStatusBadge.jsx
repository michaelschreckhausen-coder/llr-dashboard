import React from 'react'

/**
 * RealtimeStatusBadge (Phase 5 Block 3.6 v2)
 *
 * Pure-Display fuer Realtime-Subscription-Status aus useEntitlements.
 * 3 Zustaende:
 *   SUBSCRIBED → gruen "Live" (Plan-Updates kommen sofort an)
 *   CONNECTING / CHANNEL_ERROR / TIMED_OUT → grau "Verbindung…"
 *   CLOSED → rot "Offline" (Manual-Reload-Button nutzen)
 *
 * Pattern: inline style, kein Tailwind. Folgt llr-dashboard-Konvention.
 */
export default function RealtimeStatusBadge({ status }) {
  const VARIANTS = {
    SUBSCRIBED:    { label: 'Live',         bg: '#DCFCE7', color: '#15803D', dot: '#22C55E', tooltip: 'Plan-Updates kommen sofort an' },
    CONNECTING:    { label: 'Verbindung…',  bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8', tooltip: 'Verbindung wird aufgebaut…' },
    CHANNEL_ERROR: { label: 'Verbindung…',  bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B', tooltip: 'Verbindung wird wiederhergestellt…' },
    TIMED_OUT:     { label: 'Verbindung…',  bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B', tooltip: 'Verbindung-Timeout — wird neu aufgebaut' },
    CLOSED:        { label: 'Offline',      bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444', tooltip: 'Verbindung verloren — Manual-Reload nutzen' },
  }
  const v = VARIANTS[status] || VARIANTS.CONNECTING

  return (
    <span
      title={v.tooltip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px 2px 7px', borderRadius: 99,
        background: v.bg, color: v.color,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.01em',
        border: '1px solid rgba(0,0,0,0.04)',
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: v.dot,
          boxShadow: status === 'SUBSCRIBED' ? `0 0 0 2px ${v.dot}33` : 'none',
        }}
      />
      {v.label}
    </span>
  )
}
