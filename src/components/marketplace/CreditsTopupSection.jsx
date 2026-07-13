// CreditsTopupSection — Sprint J.2 Phase B
//
// Listet alle aktiven credit_topup_offers (4 Credits + 3 Storage + 2 CRM)
// als Karten gruppiert nach Type. Klick → Stripe-Checkout via
// create-credits-checkout-session EF → Hosted-Checkout-Redirect.
//
// Wird in Marketplace.jsx als Sektion oberhalb der Add-ons gerendered.

import { useEffect, useMemo, useState } from 'react'
import { Building2, Save, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const TYPE_LABELS = {
  credits:        { label: 'Credits',           icon: '⚡', desc: 'Einmalig kaufen, verfallen nicht solange Abo aktiv' },
  storage_gb:     { label: 'Speicher',          icon: <Save size={16} strokeWidth={1.75}/>, desc: 'Monatlich · sticky, jederzeit kündbar' },
  crm_companies:  { label: 'CRM Unternehmen',   icon: <Building2 size={16} strokeWidth={1.75}/>, desc: 'Monatlich · für Sales-Lizenzen mit erhöhtem Bedarf' },
  crm_contacts:   { label: 'CRM Kontakte',      icon: <User size={16} strokeWidth={1.75}/>, desc: 'Monatlich · für Sales-Lizenzen mit erhöhtem Bedarf' },
}

export default function CreditsTopupSection({ onFlash }) {
  const [offers, setOffers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [pendingSlug, setPendingSlug] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error: e } = await supabase
        .from('credit_topup_offers')
        .select('id, slug, type, amount, price_eur, currency, is_recurring, label, short_description, sort_order, stripe_price_id')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (e) { setError(e.message); setOffers([]) }
      else   { setOffers(data || []) }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => {
    const g = { credits: [], storage_gb: [], crm_companies: [], crm_contacts: [] }
    for (const o of offers) {
      if (g[o.type]) g[o.type].push(o)
    }
    return g
  }, [offers])

  const handleBuy = async (offer) => {
    if (pendingSlug) return
    setPendingSlug(offer.slug)
    try {
      const { data, error: e } = await supabase.functions.invoke('create-credits-checkout-session', {
        body: { offer_slug: offer.slug },
      })
      if (e) throw new Error(e.message || 'Checkout fehlgeschlagen')
      if (data?.error) {
        if (data.error === 'offer_not_priced_in_stripe') {
          throw new Error('Dieses Top-Up ist noch nicht buchbar (Stripe-Wiring fehlt).')
        }
        throw new Error(data.error)
      }
      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error('Keine Checkout-URL erhalten')
      }
    } catch (err) {
      onFlash?.(err.message, 'err')
      setPendingSlug(null)
    }
  }

  if (loading) return null  // silent — addon-Section übernimmt loading-UI
  if (error)   return null  // silent — fehlende offers blocken nicht den Marketplace
  if (offers.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-strong, #111827)', letterSpacing: '-0.01em' }}>
          ⚡ Credits + Limits aufladen
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6B7280)' }}>
          Bei aufgebrauchten Credits oder Storage-Limit
        </span>
      </div>

      {Object.entries(grouped).map(([type, list]) => {
        if (list.length === 0) return null
        const meta = TYPE_LABELS[type]
        return (
          <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong, #111827)' }}>
                {meta.icon} {meta.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6B7280)' }}>
                · {meta.desc}
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
              {list.map(offer => {
                const isPending = pendingSlug === offer.slug
                const hasStripe = !!offer.stripe_price_id
                return (
                  <div key={offer.id} style={{
                    background: 'var(--surface, #fff)',
                    border: '1.5px solid var(--border, #E4E7EC)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong, #111827)', letterSpacing: '-0.01em' }}>
                      {offer.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6B7280)', minHeight: 28, lineHeight: 1.4 }}>
                      {offer.short_description || ' '}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong, #111827)', letterSpacing: '-0.02em' }}>
                        {Number(offer.price_eur).toFixed(Number(offer.price_eur) % 1 === 0 ? 0 : 2)} €
                      </span>
                      {offer.is_recurring && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #6B7280)' }}>
                          / Monat
                        </span>
                      )}
                    </div>
                    <button className="lk-btn lk-btn-cta"
                      onClick={() => handleBuy(offer)}
                      disabled={!hasStripe || !!pendingSlug}
                      title={!hasStripe ? 'Stripe-Price-ID fehlt (Setup pending)' : undefined}
                      style={{ marginTop: 6, opacity: pendingSlug && !isPending ? 0.5 : 1 }}
                    >
                      {isPending ? 'Wird geladen…' : !hasStripe ? 'Bald verfügbar' : (offer.is_recurring ? 'Abo starten' : 'Kaufen')}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
