// src/lib/addonPricing.js
//
// Single Source of Truth für die Preis-/Frist-Konditionen der Marketplace-Add-ons.
//
// Autoritative Entscheidung (07.07.2026):
//   sales-nav-sync ist kostenfrei bis EINSCHLIESSLICH 31.08.2026.
//   Der Preis-Switch auf 9 €/Monat wird zum 01.09.2026 00:00 (Europe/Berlin)
//   wirksam — d. h. der Preis greift erst, wenn der 31.08. vollständig vorbei ist.
//
// Alle nutzer-sichtbaren Frist-Texte im Frontend (Marketplace-Modal,
// LeadsImports-Hinweis) MÜSSEN aus diesen Konstanten lesen statt das Datum
// hartzucodieren, damit die Werte nicht wieder auseinanderdriften.
//
// ⚠️ Die Chrome-Extension (chrome-extension/sidepanel.js) bundlet separat und
// kann diese Datei NICHT importieren. Dort steht ein Kommentar-Verweis auf
// diese Datei — der Frist-Text im sidepanel MUSS mit `freeUntilLabel` unten
// synchron gehalten werden.
//
// Der maßgebliche Preis-Wert lebt zusätzlich in der DB (addons.price_monthly_cents
// für slug='sales-nav-sync' = 900). Solange addons.stripe_price_id IS NULL ist,
// zeigt der Marketplace „Kostenlos"; der 9-€-Preis wird erst mit dem Switch aktiv.

export const ADDON_PRICING = {
  'sales-nav-sync': {
    // Gratis-Nutzung gilt bis einschließlich dieses Tages.
    freeUntilDate: '2026-08-31',
    // Anzeige-Varianten (DE): numerisch als Primärform, ausgeschrieben optional.
    freeUntilLabel: '31.08.2026',
    freeUntilLabelLong: '31. August 2026',
    // Zeitpunkt, zu dem der Preis-Switch wirksam wird (ISO, Europe/Berlin = CEST).
    switchAt: '2026-09-01T00:00:00+02:00',
    // Preis nach Ablauf der Gratis-Frist.
    priceMonthlyCents: 900,
    priceLabel: '9 €',
  },
}

// Liefert das Frist-Label für einen Addon-Slug (numerisch bzw. { long: true }
// für die ausgeschriebene Variante). null, wenn der Slug keine Frist-Kondition hat.
export function addonFreeUntilLabel(slug, opts) {
  const p = ADDON_PRICING[slug]
  if (!p) return null
  return opts && opts.long ? p.freeUntilLabelLong : p.freeUntilLabel
}
