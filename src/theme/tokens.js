// ─── Leadesk Design Tokens ────────────────────────────────────────────────────
// Zentrale Design-System-Konstanten, angelehnt an die Marketing-Site (leadesk.de).
//
// WICHTIG — Lese-Regeln:
// • Farben werden über CSS-Variablen geliefert, NICHT hardcoded.
//   Primary nutzt weiterhin --wl-primary (Whitelabel-Support, siehe
//   lib/whitelabel.js). Für den Leadesk-Main-Tenant wird primary_color in
//   whitelabel_settings auf Navy #003060 gesetzt.
// • Dieses Modul wird in Inline-Styles per Import konsumiert, z.B.:
//     import { colors, radii, shadows, typography } from '../theme/tokens'
//     <div style={{ borderRadius: radii.lg, boxShadow: shadows.card }}>
// • Neue Seiten/Komponenten sollten ausschließlich Tokens verwenden,
//   bestehende Seiten werden schrittweise migriert (Phase 2+).
// ──────────────────────────────────────────────────────────────────────────────

// ── Farben ────────────────────────────────────────────────────────────────────
// Glass-Mode (Phase G1): Die App läuft auf einem tiefblauen Background mit
// Glow-Orbs. Alle Surfaces sind semi-transparente Glass-Panels, Text ist hell.
// Die alten Namen bleiben für Kompatibilität, die Werte sind auf Glass umgestellt.
export const colors = {
  // Brand (über Whitelabel-CSS-Variable, damit pro Mandant überschreibbar)
  primary:          'var(--wl-primary, rgb(48,160,208))',  // Sky-Blue als Primary im Dark-Mode besser lesbar
  primaryHover:     'rgb(100, 195, 230)',
  primaryDark:      'rgb(0, 48, 96)',                       // Navy bleibt für Hero-Gradients
  primarySoft:      'rgba(48,160,208,0.15)',
  primarySofter:    'rgba(48,160,208,0.08)',
  primaryGlow:      'rgba(48,160,208,0.45)',

  // Accent (identisch mit Primary im Dark-Mode)
  accentBlue:       'rgb(48,160,208)',
  accentBlueSoft:   'rgb(120,195,225)',
  accentGlow:       'rgba(48,160,208,0.35)',

  // Surfaces — Glass (semi-transparent auf Dark-Background)
  white:            'rgba(255,255,255,0.06)',               // Glass-Panel (Cards)
  cream:            'rgba(255,255,255,0.04)',               // Schwächere Glass-Variante
  blueTint:         'rgba(48,160,208,0.10)',                // Getönte Glass-Zone
  blueTint2:        'rgba(48,160,208,0.15)',
  bgPage:           '#0B1020',                              // Tiefer Body-Background (Fallback)
  glassStrong:      'rgba(255,255,255,0.09)',               // Für Hover-States
  glassDark:        'rgba(10,15,30,0.35)',                  // Für Overlays

  // Text (hell statt dunkel)
  ink:              '#FFFFFF',
  ink2:             'rgba(255,255,255,0.92)',
  inkMuted:         'rgba(255,255,255,0.65)',
  inkSoft:          'rgba(255,255,255,0.45)',
  inkOnBlue:        '#FFFFFF',
  inkOnBlueMuted:   'rgba(255,255,255,0.78)',

  // Borders (Glass-Kanten)
  border:           'rgba(255,255,255,0.10)',
  borderSoft:       'rgba(255,255,255,0.06)',
  borderStrong:     'rgba(255,255,255,0.18)',

  // Status (an Dark-Mode angepasst, Pastelltöne statt Soft-BGs)
  warm:             '#FCD34D',                              // Helles Amber
  warmSoft:         'rgba(245,158,11,0.18)',
  success:          '#6FE6A8',                              // Helles Green
  successSoft:      'rgba(34,197,94,0.18)',
  danger:           '#FCA5A5',                              // Helles Red für Text
  dangerSoft:       'rgba(239,68,68,0.18)',
  info:             '#7DD3FC',                              // Helles Blue
  infoSoft:         'rgba(59,130,246,0.18)',

  // Spezielle Glass-Farben (neu in G1)
  cardGlass:        'rgba(255,255,255,0.06)',               // Standard Glass-Card-BG
  cardGlassHover:   'rgba(255,255,255,0.09)',
  glassBorder:      'rgba(255,255,255,0.10)',
  glassHighlight:   'linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05) 50%, transparent 100%)',
}

