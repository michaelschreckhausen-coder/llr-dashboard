import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEntitlements } from '../hooks/useEntitlements'
import RealtimeStatusBadge from '../components/RealtimeStatusBadge'

const NAVY  = 'var(--wl-primary, rgb(0,48,96))'
const SKY   = '#30A0D0'
const CREAM = 'var(--surface-muted)'

const GRANTED_VIA_BADGE = {
  stripe: { label: 'Stripe-Subscription', bg: '#DBEAFE', color: '#1E40AF' },
  manual: { label: 'Manuell vergeben',   bg: '#EDE9FE', color: '#5B21B6' },
  trial:  { label: 'Trial',              bg: '#F1F5F9', color: '#475569' },
}

// Block 5.5d: Marketing-Copy per DB-Slug. DB-driven sind Pricing + Stripe-IDs;
// Tagline + Features bleiben Frontend-Constant (Git-Review fuer Marketing-Text).
// Bei neuen DB-Plans: MARKETING_BY_SLUG-Eintrag manuell hinzufuegen, sonst
// fallback auf '—' fuer tagline/features.
const MARKETING_BY_SLUG = {
  starter: {
    tagline: 'Für Solo-Founder & Freelancer',
    features: [
      'KI-Content in deiner Markenstimme',
      '500 Lead-Imports / Monat',
      'CRM mit Pipeline & Deals',
      '1 Team-Mitglied',
      'E-Mail Support',
    ],
  },
  pro: {
    tagline: 'Für wachsende Sales-Teams',
    features: [
      'Alles aus Starter',
      '2.500 Lead-Imports / Monat',
      'Automatisierte Vernetzungs-Sequenzen',
      'SSI-Tracking & Reports',
      'Bis 5 Team-Mitglieder',
      'Priority Support',
    ],
  },
  business: {
    tagline: 'Für Agenturen & Enterprise',
    features: [
      'Alles aus Pro',
      'Unlimited Lead-Imports',
      'Whitelabel + eigene Domain',
      'Multi-Tenant-Verwaltung',
      'Unbegrenzte Team-Größe',
      'Dedicated Customer Success',
    ],
  },
}

// Plan-Slug der "Beliebt"-Badge bekommt. Frontend-Constant analog Block-5.5d
// E-2-Decision (kein DB-Schema-Eintrag fuer 1 Boolean).
const HIGHLIGHTED_SLUG = 'pro'

// Defensive-Degradation Mailto fuer Plans ohne Stripe-Setup (Block 5.5d
// scope-gamma): "Kontakt aufnehmen"-Button statt broken-Checkout.
const CONTACT_EMAIL = 'info@leadesk.de'

