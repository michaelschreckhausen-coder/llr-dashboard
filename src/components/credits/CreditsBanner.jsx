// CreditsBanner — Top-Banner bei ≥ 80% Verbrauch
//
// Mounted im Layout über <main>. Dismissable per Session (sessionStorage).
// Bei isExhausted (100%): roter Banner, nicht dismissable.

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreditBudget } from '../../hooks/useCreditBudget'

const DISMISS_KEY = 'leadesk_credits_warning_dismissed_at'
const DISMISS_TTL_MS = 4 * 60 * 60 * 1000  // 4 Stunden

export default function CreditsBanner() {
  const navigate = useNavigate()
  const { budget, pctUsed, isExhausted, isWarning } = useCreditBudget()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(DISMISS_KEY)
      if (t && (Date.now() - Number(t)) < DISMISS_TTL_MS) {
        setDismissed(true)
      }
    } catch (_) {}
  }, [])

  if (!budget || budget.error) return null
  if (!isWarning && !isExhausted) return null
  if (isWarning && !isExhausted && dismissed) return null

  const isHard = isExhausted
  const bg = isHard ? 'rgb(254,226,226)' : 'rgb(255,237,213)'
  const fg = isHard ? 'rgb(127,29,29)' : 'rgb(154,52,18)'
  const border = isHard ? 'rgb(252,165,165)' : 'rgb(253,186,116)'

  const handleDismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, String(Date.now())) } catch (_) {}
    setDismissed(true)
  }

  return (
    <div style={{
      background: bg, color: fg,
      borderBottom: `1px solid ${border}`,
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 13, fontWeight: 500,
    }}>
      <span style={{ fontSize: 16 }}>{isHard ? '⛔' : '⚠️'}</span>
      <span style={{ flex: 1 }}>
        {isHard ? (
          <>
            <strong>Credit-Budget aufgebraucht.</strong>{' '}
            KI-Funktionen sind deaktiviert bis zum Plan-Upgrade oder Top-Up.
          </>
        ) : (
          <>
            <strong>{pctUsed}% der monatlichen Credits verbraucht.</strong>{' '}
            Jetzt Top-Up kaufen oder Plan upgraden.
          </>
        )}
      </span>
      <button
        onClick={() => navigate('/billing')}
        style={{
          background: fg, color: 'white', border: 0,
          padding: '6px 14px', borderRadius: 6,
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        {isHard ? 'Plan-Upgrade' : 'Top-Up'}
      </button>
      {!isHard && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent', color: fg, border: 0,
            padding: '4px 8px', cursor: 'pointer', fontSize: 16, fontWeight: 700,
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
