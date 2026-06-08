// src/lib/tagColors.js
//
// Tag-Farben in zwei Schichten:
//   1. Registry (user-zuweisbar): lead_tag_registry.color = Paletten-Schlüssel.
//      Der useTagRegistry-Hook füllt den Modul-Cache via setTagRegistry({name->key}).
//   2. Auto-Color (Fallback): deterministischer Hash des Tag-Namens → Palette.
//
// tagColor(name) schlägt zuerst die Registry nach, sonst Auto. Dadurch bekommen
// ALLE bestehenden Pill-Stellen (die tagColor importieren) die Registry-Farbe
// ohne eigenen Refactor.

// Benannte Palette — Schlüssel werden in der DB gespeichert (lead_tag_registry.color).
export const TAG_PALETTE = {
  indigo:  { bg: '#EEF2FF', fg: '#3730A3', border: '#C7D2FE' },
  emerald: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
  amber:   { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
  pink:    { bg: '#FCE7F3', fg: '#9D174D', border: '#FBCFE8' },
  sky:     { bg: '#E0F2FE', fg: '#075985', border: '#BAE6FD' },
  purple:  { bg: '#F3E8FF', fg: '#6B21A8', border: '#E9D5FF' },
  orange:  { bg: '#FFEDD5', fg: '#9A3412', border: '#FED7AA' },
  green:   { bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0' },
  red:     { bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA' },
  teal:    { bg: '#CCFBF1', fg: '#115E59', border: '#99F6E4' },
};

export const TAG_PALETTE_KEYS = Object.keys(TAG_PALETTE);

export function paletteColor(key) {
  return TAG_PALETTE[key] || TAG_PALETTE.indigo;
}

// ─── Registry-Modul-Cache ────────────────────────────────────────────────
// name(lower) -> Paletten-Schlüssel. Vom useTagRegistry-Hook gepflegt.
let REGISTRY = {};

export function setTagRegistry(map) {
  REGISTRY = map || {};
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Auto-Color (Fallback) — deterministisch aus dem Namen.
export function autoTagColor(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return TAG_PALETTE.indigo;
  return TAG_PALETTE[TAG_PALETTE_KEYS[hashString(key) % TAG_PALETTE_KEYS.length]];
}

// Liefert { bg, fg, border } — Registry zuerst, sonst Auto.
export function tagColor(name) {
  const key = (name || '').trim().toLowerCase();
  if (key && REGISTRY[key]) return paletteColor(REGISTRY[key]);
  return autoTagColor(name);
}
