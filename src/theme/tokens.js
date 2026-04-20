// ─── Leadesk Design Tokens ────────────────────────────────────────────────────
// Phase Theme-1: Alle Farben sind jetzt CSS-Variablen-Referenzen, die sich
// automatisch ändern wenn der User zwischen Light/Dark wechselt.
//
// Der aktuelle Theme-Wert steckt in [data-theme="dark"] auf <html> und wird
// über ThemeContext gesetzt. Die konkreten Farbwerte stehen in src/index.css.
//
// Nutzung (unverändert):
//   import { colors, radii, shadows } from '../theme/tokens'
//   <div style={{ background: colors.white, color: colors.ink }}>
// ──────────────────────────────────────────────────────────────────────────────

// ── Farben (alle als var(--...)-Referenzen) ──────────────────────────────────
export const colors = {
  // Brand
  primary:          'var(--primary)',
  primaryHover:     'var(--primary-hover)',
  primaryDark:      'var(--primary-dark)',
  primarySoft:      'var(--primary-soft)',
  primarySofter:    'var(--primary-softer)',
  primaryGlow:      'var(--primary-glow)',

  // Accent (Sky-Blue)
  accentBlue:       'var(--accent)',
  accentBlueSoft:   'var(--accent-soft)',
  accentGlow:       'var(--accent-glow)',

  // Surfaces
  white:            'var(--surface)',        // Card-Background (Weiß in Light, Glass in Dark)
  surface:          'var(--surface)',        // Alias für semantische Klarheit
  onPrimary:        '#ffffff',                // Text auf farbigem Hintergrund (Primary/Accent-Gradient). Immer true-white, in beiden Modes.
  cream:            'var(--surface-muted)',
  blueTint:         'var(--surface-tint)',
  blueTint2:        'var(--surface-tint-2)',
  bgPage:           'var(--bg-body)',
  glassStrong:      'var(--surface-glass-strong)',
  glassDark:        'rgba(10,15,30,0.35)',   // Nur für spezielle Overlays, nicht in Light genutzt

  // Text
  ink:              'var(--text-primary)',
  ink2:             'var(--text-strong)',
  inkMuted:         'var(--text-muted)',
  inkSoft:          'var(--text-soft)',
  inkOnBlue:        'var(--text-on-brand)',
  inkOnBlueMuted:   'var(--text-on-brand-soft)',

  // Borders
  border:           'var(--border)',
  borderSoft:       'var(--border-soft)',
  borderStrong:     'var(--border-strong)',

  // Status
  warm:             'var(--warm)',
  warmSoft:         'var(--warm-soft)',
  success:          'var(--success)',
  successSoft:      'var(--success-soft)',
  danger:           'var(--danger)',
  dangerSoft:       'var(--danger-soft)',
  info:             'var(--info)',
  infoSoft:         'var(--info-soft)',

  // Spezielle Glass-Tokens (in Light-Mode fallen sie auf Solid-Weiß zurück)
  cardGlass:        'var(--surface-glass)',
  cardGlassHover:   'var(--surface-glass-strong)',
  glassBorder:      'var(--border)',
  glassHighlight:   'var(--glass-highlight)',
  glassBlur:        'var(--glass-blur)',
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

// ── Shadows (als CSS-Variablen, ändern sich mit Theme) ───────────────────────
export const shadows = {
  none:    'none',
  sm:      'var(--shadow-sm)',
  card:    'var(--shadow-card)',
  lg:      'var(--shadow-lg)',
  blue:    'var(--shadow-brand)',
  focus:   'var(--shadow-focus)',
  glow:    'var(--shadow-glow)',
}

// ── Typography ────────────────────────────────────────────────────────────────
// Inter bleibt die App-Schrift (hohe Lesbarkeit in Daten-Views).
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
  meta:           { fontSize: 11, fontWeight: 500 },
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
