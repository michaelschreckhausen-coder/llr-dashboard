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
  const vis = (data || []).map(r => r.visuals).filter(Boolean)
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

export async function getVisual(id) {
  return supabase.from('visuals').select('*').eq('id', id).maybeSingle()
}

// Medien-Bibliothek: alle Bilder des Teams (brand-scoped, neueste zuerst) — für den
// Medien-Tab im Designer. RLS scoped zusätzlich über visuals.team_id.
export async function listTeamVisuals({ teamId, brandVoiceId, limit = 80 } = {}) {
  let q = supabase
    .from('visuals')
    .select('id, title, storage_path, thumbnail_path, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (brandVoiceId) q = q.eq('brand_voice_id', brandVoiceId)
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
