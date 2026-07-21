import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Bild<->Chat-Zuordnung (visual_chats) + Visual-Helfer für die Content-Werkstatt.
// Spiegel von contentDocuments.js, nur für Bilder/Designs (Tabelle `visuals`).
// team_id steckt schon in jeder visuals-Row; RLS scoped über visuals.team_id.
// ─────────────────────────────────────────────────────────────────────────────

const VISUAL_COLS =
  'id, title, prompt, aspect_ratio, model, storage_path, thumbnail_path, design_json, parent_visual_id, post_id, brand_voice_id, team_id, updated_at:created_at, created_at'

// Alle Bilder, die in einem Chat erzeugt/bearbeitet/hinzugefügt wurden — neueste zuerst.
export async function listVisualsForChat(chatId) {
  if (!chatId) return { data: [] }
  const { data, error } = await supabase
    .from('visual_chats')
    .select('last_opened_at, visuals!inner(id, title, prompt, aspect_ratio, model, storage_path, thumbnail_path, design_json, parent_visual_id, created_at, kind)')
    .eq('chat_id', chatId)
    .order('last_opened_at', { ascending: false })
  if (error) return { data: [], error }
  const vis = (data || []).map(r => r.visuals && ({ ...r.visuals, last_opened_at: r.last_opened_at })).filter(Boolean)
  return { data: vis }
}

// Alle Chats, in denen ein Bild auftaucht (für Auswahldialog), neueste zuerst.
export async function listChatsForVisual(visualId) {
  if (!visualId) return { data: [] }
  const { data, error } = await supabase
    .from('visual_chats')
    .select('chat_id, last_opened_at, content_chats!inner(id, title, updated_at)')
    .eq('visual_id', visualId)
    .order('last_opened_at', { ascending: false })
  if (error) return { data: [], error }
  const chats = (data || []).map(r => r.content_chats && ({ ...r.content_chats, last_opened_at: r.last_opened_at })).filter(Boolean)
  return { data: chats }
}

// Bild<->Chat verknüpfen ODER Aktualität bumpen (Upsert).
export async function linkVisualToChat(visualId, chatId) {
  if (!visualId || !chatId) return { data: null }
  return supabase
    .from('visual_chats')
    .upsert({ visual_id: visualId, chat_id: chatId, last_opened_at: new Date().toISOString() }, { onConflict: 'visual_id,chat_id' })
}
export const addVisualToChat = linkVisualToChat

// Zuordnung eines Designs/Bilds zu EINEM Chat entfernen (Design bleibt bestehen).
export async function unlinkVisualFromChat(visualId, chatId) {
  if (!visualId || !chatId) return { error: null }
  return supabase.from('visual_chats').delete().eq('visual_id', visualId).eq('chat_id', chatId)
}

// Einen Chat vollständig löschen: Nachrichten, Dokument-/Visual-Zuordnungen und den Chat
// selbst. (Designs/Bilder/Dokumente selbst bleiben erhalten — nur die Verknüpfung geht weg.)
// Es gibt keine DB-Cascades auf content_chats → Kinder explizit entfernen.
export async function deleteChat(chatId) {
  if (!chatId) return { error: null }
  try { await supabase.from('content_posts').update({ text_werkstatt_chat_id: null }).eq('text_werkstatt_chat_id', chatId) } catch (_e) {}
  try { await supabase.from('visual_chats').delete().eq('chat_id', chatId) } catch (_e) {}
  try { await supabase.from('content_document_chats').delete().eq('chat_id', chatId) } catch (_e) {}
  try { await supabase.from('content_chat_messages').delete().eq('chat_id', chatId) } catch (_e) {}
  return supabase.from('content_chats').delete().eq('id', chatId)
}

export async function getVisual(id) {
  return supabase.from('visuals').select('*').eq('id', id).maybeSingle()
}

