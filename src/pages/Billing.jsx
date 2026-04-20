import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const NAVY  = 'var(--wl-primary, rgb(0,48,96))'
const SKY   = '#30A0D0'
const CREAM = 'var(--surface-muted)'

// Plan-Definitionen — synchron halten mit pricing.html auf Marketing-Seite
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Für Solo-Founder & Freelancer',
    monthly: 29,
    yearly:  23,
    features: [
      'KI-Content in deiner Markenstimme',
      '500 Lead-Imports / Monat',
      'CRM mit Pipeline & Deals',
      '1 Team-Mitglied',
      'E-Mail Support',
    ],
    highlighted: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Für wachsende Sales-Teams',
    monthly: 79,
    yearly:  63,
    features: [
      'Alles aus Starter',
      '2.500 Lead-Imports / Monat',
      'Automatisierte Vernetzungs-Sequenzen',
      'SSI-Tracking & Reports',
      'Bis 5 Team-Mitglieder',
      'Priority Support',
    ],
    highlighted: true,
    badge: 'Beliebt',
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'Für Agenturen & Enterprise',
    monthly: 199,
    yearly:  159,
    features: [
      'Alles aus Professional',
      'Unlimited Lead-Imports',
      'Whitelabel + eigene Domain',
      'Multi-Tenant-Verwaltung',
      'Unbegrenzte Team-Größe',
      'Dedicated Customer Success',
    ],
    highlighted: false,
  },
]

