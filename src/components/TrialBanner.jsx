import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const NAVY = 'var(--wl-primary, rgb(0,48,96))'
const SKY  = '#30A0D0'

/**
 * TrialBanner
 * Zeigt im Layout-Header einen schmalen Streifen mit Trial-Countdown.
 * Rendert nichts für: aktive Zahler, enterprise-Plan, abgeschlossene Trials, ausgeloggt.
 *
 * Daten kommen aus public.profiles (Felder: subscription_status, trial_ends_at, plan_id).
 * Die Sichtbarkeit ist rein kosmetisch — Access-Enforcement passiert über has_feature_access().
 */
export default function TrialBanner() {
  const [state, setState] = useState(null) // null = loading | {} = fertige daten

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setState({ hide: true }); return }

      const { data: p } = await supabase
        .from('profiles')
        .select('subscription_status, trial_ends_at, plan_id')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (!p) { setState({ hide: true }); return }
      // Unterdrücken: Admin/Enterprise-Bypass
      if (p.plan_id === 'enterprise') { setState({ hide: true }); return }
      // Unterdrücken: aktive Zahler
      if (p.subscription_status === 'active') { setState({ hide: true }); return }

      // Trial: zeigen wenn trialing + trial_ends_at in Zukunft
      if (p.subscription_status === 'trialing' && p.trial_ends_at) {
        const endsAt = new Date(p.trial_ends_at)
        const msLeft = endsAt - Date.now()
        const daysLeft = Math.max(0, Math.ceil(msLeft / (1000*60*60*24)))
        setState({ mode: 'trial', daysLeft, endsAt })
        return
      }

      // Abgelaufen
      if (p.subscription_status === 'expired' || (p.subscription_status === 'trialing' && p.trial_ends_at && new Date(p.trial_ends_at) <= new Date())) {
        setState({ mode: 'expired' })
        return
      }

      // Default: free ohne Trial = kein Banner
      setState({ hide: true })
    })()
    return () => { cancelled = true }
  }, [])

  if (!state || state.hide) return null

  const isExpired = state.mode === 'expired'
  const bg = isExpired
    ? 'linear-gradient(90deg, #B91C1C 0%, #991B1B 100%)'
    : `linear-gradient(90deg, ${NAVY} 0%, #002040 100%)`

  const title = isExpired
    ? 'Dein Trial ist abgelaufen.'
    : state.daysLeft === 0
      ? 'Dein Trial endet heute.'
      : state.daysLeft === 1
        ? 'Noch 1 Tag Basic-Trial.'
        : `Noch ${state.daysLeft} Tage Basic-Trial.`

  const sub = isExpired
    ? 'Für vollen Zugriff bitte einen Plan wählen.'
    : 'Keine Kreditkarte — jederzeit upgraden.'

  return (
    <div style={{
      background: bg, color: '#fff', padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 16, fontSize: 13, lineHeight: 1.3, flexWrap: 'wrap',
      borderBottom: '1px solid rgba(0,0,0,0.15)',
    }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize: 16 }}>{isExpired ? '⏰' : '✨'}</span>
        <b style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</b>
        <span style={{ opacity: 0.85 }}>· {sub}</span>
      </span>
      <a
        href="/billing"
        style={{
          background: '#fff',
          color: isExpired ? '#B91C1C' : NAVY,
          padding: '6px 14px',
          borderRadius: 99,
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          letterSpacing: '-0.01em',
        }}
      >
        {isExpired ? 'Jetzt aktivieren' : 'Upgrade →'}
      </a>
    </div>
  )
}
