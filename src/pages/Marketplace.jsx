// src/pages/Marketplace.jsx
//
// Storefront-Page für Leadesk-Add-ons. Phase 0 — Listing + Waitlist-Enroll.
// Stripe-Subscribe-Flow kommt in Phase 2.
//
// Layout: Hero → Category-Tabs → Grid mit MarketplaceCards (auto-fit responsive)

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAddons } from '../hooks/useAddons'
import { useEntitlements } from '../hooks/useEntitlements'
import { MarketplaceCard } from '../components/marketplace/MarketplaceCard'
import CreditsTopupSection from '../components/marketplace/CreditsTopupSection'
import { ADDON_CATEGORIES, WAITLIST_RESULT_MESSAGES } from '../lib/addons'

// Add-on-spezifische Redirect-Pfade nach erfolgreicher Stripe-Subscription.
// Wenn das Add-on nach Subscribe noch eine Verbindung braucht (API-Key,
// OAuth), führen wir den User direkt dorthin.
const POST_SUBSCRIBE_REDIRECTS = {
  'sevdesk-integration': '/integrations',
}

const pageStyle    = { background: 'var(--surface-canvas, #F8FAFC)', minHeight: '100vh', padding: '32px 32px 60px' }
const containerStyle = { maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }
const heroStyle    = { display: 'flex', alignItems: 'center', gap: 16 }
const heroIconBox  = {
  width: 56, height: 56, borderRadius: 16,
  background: 'rgba(139,92,246,0.10)', color: '#8B5CF6',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}
const heroTitle    = { fontSize: 26, fontWeight: 800, margin: 0, color: 'var(--text-strong, #111827)', letterSpacing: '-0.02em' }
const heroSubtitle = { fontSize: 14, color: 'var(--text-muted, #6B7280)', marginTop: 4 }

const tabsStyle = { display: 'flex', gap: 6, flexWrap: 'wrap' }
const tabStyle = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 99,
  fontSize: 13, fontWeight: 600,
  border: `1.5px solid ${active ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--border, #E4E7EC)'}`,
  background: active ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--surface, #fff)',
  color: active ? '#fff' : 'var(--text-secondary, #4B5563)',
  cursor: 'pointer',
  transition: 'all .12s',
})
const searchWrapStyle = { position: 'relative', flex: 1, maxWidth: 320 }
const searchInputStyle = {
  width: '100%', padding: '8px 14px 8px 36px',
  border: '1.5px solid var(--border, #E4E7EC)', borderRadius: 99,
  background: 'var(--surface, #fff)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 16,
}
const emptyStyle = {
  padding: '60px 20px', textAlign: 'center',
  color: 'var(--text-muted, #6B7280)', fontSize: 14,
  background: 'var(--surface, #fff)',
  border: '1px dashed var(--border, #E4E7EC)',
  borderRadius: 14,
}
const flashStyle = (type) => ({
  position: 'fixed', top: 20, right: 24, zIndex: 1100,
  padding: '12px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: type === 'err' ? '#FEF2F2' : '#ECFDF5',
  color:      type === 'err' ? '#dc2626' : '#059669',
  border: `1px solid ${type === 'err' ? '#FECACA' : '#A7F3D0'}`,
  boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
  maxWidth: 360,
})