export default function Billing() {
  const [profile, setProfile] = useState(null)
  const [billing, setBilling] = useState('yearly') // 'monthly' | 'yearly'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: p } = await supabase.from('profiles')
        .select('plan_id, subscription_status, trial_ends_at')
        .eq('id', user.id).maybeSingle()
      if (cancelled) return
      setProfile(p)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at) - Date.now()) / (1000*60*60*24)))
    : null

  const trialExpired = profile?.subscription_status === 'expired'
    || (profile?.subscription_status === 'trialing' && profile?.trial_ends_at && new Date(profile.trial_ends_at) <= new Date())

  return (
    <div style={{ padding:'40px 32px 80px', maxWidth:1200, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom:36 }}>
        <div style={{ fontFamily:'"Caveat",cursive', fontSize:26, color: SKY, marginBottom:4, lineHeight:1 }}>
          {trialExpired ? 'Dein Trial ist zu Ende' : trialDaysLeft !== null ? `Noch ${trialDaysLeft} Tage Trial` : 'Billing'}
        </div>
        <h1 style={{ fontSize:42, fontWeight:900, color: NAVY, letterSpacing:'-0.03em', marginBottom:8, lineHeight:1.05 }}>
          {trialExpired ? 'Aktiviere deinen Plan.' : 'Wähle deinen Plan.'}
        </h1>
        <p style={{ fontSize:16, color:'var(--text-primary)', maxWidth:620, lineHeight:1.5 }}>
          Transparente Preise, jederzeit kündbar. Alle Pläne in Euro inkl. gesetzlicher USt.
          Jährliche Zahlung spart ~20% gegenüber monatlicher.
        </p>
      </div>

      {/* Aktueller Status */}
      {profile && (
        <div style={{
          marginBottom:32, padding:'16px 20px',
          background: trialExpired ? '#FEF2F2' : 'var(--primary-soft)',
          border: `1px solid ${trialExpired ? '#FCA5A5' : 'var(--border)'}`,
          borderRadius:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap'
        }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>
              Dein aktueller Plan
            </div>
            <div style={{ fontSize:17, fontWeight:800, color: trialExpired ? '#991B1B' : NAVY }}>
              {profile.plan_id === 'enterprise' ? 'Enterprise (Admin-Zugang)'
                : profile.subscription_status === 'trialing' ? `Basic-Trial · noch ${trialDaysLeft} Tag${trialDaysLeft===1?'':'e'}`
                : trialExpired ? 'Trial abgelaufen'
                : profile.plan_id === 'free' ? 'Kein aktiver Plan'
                : `${profile.plan_id.charAt(0).toUpperCase() + profile.plan_id.slice(1)} (${profile.subscription_status})`}
            </div>
          </div>
        </div>
      )}

      {/* Billing-Period Toggle */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
        <div style={{ display:'inline-flex', background:'var(--surface-muted)', padding:4, borderRadius:99, border:'1px solid var(--border)' }}>
          {['monthly','yearly'].map(p => (
            <button key={p} onClick={() => setBilling(p)} style={{
              padding:'8px 20px', border:'none', borderRadius:99, fontSize:13, fontWeight:700,
              background: billing === p ? NAVY : 'transparent',
              color:     billing === p ? '#fff' : 'var(--text-primary)',
              cursor:'pointer', transition:'all 0.2s', letterSpacing:'-0.01em',
            }}>
              {p === 'monthly' ? 'Monatlich' : 'Jährlich — spare 20%'}
            </button>
          ))}
        </div>
      </div>

      {/* Plan-Karten */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:20, marginBottom:40 }}>
        {PLANS.map(plan => {
          const price = billing === 'yearly' ? plan.yearly : plan.monthly
          const isCurrent = profile?.plan_id === plan.id
          return (
            <div key={plan.id} style={{
              background: plan.highlighted ? NAVY : 'var(--surface)',
              color:      plan.highlighted ? '#fff' : 'var(--text-strong)',
              border:     plan.highlighted ? 'none' : '1px solid var(--border)',
              borderRadius:20, padding:'32px 28px', position:'relative',
              boxShadow: plan.highlighted ? '0 20px 40px rgba(0,48,96,0.18)' : '0 4px 16px rgba(0,48,96,0.05)',
              transform: plan.highlighted ? 'scale(1.02)' : 'scale(1)',
              display:'flex', flexDirection:'column',
            }}>
              {plan.badge && (
                <div style={{ position:'absolute', top:-12, right:20, background: SKY, color:'#fff', fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:99, letterSpacing:'0.03em' }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-0.02em', marginBottom:2 }}>{plan.name}</div>
                <div style={{ fontSize:13, opacity:0.75 }}>{plan.tagline}</div>
              </div>

              <div style={{ marginBottom:24 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                  <span style={{ fontSize:44, fontWeight:900, letterSpacing:'-0.03em', lineHeight:1 }}>{price}€</span>
                  <span style={{ fontSize:13, opacity:0.7 }}>/ Monat{billing === 'yearly' ? ' · jährlich' : ''}</span>
                </div>
                {billing === 'yearly' && (
                  <div style={{ fontSize:11, opacity:0.65, marginTop:4 }}>
                    Statt {plan.monthly}€ monatlich
                  </div>
                )}
              </div>

              <ul style={{ listStyle:'none', padding:0, margin:'0 0 24px', display:'flex', flexDirection:'column', gap:10, flex:1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:13.5, lineHeight:1.4 }}>
                    <span style={{ color: plan.highlighted ? SKY : NAVY, fontWeight:800, marginTop:1 }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div style={{
                  padding:'12px 16px', border:`1.5px solid ${plan.highlighted ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
                  borderRadius:10, textAlign:'center', fontSize:13, fontWeight:700, opacity:0.7,
                }}>
                  Aktueller Plan
                </div>
              ) : (
                <a
                  href={`mailto:info@leadesk.de?subject=Plan-Aktivierung: ${plan.name}&body=Hallo Leadesk-Team,%0D%0A%0D%0Aich möchte den ${plan.name}-Plan (${billing === 'yearly' ? 'jährlich' : 'monatlich'}) aktivieren.%0D%0A%0D%0AMeine Account-E-Mail: %0D%0A%0D%0AViele Grüße`}
                  style={{
                    padding:'12px 16px', borderRadius:10, textAlign:'center', fontSize:14, fontWeight:700,
                    background: plan.highlighted ? '#fff' : NAVY,
                    color:      plan.highlighted ? NAVY  : '#fff',
                    textDecoration:'none', letterSpacing:'-0.01em', cursor:'pointer',
                  }}
                >
                  Plan aktivieren →
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Kontakt-Hinweis */}
      <div style={{
        background: CREAM, border:'1px solid var(--border)', borderRadius:16,
        padding:'24px 28px', display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'
      }}>
        <div style={{ fontSize:32, lineHeight:1 }}>✉️</div>
        <div style={{ flex:1, minWidth:280 }}>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
            Noch kein Self-Service Checkout
          </div>
          <div style={{ fontSize:13.5, color:'var(--text-primary)', lineHeight:1.55, marginBottom:10 }}>
            Wir aktivieren deinen Plan aktuell noch manuell. Schreib uns an <a href="mailto:info@leadesk.de" style={{ color: NAVY, fontWeight:700 }}>info@leadesk.de</a> —
            wir bestätigen innerhalb von 1 Werktag und richten dir SEPA-Abbuchung oder Kreditkarte ein.
            Stripe-Integration folgt in wenigen Wochen.
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            Tipp: Die Plan-Buttons oben öffnen direkt eine vorausgefüllte Mail.
          </div>
        </div>
      </div>

      {/* FAQ Kurzfassung */}
      <div style={{ marginTop:40, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16 }}>
        {[
          { q: 'Kann ich jederzeit wechseln?', a: 'Ja. Upgrade oder Downgrade jederzeit zum Folgemonat.' },
          { q: 'Was passiert nach dem Trial?', a: 'Ohne Aktivierung wechselt dein Konto in den Nur-Lesen-Modus. Keine Daten gehen verloren.' },
          { q: 'Rechnung mit USt?', a: 'Ja, alle Rechnungen enthalten die ausgewiesene Umsatzsteuer und sind DATEV-kompatibel.' },
        ].map((f, i) => (
          <div key={i} style={{ padding:'16px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>{f.q}</div>
            <div style={{ fontSize:13, color:'var(--text-primary)', lineHeight:1.5 }}>{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
