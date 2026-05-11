// src/lib/leadStyleTokens.js
//
// Single source of truth for the Leads-redesign tokens.
// Pure JS — no React imports — so it can be reused in helpers, tests, etc.
//
// Whitelabel-Hinweis:
// `primary` wird über CSS-Var --lk-primary überschreibbar gemacht.
// Status-Farben sind bewusst hardcoded, damit Lead/LQL/MQL/MQN/SQL über alle
// Tenants konsistent gelesen werden können.

export const COLORS = {
  // Surfaces
  surface: 'var(--lk-surface, #ffffff)',
  surfaceMuted: 'var(--lk-surface-muted, #f7f6f3)',
  surfaceCanvas: 'var(--lk-surface-canvas, #faf9f6)',

  // Borders
  borderSubtle: 'var(--lk-border-subtle, rgba(0,0,0,0.06))',
  borderHover: 'var(--lk-border-hover, rgba(0,0,0,0.12))',

  // Text
  textPrimary: 'var(--lk-text-primary, #1a1a1a)',
  textSecondary: 'var(--lk-text-secondary, #555550)',
  textTertiary: 'var(--lk-text-tertiary, #8a8a85)',

  // Brand (overridable per tenant)
  primary: 'var(--lk-primary, #534AB7)',
  primaryFg: 'var(--lk-primary-fg, #ffffff)',
  primarySoft: 'var(--lk-primary-soft, #EEEDFE)',
  primarySoftFg: 'var(--lk-primary-soft-fg, #3C3489)',
};

// CRM-Status — die fünf produktiven Werte aus deinem leads.status-CHECK.
// Reihenfolge = Kanban-Spaltenreihenfolge.
export const STATUS_ORDER = ['Lead', 'LQL', 'MQL', 'MQN', 'SQL'];

export const STATUS_CONFIG = {
  Lead: {
    label: 'Lead',
    sublabel: 'Neu',
    dot: '#B4B2A9',
    pillBg: '#F1EFE8',
    pillFg: '#444441',
  },
  LQL: {
    label: 'LQL',
    sublabel: 'Lead-qualified',
    dot: '#378ADD',
    pillBg: '#E6F1FB',
    pillFg: '#0C447C',
  },
  MQL: {
    label: 'MQL',
    sublabel: 'Marketing-qualified',
    dot: '#7F77DD',
    pillBg: '#EEEDFE',
    pillFg: '#3C3489',
  },
  MQN: {
    label: 'MQN',
    sublabel: 'Nurture',
    dot: '#BA7517',
    pillBg: '#FAEEDA',
    pillFg: '#633806',
  },
  SQL: {
    label: 'SQL',
    sublabel: 'Sales-qualified',
    dot: '#639922',
    pillBg: '#EAF3DE',
    pillFg: '#3B6D11',
  },
};

// 6 Pastell-Avatar-Paletten. Avatar-Farbe wird deterministisch über
// den Namen-Hash gewählt (s. leadHelpers.js), damit ein User immer
// dieselbe Farbe hat, egal in welcher View.
export const AVATAR_PALETTES = [
  { bg: '#FBEAF0', fg: '#72243E' }, // pink
  { bg: '#E6F1FB', fg: '#042C53' }, // blue
  { bg: '#E1F5EE', fg: '#04342C' }, // teal
  { bg: '#FAECE7', fg: '#4A1B0C' }, // coral
  { bg: '#FAEEDA', fg: '#412402' }, // amber
  { bg: '#EEEDFE', fg: '#26215C' }, // purple
];

// Avatar-Palette für leere Leads (kein Owner, kein Name verfügbar).
export const AVATAR_NEUTRAL = { bg: '#F1EFE8', fg: '#5F5E5A' };

export const RADIUS = {
  pill: 999,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
};

export const ROW_HEIGHT = 68; // px — fester Wert für react-window FixedSizeList
