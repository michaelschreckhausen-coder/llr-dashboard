// ─────────────────────────────────────────────────────────────────────────────
// Google-Fonts-Katalog (vollständig, 1500+ Familien) + On-Demand-Laden.
// Daten (Familie / Kategorie / verfügbare Schnitte) liegen in googleFontsData.json.
// Fonts werden per Google-Fonts-CSS2-API nachgeladen — derselbe Datenfluss, den
// index.html bereits für 'Caveat' nutzt (fonts.googleapis.com / fonts.gstatic.com).
// Kategorien-Codes: s=Sans-Serif, r=Serif, d=Display, h=Handschrift, m=Monospace
// Schnitt-Flags (bitweise): 1=Regular400, 2=Italic400, 4=Bold700, 8=BoldItalic700
// ─────────────────────────────────────────────────────────────────────────────
import DATA from './googleFontsData.json'

export const CAT_LABEL = { s: 'Sans-Serif', r: 'Serif', d: 'Display', h: 'Handschrift', m: 'Monospace' }
export const CAT_ORDER = ['s', 'r', 'd', 'h', 'm']

// Flache Liste aller Familien: [{ family, cat, flags }]
export const GOOGLE_FONTS = CAT_ORDER.flatMap(c => (DATA[c] || []).map(([family, flags]) => ({ family, cat: c, flags })))
export const FEATURED_FONTS = DATA.featured || []

const _byFamily = new Map(GOOGLE_FONTS.map(x => [x.family, x]))
export function isGoogleFont(family) { return _byFamily.has(family) }
export function fontCategory(family) { const e = _byFamily.get(family); return e ? e.cat : null }
export function fontsInCategory(cat) { return GOOGLE_FONTS.filter(x => x.cat === cat).map(x => x.family) }

// System-/Web-Safe-Fonts — nicht über Google laden (immer verfügbar).
export const SYSTEM_FONTS = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Impact', 'Palatino', 'Garamond', 'Lucida Sans', 'Comic Sans MS', 'Brush Script MT']
const _system = new Set(SYSTEM_FONTS)

const _fullLoaded = new Set()   // voll geladene Familien (Regular/Bold/Italic)
const _prevLoaded = new Set()   // nur-Vorschau geladene Familien
const _loadingFull = new Map()  // family -> Promise (Dedupe)

function elId(family, kind) { return 'gf-' + kind + '-' + family.replace(/[^a-z0-9]+/gi, '-').toLowerCase() }
function inject(href, id) {
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.id = id
  document.head.appendChild(l)
}

export function isFontLoaded(family) { return _system.has(family) || _fullLoaded.has(family) }

// CSS2-URL nur aus tatsächlich vorhandenen Schnitten bauen → verhindert 400er
// (Google lehnt Anfragen für nicht existierende Bold/Italic-Varianten ab).
function fullHref(family, flags) {
  const fam = family.replace(/ /g, '+')
  const tuples = []
  if (flags & 1) tuples.push([0, 400])
  if (flags & 4) tuples.push([0, 700])
  if (flags & 2) tuples.push([1, 400])
  if (flags & 8) tuples.push([1, 700])
  if (!tuples.length) return `https://fonts.googleapis.com/css2?family=${fam}&display=swap`
  tuples.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const spec = tuples.map(t => t[0] + ',' + t[1]).join(';')
  return `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${spec}&display=swap`
}

// Vorschau: nur die Zeichen des Familiennamens laden → winziger Download.
export async function loadFontPreview(family) {
  if (typeof document === 'undefined') return
  if (_system.has(family) || _prevLoaded.has(family) || _fullLoaded.has(family)) return
  _prevLoaded.add(family)
  const fam = family.replace(/ /g, '+')
  const text = encodeURIComponent(family)
  inject(`https://fonts.googleapis.com/css2?family=${fam}&text=${text}&display=swap`, elId(family, 'p'))
  try { await document.fonts.load(`16px "${family}"`) } catch (_e) {}
}

// Volle Familie laden (Regular + soweit vorhanden Bold/Italic).
export function loadGoogleFont(family) {
  if (typeof document === 'undefined' || _system.has(family)) return Promise.resolve()
  if (_fullLoaded.has(family)) return Promise.resolve()
  if (_loadingFull.has(family)) return _loadingFull.get(family)
  const entry = _byFamily.get(family)
  const flags = entry ? entry.flags : 1
  inject(fullHref(family, flags), elId(family, 'f'))
  const p = (async () => {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`400 24px "${family}"`),
          (flags & 4) ? document.fonts.load(`700 24px "${family}"`) : Promise.resolve(),
          (flags & 2) ? document.fonts.load(`italic 400 24px "${family}"`) : Promise.resolve(),
        ]),
        new Promise(r => setTimeout(r, 6000)),
      ])
    } catch (_e) {}
    _fullLoaded.add(family)
  })()
  _loadingFull.set(family, p)
  return p
}

// Mehrere Familien laden (z.B. beim Öffnen eines Designs). Gibt true zurück,
// wenn mindestens eine Familie tatsächlich (nach-)geladen wurde.
export async function loadGoogleFonts(families) {
  const uniq = [...new Set((families || []).filter(f => f && isGoogleFont(f) && !isFontLoaded(f)))]
  if (!uniq.length) return false
  await Promise.all(uniq.map(f => loadGoogleFont(f).catch(() => {})))
  return true
}
