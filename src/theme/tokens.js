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
export const colors = {
  // Brand (über Whitelabel-CSS-Variable, damit pro Mandant überschreibbar)
  primary:          'var(--wl-primary, rgb(0,48,96))',
  primaryHover:     'rgb(0,32,72)',
  primaryDark:      'rgb(0,24,56)',
  primarySoft:      'rgba(0,48,96,0.08)',
  primarySofter:    'rgba(0,48,96,0.04)',
  primaryGlow:      'rgba(0,48,96,0.22)',

  // Accent (dezenter Sky-Blue-Akzent aus dem Logo)
  accentBlue:       'rgb(48,160,208)',
  accentBlueSoft:   'rgb(120,195,225)',
  accentGlow:       'rgba(48,160,208,0.30)',

  // Backgrounds (Marketing-Site Sektionsrhythmus)
  white:            '#FFFFFF',
  cream:            '#F8F9FB',
  blueTint:         '#EFF4F9',
  blueTint2:        '#E3ECF5',
  bgPage:           '#F0EFFD', // Legacy — wird schrittweise durch cream ersetzt

  // Text
  ink:              '#0E1633',
  ink2:             '#1D1D1F',
  inkMuted:         '#6A6D7A',
  inkSoft:          '#9096A3',
  inkOnBlue:        '#FFFFFF',
  inkOnBlueMuted:   'rgba(255,255,255,0.78)',

  // Borders
  border:           '#E4E5EB',
  borderSoft:       '#EEEFF4',
  borderStrong:     '#D2D4DE',

  // Status
  warm:             '#F59E0B',
  warmSoft:         '#FEF3C7',
  success:          '#22C55E',
  successSoft:      '#DCFCE7',
  danger:           '#EF4444',
  dangerSoft:       '#FEE2E2',
  info:             '#3B82F6',
  infoSoft:         '#DBEAFE',
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
export const shadows = {
  none:    'none',
  sm:      '0 2px 8px rgba(14, 22, 51, 0.04)',
  card:    '0 8px 30px rgba(14, 22, 51, 0.06)',
  lg:      '0 30px 80px rgba(14, 22, 51, 0.10)',
  blue:    '0 20px 60px rgba(0, 48, 96, 0.25)',
  focus:   '0 0 0 3px rgba(0, 48, 96, 0.15)',
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
