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

// ── Timeline-Primitives (Variante C) ──────────────────────────────────────────
// Die Timeline ist die Kern-Metapher der Startseite: Tag als vertikaler Faden,
// Abschnitte nach Tageszeit, handschriftliche Zeit-Marker links.

// Der Container um die gesamte Timeline — Linie rendert sich als ::before
// auf einem sibling-Element, da Inline-Styles keine Pseudo-Elemente unterstützen.
// → Die Linie wird als separates absolut positioniertes div ausserhalb
// erzeugt, nicht via ::before.
export const timelineWrap = () => ({
  position:     'relative',
  paddingLeft:  space[8],          // 32px Platz links für Dot + Linie
})

// Die vertikale Linie — als eigenes, absolut positioniertes Div in der Komponente.
export const timelineLine = () => ({
  position:     'absolute',
  left:         10,
  top:          12,
  bottom:       60,
  width:        2,
  background:   `linear-gradient(to bottom, ${colors.primary} 0%, ${colors.border} 100%)`,
  pointerEvents:'none',
})

// Einzelner Timeline-Block — relativ positioniert, damit der Dot davon absolut hängt.
export const timelineBlock = () => ({
  position:     'relative',
  marginBottom: space[12],         // 48px zwischen Blöcken
})

// Der Punkt links am Block-Anfang. Variante über `variant`:
//   'default' — hohler Navy-Kreis
//   'done'    — gefüllter Navy-Kreis
//   'urgent'  — gefüllter Danger-Kreis
export const timelineDot = (variant = 'default') => {
  const palette = {
    default: { bg: colors.white, border: colors.primary },
    done:    { bg: colors.primary, border: colors.primary },
    urgent:  { bg: colors.danger,  border: colors.danger  },
  }
  const { bg, border } = palette[variant] || palette.default
  return {
    position:     'absolute',
    left:         -space[7] + 4,   // ragt leicht in den Paddingraum hinein
    top:          8,
    width:        14,
    height:       14,
    borderRadius: radii.pill,
    background:   bg,
    border:       `2px solid ${border}`,
    zIndex:       1,
  }
}

// Handschriftlicher Zeit-Marker (Caveat-Font). "Morgens — fokussiert" o.ä.
export const handwrittenTime = () => ({
  fontFamily:    typography.fontHandwritten,
  fontWeight:    600,
  fontSize:      22,
  color:         colors.accentBlue,
  lineHeight:    1,
  marginBottom:  space[1],
})

// Handschriftliche Inline-Notiz (kleiner, für Fließtext-Akzente).
export const handwrittenInline = () => ({
  fontFamily:    typography.fontHandwritten,
  fontWeight:    600,
  fontSize:      17,
  color:         colors.accentBlue,
  lineHeight:    1,
})

// Narrative Block-Überschrift (unter Zeit-Marker, über Body-Text).
export const timelineHeading = () => ({
  fontSize:      24,
  fontWeight:    600,
  letterSpacing: '-0.02em',
  lineHeight:    1.2,
  color:         colors.ink,
  marginBottom:  space[3],
})

// Erklärender Fließtext unter der Überschrift.
export const timelineBody = () => ({
  fontSize:      15,
  color:         colors.inkMuted,
  lineHeight:    1.6,
  marginBottom:  space[4],
  maxWidth:      '60ch',
})

// ── "Highlight"-Span (Marketing-Stil: Sky-Blue-Unterstreichung) ──────────────
// Nutzung: <span style={highlight()}>Michael</span>
// Tipp: die Unterstreichung ist ein absolut positioniertes div unter dem Text,
// das außerhalb des Flow-Space lebt. Inline-Styles können keine Pseudo-Elemente,
// deshalb rendert der Aufrufer das Unterstreichungs-Div separat. Kurzversion:
// nur den Vordergrund-Style + Position relativ. Den Unterstrich als Helper.
export const highlightText = () => ({
  position:      'relative',
  display:       'inline-block',
  color:         colors.primary,
  zIndex:        1,
})

export const highlightUnderline = () => ({
  position:      'absolute',
  left:          '-4%',
  right:         '-4%',
  bottom:        '6%',
  height:        '22%',
  background:    colors.accentGlow,
  borderRadius:  radii.xs,
  transform:     'rotate(-1deg)',
  zIndex:        -1,
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
  timelineWrap, timelineLine, timelineBlock, timelineDot,
  handwrittenTime, handwrittenInline,
  timelineHeading, timelineBody,
  highlightText, highlightUnderline,
}
export default styles