// Medien-Bibliothek: alle Bilder des Teams (brand-scoped, neueste zuerst) — für den
// Medien-Tab im Designer. RLS scoped zusätzlich über visuals.team_id.
export async function listTeamVisuals({ teamId, brandVoiceId, kind = null, limit = 80, noBrand = false } = {}) {
  let q = supabase
    .from('visuals')
    .select('id, title, prompt, storage_path, thumbnail_path, created_at, kind, aspect_ratio')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (kind) q = q.eq('kind', kind)
  if (noBrand) {
    q = q.eq('no_brand', true).eq('team_id', teamId)
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) q = q.eq('user_id', user.id)
  }
  else if (brandVoiceId) q = q.eq('brand_voice_id', brandVoiceId)
  else if (teamId) q = q.eq('team_id', teamId)
  const { data, error } = await q
  if (error) return { data: [] }
  return { data: (data || []).filter(v => v.storage_path) }
}

// patch: { title?, design_json?, storage_path?, thumbnail_path?, prompt? }
export async function updateVisual(id, patch) {
  return supabase.from('visuals').update(patch).eq('id', id).select().single()
}

export async function deleteVisual(id) {
  return supabase.from('visuals').delete().eq('id', id)
}

// Signierte URL für ein Storage-Objekt im visuals-Bucket (Anzeige in Chat/Rail/Designer).
export async function signedVisualUrl(storagePath, expiresIn = 3600) {
  if (!storagePath) return null
  const { data, error } = await supabase.storage.from('visuals').createSignedUrl(storagePath, expiresIn)
  if (error) return null
  return data?.signedUrl || null
}

// Signierte URL mit serverseitiger Verkleinerung (imgproxy) — schnelle, kleine
// Grid-Thumbnails. Fällt bei fehlender Transformation auf die normale URL zurück.
export async function signedThumbUrl(storagePath, { width = 400, height = 400, resize = 'contain', quality = 75, expiresIn = 3600 } = {}) {
  if (!storagePath) return null
  try {
    const { data, error } = await supabase.storage.from('visuals')
      .createSignedUrl(storagePath, expiresIn, { transform: { width, height, resize, quality } })
    if (error) throw error
    if (data?.signedUrl) return data.signedUrl
  } catch (_e) { /* Transformation nicht verfügbar → Fallback */ }
  return await signedVisualUrl(storagePath, expiresIn)
}

// Lädt ein Storage-Objekt als Blob (für CORS-sicheres Laden ins Canvas / Download).
export async function downloadVisualBlob(storagePath) {
  if (!storagePath) return null
  const { data, error } = await supabase.storage.from('visuals').download(storagePath)
  if (error) return null
  return data // Blob
}

// Lädt einen DataURL (base64) eines Visuals — praktisch fürs Canvas (kein CORS-Taint).
export async function visualDataUrl(storagePath) {
  const blob = await downloadVisualBlob(storagePath)
  if (!blob) return null
  return await new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => resolve(null)
    fr.readAsDataURL(blob)
  })
}

// Lädt ein gerendertes Design (PNG-Blob) in den visuals-Bucket hoch und gibt den Pfad zurück.
// Pfad-Konvention: <team_id>/designs/<visual_id>.png
export async function uploadDesignRender(teamId, visualId, blob) {
  const path = `${teamId}/designs/${visualId}.png`
  const { error } = await supabase.storage.from('visuals').upload(path, blob, { upsert: true, contentType: 'image/png' })
  if (error) return { error }
  return { path }
}

