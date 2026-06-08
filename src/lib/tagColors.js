// src/lib/tagColors.js
//
// Deterministische Tag-Farben ("Auto-Color"): die Farbe wird aus dem
// Tag-Namen abgeleitet (Hash → Palette), sodass derselbe Tag überall in der
// App dieselbe Farbe hat — ohne Schema oder Verwaltungs-UI.
//
// Später ablösbar durch eine Tag-Registry (user-zuweisbare Farben pro Team):
// dann hier zuerst die Registry-Farbe nachschlagen und nur als Fallback
// auf tagColor() zurückfallen.

const PALETTE = [
  { bg: '#EEF2FF', fg: '#3730A3', border: '#C7D2FE' }, // indigo
  { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' }, // emerald
  { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' }, // amber
  { bg: '#FCE7F3', fg: '#9D174D', border: '#FBCFE8' }, // pink
  { bg: '#E0F2FE', fg: '#075985', border: '#BAE6FD' }, // sky
  { bg: '#F3E8FF', fg: '#6B21A8', border: '#E9D5FF' }, // purple
  { bg: '#FFEDD5', fg: '#9A3412', border: '#FED7AA' }, // orange
  { bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0' }, // green
  { bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA' }, // red
  { bg: '#CCFBF1', fg: '#115E59', border: '#99F6E4' }, // teal
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Liefert { bg, fg, border } für einen Tag-Namen. Case-insensitiv + trim,
// damit "Enterprise" und "enterprise " dieselbe Farbe bekommen.
export function tagColor(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return PALETTE[0];
  return PALETTE[hashString(key) % PALETTE.length];
}