export default function Billing() {
  const {
    data: entitlements,
    loading,
    refresh,
    realtimeStatus,
  } = useEntitlements()
  const [billing, setBilling] = useState('yearly')
  const [pendingPlan, setPendingPlan] = useState(null)  // plan_id das gerade gecheckoutet wird
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMode, setSuccessMode] = useState(false)
  const [canceledMode, setCanceledMode] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Block 5.5d: DB-driven Pricing-Tiles (statt hardcoded PLANS-Array)
  const [plans,        setPlans]        = useState([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError,   setPlansError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPlansLoading(true)
      setPlansError(null)
      const { data, error: queryError } = await supabase
        .from('plans')
        .select('id, name, slug, price_monthly, price_yearly, stripe_price_id, plan_managed_by, is_active, archived')
        .eq('archived', false)
        .eq('is_active', true)
        .not('price_monthly', 'is', null)
        .not('slug', 'in', '("free","enterprise")')
        .order('price_monthly', { ascending: true })
      if (cancelled) return
      if (queryError) {
        console.error('[Billing] plans-load error:', queryError)
        setPlansError(queryError.message)
        setPlansLoading(false)
        return
      }
      setPlans(data || [])
      setPlansLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // URL-Parameter auswerten (nach Stripe-Checkout-Redirect).
  // Phase 5 Block 3.5: Polling auf entitlements.account_status='active' statt
  // profile.subscription_status. Ruft refresh() in Intervallen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setSuccessMode(true)
      window.history.replaceState({}, '', '/billing')
      const pollStart = Date.now()
      const poll = async () => {
        await refresh()
        // refresh() ist async; entitlements kann beim naechsten Render greifen.
        // Wenn das Polling-Fenster (15s) noch nicht abgelaufen ist, weiter probieren.
        if (Date.now() - pollStart < 15000) setTimeout(poll, 1500)
      }
      poll()
    }
    if (params.get('canceled') === 'true') {
      setCanceledMode(true)
      window.history.replaceState({}, '', '/billing')
    }
  }, [refresh])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  async function handleCheckout(planId) {
    setError(null)
    setPendingPlan(planId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: planId, billing_period: billing }),
      })
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error || 'Checkout fehlgeschlagen')
      if (body.url) {
        window.location.href = body.url
      } else {
        throw new Error('Keine Checkout-URL erhalten')
      }
    } catch (err) {
      setError(err.message)
      setPendingPlan(null)
    }
  }

  async function handlePortal() {
    setError(null)
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/create-portal-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error || 'Portal konnte nicht geöffnet werden')
      if (body.url) window.location.href = body.url
      else throw new Error('Keine Portal-URL erhalten')
    } catch (err) {
      setError(err.message)
      setPortalLoading(false)
    }
  }

  // Phase 5 Block 3.5: alle Status-Felder kommen aus entitlements (account-zentrisch).
  // entitlements===null bedeutet: noch nicht geladen ODER Orphan-User.
  const isOrphan = !loading && !entitlements
  const isActive = entitlements?.account_status === 'active'
  const trialDaysLeft = entitlements?.trial_days_left ?? null
  const trialExpired = entitlements?.account_status === 'trialing'
    && entitlements?.trial_ends_at
    && new Date(entitlements.trial_ends_at) <= new Date()
  const grantedViaBadge = entitlements?.granted_via
    ? GRANTED_VIA_BADGE[entitlements.granted_via]
    : null
  const planExpiresAt = entitlements?.plan_expires_at || null

  return (
    <div style={{ padding:'40px 32px 80px', maxWidth:1200, margin:'0 auto' }}>

      {/* Success-Banner nach erfolgreichem Checkout */}
      {successMode && (
        <div style={{
          marginBottom:24, padding:'16px 20px',
          background:'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          color:'#fff', borderRadius:12,
          display:'flex', alignItems:'center', gap:12, fontSize:15, fontWeight:600,
        }}>
          <span style={{ fontSize:24 }}>🎉</span>
          <div>
            <div style={{ fontWeight:800, marginBottom:2 }}>Willkommen bei Leadesk!</div>
            <div style={{ fontSize:13, opacity:0.95, fontWeight:400 }}>Dein Plan ist aktiv. Die Rechnung erhältst du per E-Mail.</div>
          </div>
        </div>
      )}

      {/* Canceled-Banner */}
      {canceledMode && (
        <div style={{
          marginBottom:24, padding:'14px 18px',
          background:'var(--surface-muted)', border:'1px solid var(--border)',
          color:'var(--text-primary)', borderRadius:12, fontSize:14,
        }}>
          Checkout abgebrochen. Kein Problem — du kannst jederzeit einen Plan auswählen.
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:36 }}>
        <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:15, color: NAVY, marginBottom:6, lineHeight:1.2 }}>
          {isActive ? 'Plan aktiv' : trialExpired ? 'Dein Trial ist zu Ende' : trialDaysLeft !== null ? `Noch ${trialDaysLeft} Tage Trial` : 'Billing'}
        </div>
        <h1 style={{ fontSize:42, fontWeight:900, color: NAVY, letterSpacing:'-0.03em', marginBottom:8, lineHeight:1.05 }}>
          {isActive ? 'Plan verwalten.' : trialExpired ? 'Aktiviere deinen Plan.' : 'Wähle deinen Plan.'}
        </h1>
        <p style={{ fontSize:16, color:'var(--text-primary)', maxWidth:620, lineHeight:1.5 }}>
          Transparente Preise, jederzeit kündbar. Alle Pläne in Euro inkl. gesetzlicher USt.
          Jährliche Zahlung spart ~20% gegenüber monatlicher.
        </p>
      </div>

      {/* Aktueller Status (Phase 5 Block 3.5: account-zentrisch via useEntitlements) */}
      {isOrphan ? (
        <div style={{
          marginBottom: 32, padding: '16px 20px',
          background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 12, color: '#92400E', fontSize: 14,
        }}>
          ⚠️ Kein Account verknüpft. Bitte kontaktiere{' '}
          <a href="mailto:info@leadesk.de" style={{ color: '#92400E', fontWeight: 700 }}>info@leadesk.de</a>
          {' '}— wir richten dir einen Account ein.
        </div>
      ) : entitlements && (
        <div style={{
          marginBottom: 32, padding: '16px 20px',
          background: trialExpired ? '#FEF2F2' : isActive ? 'rgba(16,185,129,0.08)' : 'var(--primary-soft)',
          border: `1px solid ${trialExpired ? '#FCA5A5' : isActive ? '#10B981' : 'var(--border)'}`,
          borderRadius: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              Dein aktueller Plan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: trialExpired ? '#991B1B' : isActive ? '#059669' : NAVY }}>
                {entitlements.plan_name || 'Kein aktiver Plan'}
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
                disabled={refreshing || loading}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                  cursor: refreshing || loading ? 'default' : 'pointer',
                  opacity: refreshing || loading ? 0.5 : 1,
                }}
              >
                {refreshing ? 'Lädt…' : '↻ Plan aktualisieren'}
              </button>
              <RealtimeStatusBadge status={realtimeStatus} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
              Bei "Live": Plan-Updates kommen automatisch. Bei "Offline": Button nutzen.
            </div>
          </div>
          {isActive && entitlements.plan_managed_by === 'stripe' && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              style={{
                padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: '#fff', color: NAVY, border: `1.5px solid ${NAVY}`,
                cursor: portalLoading ? 'default' : 'pointer', letterSpacing: '-0.01em',
                opacity: portalLoading ? 0.6 : 1, whiteSpace: 'nowrap',
              }}
            >
              {portalLoading ? 'Wird geöffnet…' : 'Abo verwalten →'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginBottom:24, padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FCA5A5', color:'#991B1B', borderRadius:10, fontSize:14 }}>
          {error}
        </div>
      )}

      {/* Billing-Period Toggle */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
        <div style={{ display:'inline-flex', background:'var(--surface-muted)', padding:4, borderRadius:99, border:'1px solid var(--border)' }}>
          {['monthly','yearly'].map(p => (
            <button key={p} onClick={() => setBilling(p)} disabled={!!pendingPlan} style={{
              padding:'8px 20px', border:'none', borderRadius:99, fontSize:13, fontWeight:700,
              background: billing === p ? NAVY : 'transparent',
              color:     billing === p ? '#fff' : 'var(--text-primary)',
              cursor: pendingPlan ? 'default' : 'pointer', transition:'all 0.2s', letterSpacing:'-0.01em',
              opacity: pendingPlan ? 0.5 : 1,
            }}>
              {p === 'monthly' ? 'Monatlich' : 'Jährlich — spare 20%'}
            </button>
          ))}
        </div>
      </div>

      {/* Plan-Karten — DB-driven seit Block 5.5d */}
      {plansLoading && (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:14 }}>
          Lade Pläne…
        </div>
      )}

      {!plansLoading && plansError && (
        <div style={{ marginBottom:24, padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FCA5A5', color:'#991B1B', borderRadius:10, fontSize:14 }}>
          Pläne konnten nicht geladen werden: {plansError}
        </div>
      )}

      {!plansLoading && !plansError && plans.length === 0 && (
        <div style={{ marginBottom:24, padding:'20px', background:'var(--surface-muted)', border:'1px solid var(--border)', borderRadius:12, fontSize:14, color:'var(--text-primary)' }}>
          Aktuell keine Pläne mit Pricing verfügbar. Schreib an{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: NAVY, fontWeight:700 }}>{CONTACT_EMAIL}</a>{' '}
          für Details.
        </div>
      )}

      {!plansLoading && !plansError && plans.length > 0 && (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:20, marginBottom:40 }}>
        {plans.map(plan => {
          const marketing  = MARKETING_BY_SLUG[plan.slug] || { tagline: '—', features: [] }
          const highlighted = plan.slug === HIGHLIGHTED_SLUG
          const monthly    = plan.price_monthly != null ? Number(plan.price_monthly) : null
          const yearly     = plan.price_yearly  != null ? Number(plan.price_yearly)  : null
          const price      = billing === 'yearly' ? (yearly ?? monthly) : monthly
          // UUID-Match (Block 5.5d D-5=alpha): plan.id ist DB-UUID.
          const isCurrent = plan.id === entitlements?.plan_id && isActive
          const isPending = pendingPlan === plan.id
          // Defensive Degradation (scope-gamma): Stripe-Checkout nur wenn beide
          // Bedingungen erfuellt sind, sonst "Kontakt aufnehmen"-Mailto.
          const hasStripeCheckout = !!plan.stripe_price_id && plan.plan_managed_by === 'stripe'

          return (
            <div key={plan.id} style={{
              background: highlighted ? NAVY : 'var(--surface)',
              color:      highlighted ? '#fff' : 'var(--text-strong)',
              border:     highlighted ? 'none' : '1px solid var(--border)',
              borderRadius:20, padding:'32px 28px', position:'relative',
              boxShadow: highlighted ? '0 20px 40px rgba(0,48,96,0.18)' : '0 4px 16px rgba(0,48,96,0.05)',
              transform: highlighted ? 'scale(1.02)' : 'scale(1)',
              display:'flex', flexDirection:'column',
            }}>
              {highlighted && (
                <div style={{ position:'absolute', top:-12, right:20, background: SKY, color:'#fff', fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:99, letterSpacing:'0.03em' }}>
                  Beliebt
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-0.02em', marginBottom:2 }}>{plan.name}</div>
                <div style={{ fontSize:13, opacity:0.75 }}>{marketing.tagline}</div>
              </div>

              <div style={{ marginBottom:24 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                  <span style={{ fontSize:44, fontWeight:900, letterSpacing:'-0.03em', lineHeight:1 }}>
                    {price != null ? `${price}€` : '—'}
                  </span>
                  <span style={{ fontSize:13, opacity:0.7 }}>
                    {price != null ? `/ Monat${billing === 'yearly' ? ' · jährlich' : ''}` : ''}
                  </span>
                </div>
                {billing === 'yearly' && monthly != null && yearly != null && yearly !== monthly && (
                  <div style={{ fontSize:11, opacity:0.65, marginTop:4 }}>
                    Statt {monthly}€ monatlich
                  </div>
                )}
              </div>

              <ul style={{ listStyle:'none', padding:0, margin:'0 0 24px', display:'flex', flexDirection:'column', gap:10, flex:1 }}>
                {marketing.features.map(f => (
                  <li key={f} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:13.5, lineHeight:1.4 }}>
                    <span style={{ color: highlighted ? SKY : NAVY, fontWeight:800, marginTop:1 }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div style={{
                  padding:'12px 16px', border:`1.5px solid ${highlighted ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
                  borderRadius:10, textAlign:'center', fontSize:13, fontWeight:700, opacity:0.7,
                }}>
                  ✓ Aktueller Plan
                </div>
              ) : hasStripeCheckout ? (
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={!!pendingPlan}
                  style={{
                    padding:'12px 16px', borderRadius:10, textAlign:'center', fontSize:14, fontWeight:700,
                    background: highlighted ? '#fff' : NAVY,
                    color:      highlighted ? NAVY  : '#fff',
                    border:'none', letterSpacing:'-0.01em',
                    cursor: pendingPlan ? 'default' : 'pointer',
                    opacity: pendingPlan && !isPending ? 0.5 : 1,
                  }}
                >
                  {isPending ? 'Wird geladen…' : 'Plan aktivieren →'}
                </button>
              ) : (
                // Defensive Degradation (scope-gamma):
                // stripe_price_id fehlt ODER plan_managed_by !== 'stripe'
                // → Mailto-Link statt Stripe-Checkout (sonst 404 vom
                // create-checkout-session Edge-Function — fehlt aktuell auf
                // Hetzner; Block-5.5e-TODO).
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Plan-Anfrage: ${plan.name}`)}`}
                  style={{
                    padding:'12px 16px', borderRadius:10, textAlign:'center', fontSize:14, fontWeight:700,
                    background: highlighted ? '#fff' : NAVY,
                    color:      highlighted ? NAVY  : '#fff',
                    border:'none', letterSpacing:'-0.01em',
                    textDecoration:'none', display:'block',
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

      {/* Vertrauens-Hinweis */}
      <div style={{
        background: CREAM, border:'1px solid var(--border)', borderRadius:16,
        padding:'24px 28px', display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'
      }}>
        <div style={{ fontSize:32, lineHeight:1 }}>🔒</div>
        <div style={{ flex:1, minWidth:280 }}>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
            Sichere Zahlung über Stripe
          </div>
          <div style={{ fontSize:13.5, color:'var(--text-primary)', lineHeight:1.55, marginBottom:10 }}>
            Kreditkarte, SEPA oder Apple Pay. Deine Zahlungsdaten gehen direkt zu Stripe, werden niemals auf unseren Servern gespeichert. Rechnung + USt-Ausweis per Mail, DATEV-kompatibel. Jederzeit kündbar.
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            Fragen zu Enterprise-Pricing oder Rechnungskauf? Schreib an <a href="mailto:info@leadesk.de" style={{ color: NAVY, fontWeight:700 }}>info@leadesk.de</a>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ marginTop:40, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16 }}>
        {[
          { q: 'Kann ich jederzeit wechseln?', a: 'Ja. Upgrade oder Downgrade jederzeit zum Folgemonat.' },
          { q: 'Was passiert nach dem Trial?', a: 'Ohne Aktivierung wechselt dein Konto in den Nur-Lesen-Modus. Keine Daten gehen verloren.' },
          { q: 'Rechnung mit USt?', a: 'Ja, alle Rechnungen enthalten die ausgewiesene Umsatzsteuer und sind DATEV-kompatibel.' },
        ].map((f, i) => (
          <div key={i} style={{ padding:'16px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'var(--shadow-card)' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>{f.q}</div>
            <div style={{ fontSize:13, color:'var(--text-primary)', lineHeight:1.5 }}>{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