// Lädt einen beliebigen PNG-Blob unter eindeutigem Pfad in den visuals-Bucket.
export async function uploadImageBlob(teamId, blob) {
  const name = `${teamId}/designs/page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const { error } = await supabase.storage.from('visuals').upload(name, blob, { upsert: true, contentType: 'image/png' })
  if (error) return { error }
  return { path: name }
}

// Legt ein Einzelbild (kind='image') in den Medien an — z.B. eine als Bild gespeicherte
// Design-Seite. storage_path muss bereits hochgeladen sein (uploadImageBlob).
export async function createImageVisual({ teamId, userId, brandVoiceId, title = 'Design-Seite', aspectRatio = '1:1', storagePath, prompt = 'Aus Design gespeichert', postId = null }) {
  const { data, error } = await supabase.from('visuals').insert({
    user_id: userId, team_id: teamId, brand_voice_id: brandVoiceId || null,
    kind: 'image', media_type: 'image', title, aspect_ratio: aspectRatio,
    prompt, storage_path: storagePath, post_id: postId,
  }).select().single()
  if (error) return { error }
  return { data }
}

// 1x1 weißer PNG-Platzhalter (storage_path ist NOT NULL; wird beim Speichern ersetzt).
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const ridFrag = () => Math.random().toString(36).slice(2, 10)

// Leeres Design (kind='design') anlegen + Zeile zurückgeben. Geteilter Helfer für
// Content-Werkstatt-Rail UND Bibliothek ("Neues Design").
export async function createEmptyDesign({ teamId, brandVoiceId = null, title = 'Neues Design', noBrand = false }) {
  try {
    const page = { id: 'p' + ridFrag(), objects: [], filters: {}, baseCrop: null, bgColor: '#ffffff', stage: { width: 1080, height: 1080 }, primaryImageId: null }
    const design_json = { version: 2, pages: [page], activePageIndex: 0 }
    let userId = null
    try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch (_e) {}
    const blob = await (await fetch(BLANK_PNG)).blob()
    const up = await uploadImageBlob(teamId, blob)
    if (up.error || !up.path) return { error: up.error || new Error('upload failed') }
    const { data: row, error } = await supabase.from('visuals').insert({
      user_id: userId, team_id: teamId, brand_voice_id: noBrand ? null : (brandVoiceId || null), no_brand: noBrand,
      kind: 'design', media_type: 'image', title, aspect_ratio: '1:1', prompt: 'Design',
      storage_path: up.path, design_json,
    }).select().single()
    if (error) return { error }
    return { data: row }
  } catch (e) { return { error: e } }
}

// Ein Bild (visuals-Row, kind='image') als NEUE Seite an ein bestehendes Design anhängen.
// Gibt die aktualisierte Design-Zeile zurück; setzt activePageIndex auf die neue Seite.
export async function addImagePageToDesign(designId, imageVisual) {
  try {
    const { data: design, error: gErr } = await supabase.from('visuals').select('*').eq('id', designId).maybeSingle()
    if (gErr || !design) return { error: gErr || new Error('design not found') }
    const dataUrl = await visualDataUrl(imageVisual.storage_path)
    if (!dataUrl) return { error: new Error('image load failed') }
    const dims = await new Promise(res => {
      const im = new Image()
      im.onload = () => res({ w: im.naturalWidth || 1080, h: im.naturalHeight || 1080 })
      im.onerror = () => res({ w: 1080, h: 1080 })
      im.src = dataUrl
    })
    const pid = 'o' + ridFrag()
    const page = {
      id: 'p' + ridFrag(),
      objects: [{ id: pid, type: 'image', __primary: true, src: dataUrl, x: 0, y: 0, width: dims.w, height: dims.h, rotation: 0, opacity: 1 }],
      filters: {}, baseCrop: null, bgColor: '#ffffff', stage: { width: dims.w, height: dims.h }, primaryImageId: pid,
    }
    const dj = design.design_json && design.design_json.version === 2 && Array.isArray(design.design_json.pages)
      ? design.design_json
      : { version: 2, pages: [], activePageIndex: 0 }
    const pages = [...dj.pages, page]
    const next = { ...dj, pages, activePageIndex: pages.length - 1 }
    const { data: row, error } = await supabase.from('visuals')
      .update({ design_json: next }).eq('id', designId).select().single()
    if (error) return { error }
    return { data: row }
  } catch (e) { return { error: e } }
}
