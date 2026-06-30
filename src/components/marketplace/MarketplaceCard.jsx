// src/components/marketplace/MarketplaceCard.jsx
//
// Add-on-Tile für die Marketplace-Page.
//
// State-Logik:
//   - active subscription/activation                       → "Aktiv" Pill, kein CTA
//   - stripe_price_id IS NOT NULL                          → "Abonnieren" CTA (Phase 2)
//   - stripe_price_id IS NULL && already on waitlist       → "Auf Warteliste" disabled
//   - stripe_price_id IS NULL                              → "Auf Warteliste" CTA
//
// is_featured → "NEU"-Pill in der Ecke (erste 2-4 Wochen post-Launch)

import { useState } from 'react'
import { Check, Hourglass, MoreVertical } from 'lucide-react'
import { formatPriceMonthly, resolveAddonIcon, ADDON_TYPE_LABELS } from '../../lib/addons'

const cardStyle = {
  background: 'var(--surface, #fff)',
  border: '1px solid var(--border, #E4E7EC)',
  borderRadius: 14,
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  position: 'relative',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  transition: 'transform .15s, box-shadow .15s',
}
const headerStyle = { display: 'flex', alignItems: 'flex-start', gap: 12 }
const iconBoxStyle = (color) => ({
  width: 44, height: 44, borderRadius: 12,
  background: `${color}1A`, color,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
})
const titleStyle    = { fontSize: 15, fontWeight: 700, color: 'var(--text-strong, #111827)', margin: 0, lineHeight: 1.25 }
const subtitleStyle = { fontSize: 11, color: 'var(--text-muted, #6B7280)', marginTop: 2, fontWeight: 500 }
const descStyle     = { fontSize: 12.5, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.55, margin: 0 }
const priceStyle    = { fontSize: 18, fontWeight: 800, color: 'var(--text-strong, #111827)' }
const priceUnitStyle = { fontSize: 11, color: 'var(--text-muted, #6B7280)', fontWeight: 500 }
const featuresUlStyle = { padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }
const featureLiStyle  = { display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.4 }
const pillNewStyle = {
  position: 'absolute', top: 14, right: 14,
  padding: '3px 8px', borderRadius: 99,
  background: '#FEF3C7', color: '#92400E',
  fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
}
const pillActiveStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 11px', borderRadius: 99,
  background: '#ECFDF5', color: '#065F46',
  fontSize: 11, fontWeight: 700,
}
const ctaPrimary = {
  flex: 1, height: 38, padding: '0 16px',
  background: 'var(--wl-primary, rgb(49,90,231))', color: '#fff',
  border: 'none', borderRadius: 10,
  fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
}
const ctaWaitlist = {
  ...ctaPrimary,
  background: 'var(--surface, #fff)',
  color: 'var(--wl-primary, rgb(49,90,231))',
  border: '1.5px solid var(--wl-primary, rgb(49,90,231))',
}
const ctaWaitlistJoined = {
  ...ctaWaitlist,
  background: '#F3F4F6',
  color: 'var(--text-muted, #6B7280)',
  borderColor: 'var(--border, #E4E7EC)',
  cursor: 'not-allowed',
}

const kebabStyle = {
  width: 34, height: 34, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--border, #E4E7EC)', borderRadius: 9,
  background: 'var(--surface, #fff)', color: 'var(--text-muted, #6B7280)', cursor: 'pointer',
}
const menuStyle = {
  position: 'absolute', right: 0, bottom: 44, zIndex: 20,
  minWidth: 196, padding: 6,
  background: '#fff', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12,
  boxShadow: '0 12px 32px rgba(15,23,42,0.16)',
}
const menuItemStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '9px 12px', border: 'none', background: 'transparent',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  color: 'var(--text-strong, #111827)',
}

function IconFromName(name, color) {
  const Icon = resolveAddonIcon(name)
  return <Icon size={22} color={color} />
}

