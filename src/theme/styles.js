// ─── Leadesk Shared Style Presets ─────────────────────────────────────────────
// Wiederverwendbare Style-Objekte (Inline-Styles) auf Basis der Design-Tokens.
//
// Nutzung:
//   import { card, btnPrimary, eyebrow, sectionHead } from '../theme/styles'
//   <div style={card()}> ... </div>
//   <button style={btnPrimary()}>Speichern</button>
//
// Jede Funktion gibt ein frisches Style-Objekt zurück, das via Spread
// überschrieben werden kann:
//   <div style={{ ...card(), padding: 32 }}>
//
// Ziele:
// • Eine einzige Quelle der Wahrheit für „wie sieht eine Card aus".
// • Reduziert Code-Duplikation in den 25+ Seiten.
// • Enthält keine hardcoded Farbwerte — nur Tokens.
// ──────────────────────────────────────────────────────────────────────────────

import { colors, radii, shadows, typography, space, motion } from './tokens'

// ── Cards ─────────────────────────────────────────────────────────────────────
export const card = () => ({
  background:     colors.white,
  border:         `1px solid ${colors.border}`,
  borderRadius:   radii.lg,
  padding:        space[6],
  transition:     `transform ${motion.base}, border-color ${motion.base}, box-shadow ${motion.base}`,
})

export const cardHover = () => ({
  ...card(),
  cursor: 'pointer',
  // Hover handled via onMouseEnter/Leave in component, or inline via CSS-in-JS.
  // Ziel-Effekt: transform: translateY(-3px), borderColor: primary, boxShadow: card-shadow.
})

export const cardMuted = () => ({
  background:     colors.cream,
  border:         `1px solid ${colors.borderSoft}`,
  borderRadius:   radii.lg,
  padding:        space[5],
})

export const cardFeature = () => ({
  background:     `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accentBlue} 100%)`,
  color:          colors.inkOnBlue,
  border:         'none',
  borderRadius:   radii.lg,
  padding:        space[6],
  boxShadow:      shadows.blue,
})

// ── Buttons ───────────────────────────────────────────────────────────────────
const btnBase = () => ({
  display:         'inline-flex',
  alignItems:      'center',
  justifyContent:  'center',
  gap:             6,
  fontFamily:      'inherit',
  fontSize:        15,
  fontWeight:      500,
  letterSpacing:   '-0.005em',
  padding:         '10px 20px',
  borderRadius:    radii.pill,
  border:          'none',
  cursor:          'pointer',
  whiteSpace:      'nowrap',
  transition:      `all ${motion.base}`,
  textDecoration:  'none',
})

export const btnPrimary = () => ({
  ...btnBase(),
  background:     colors.primary,
  color:          colors.inkOnBlue,
  boxShadow:      '0 6px 18px rgba(0,48,96,0.08)',
})

export const btnGhost = () => ({
  ...btnBase(),
  background:     'transparent',
  color:          colors.ink,
  border:         `1px solid ${colors.borderStrong}`,
})

export const btnDark = () => ({
  ...btnBase(),
  background:     colors.ink,
  color:          colors.inkOnBlue,
})

export const btnDanger = () => ({
  ...btnBase(),
  background:     colors.danger,
  color:          colors.inkOnBlue,
})

export const btnOnBlue = () => ({
  ...btnBase(),
  background:     colors.white,
  color:          colors.primary,
})

// Button-Größen
export const btnSm = () => ({ padding: '7px 14px', fontSize: 13 })
export const btnLg = () => ({ padding: '13px 24px', fontSize: 16 })

// ── Eyebrows (kleine Badge-Labels über Headlines) ─────────────────────────────
export const eyebrow = () => ({
  display:        'inline-flex',
  alignItems:     'center',
  gap:            8,
  ...typography.eyebrow,
  color:          colors.primary,
  background:     colors.primarySoft,
  padding:        '5px 12px',
  borderRadius:   radii.pill,
})

export const eyebrowWarm = () => ({
  ...eyebrow(),
  color:          colors.warm,
  background:     colors.warmSoft,
})

// ── Section-Heads (Seitentitel-Block) ─────────────────────────────────────────
export const sectionHead = () => ({
  marginBottom:   space[6],
})

export const sectionTitle = () => ({
  ...typography.h1,
  color:          colors.ink,
  marginTop:      space[3],
  marginBottom:   space[2],
})

export const sectionSub = () => ({
  ...typography.bodyLg,
  color:          colors.inkMuted,
  maxWidth:       620,
})

// ── Inputs ────────────────────────────────────────────────────────────────────
export const input = () => ({
  fontFamily:    'inherit',
  fontSize:      14,
  padding:       '10px 14px',
  borderRadius:  radii.md,
  border:        `1px solid ${colors.border}`,
  background:    colors.white,
  color:         colors.ink,
  outline:       'none',
  transition:    `border-color ${motion.base}, box-shadow ${motion.base}`,
  width:         '100%',
})

export const inputFocus = () => ({
  borderColor:   colors.primary,
  boxShadow:     shadows.focus,
})

// ── Badges (Status, Tags) ─────────────────────────────────────────────────────
export const badge = (variant = 'neutral') => {
  const variants = {
    neutral:  { color: colors.inkMuted,   background: colors.cream                     },
    primary:  { color: colors.primary,    background: colors.primarySoft               },
    success:  { color: colors.success,    background: colors.successSoft               },
    warm:     { color: colors.warm,       background: colors.warmSoft                  },
    danger:   { color: colors.danger,     background: colors.dangerSoft                },
    info:     { color: colors.info,       background: colors.infoSoft                  },
  }
  return {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            6,
    fontSize:       12,
    fontWeight:     600,
    padding:        '3px 10px',
    borderRadius:   radii.pill,
    letterSpacing:  '-0.005em',
    ...variants[variant],
  }
}

// ── Divider ───────────────────────────────────────────────────────────────────
export const divider = () => ({
  height:      1,
  background:  colors.border,
  border:      'none',
  margin:      `${space[6]}px 0`,
})

// ── Screen-Reader-only ────────────────────────────────────────────────────────
export const srOnly = () => ({
  position:    'absolute',
  width:       1,
  height:      1,
  padding:     0,
  margin:      -1,
  overflow:    'hidden',
  clip:        'rect(0,0,0,0)',
  whiteSpace:  'nowrap',
  border:      0,
})

const styles = {
  card, cardHover, cardMuted, cardFeature,
  btnPrimary, btnGhost, btnDark, btnDanger, btnOnBlue, btnSm, btnLg,
  eyebrow, eyebrowWarm,
  sectionHead, sectionTitle, sectionSub,
  input, inputFocus,
  badge,
  divider,
  srOnly,
}
export default styles