export default function Marketplace() {
  const navigate = useNavigate()
  const { catalog, subscribedSlugs, waitlistedSlugs, isLoading, error, joinWaitlist, activateAddon, reload } = useAddons()
  const { refresh: refreshEntitlements } = useEntitlements()
  const [category, setCategory] = useState('all')
  const [search, setSearch]     = useState('')
  const [flash, setFlash]       = useState(null)

  // Success/Cancel-URL-Handler — Stripe-Checkout redirected mit ?addon_subscribed=<slug>
  // bzw. ?addon_canceled=<slug> zurück.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const subscribed = params.get('addon_subscribed')
    const canceled   = params.get('addon_canceled')
    const topupPurchased = params.get('topup_purchased')
    const topupCancelled = params.get('topup_cancelled')

    // Credit-Top-Up Success/Cancel-Handler (Phase J.2 B)
    if (topupPurchased) {
      setFlash({ msg: `Top-Up '${topupPurchased}' aktiviert — Credits/Limits sind in 1–2 Sek verfügbar.`, type: 'ok' })
      params.delete('topup_purchased')
      const newSearch = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''))
      const t = setTimeout(() => setFlash(null), 5000)
      return () => clearTimeout(t)
    }
    if (topupCancelled) {
      setFlash({ msg: 'Top-Up nicht abgeschlossen.', type: 'err' })
      params.delete('topup_cancelled')
      const newSearch = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''))
      const t = setTimeout(() => setFlash(null), 5000)
      return () => clearTimeout(t)
    }

    if (!subscribed && !canceled) return

    if (subscribed) {
      const followup = POST_SUBSCRIBE_REDIRECTS[subscribed]
      setFlash({
        msg: followup
          ? `${subscribed} aktiviert. Weiterleitung zur Einrichtung…`
          : `${subscribed} aktiviert.`,
        type: 'ok',
      })
      // Realtime-Webhook braucht ggf. 1-2 Sek bis account_addons-Row da ist.
      // Wir reload nach kurzer Wartezeit damit der Status-Pill stimmt.
      setTimeout(() => { reload() }, 1500)
      if (followup) {
        setTimeout(() => navigate(followup), 2500)
      }
    } else if (canceled) {
      setFlash({ msg: 'Abo nicht abgeschlossen.', type: 'err' })
    }

    // URL aufräumen
    params.delete('addon_subscribed')
    params.delete('addon_canceled')
    const newSearch = params.toString()
    const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '')
    window.history.replaceState({}, '', cleanUrl)

    const t = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (catalog || []).filter((a) => {
      if (category !== 'all' && a.category !== category) return false
      if (!term) return true
      return (
        (a.name || '').toLowerCase().includes(term) ||
        (a.short_description || '').toLowerCase().includes(term) ||
        (a.long_description  || '').toLowerCase().includes(term)
      )
    })
  }, [catalog, category, search])

  const counts = useMemo(() => {
    const out = { all: catalog.length }
    for (const a of catalog) out[a.category] = (out[a.category] || 0) + 1
    return out
  }, [catalog])

  const showFlash = (msg, type = 'ok') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 4000)
  }

  const onJoinWaitlist = async (addon) => {
    const { data, error: err } = await joinWaitlist(addon.slug)
    if (err) {
      showFlash(err.message || 'Fehler beim Eintragen', 'err')
      return
    }
    const msg = WAITLIST_RESULT_MESSAGES[data] || 'Eingetragen.'
    showFlash(msg, data === 'enrolled' || data === 'already_listed' ? 'ok' : 'err')
  }

  // Free-Aktivierung für Add-ons ohne stripe_price_id (z.B. Sponsoring OS).
  // Nach Erfolg: Entitlements refreshen, damit die Sidebar-Section (z.B.
  // 'Sponsoring') ohne Page-Reload erscheint.
  const onActivateFree = async (addon) => {
    if (!addon?.slug) return
    const { error: err } = await activateAddon(addon.slug)
    if (err) {
      showFlash(err.message || 'Aktivierung fehlgeschlagen', 'err')
      return
    }
    showFlash(`${addon.name} aktiviert.`, 'ok')
    // Entitlements neu laden → modules[] enthält jetzt das Addon-Modul,
    // Sidebar rendert die Section ohne Reload.
    refreshEntitlements()
  }

  // Stripe-Checkout via Edge-Function. Bei Erfolg redirect auf die
  // Hosted-Checkout-URL. Nach Bezahlung kommt der User mit
  // ?addon_subscribed=<slug> zurück, was der useEffect oben handlet.
  const onSubscribe = async (addon) => {
    if (!addon?.slug) return
    const { data, error: invokeErr } = await supabase.functions.invoke(
      'create-addon-checkout-session',
      { body: { addon_slug: addon.slug } },
    )
    if (invokeErr) {
      console.error('[Marketplace] checkout-session invoke error:', invokeErr)
      showFlash('Checkout konnte nicht gestartet werden. Bitte später erneut versuchen.', 'err')
      return
    }
    if (data?.error) {
      const msg = data.error === 'addon_not_priced'
        ? 'Dieses Add-on ist noch nicht buchbar (Preis fehlt).'
        : data.error === 'no_account_context'
        ? 'Kein Account-Kontext gefunden.'
        : `Checkout fehlgeschlagen: ${data.error}`
      showFlash(msg, 'err')
      return
    }
    if (data?.url) {
      window.location.href = data.url
    } else {
      showFlash('Keine Checkout-URL erhalten.', 'err')
    }
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>

        {/* Hero */}
        <div style={heroStyle}>
          <div style={heroIconBox}><Sparkles size={28} /></div>
          <div>
            <h1 style={heroTitle}>Marketplace</h1>
            <div style={heroSubtitle}>Erweitere Leadesk mit zusätzlichen KI-Credits, Speicher-Top-Ups, Integrationen und Premium-Features.</div>
          </div>
        </div>

        {/* Credits + Top-Up-Section (Sprint J.2 Phase B) */}
        <CreditsTopupSection onFlash={showFlash} />

        {/* Add-on-Tabs + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={tabsStyle}>
            {ADDON_CATEGORIES.map((t) => {
              const active = category === t.key
              const count  = counts[t.key] || 0
              return (
                <button key={t.key} type="button" onClick={() => setCategory(t.key)} style={tabStyle(active)}>
                  <t.Icon size={14} />
                  {t.label}
                  <span style={{
                    padding: '1px 7px', borderRadius: 99,
                    background: active ? 'rgba(255,255,255,0.22)' : 'var(--surface-muted, #F1F5F9)',
                    color: active ? '#fff' : 'var(--text-muted, #6B7280)',
                    fontSize: 11, fontWeight: 800,
                  }}>{count}</span>
                </button>
              )
            })}
          </div>
          <div style={searchWrapStyle}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Add-on suchen…"
              style={searchInputStyle}
            />
          </div>
        </div>

        {/* Content */}
        {error && (
          <div style={{ ...emptyStyle, color: '#dc2626', borderColor: '#FECACA', background: '#FEF2F2' }}>
            Fehler beim Laden: {error.message || String(error)}
          </div>
        )}

        {!error && isLoading && (
          <div style={emptyStyle}>Lade Marketplace…</div>
        )}

        {!error && !isLoading && filtered.length === 0 && (
          <div style={emptyStyle}>
            {search
              ? `Keine Treffer für „${search}"`
              : `Keine Add-ons in der Kategorie „${ADDON_CATEGORIES.find(c => c.key === category)?.label}"`
            }
          </div>
        )}

        {!error && !isLoading && filtered.length > 0 && (
          <div style={gridStyle}>
            {filtered.map((addon) => (
              <MarketplaceCard
                key={addon.id}
                addon={addon}
                isSubscribed={subscribedSlugs.has(addon.slug)}
                isWaitlisted={waitlistedSlugs.has(addon.slug)}
                onJoinWaitlist={onJoinWaitlist}
                onSubscribe={onSubscribe}
                onActivateFree={onActivateFree}
              />
            ))}
          </div>
        )}
      </div>

      {flash && <div style={flashStyle(flash.type)}>{flash.msg}</div>}
    </div>
  )
}
