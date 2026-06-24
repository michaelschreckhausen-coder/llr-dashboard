// src/lib/stockMedia.js
// Stock-Medien-Quellen für den Content-Werkstatt-Designer (Kategorie "Elemente").
// Drei Quellen:
//   1. Icons      → Iconify (öffentliche API, kein Key, CORS-fähig)
//   2. Grafiken   → Iconify, gefiltert auf farbige Emoji-/Illustrations-Sets
//   3. Bilder     → Pexels via Edge Function 'stock-photos' (Key bleibt serverseitig)
//
// Alles defensiv: niemals throwen, immer { error }-Form oder leere Arrays liefern.
// Ausschließlich für den Frontend-Einsatz (Vite/React 18).

import { supabase } from './supabase'

const ICONIFY = 'https://api.iconify.design'

// ─── Kuratierte Default-Icons (mdi-Prefix) für den Erst-Zustand ──────────────
const DEFAULT_ICON_NAMES = [
  'home', 'account', 'magnify', 'heart', 'star', 'check', 'close', 'arrow-right',
  'bell', 'calendar', 'email', 'phone', 'map-marker', 'lightbulb', 'cog', 'camera',
  'image', 'play', 'download', 'share-variant', 'thumb-up', 'chat', 'cart',
  'briefcase', 'rocket-launch', 'chart-line', 'target', 'flag', 'fire', 'shield-check',
  'trophy', 'gift', 'clock-outline', 'pencil', 'folder', 'tag', 'link-variant',
  'web', 'cloud', 'lock', 'eye', 'send', 'plus', 'minus', 'arrow-up', 'arrow-down',
  'menu', 'dots-horizontal', 'information', 'alert-circle', 'help-circle',
  'currency-eur', 'percent', 'crown', 'handshake', 'account-group', 'school',
  'book-open-variant', 'palette',
]
const DEFAULT_ICONS = DEFAULT_ICON_NAMES.map(n => `mdi:${n}`)

// ─── Farbige Sets, die wir als "Grafiken" anbieten ───────────────────────────
// Freie Interims-Quelle: bereits eingefärbte Emoji-/Illustrations-Sets von Iconify.
// Kann später durch einen lizenzierten Illustrations-Anbieter (z. B. Storyset/
// unDraw mit eigener API) ersetzt werden, ohne die UI zu ändern.
const GRAPHIC_PREFIXES = ['twemoji', 'fluent-emoji-flat', 'noto', 'openmoji', 'streamline-emojis', 'emojione']
const DEFAULT_GRAPHIC_NAMES = [
  'rocket', 'light-bulb', 'party-popper', 'chart-increasing', 'bullseye',
  'handshake', 'briefcase', 'megaphone', 'trophy', 'star', 'fire', 'sparkles',
  'red-heart', 'check-mark-button', 'thumbs-up', 'money-bag', 'gem-stone',
  'gear', 'graduation-cap', 'calendar', 'envelope', 'mobile-phone', 'laptop',
  'magnifying-glass-tilted-left', 'bar-chart', 'shield', 'crown', 'gift',
  'glowing-star', 'high-voltage', 'globe-showing-europe-africa', 'puzzle-piece',
]
const DEFAULT_GRAPHICS = DEFAULT_GRAPHIC_NAMES.map(n => `twemoji:${n}`)

// ─── Icon-Suche (Iconify) ────────────────────────────────────────────────────
// Liefert ein Array von Icon-IDs wie "mdi:home". Bei leerer Query → Default-Set.
export async function searchIcons(query, limit = 60) {
  const q = String(query || '').trim()
  if (!q) return DEFAULT_ICONS.slice(0, limit)
  try {
    const url = `${ICONIFY}/search?query=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`
    const resp = await fetch(url)
    if (!resp.ok) return []
    const data = await resp.json()
    const icons = Array.isArray(data?.icons) ? data.icons : []
    return icons.slice(0, limit)
  } catch (_e) {
    return []
  }
}

// ─── Grafik-Suche (Iconify, auf farbige Sets gefiltert) ──────────────────────
// FREIE INTERIMS-QUELLE: nutzt Iconifys farbige Emoji-/Illustrations-Sets, da es
// keine zuverlässig CORS-fähige, freie Illustrations-Such-API gibt. Später durch
// einen lizenzierten Illustrations-Anbieter austauschbar (gleiche Rückgabe-Form).
export async function searchGraphics(query, limit = 60) {
  const q = String(query || '').trim()
  if (!q) return DEFAULT_GRAPHICS.slice(0, limit)
  try {
    // Iconify unterstützt einen "prefixes"-Parameter; wir filtern zusätzlich
    // client-seitig auf die Allow-List, falls der Server lockerer filtert.
    const url = `${ICONIFY}/search?query=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit * 2)}&prefixes=${encodeURIComponent(GRAPHIC_PREFIXES.join(','))}`
    const resp = await fetch(url)
    if (!resp.ok) return []
    const data = await resp.json()
    const icons = Array.isArray(data?.icons) ? data.icons : []
    const filtered = icons.filter(id => {
      const prefix = String(id).split(':')[0]
      return GRAPHIC_PREFIXES.includes(prefix)
    })
    return filtered.slice(0, limit)
  } catch (_e) {
    return []
  }
}

// ─── SVG-URL eines Icons (für <img>-Vorschau) ────────────────────────────────
// id "mdi:home" → https://api.iconify.design/mdi/home.svg?color=...
export function iconSvgUrl(id, color) {
  const [prefix, name] = String(id || '').split(':')
  if (!prefix || !name) return ''
  let url = `${ICONIFY}/${prefix}/${name}.svg`
  if (color) url += `?color=${encodeURIComponent(color)}`
  return url
}

// ─── Icon → DataURL (zum Einfügen als Bild-Objekt, export-sicher) ────────────
export async function iconToDataUrl(id, color) {
  try {
    const url = iconSvgUrl(id, color)
    if (!url) return null
    const resp = await fetch(url)
    if (!resp.ok) return null
    const svg = await resp.text()
    if (!svg || !svg.includes('<svg')) return null
    // UTF-8-sichere Base64-Kodierung
    const base64 = btoa(unescape(encodeURIComponent(svg)))
    return `data:image/svg+xml;base64,${base64}`
  } catch (_e) {
    return null
  }
}

// ─── Foto-Suche (Pexels via Edge Function) ───────────────────────────────────
// Rückgabe: { photos, total, page, missingKey?, error? }
export async function searchPhotos({ query, page = 1, perPage = 30, orientation } = {}) {
  try {
    const body = { query: String(query || ''), page, perPage }
    if (orientation) body.orientation = orientation
    const { data, error } = await supabase.functions.invoke('stock-photos', { body })
    if (error) {
      return { photos: [], total: 0, page, error: error.message || 'Bilder-Suche fehlgeschlagen.' }
    }
    return {
      photos: Array.isArray(data?.photos) ? data.photos : [],
      total: data?.total ?? 0,
      page: data?.page ?? page,
      missingKey: !!data?.missingKey,
      error: data?.error,
    }
  } catch (e) {
    return { photos: [], total: 0, page, error: 'Bilder-Suche fehlgeschlagen: ' + (e?.message || String(e)) }
  }
}

// ─── Foto-URL → DataURL (CORS-sicheres Einfügen ohne Canvas-Taint) ───────────
// Pexels-CDN erlaubt CORS, daher fetch → blob → FileReader.
export async function photoToDataUrl(url) {
  try {
    if (!url) return null
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch (_e) {
    return null
  }
}
