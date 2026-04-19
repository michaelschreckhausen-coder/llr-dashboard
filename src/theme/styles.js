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

// ── Cards (theme-aware) ───────────────────────────────────────────────────────
// Im Light-Mode: solides Weiß, subtiler Border, kein backdrop-filter.
// Im Dark-Mode: semi-transparentes Glass mit Blur.
// Beide Varianten kommen automatisch via CSS-Variablen — keine Komponente
// muss das Theme kennen.
export const card = () => ({
  background:      colors.cardGlass,
  border:          `1px solid ${colors.glassBorder}`,
  borderRadius:    radii.lg,
  padding:         space[6],
  backdropFilter:  colors.glassBlur,           // 'none' in Light, 'blur(40px)' in Dark
  WebkitBackdropFilter: colors.glassBlur,
  transition:      `transform ${motion.base}, border-color ${motion.base}, box-shadow ${motion.base}, background ${motion.base}`,
  color:           colors.ink,
})

export const cardHover = () => ({
  ...card(),
  cursor: 'pointer',
})

export const cardMuted = () => ({
  background:      colors.cream,
  border:          `1px solid ${colors.borderSoft}`,
  borderRadius:    radii.lg,
  padding:         space[5],
  backdropFilter:  colors.glassBlur,
  WebkitBackdropFilter: colors.glassBlur,
  color:           colors.ink,
})

// Feature-Card: farbiger Gradient (KI-Assistent, Highlights). Identisch in
// beiden Themes — der Navy→Sky-Gradient sieht auf Cream und auf Dark beide gut aus.
export const cardFeature = () => ({
  background:      `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.accentBlue} 110%)`,
  color:           colors.inkOnBlue,
  border:          `1px solid ${colors.glassBorder}`,
  borderRadius:    radii.lg,
  padding:         space[6],
  boxShadow:       shadows.blue,
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
  background:     `linear-gradient(135deg, ${colors.accentBlue} 0%, ${colors.primaryDark} 110%)`,
  color:          colors.inkOnBlue,
  // Box-Shadow direkt: schmuck im Dark, subtiler im Light
  boxShadow:      'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px rgba(48,160,208,0.30), 0 2px 6px rgba(0,48,96,0.25)',
})

export const btnGhost = () => ({
  ...btnBase(),
  background:     colors.surface,   // var(--surface): solides Weiß in Light, Glass in Dark
  color:          colors.ink,
  border:         `1px solid ${colors.border}`,
  backdropFilter: colors.glassBlur,
  WebkitBackdropFilter: colors.glassBlur,
})

export const btnDark = () => ({
  ...btnBase(),
  background:     colors.ink,
  color:          colors.inkOnBlue,
  border:         `1px solid ${colors.border}`,
})

export const btnDanger = () => ({
  ...btnBase(),
  background:     'linear-gradient(135deg, rgb(239,68,68) 0%, rgb(220,38,38) 100%)',
  color:          '#FFFFFF',
  boxShadow:      '0 8px 20px rgba(239,68,68,0.30)',
})

export const btnOnBlue = () => ({
  ...btnBase(),
  background:     '#FFFFFF',
  color:          colors.primaryDark,
  boxShadow:      '0 10px 30px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,1)',
})

// Button-Größen
export const btnSm = () => ({ padding: '7px 14px', fontSize: 13 })
export const btnLg = () => ({ padding: '13px 24px', fontSize: 16 })

// ── Eyebrows (theme-aware Badge-Label) ──────────────────────────────────────
export const eyebrow = () => ({
  display:        'inline-flex',
  alignItems:     'center',
  gap:            8,
  ...typography.eyebrow,
  color:          colors.primary,
  background:     colors.primarySoft,
  border:         `1px solid ${colors.border}`,
  padding:        '5px 12px',
  borderRadius:   radii.pill,
  backdropFilter: colors.glassBlur,
  WebkitBackdropFilter: colors.glassBlur,
})

export const eyebrowWarm = () => ({
  ...eyebrow(),
  color:          colors.warm,
  background:     colors.warmSoft,
  borderColor:    'rgba(245,158,11,0.30)',
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