// ── Radien (Scale: 8 / 14 / 20 / 28) ──────────────────────────────────────────
export const radii = {
  xs:    4,
  sm:    8,
  md:    14,
  lg:    20,
  xl:    28,
  pill:  999,
}

// ── Shadows ───────────────────────────────────────────────────────────────────
// Glass-Mode: Shadows haben Blau-Tönung und sind tiefer (mehr Blur).
// Zusätzlich bekommen Cards eine innere Highlight-Linie (inset 0 1px 0).
export const shadows = {
  none:    'none',
  sm:      '0 8px 20px rgba(0, 0, 0, 0.20)',
  card:    '0 20px 50px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255,255,255,0.08)',
  lg:      '0 40px 90px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255,255,255,0.10)',
  blue:    '0 20px 60px rgba(48, 160, 208, 0.35), 0 8px 20px rgba(48, 160, 208, 0.20)',
  focus:   '0 0 0 3px rgba(48, 160, 208, 0.40)',
  glow:    '0 0 40px rgba(48, 160, 208, 0.50)',             // Neon-Glow für Highlights
  glowDeep:'0 0 80px rgba(48, 160, 208, 0.35)',
}

// ── Typography ────────────────────────────────────────────────────────────────
// Inter bleibt die App-Schrift (hohe Lesbarkeit in Daten-Views).
// Geist ist der Marketing-Font — kommt nur zum Einsatz bei großen Headlines.
// Caveat ist der handschriftliche Akzent für Timeline-Zeitmarker und Notizen.
export const typography = {
  fontSans:       "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontDisplay:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontHandwritten:"'Caveat', cursive",

  // Headline-Skala (für große In-App-Titel, z.B. Seiten-Heads)
  h1:             { fontSize: 'clamp(32px, 4vw, 44px)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1 },
  h2:             { fontSize: 'clamp(24px, 2.8vw, 32px)', fontWeight: 600, letterSpacing: '-0.02em',  lineHeight: 1.15 },
  h3:             { fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 },
  h4:             { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em',  lineHeight: 1.3 },

  // Body-Skala
  bodyLg:         { fontSize: 17, fontWeight: 400, lineHeight: 1.55 },
  body:           { fontSize: 15, fontWeight: 400, lineHeight: 1.5  },
  bodySm:         { fontSize: 13, fontWeight: 400, lineHeight: 1.45 },

  // Labels, Eyebrows, Metadata
  label:          { fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em' },
  eyebrow:        { fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em', textTransform: 'none' },
  meta:           { fontSize: 11, fontWeight: 500, color: '#6A6D7A' },
}

// ── Spacing (4px-Grid) ────────────────────────────────────────────────────────
export const space = {
  0:   0,
  1:   4,
  2:   8,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  8:   32,
  10:  40,
  12:  48,
  14:  56,
  16:  64,
  20:  80,
  24:  96,
}

// ── Motion ────────────────────────────────────────────────────────────────────
export const motion = {
  fast:     '0.15s ease',
  base:     '0.2s ease',
  slow:     '0.3s ease',
  bounce:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

// ── Z-Index-Skala ─────────────────────────────────────────────────────────────
export const z = {
  base:       1,
  dropdown:   10,
  sticky:     20,
  overlay:    40,
  drawer:     50,
  modal:      60,
  toast:      70,
  tooltip:    80,
}

// ── Layout-Breakpoints (müssen zu index.css passen!) ──────────────────────────
export const breakpoints = {
  small:     1100,
  notebook:  1280,
  laptop:    1400,
}

// Alles zusammen als Default-Export (bequem für `import tokens from ...`)
const tokens = { colors, radii, shadows, typography, space, motion, z, breakpoints }
export default tokens
