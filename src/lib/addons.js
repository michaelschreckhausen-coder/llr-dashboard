// src/lib/addons.js
//
// Marketplace-Konstanten + Helpers. Single source of truth für Frontend.
//
// Schema-Bindings:
//   addons.category — frei wählbar, hier sinnvoll gruppiert
//   addons.type     — 'feature_unlock' | 'integration' | 'ai_quota'
//                     CHECK-Constraint in Migration 20260518140000

import {
  Sparkles, Plug, Zap, Star, Package,
  MessageSquare, Mail, Phone, Calendar, Bell,
  Workflow, Globe, Shield, Cloud, FileText, Receipt,
} from 'lucide-react'

// Whitelist-Map für Add-on-Icons aus DB-Spalte `addons.icon` (String → Component).
// WICHTIG: `import * as lucide` ist tree-shake-unfreundlich (~900KB extra)!
// Stattdessen: nur Icons die in DB-Seeds verwendet werden hier auflisten.
// Bei neuem Add-on mit neuem Icon → hier ergänzen.
// Hinweis: `Linkedin` existiert in lucide@1.14.0 nicht (Top-Fallstrick #11).
// Für LinkedIn-Brand-Glyph eigenes IcLinkedin nutzen, hier weglassen.
export const ADDON_ICON_MAP = {
  Sparkles, Plug, Zap, Star, Package,
  MessageSquare, Mail, Phone, Calendar, Bell,
  Workflow, Globe, Shield, Cloud, FileText, Receipt,
}

export function resolveAddonIcon(name) {
  return (name && ADDON_ICON_MAP[name]) || Zap
}

// Category-Map — Tabs auf der Marketplace-Page
export const ADDON_CATEGORIES = [
  { key: 'all',         label: 'Alle',          Icon: Package },
  { key: 'ai',          label: 'KI',            Icon: Sparkles },
  { key: 'integration', label: 'Integrationen', Icon: Plug },
  { key: 'feature',     label: 'Features',      Icon: Star },
]

// Type-Labels (DB-Wert → UI-Label, primär für Detail-Ansicht)
export const ADDON_TYPE_LABELS = {
  feature_unlock: 'Feature-Erweiterung',
  integration:    'Integration',
  ai_quota:       'KI-Quota',
}

// Default-Icon falls icon-Spalte leer
export const DEFAULT_ADDON_ICON = Zap

// Preis-Format helper. cents → "19 €" / "19,99 €"
export function formatPriceMonthly(cents, currency = 'EUR') {
  if (cents == null) return '—'
  const euros = cents / 100
  const formatted = euros % 1 === 0
    ? euros.toString()
    : euros.toFixed(2).replace('.', ',')
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency
  return `${formatted} ${symbol}`
}

// Status-Helpers für waitlist-RPC-Result-Codes
export const WAITLIST_RESULT_MESSAGES = {
  enrolled:        'Du bist auf der Warteliste. Wir melden uns sobald verfügbar.',
  already_listed:  'Du stehst bereits auf der Warteliste.',
  already_active:  'Du hast dieses Add-on bereits abonniert.',
  addon_not_found: 'Add-on nicht gefunden.',
}
