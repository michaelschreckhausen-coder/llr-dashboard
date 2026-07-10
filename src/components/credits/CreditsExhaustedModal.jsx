// CreditsExhaustedModal — Hard-Block-Modal bei 402-Response von Edge-Functions
//
// Pattern für Caller (jeder AI-Call-Site):
//   try {
//     const { data, error } = await supabase.functions.invoke('generate', { body: {...} })
//     if (error?.context?.status === 402 || data?.code === 'credits_exhausted') {
//       openCreditsExhaustedModal(data || error.context.json || {})
//       return
//     }
//     ...
//   } catch (e) { ... }
//
// Optional: window-event-Pattern für lose Kopplung:
//   window.dispatchEvent(new CustomEvent('leadesk:credits-exhausted', { detail: {...} }))
// Dieses Modal lauscht auf das Event + zeigt sich an.

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function CreditsExhaustedModal() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      setDetails(e.detail || {})
      setOpen(true)
    }
    window.addEventListener('leadesk:credits-exhausted', handler)
    return () => window.removeEventListener('leadesk:credits-exhausted', handler)
  }, [])

  if (!open) return null

  const reason = details?.reason
  const isDaily = reason === 'daily_cap_exceeded'
  const title = isDaily ? 'Tägliches Limit erreicht' : 'Credit-Budget aufgebraucht'
  const subtitle = isDaily
    ? 'Du hast heute bereits 25 % deines monatlichen Budgets verbraucht. Schutz vor unbeabsichtigten Power-User-Schleifen.'
    : 'Dein monatliches Credit-Budget ist erschöpft. Wähle eine Option:'

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, white)',
          borderRadius: 16,
          width: 480, maxWidth: '92vw',
          padding: 28,
          boxShadow: '0 24px 64px rgba(15,23,42,0.35)',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>{isDaily ? '⏱️' : '⛔'}</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary, #0f172a)' }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #475569)', margin: '0 0 20px', lineHeight: 1.5 }}>
          {subtitle}
        </p>

        {details?.remaining !== undefined && (
          <div style={{
            background: 'var(--background-soft, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--text-secondary, #64748b)',
            marginBottom: 18,
          }}>
            Verbleibend: <strong>{Math.round(Number(details.remaining))} Credits</strong>
            {details.estimated !== undefined && (
              <> · Benötigt für diesen Call: <strong>{Math.round(Number(details.estimated))}</strong></>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => { setOpen(false); navigate('/billing') }}
            style={{
              background: 'var(--wl-primary, #0A6FB0)', color: 'white',
              border: 0, padding: '12px 16px', borderRadius: 8,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Top-Up kaufen
          </button>
          <button
            onClick={() => { setOpen(false); navigate('/billing') }}
            style={{
              background: 'var(--surface-soft, #f1f5f9)', color: 'var(--text-primary, #0f172a)',
              border: '1px solid var(--border, #e2e8f0)',
              padding: '12px 16px', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Plan upgraden
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', color: 'var(--text-muted, #64748b)',
              border: 0, padding: '10px', borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {isDaily ? 'Morgen erneut versuchen' : 'Auf nächsten Monat warten'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper für Caller — convenience wrapper
export function dispatchCreditsExhausted(details) {
  try {
    window.dispatchEvent(new CustomEvent('leadesk:credits-exhausted', { detail: details || {} }))
  } catch (_) {}
}
