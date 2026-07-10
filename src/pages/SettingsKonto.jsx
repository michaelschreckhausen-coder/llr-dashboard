import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAccount } from '../context/AccountContext'
import { useEntitlements } from '../hooks/useEntitlements'
import SettingsTabs from '../components/SettingsTabs'
import RealtimeStatusBadge from '../components/RealtimeStatusBadge'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const CONTACT_EMAIL = 'info@leadesk.de'

const STATUS_LABELS = {
  trialing:  { label: 'Test-Phase',         color: '#0369A1', bg: '#E0F2FE' },
  active:    { label: 'Aktiv',              color: '#15803D', bg: '#DCFCE7' },
  past_due:  { label: 'Zahlung überfällig', color: '#B45309', bg: '#FEF3C7' },
  suspended: { label: 'Gesperrt',           color: '#B91C1C', bg: '#FEE2E2' },
  canceled:  { label: 'Gekündigt',          color: '#475569', bg: '#F1F5F9' },
}

const GRANTED_VIA_BADGE = {
  stripe: { label: 'Stripe', bg: '#DBEAFE', color: '#1E40AF' },
  manual: { label: 'Manuell', bg: '#EDE9FE', color: '#5B21B6' },
  trial:  { label: 'Trial',   bg: '#F1F5F9', color: '#475569' },
}

// Marketing-Copy per DB-Slug (Pricing v2, 2026-06-05: 7 paid Plans + Trial + Free).
// Bei neuen DB-Plans hier ergänzen, sonst fallback auf Plan-Name.
const MARKETING_BY_SLUG = {
  // Single-Lizenzen
  sales: {
    tagline: 'Solo-Vertriebler, Sales-Consultants, Outbound-fokussierte Founder',
    features: [
      '5.000 KI-Credits / Monat',
      '5 GB Speicher',
      '250 Unternehmen · 1.000 Kontakte',
      '1 Brand Voice · 3 Zielgruppen',
      'LinkedIn-Vernetzung + Nachrichten',
      'Sales-Reporting + SSI-Tracker',
      'Premium-AI-Modelle als Add-On (+15 €/Mo)',
    ],
  },
  marketing: {
    tagline: 'Personal-Brand-Builder, Content-Creator, Marketing-Verantwortliche',
    features: [
      '15.000 KI-Credits / Monat',
      '25 GB Speicher',
      '3 Brand Voices · 3 Zielgruppen',
      'Content-Studio + Redaktionsplan',
      'KI-Bilder (Standard + Nano Banana)',
      'Premium-AI-Modelle inkludiert',
      'LinkedIn + Reporting',
    ],
  },
  'all-in': {
    tagline: 'Komplette Suite für Solo-Founder + Personal-Brand-Berater',
    features: [
      '25.000 KI-Credits / Monat',
      '50 GB Speicher',
      'Unbegrenzte CRM-Datensätze, Brand Voices',
      'Premium-KI-Modelle (Opus 4.7, GPT-5, Gemini 2.5 Pro)',
      'Projektumsetzung + Zeiterfassung',
      'Prioritäts-Support',
    ],
  },
  // Team-Pakete
  'sales-team': {
    tagline: '2 Sales-Seats mit geteiltem Pool — spart 9 €/Monat',
    features: [
      '10.000 Credits-Pool / 10 GB Speicher',
      '500 Unternehmen · 2.000 Kontakte',
      '2 Brand Voices, 3 Zielgruppen',
      'Geteilt auf 2 Seats mit zentraler Verwaltung',
      'Premium-AI als Add-On pro Seat',
    ],
  },
  'marketing-team': {
    tagline: '2 Marketing-Seats — spart 19 €/Monat',
    features: [
      '30.000 Credits-Pool / 50 GB Speicher',
      '6 Brand Voices · 6 Zielgruppen',
      'Content-Studio + Redaktionsplan',
      'Premium-AI-Modelle inkludiert',
      'Geteilt auf 2 Seats',
    ],
  },
  kmu: {
    tagline: 'Typisches 3-Personen-B2B-Setup: 2 Sales + 1 All-In — spart 48 €/Monat (-24 %)',
    features: [
      '35.000 Credits-Pool / 60 GB Speicher',
      'Unbegrenzte CRM + Brand Voices',
      'Premium-KI für den All-In-Seat',
      '3 Seats: 2 Sales + 1 All-In',
    ],
  },
  customized: {
    tagline: 'Individuelles Team-Setup ab 4 Seats — Mindestpreis 199 €/Mo',
    features: [
      'Eigener Lizenz-Mix nach Bedarf',
      'Single-Sign-On (SAML)',
      'Dedicated Account-Manager',
      'Eigene Modell-Allowlist',
      'Onboarding-Session 60 Min',
    ],
  },
}

