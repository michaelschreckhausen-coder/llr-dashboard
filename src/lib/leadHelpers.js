// src/lib/leadHelpers.js
//
// Reine Helper-Funktionen für die Leads-Components.
// Keine React-Imports — bleibt testbar als Unit-Tests.

import { AVATAR_PALETTES, AVATAR_NEUTRAL } from './leadStyleTokens';

/**
 * Schneller, deterministischer String-Hash (DJB2-Variante).
 * Reicht völlig für die Avatar-Palette-Wahl — kein kryptographischer Zweck.
 */
export function hashString(input) {
  if (!input) return 0;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Liefert die Avatar-Farbpalette für einen Lead/User.
 * Gleicher Name = gleiche Palette, immer und überall.
 */
export function getAvatarPalette(name) {
  if (!name) return AVATAR_NEUTRAL;
  const idx = hashString(name.trim().toLowerCase()) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

/**
 * Macht aus "Anna Krüger" -> "AK", aus "anna" -> "A", aus undefined -> "?".
 */
export function getInitials(firstName, lastName) {
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  if (!f && !l) return '?';
  if (f && l) return (f[0] + l[0]).toUpperCase();
  const single = (f || l).split(/\s+/);
  if (single.length >= 2) return (single[0][0] + single[1][0]).toUpperCase();
  return single[0][0].toUpperCase();
}

/**
 * Formatiert ein ISO-Date relativ zu heute.
 * "Heute", "Gestern", "16. Mai" — wie awork.
 */
export function formatRelativeDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfTarget - startOfToday) / 86400000);

  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Morgen';
  if (diffDays === -1) return 'Gestern';
  if (diffDays > 1 && diffDays <= 6) {
    return d.toLocaleDateString('de-DE', { weekday: 'short' });
  }
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

/**
 * "Heute" für nächste Aktion in <24h → urgency=true (amber pill).
 * Sonst neutral.
 */
export function isUrgent(isoString) {
  if (!isoString) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  const diffHours = (d - new Date()) / 3600000;
  return diffHours >= -1 && diffHours <= 24;
}

/**
 * Konsistenter Display-Name. Fällt auf email zurück wenn nichts da ist.
 */
export function getDisplayName(lead) {
  if (!lead) return '';
  const f = (lead.first_name || '').trim();
  const l = (lead.last_name || '').trim();
  const full = [f, l].filter(Boolean).join(' ');
  return full || lead.email || 'Ohne Namen';
}

/**
 * "Head of Marketing · Rhino GmbH" — Subtitle für die Row.
 */
export function getSubtitle(lead) {
  if (!lead) return '';
  const parts = [];
  if (lead.position) parts.push(lead.position);
  if (lead.company) parts.push(lead.company);
  return parts.join(' · ');
}