export function MarketplaceCard({ addon, isSubscribed, isWaitlisted, manageViaStripe, onJoinWaitlist, onSubscribe, onActivateFree, onCancel, onManageBilling, settingsRoute, onOpenSettings }) {
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const color = addon.highlight_color || 'var(--wl-primary, rgb(49,90,231))'
  const features = Array.isArray(addon.features) ? addon.features : []
  const hasStripe = !!addon.stripe_price_id
  // Verwalten-vs-Kündigen gatet auf die AKTIVE Row dieses Accounts (manageViaStripe),
  // NICHT auf das Addon: grandfathered Free-Bestandskunden eines inzwischen kosten-
  // pflichtigen Addons (kein stripe_subscription_id) kündigen self-service statt ins
  // Billing-Portal geschickt zu werden. Fallback hasStripe nur wenn Prop fehlt.
  const showStripeManage = manageViaStripe !== undefined ? manageViaStripe : hasStripe
  // Free-Preview: kein Stripe-Preis, aber das Addon schaltet ein Modul frei
  // (activates_modules nicht leer) → direkt aktivierbar statt Warteliste.
  const isFreeActivatable = !hasStripe
    && Array.isArray(addon.activates_modules)
    && addon.activates_modules.length > 0

  const handleClick = async () => {
    // isWaitlisted blockt NICHT mehr generell — free-activatable Addons müssen
    // trotz Waitlist-Eintrag aktivierbar bleiben (renderCta zeigt für reine
    // Waitlist-Addons ohnehin einen disabled-Button ohne onClick).
    if (busy || isSubscribed) return
    if (isWaitlisted && !isFreeActivatable) return
    setBusy(true)
    try {
      if (hasStripe && onSubscribe) {
        await onSubscribe(addon)
      } else if (isFreeActivatable && onActivateFree) {
        await onActivateFree(addon)
      } else if (!hasStripe && onJoinWaitlist) {
        await onJoinWaitlist(addon)
      }
    } finally {
      setBusy(false)
    }
  }

  const renderCta = () => {
    if (isSubscribed) {
      return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={pillActiveStyle}>
            <Check size={13} /> Aktiv
          </span>
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button type="button" style={kebabStyle} aria-label="Add-on verwalten"
              onClick={() => setMenuOpen(o => !o)}>
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                {/* Click-away-Overlay */}
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div style={menuStyle}>
                  {settingsRoute && (
                    <button type="button" style={menuItemStyle}
                      onClick={() => { setMenuOpen(false); onOpenSettings?.(addon) }}>
                      Einstellungen
                    </button>
                  )}
                  {showStripeManage ? (
                    <button type="button" style={menuItemStyle}
                      onClick={() => { setMenuOpen(false); onManageBilling?.(addon) }}>
                      Abonnement verwalten
                    </button>
                  ) : (
                    <button type="button" style={{ ...menuItemStyle, color: '#B91C1C' }}
                      onClick={() => { setMenuOpen(false); onCancel?.(addon) }}>
                      Kündigen
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )
    }
    // Free-Activation hat Vorrang vor Waitlist: wer ein Addon waitlisted hat,
    // BEVOR es free-activatable wurde, darf trotzdem direkt aktivieren (sonst
    // bleibt er auf "Auf Warteliste" hängen — Lockout).
    if (isFreeActivatable) {
      return (
        <button type="button" onClick={handleClick} disabled={busy} style={ctaPrimary}>
          {busy ? 'Aktiviere…' : 'Kostenlos aktivieren'}
        </button>
      )
    }
    if (isWaitlisted) {
      return (
        <button type="button" disabled style={ctaWaitlistJoined}>
          <Check size={14} /> Auf Warteliste
        </button>
      )
    }
    if (hasStripe) {
      return (
        <button type="button" onClick={handleClick} disabled={busy} style={ctaPrimary}>
          {busy ? 'Lade…' : 'Abonnieren'}
        </button>
      )
    }
    return (
      <button type="button" onClick={handleClick} disabled={busy} style={ctaWaitlist}>
        <Hourglass size={14} /> {busy ? 'Eintragen…' : 'Auf Warteliste'}
      </button>
    )
  }

  return (
    <div
      style={{
        ...cardStyle,
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover ? '0 10px 24px rgba(15,23,42,0.10)' : '0 1px 2px rgba(15,23,42,0.04)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {addon.is_featured && <span style={pillNewStyle}>NEU</span>}

      <div style={headerStyle}>
        <div style={iconBoxStyle(color)}>{IconFromName(addon.icon, color)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={titleStyle}>{addon.name}</h3>
          <div style={subtitleStyle}>{ADDON_TYPE_LABELS[addon.type] || addon.type}</div>
        </div>
      </div>

      {addon.short_description && <p style={descStyle}>{addon.short_description}</p>}

      {features.length > 0 && (
        <ul style={featuresUlStyle}>
          {features.slice(0, 4).map((f, i) => (
            <li key={i} style={featureLiStyle}>
              <Check size={12} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 'auto' }}>
        {isFreeActivatable ? (
          <span style={priceStyle}>Kostenlos</span>
        ) : (
          <>
            <span style={priceStyle}>{formatPriceMonthly(addon.price_monthly_cents, addon.currency)}</span>
            <span style={priceUnitStyle}>/ Monat</span>
          </>
        )}
      </div>

      <div style={{ display: 'flex' }}>
        {renderCta()}
      </div>
    </div>
  )
}
