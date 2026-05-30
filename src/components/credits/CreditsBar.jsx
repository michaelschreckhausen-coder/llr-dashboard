// CreditsBar — Sidebar-Footer-Visualisierung von Credits + Storage
//
// Compact-Mode (Sidebar collapsed): nur Ring + %-Number
// Full-Mode: Bar mit Label "X / Y Credits" + Storage-Subtext + "Top-Up"-Link
//
// Verhalten:
//   < 80%  → grau-blaue Bar
//   ≥ 80%  → orange Warnung
//   100%   → rot, Bar voll
//
// Klick → /billing (Plan-Upgrade + Top-Up)

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreditBudget } from '../../hooks/useCreditBudget'

function formatCredits(n) {
  if (n === null || n === undefined) return '–'
  const num = Number(n)
  if (num >= 1000) return (num / 1000).toFixed(num >= 10000 ? 0 : 1) + 'k'
  return Math.round(num).toString()
}

function formatGB(gb) {
  if (gb === null || gb === undefined) return '–'
  const n = Number(gb)
  if (n < 1) return (n * 1024).toFixed(0) + ' MB'
  return n.toFixed(n < 10 ? 1 : 0) + ' GB'
}

export default function CreditsBar({ collapsed = false }) {
  const navigate = useNavigate()
  const { budget, storage, loading, pctUsed, isExhausted, isWarning } = useCreditBudget()

  if (loading || !budget || budget.error) return null

  const planCredits = Number(budget.plan_credits || 0)
  const used = Number(budget.used_this_period || 0)
  const topup = Number(budget.topup_remaining || 0)
  const totalRem = Number(budget.total_remaining || 0)

  const barColor = isExhausted ? 'rgb(220,38,38)' : isWarning ? 'rgb(234,88,12)' : 'var(--wl-primary, rgb(49,90,231))'
  const barBg = 'var(--border, rgba(148,163,184,0.25))'
  const pct = pctUsed === undefined ? 0 : pctUsed

  if (collapsed) {
    return (
      <button
        onClick={() => navigate('/billing')}
        title={`${formatCredits(used)} / ${formatCredits(planCredits)} Credits diesen Monat`}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'transparent', border: `2px solid ${barColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '8px auto', cursor: 'pointer', color: barColor,
          fontSize: 10, fontWeight: 700,
        }}
      >
        {pct}%
      </button>
    )
  }

  return (
    <div
      onClick={() => navigate('/billing')}
      style={{
        margin: '8px 12px 12px',
        padding: '10px 12px',
        background: 'var(--surface, rgba(255,255,255,0.04))',
        border: '1px solid var(--border, rgba(148,163,184,0.18))',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover, rgba(255,255,255,0.08))' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface, rgba(255,255,255,0.04))' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Credits
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>
          {pct}%
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, background: barBg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: barColor,
          transition: 'width 0.35s ease',
        }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', marginTop: 6, fontWeight: 500 }}>
        {formatCredits(used)} / {formatCredits(planCredits)}
        {topup > 0 && (
          <span style={{ color: barColor, marginLeft: 4 }}>+ {formatCredits(topup)} Top-Up</span>
        )}
      </div>
      {storage && !storage.error && Number(storage.total_quota_gb) > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
          Speicher: {formatGB(storage.used_gb)} / {formatGB(storage.total_quota_gb)}
        </div>
      )}
      {isExhausted && (
        <div style={{ fontSize: 10, color: 'rgb(220,38,38)', marginTop: 6, fontWeight: 600 }}>
          Aufgebraucht — Top-Up erwerben
        </div>
      )}
    </div>
  )
}
