// formatPresets.js — Canva-artige Format-Presets fuer /visuals.
// Benannte Social-Formate (echte Ziel-px) gemappt auf das naechstliegende vom
// Bild-Gen-Backend unterstuetzte Seitenverhaeltnis. Exakte px entsteht danach
// per cover-Crop in der EF. LinkedIn-Masse Stand Juni 2026.

export const SUPPORTED_RATIOS = {
  '1:1': 1, '4:5': 0.8, '3:4': 0.75, '2:3': 0.6667, '5:4': 1.25,
  '4:3': 1.3333, '3:2': 1.5, '16:9': 1.7778, '21:9': 2.3333, '9:16': 0.5625,
}

export function nearestRatio(w, h) {
  if (!w || !h) return '1:1'
  const target = w / h
  let best = '1:1', bestDiff = Infinity
  for (const [r, val] of Object.entries(SUPPORTED_RATIOS)) {
    const diff = Math.abs(Math.log(val) - Math.log(target))
    if (diff < bestDiff) { bestDiff = diff; best = r }
  }
  return best
}

const P = (id, label, w, h, ratio) => ({ id, label, w, h, ratio: ratio || nearestRatio(w, h) })

export const FORMAT_CATEGORIES = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'Linkedin', presets: [
    P('li-feed-square',   'Feed-Beitrag (Quadrat)',         1200, 1200, '1:1'),
    P('li-feed-portrait', 'Feed-Beitrag (Hochformat)',      1080, 1350, '4:5'),
    P('li-feed-link',     'Feed-Beitrag (Querformat/Link)', 1200, 627,  '16:9'),
    P('li-cover',         'Profil-Titelbild',               1584, 396,  '21:9'),
    P('li-company-cover', 'Unternehmensseite-Titelbild',    1128, 191,  '21:9'),
    P('li-event-cover',   'Event-Titelbild',                1776, 444,  '21:9'),
    P('li-article',       'Artikel-Titelbild',              1920, 1080, '16:9'),
    P('li-carousel',      'Carousel-Slide',                 1080, 1080, '1:1'),
    P('li-story',         'Story / Hochformat',             1080, 1920, '9:16'),
    P('li-profile',       'Profilbild',                     400,  400,  '1:1'),
  ]},
  { key: 'instagram', label: 'Instagram', icon: 'Instagram', presets: [
    P('ig-square',   'Beitrag (Quadrat)',    1080, 1080, '1:1'),
    P('ig-portrait', 'Beitrag (Hochformat)', 1080, 1350, '4:5'),
    P('ig-landscape','Beitrag (Querformat)', 1080, 566,  '16:9'),
    P('ig-story',    'Story / Reel',         1080, 1920, '9:16'),
  ]},
  { key: 'facebook', label: 'Facebook', icon: 'Facebook', presets: [
    P('fb-feed',   'Feed-Beitrag',     1200, 630,  '16:9'),
    P('fb-square', 'Beitrag (Quadrat)',1080, 1080, '1:1'),
    P('fb-cover',  'Titelbild',        820,  312,  '21:9'),
    P('fb-story',  'Story',            1080, 1920, '9:16'),
  ]},
  { key: 'x', label: 'X / Twitter', icon: 'Twitter', presets: [
    P('x-post',   'Beitrag (Querformat)', 1600, 900,  '16:9'),
    P('x-square', 'Beitrag (Quadrat)',    1080, 1080, '1:1'),
    P('x-header', 'Header / Banner',      1500, 500,  '21:9'),
  ]},
  { key: 'youtube', label: 'YouTube', icon: 'Youtube', presets: [
    P('yt-thumb',  'Thumbnail', 1280, 720,  '16:9'),
    P('yt-banner', 'Kanalbild', 2560, 1440, '16:9'),
  ]},
  { key: 'tiktok', label: 'TikTok', icon: 'Music2', presets: [
    P('tt-video', 'Video / Story', 1080, 1920, '9:16'),
  ]},
  { key: 'standard', label: 'Standardformate', icon: 'Ratio', presets: [
    P('std-1-1',  '1:1 · Quadrat',           1080, 1080, '1:1'),
    P('std-4-5',  '4:5 · Portrait',          1080, 1350, '4:5'),
    P('std-3-4',  '3:4 · Hochformat',        1080, 1440, '3:4'),
    P('std-2-3',  '2:3 · Klassisch hoch',    1080, 1620, '2:3'),
    P('std-5-4',  '5:4 · Large-Format quer', 1350, 1080, '5:4'),
    P('std-4-3',  '4:3 · TV/Print quer',     1440, 1080, '4:3'),
    P('std-3-2',  '3:2 · Klassisch quer',    1620, 1080, '3:2'),
    P('std-16-9', '16:9 · Widescreen',       1920, 1080, '16:9'),
    P('std-21-9', '21:9 · Ultrabreit',       2520, 1080, '21:9'),
    P('std-9-16', '9:16 · Vertikal (Story)', 1080, 1920, '9:16'),
  ]},
]

export const PRESET_BY_ID = Object.fromEntries(
  FORMAT_CATEGORIES.flatMap(c => c.presets.map(p => [p.id, { ...p, category: c.key }]))
)

export const DEFAULT_PRESET_ID = 'li-feed-square'

export function freeformPreset(w, h) {
  const W = Math.max(1, Math.round(Number(w) || 0))
  const H = Math.max(1, Math.round(Number(h) || 0))
  return { id: 'free', label: `Freiformat ${W}×${H}`, w: W, h: H, ratio: nearestRatio(W, H), category: 'free' }
}