const HIGHLIGHTED_SLUG = 'all-in'

export default function SettingsKonto() {
  const { account, loading: accountLoading, error: accountError } = useAccount()
  const {
    data: entitlements,
    loading: entLoading,
    refresh,
    realtimeStatus,
  } = useEntitlements()

  const [billing, setBilling]           = useState('monthly')
  const [pendingPlan, setPendingPlan]   = useState(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [successMode, setSuccessMode]   = useState(false)
  const [canceledMode, setCanceledMode] = useState(false)
  const [refreshing, setRefreshing]     = useState(false)

  // DB-driven plans (übernommen aus alter Billing.jsx)
  const [plans, setPlans]               = useState([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPlansLoading(true)
      setPlansError(null)
      const { data, error: queryError } = await supabase
        .from('plans')
        .select('id, name, slug, price_monthly, price_yearly, stripe_price_id, stripe_price_id_yearly, plan_managed_by, is_active, archived, license_type, is_team_plan, seats_included, credits_quota, storage_quota_gb')
        .eq('archived', false)
        .eq('is_active', true)
        .not('price_monthly', 'is', null)
        .not('slug', 'in', '("free","free-legacy","trial","trial-classic")')
        .order('price_monthly', { ascending: true })
      if (cancelled) return
      if (queryError) {
        console.error('[SettingsKonto] plans-load error:', queryError)
        setPlansError(queryError.message)
        setPlansLoading(false)
        return
      }
      setPlans(data || [])
      setPlansLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Query-Params von Stripe-Redirect (legacy /billing?success=true wird via
  // App.jsx-Redirect zu /settings/konto?success=true weitergeleitet).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setSuccessMode(true)
      window.history.replaceState({}, '', '/settings/konto')
      const pollStart = Date.now()
      const poll = async () => {
        await refresh()
        if (Date.now() - pollStart < 15000) setTimeout(poll, 1500)
      }
      poll()
    }
    if (params.get('canceled') === 'true') {
      setCanceledMode(true)
      window.history.replaceState({}, '', '/settings/konto')
    }
  }, [refresh])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  async function handleCheckout(planSlug) {
    setCheckoutError(null)
    setPendingPlan(planSlug)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      const { data, error } = await supabase.functions.invoke('create-plan-checkout-session', {
        body: { plan_slug: planSlug, period: billing },
      })
      if (error) throw new Error(error.message || 'Checkout fehlgeschlagen')
      if (data?.error) throw new Error(data.error)
      if (data?.url) window.location.href = data.url
      else throw new Error('Keine Checkout-URL erhalten')
    } catch (err) {
      setCheckoutError(err.message)
      setPendingPlan(null)
    }
  }

  async function handlePortal() {
    setCheckoutError(null)
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', { body: {} })
      if (error) throw new Error(error.message || 'Portal konnte nicht geöffnet werden')
      if (data?.error) throw new Error(data.error)
      if (data?.url) window.location.href = data.url
      else throw new Error('Keine Portal-URL erhalten')
    } catch (err) {
      setCheckoutError(err.message)
      setPortalLoading(false)
    }
  }

  const planName        = entitlements?.plan_name || null
  const planExpiresAt   = entitlements?.plan_expires_at || null
  const grantedViaBadge = entitlements?.granted_via ? GRANTED_VIA_BADGE[entitlements.granted_via] : null
  const isOrphan        = !entLoading && !entitlements
  const isActive        = entitlements?.account_status === 'active'
  const trialDaysLeft   = entitlements?.trial_days_left ?? null
  const trialExpired    = entitlements?.account_status === 'trialing'
    && entitlements?.trial_ends_at
    && new Date(entitlements.trial_ends_at) <= new Date()

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <SettingsTabs />

      {/* Success-Banner nach Stripe-Checkout */}
      {successMode && (
        <div style={{
          marginBottom: 16, padding: '14px 18px',
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          color: '#fff', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: 600,
        }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 2 }}>Plan aktiviert</div>
            <div style={{ fontSize: 12, opacity: 0.95, fontWeight: 400 }}>
              Die Rechnung erhältst du per E-Mail.
            </div>
          </div>
        </div>
      )}

      {canceledMode && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: 'var(--surface-muted)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', borderRadius: 10, fontSize: 13,
        }}>
          Checkout abgebrochen. Du kannst jederzeit einen Plan auswählen.
        </div>
      )}

      {/* Loading / Error / Orphan States */}
      {accountLoading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-soft, #6B7280)', fontSize: 13 }}>
          Account-Daten werden geladen…
        </div>
      )}

      {!accountLoading && accountError && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: '#FEE2E2', border: '1px solid #FCA5A5',
          color: '#991B1B', fontSize: 13, marginBottom: 16,
        }}>
          Fehler beim Laden der Account-Daten: {accountError}
        </div>
      )}

      {!accountLoading && !accountError && !account && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-soft, #6B7280)', fontSize: 13 }}>
          Kein Account verknüpft — bitte{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: PRIMARY, fontWeight: 700 }}>{CONTACT_EMAIL}</a>{' '}
          kontaktieren.
        </div>
      )}

      {/* Stammdaten-Card */}
      {!accountLoading && !accountError && account && (
        <div style={{
          background: 'var(--surface, white)',
          borderRadius: 16,
          border: '1px solid var(--border, #E5E7EB)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong, #0F172A)' }}>
              Konto
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-soft, #6B7280)', marginTop: 4 }}>
              Stammdaten — Änderungen über den Leadesk-Support.
            </div>
          </div>
          <Row label="Account-Name" value={account.name || '—'} />
          <Row label="Rechnungs-E-Mail" value={account.billing_email || '—'} />
          <Row label="Sitzplätze" value={account.seat_limit != null ? String(account.seat_limit) : '—'} />
          <Row label="Status" value={
            <span style={{
              display: 'inline-block', padding: '3px 9px', borderRadius: 6,
              fontSize: 11, fontWeight: 700,
              color: STATUS_LABELS[account.status]?.color || '#475569',
              background: STATUS_LABELS[account.status]?.bg || '#F1F5F9',
            }}>
              {STATUS_LABELS[account.status]?.label || account.status || '—'}
            </span>
          } />
        </div>
      )}

      {/* Plan-Status-Card */}
      {isOrphan ? (
        <div style={{
          marginBottom: 16, padding: '16px 20px',
          background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 12, color: '#92400E', fontSize: 13,
        }}>
          ⚠️ Kein Account verknüpft. Bitte{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#92400E', fontWeight: 700 }}>{CONTACT_EMAIL}</a>{' '}
          — wir richten dir einen Account ein.
        </div>
      ) : entitlements && (
        <div style={{
          marginBottom: 16, padding: '16px 20px',
          background: trialExpired ? '#FEF2F2' : isActive ? 'rgba(16,185,129,0.08)' : 'var(--surface-muted)',
          border: `1px solid ${trialExpired ? '#FCA5A5' : isActive ? '#10B981' : 'var(--border)'}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              Aktueller Plan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: trialExpired ? '#991B1B' : isActive ? '#059669' : 'var(--text-strong)' }}>
                {planName || 'Kein aktiver Plan'}
                {trialExpired && ' · Trial abgelaufen'}
                {!trialExpired && entitlements.account_status === 'trialing' && trialDaysLeft !== null && ` · Trial (noch ${trialDaysLeft} Tag${trialDaysLeft === 1 ? '' : 'e'})`}
              </div>
              {grantedViaBadge && (
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                  fontSize: 11, fontWeight: 700,
                  color: grantedViaBadge.color, background: grantedViaBadge.bg,
                }}>
                  {grantedViaBadge.label}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {planExpiresAt
                ? `Lizenz aktiv bis ${new Date(planExpiresAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                : 'Lizenz: unbegrenzt'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing || entLoading}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                  cursor: refreshing || entLoading ? 'default' : 'pointer',
                  opacity: refreshing || entLoading ? 0.5 : 1,
                }}
              >
                {refreshing ? 'Lädt…' : '↻ Plan aktualisieren'}
              </button>
              <RealtimeStatusBadge status={realtimeStatus} />
            </div>
          </div>
          {isActive && entitlements.plan_managed_by === 'stripe' && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              style={{
                padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: '#fff', color: PRIMARY, border: `1.5px solid ${PRIMARY}`,
                cursor: portalLoading ? 'default' : 'pointer', letterSpacing: '-0.01em',
                opacity: portalLoading ? 0.6 : 1, whiteSpace: 'nowrap',
              }}
            >
              {portalLoading ? 'Wird geöffnet…' : 'Abo verwalten →'}
            </button>
          )}
        </div>
      )}

      {checkoutError && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>
          {checkoutError}
        </div>
      )}

      {/* Plan-Wechsel-Card */}
      <div style={{
        background: 'var(--surface, white)',
        borderRadius: 16,
        border: '1px solid var(--border, #E5E7EB)',
        boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
        padding: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong, #0F172A)' }}>
              Plan wechseln
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-soft, #6B7280)', marginTop: 4 }}>
              Jederzeit kündbar · Stripe-Checkout · DATEV-kompatible Rechnung
            </div>
          </div>

          {/* Monthly/Yearly Toggle */}
          <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', padding: 3, borderRadius: 99, border: '1px solid var(--border)' }}>
            {['monthly', 'yearly'].map(p => (
              <button key={p} onClick={() => setBilling(p)} disabled={!!pendingPlan} style={{
                padding: '6px 14px', border: 'none', borderRadius: 99, fontSize: 12, fontWeight: 700,
                background: billing === p ? PRIMARY : 'transparent',
                color: billing === p ? '#fff' : 'var(--text-primary)',
                cursor: pendingPlan ? 'default' : 'pointer', transition: 'all 0.2s', letterSpacing: '-0.01em',
                opacity: pendingPlan ? 0.5 : 1,
              }}>
                {p === 'monthly' ? 'Monatlich' : 'Jährlich −20%'}
              </button>
            ))}
          </div>
        </div>

        {plansLoading && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Lade Pläne…
          </div>
        )}

        {!plansLoading && plansError && (
          <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>
            Pläne konnten nicht geladen werden: {plansError}
          </div>
        )}

        {!plansLoading && !plansError && plans.length === 0 && (
          <div style={{ padding: '16px 20px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-primary)' }}>
            Aktuell keine Pläne mit Pricing verfügbar. Schreib an{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: PRIMARY, fontWeight: 700 }}>{CONTACT_EMAIL}</a>{' '}
            für Details.
          </div>
        )}

        {!plansLoading && !plansError && plans.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {(() => {
              // Filter: nur Upgrades zeigen (price_monthly >= aktueller Plan-Preis)
              // sowie current-Plan selbst. Customized immer zeigen.
              const currentPlan = plans.find(p => p.id === entitlements?.plan_id)
              const currentPrice = Number(currentPlan?.price_monthly ?? 0)
              return plans.filter(p =>
                p.slug === 'customized'
                  || p.id === entitlements?.plan_id
                  || Number(p.price_monthly ?? 0) >= currentPrice
              )
            })().map(plan => {
              const marketing   = MARKETING_BY_SLUG[plan.slug] || { tagline: '—', features: [] }
              const highlighted = plan.slug === HIGHLIGHTED_SLUG
              const monthly     = plan.price_monthly != null ? Number(plan.price_monthly) : null
              const yearly      = plan.price_yearly  != null ? Number(plan.price_yearly)  : null
              const price       = billing === 'yearly' ? (yearly ?? monthly) : monthly
              const isCurrent   = plan.id === entitlements?.plan_id && isActive
              const isPending   = pendingPlan === plan.slug
              // Period-aware: yearly braucht stripe_price_id_yearly, monthly braucht stripe_price_id
              const stripePriceForPeriod = billing === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id
              const hasStripeCheckout = !!stripePriceForPeriod && plan.license_type !== 'custom'

              return (
                <div key={plan.id} style={{
                  background: highlighted ? PRIMARY : 'var(--surface)',
                  color: highlighted ? '#fff' : 'var(--text-strong)',
                  border: highlighted ? 'none' : '1.5px solid var(--border)',
                  borderRadius: 14, padding: '20px 18px', position: 'relative',
                  boxShadow: highlighted ? '0 12px 28px rgba(10,111,176,0.18)' : 'none',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {highlighted && (
                    <div style={{ position: 'absolute', top: -10, right: 14, background: '#fff', color: PRIMARY, fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 99, letterSpacing: '0.04em', border: `1.5px solid ${PRIMARY}` }}>
                      BELIEBT
                    </div>
                  )}

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 2 }}>{plan.name}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.78 }}>{marketing.tagline}</div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>
                        {price != null ? `${price}€` : '—'}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>
                        {price != null ? `/ Monat${billing === 'yearly' ? ' · jährlich' : ''}` : ''}
                      </span>
                    </div>
                    {billing === 'yearly' && monthly != null && yearly != null && yearly !== monthly && (
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3 }}>
                        Statt {monthly}€ monatlich
                      </div>
                    )}
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {marketing.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.4 }}>
                        <span style={{ color: highlighted ? '#fff' : PRIMARY, fontWeight: 800, marginTop: 1 }}>✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div style={{
                      padding: '9px 14px', border: `1.5px solid ${highlighted ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
                      borderRadius: 10, textAlign: 'center', fontSize: 12, fontWeight: 700, opacity: 0.75,
                    }}>
                      ✓ Aktueller Plan
                    </div>
                  ) : hasStripeCheckout ? (
                    <button
                      onClick={() => handleCheckout(plan.slug)}
                      disabled={!!pendingPlan}
                      style={{
                        padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 13, fontWeight: 700,
                        background: highlighted ? '#fff' : PRIMARY,
                        color: highlighted ? PRIMARY : '#fff',
                        border: 'none', letterSpacing: '-0.01em',
                        cursor: pendingPlan ? 'default' : 'pointer',
                        opacity: pendingPlan && !isPending ? 0.5 : 1,
                      }}
                    >
                      {isPending ? 'Wird geladen…' : 'Plan aktivieren →'}
                    </button>
                  ) : (
                    <a
                      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Plan-Anfrage: ${plan.name}`)}`}
                      style={{
                        padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 13, fontWeight: 700,
                        background: highlighted ? '#fff' : PRIMARY,
                        color: highlighted ? PRIMARY : '#fff',
                        border: 'none', letterSpacing: '-0.01em',
                        textDecoration: 'none', display: 'block',
                      }}
                    >
                      Kontakt aufnehmen →
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer-Hinweis (kompakt, statt großer Marketing-Box) */}
      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
        🔒 Sichere Zahlung über Stripe · Enterprise / Rechnungskauf:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: PRIMARY, fontWeight: 600 }}>{CONTACT_EMAIL}</a>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid #F3F4F6',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: 16, fontSize: 13,
    }}>
      <div style={{ color: 'var(--text-soft, #6B7280)', fontWeight: 500 }}>{label}</div>
      <div style={{ color: 'var(--text-strong, #0F172A)', fontWeight: 600, textAlign: 'right' }}>{value}</div>
    </div>
  )
}
