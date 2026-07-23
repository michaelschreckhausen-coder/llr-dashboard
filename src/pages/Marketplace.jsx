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
import { getAddonSettingsComponent } from '../components/marketplace/addonSettingsRegistry'
import { ADDON_CATEGORIES, WAITLIST_RESULT_MESSAGES } from '../lib/addons'
import { addonFreeUntilLabel } from '../lib/addonPricing'

// Add-on-spezifische Redirect-Pfade nach erfolgreicher Stripe-Subscription.
// Wenn das Add-on nach Subscribe noch eine Verbindung braucht (API-Key,
// OAuth), führen wir den User direkt dorthin.
// Free-Until-Konditionen pro Addon-Slug (für das Confirmation-Modal).
// sales-nav-sync liest die Frist aus der Single Source of Truth (src/lib/addonPricing.js),
// damit das Datum nicht mehr an mehreren Stellen hartkodiert driftet.
const ADDON_FREE_UNTIL = {
  'sales-nav-sync': addonFreeUntilLabel('sales-nav-sync'),
  'strike2-zielgruppen-plus': '31. August 2026',
}

const POST_SUBSCRIBE_REDIRECTS = {
  'sevdesk-integration': '/integrations',
}

// An Settings angeglichen: gleiche Breite (1100), kein eigener Vollflächen-Canvas,
// sitzt auf dem normalen App-Hintergrund wie /settings.
const pageStyle    = { width: '100%', padding: '8px 0 40px' }
const containerStyle = { width: '100%', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }
const heroStyle    = { display: 'flex', alignItems: 'center', gap: 16 }
const heroIconBox  = {
  width: 56, height: 56, borderRadius: 16,
  background: 'rgba(139,92,246,0.10)', color: '#0A6FB0',
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
  border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border, #E4E7EC)'}`,
  background: active ? 'var(--primary)' : 'var(--surface, #fff)',
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
  const { catalog, subscribedSlugs, waitlistedSlugs, stripeManagedSlugs, isLoading, error, joinWaitlist, activateAddon, cancelAddon, reload } = useAddons()
  const [uniAllowance, setUniAllowance] = useState(null)
  useEffect(() => { supabase.rpc('unipile_allowance').then(({ data }) => setUniAllowance(data || null)).catch(() => setUniAllowance(null)) }, [])
  const { refresh: refreshEntitlements } = useEntitlements()
  const [category, setCategory] = useState('all')
  const [search, setSearch]     = useState('')
  const [flash, setFlash]       = useState(null)
  const [pendingAddon, setPendingAddon] = useState(null) // Free-Activation-Confirmation
  const [activating, setActivating]     = useState(false)
  const [pendingCancel, setPendingCancel] = useState(null) // Cancel-Confirmation (Pattern B)
  const [canceling, setCanceling]         = useState(false)
  const [settingsAddon, setSettingsAddon] = useState(null) // ⋮ → "Einstellungen" (In-Place-Panel)

  // Success/Cancel-URL-Handler — Stripe-Checkout redirected mit ?addon_subscribed=<slug>
  // bzw. ?addon_canceled=<slug> zurück.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const subscribed = params.get('addon_subscribed')
    const canceled   = params.get('addon_canceled')
    const topupPurchased = params.get('topup_purchased')
    const topupCancelled = params.get('topup_cancelled')

    // Rückkehr vom Asana-OAuth-Callback (/integrations/asana/callback leitet
    // hierher: ?asana_connected=1 bzw. ?asana_error=...). Flash + Settings-Panel
    // öffnen, damit der (neue) Verbindungsstatus sofort sichtbar ist.
    const asanaConnected = params.get('asana_connected')
    const asanaError     = params.get('asana_error')
    if (asanaConnected || asanaError) {
      setFlash(asanaConnected
        ? { msg: 'Asana erfolgreich verbunden.', type: 'ok' }
        : { msg: 'Asana-Verbindung fehlgeschlagen: ' + asanaError, type: 'err' })
      setSettingsAddon({ slug: 'asana-integration', name: 'Asana Integration' })
      params.delete('asana_connected')
      params.delete('asana_error')
      const ns = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (ns ? `?${ns}` : ''))
      const t = setTimeout(() => setFlash(null), 5000)
      return () => clearTimeout(t)
    }

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
      if (a.slug === 'automation') return false   // eigene Kapazitäts-Kachel oben (LinkedIn-Verknüpfung)
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
    setTimeout(() => setFlash(null), 5000)
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

  // Free-Aktivierung für Add-ons ohne stripe_price_id (z.B. Sponsoring OS,
  // Sales-Nav-Sync). Klick öffnet ERST das Confirmation-Modal (Free-Until-
  // Awareness), Bestätigung aktiviert dann tatsächlich.
  const onActivateFree = (addon) => { if (addon?.slug) setPendingAddon(addon) }
  const doActivateFree = async (addon) => {
    if (!addon?.slug) return
    setActivating(true)
    const { error: err } = await activateAddon(addon.slug)
    setActivating(false)
    setPendingAddon(null)
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

  // Pattern B (Free): Kündigen → erst Confirm-Modal, dann cancel_addon-RPC.
  const onCancel = (addon) => { if (addon?.slug) setPendingCancel(addon) }
  const doCancelConfirmed = async (addon) => {
    if (!addon?.slug) return
    setCanceling(true)
    const { error: err } = await cancelAddon(addon.slug)
    setCanceling(false)
    setPendingCancel(null)
    if (err) {
      showFlash(err.message || 'Kündigung fehlgeschlagen', 'err')
      return
    }
    showFlash(`${addon.name} gekündigt — Zugriff entzogen.`, 'ok')
    refreshEntitlements() // Modul fällt aus entitlements → Sidebar/Gate aktualisieren
  }

  // Pattern C (Paid): Abonnement verwalten → Stripe-Billing-Portal (neuer Tab).
  const onManageBilling = async (addon) => {
    const { data, error: invokeErr } = await supabase.functions.invoke(
      'create-billing-portal-session',
      { body: { return_url: window.location.href } },
    )
    if (invokeErr || data?.error) {
      showFlash('Billing-Portal konnte nicht geöffnet werden.', 'err')
      return
    }
    if (data?.url) window.open(data.url, '_blank', 'noopener')
    else showFlash('Keine Portal-URL erhalten.', 'err')
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

        {/* LinkedIn-Verknüpfung — Kapazitäts-Limit (pro Lizenz 1 inklusive, weitere 5 €/Monat) */}
        {(() => {
          const li = (catalog || []).find(a => a.slug === 'automation')
          if (!li) return null
          const sub = subscribedSlugs.has('automation')
          const stripeManaged = stripeManagedSlugs.has('automation')
          const al = uniAllowance
          return (
            <div style={{ margin: '18px 0 6px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                🔗 LinkedIn-Verknüpfung <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>· pro Lizenz 1 inklusive · Monatlich · jederzeit kündbar</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 360px))', gap: 12, marginTop: 10 }}>
                <div style={{ background: '#fff', border: '1px solid var(--border, #E4E7EC)', borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>Weitere LinkedIn-Anbindung</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>Jedes weitere LinkedIn-Profil — serverseitig über Unipile (Analyse, Nachrichten, Vernetzung, Content).</div>
                  {al && (
                    <div style={{ marginTop: 10, fontSize: 12.5, background: '#EEF2FF', border: '1px solid #E0E7FF', borderRadius: 10, padding: '8px 11px', color: '#3730A3' }}>
                      Aktuell <strong>{al.connected} von {al.included}</strong> inklusive genutzt{al.can_add ? '' : ' — Limit erreicht'}{al.addon_active ? ' · Zubuchung aktiv' : ''}.
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '12px 0 10px' }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>5 €</span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>/ Monat je weitere Verknüpfung</span>
                  </div>
                  {sub ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 5 }}>✓ Zubuchung aktiv</span>
                      {stripeManaged && <button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={() => onManageBilling(li)}>Verwalten</button>}
                    </div>
                  ) : (
                    <button className="lk-btn lk-btn-primary" style={{ width: '100%' }} onClick={() => onSubscribe(li)}>Weitere Verknüpfung zubuchen</button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

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
                manageViaStripe={stripeManagedSlugs.has(addon.slug)}
                onJoinWaitlist={onJoinWaitlist}
                onSubscribe={onSubscribe}
                onActivateFree={onActivateFree}
                onCancel={onCancel}
                onManageBilling={onManageBilling}
                settingsRoute={POST_SUBSCRIBE_REDIRECTS[addon.slug]}
                hasSettings={!!getAddonSettingsComponent(addon.slug)}
                allowance={addon.slug === 'automation' ? uniAllowance : undefined}
                onOpenSettings={(a) => {
                  if (getAddonSettingsComponent(a.slug)) setSettingsAddon(a)
                  else navigate(POST_SUBSCRIBE_REDIRECTS[a.slug] || '/integrations')
                }}
              />
            ))}
          </div>
        )}
      </div>

      {flash && <div style={flashStyle(flash.type)}>{flash.msg}</div>}

      {pendingAddon && (
        <div onClick={() => !activating && setPendingAddon(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,0.18)', width: 440, maxWidth: '92vw', padding: 26 }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>🎁 {pendingAddon.name} aktivieren?</div>
            <p style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.6, margin: '0 0 14px' }}>
              {pendingAddon.long_description || pendingAddon.short_description || ''}
            </p>
            {Array.isArray(pendingAddon.features) && pendingAddon.features.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', fontSize: 13, color: '#334155', lineHeight: 1.85 }}>
                {pendingAddon.features.map((f, i) => (<li key={i}>✓ {f}</li>))}
              </ul>
            )}
            {ADDON_FREE_UNTIL[pendingAddon.slug] && (
              <div style={{ fontSize: 13, lineHeight: 1.7, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
                <div style={{ color: '#065F46', fontWeight: 600 }}>✓ Kostenfrei bis {ADDON_FREE_UNTIL[pendingAddon.slug]}</div>
                <div style={{ color: '#92400E', marginTop: 4 }}>ℹ Danach Abo erforderlich (Konditionen werden vor Ablauf kommuniziert, jederzeit kündbar)</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="lk-btn lk-btn-ghost" onClick={() => setPendingAddon(null)} disabled={activating}
                >
                Abbrechen
              </button>
              <button className="lk-btn lk-btn-primary" onClick={() => doActivateFree(pendingAddon)} disabled={activating}
                style={{ opacity: activating ? 0.6 : 1 }}>
                {activating ? 'Aktiviere…' : 'Aktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCancel && (
        <div onClick={() => !canceling && setPendingCancel(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,0.18)', width: 420, maxWidth: '92vw', padding: 26 }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>{pendingCancel.name} kündigen?</div>
            <p style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.6, margin: '0 0 18px' }}>
              Du verlierst <strong>sofort</strong> den Zugriff auf dieses Add-on. Bereits erstellte Inhalte
              (z.B. übernommene Ideen im Redaktionsplan) bleiben erhalten. Du kannst es jederzeit wieder aktivieren.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="lk-btn lk-btn-ghost" onClick={() => setPendingCancel(null)} disabled={canceling}
                >
                Abbrechen
              </button>
              <button onClick={() => doCancelConfirmed(pendingCancel)} disabled={canceling}
                style={{ border: 'none', background: '#DC2626', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: canceling ? 0.6 : 1 }}>
                {canceling ? 'Kündige…' : 'Kündigen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsAddon && (() => {
        const SettingsComp = getAddonSettingsComponent(settingsAddon.slug)
        if (!SettingsComp) return null
        return (
          <div onClick={() => setSettingsAddon(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,0.18)', width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', padding: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong, #111827)' }}>
                  {settingsAddon.name} — Einstellungen
                </div>
                <button onClick={() => setSettingsAddon(null)} aria-label="Schließen"
                  style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
                  ×
                </button>
              </div>
              <SettingsComp addon={settingsAddon} onFlash={showFlash} onClose={() => setSettingsAddon(null)} />
            </div>
          </div>
        )
      })()}
    </div>
  )
}
