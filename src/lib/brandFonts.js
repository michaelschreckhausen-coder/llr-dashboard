import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Brand-Fonts: eigene Schriftarten je Company Brand (visuelle Identität).
// Storage-Bucket 'brand-fonts', Pfad-Konvention: <team_id>/<brand_voice_id>/<datei>
// Metadaten in brand_voices.font_assets (jsonb-Array): { name, path, format, family }
// Im Designer werden die Fonts per FontFace-API geladen und über `family` nutzbar.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EXT = ['woff2', 'woff', 'ttf', 'otf']

export function fontExt(filename) {
  const m = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function isAllowedFontFile(filename) {
  return ALLOWED_EXT.includes(fontExt(filename))
}

// Hübscher Family-Name aus Dateiname ableiten (für die FontFace-Family).
export function deriveFamily(filename) {
  const base = String(filename || 'Font').replace(/\.[a-z0-9]+$/i, '')
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'Brand-Font'
}

// Liste der Font-Assets einer Brand Voice frisch aus der DB lesen.
export async function listBrandFonts(brandVoiceId) {
  if (!brandVoiceId) return { data: [] }
  const { data, error } = await supabase
    .from('brand_voices')
    .select('font_assets')
    .eq('id', brandVoiceId)
    .maybeSingle()
  if (error) return { data: [], error }
  return { data: Array.isArray(data?.font_assets) ? data.font_assets : [] }
}

// Schrift hochladen + in font_assets registrieren. Gibt das neue Asset zurück.
export async function uploadBrandFont(teamId, brandVoiceId, file) {
  if (!teamId || !brandVoiceId || !file) return { error: { message: 'Fehlende Angaben' } }
  if (!isAllowedFontFile(file.name)) {
    return { error: { message: 'Nur .woff2, .woff, .ttf oder .otf erlaubt' } }
  }
  const ext = fontExt(file.name)
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${teamId}/${brandVoiceId}/${Date.now()}_${safe}`
  const { error: upErr } = await supabase.storage
    .from('brand-fonts')
    .upload(path, file, { upsert: true, contentType: file.type || 'font/' + ext })
  if (upErr) return { error: upErr }

  const asset = { name: deriveFamily(file.name), path, format: ext, family: deriveFamily(file.name) }
  const { data: cur } = await listBrandFonts(brandVoiceId)
  const next = [...cur.filter(a => a.path !== path), asset]
  const { error: updErr } = await supabase
    .from('brand_voices')
    .update({ font_assets: next })
    .eq('id', brandVoiceId)
  if (updErr) return { error: updErr }
  return { data: asset, all: next }
}

// Schrift aus font_assets + Storage entfernen.
export async function deleteBrandFont(brandVoiceId, path) {
  if (!brandVoiceId || !path) return { error: { message: 'Fehlende Angaben' } }
  await supabase.storage.from('brand-fonts').remove([path])
  const { data: cur } = await listBrandFonts(brandVoiceId)
  const next = cur.filter(a => a.path !== path)
  const { error } = await supabase
    .from('brand_voices')
    .update({ font_assets: next })
    .eq('id', brandVoiceId)
  return { error, all: next }
}

// Family umbenennen (z.B. damit der Name im Designer schöner ist).
export async function renameBrandFont(brandVoiceId, path, newName) {
  const clean = String(newName || '').trim()
  if (!brandVoiceId || !path || !clean) return { error: { message: 'Fehlende Angaben' } }
  const { data: cur } = await listBrandFonts(brandVoiceId)
  const next = cur.map(a => a.path === path ? { ...a, name: clean, family: clean } : a)
  const { error } = await supabase.from('brand_voices').update({ font_assets: next }).eq('id', brandVoiceId)
  return { error, all: next }
}

// Signierte URL zu einer hochgeladenen Schrift.
export async function signedFontUrl(path, expiresIn = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('brand-fonts').createSignedUrl(path, expiresIn)
  if (error) return null
  return data?.signedUrl || null
}

// Lädt alle übergebenen Font-Assets per FontFace-API in das Dokument.
// Idempotent (bereits geladene families werden übersprungen). Gibt die geladenen
// Family-Namen zurück, damit der Aufrufer sie z.B. in die Font-Liste mischen kann.
const _loaded = new Set()
export async function loadBrandFonts(fontAssets) {
  const families = []
  for (const a of (fontAssets || [])) {
    const family = a?.family || a?.name
    if (!family || !a?.path) continue
    families.push(family)
    if (_loaded.has(family)) continue
    try {
      const url = await signedFontUrl(a.path)
      if (!url) continue
      const ff = new FontFace(family, `url(${JSON.stringify(url)})`)
      const loaded = await ff.load()
      document.fonts.add(loaded)
      _loaded.add(family)
    } catch (_e) { /* einzelne Schrift überspringen, nie crashen */ }
  }
  return families
}
