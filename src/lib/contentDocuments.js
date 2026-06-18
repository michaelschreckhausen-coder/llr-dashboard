import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// CRUD für content_documents (Dokumenten-Editor / Text-Werkstatt).
// team_id wird vom Caller (aktives Team aus TeamContext) übergeben — RLS verlangt
// team_id ∈ get_my_team_ids(). Jede Funktion gibt das supabase-{data,error}-Objekt
// zurück (gleicher Idiom wie im Rest der App).
// ─────────────────────────────────────────────────────────────────────────────

const LIST_COLS = 'id, title, content_text, status, brand_voice_id, updated_at, created_at'

export async function createDocument({
  teamId,
  title = 'Unbenanntes Dokument',
  contentJson = {},
  contentText = '',
  sourceChatId = null,
  brandVoiceId = null,
}) {
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('content_documents')
    .insert({
      team_id: teamId,
      user_id: user?.id ?? null,
      title,
      content_json: contentJson,
      content_text: contentText,
      source_chat_id: sourceChatId,
      brand_voice_id: brandVoiceId,
    })
    .select()
    .single()
}

export async function getDocument(id) {
  return supabase.from('content_documents').select('*').eq('id', id).maybeSingle()
}

export async function listDocuments(teamId) {
  return supabase
    .from('content_documents')
    .select(LIST_COLS)
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })
}

// patch: { title?, content_json?, content_text?, status?, brand_voice_id? }
export async function updateDocument(id, patch) {
  return supabase
    .from('content_documents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

export async function deleteDocument(id) {
  return supabase.from('content_documents').delete().eq('id', id)
}

// Plain-Text → TipTap-Doc-JSON.
// Einheitlicher Blank-Line-Stil: Leerzeilen werden zusammengefasst, zwischen je
// zwei Inhalts-Absätzen steht GENAU ein leerer Absatz (= sichtbare Leerzeile).
// So sieht eingefügter/KI-bearbeiteter Text exakt wie der restliche Editor-Text aus.
export function textToDoc(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { type:'doc', content:[{ type:'paragraph' }] }
  const content = []
  lines.forEach((line, i) => {
    content.push({ type:'paragraph', content:[{ type:'text', text:line }] })
    if (i < lines.length - 1) content.push({ type:'paragraph' }) // leerer Absatz = Leerzeile
  })
  return { type:'doc', content }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eigene KI-Actions (content_flash_actions) — team-scoped.
// ─────────────────────────────────────────────────────────────────────────────
export async function listFlashActions(teamId) {
  if (!teamId) return { data: [] }
  return supabase
    .from('content_flash_actions')
    .select('id, label, prompt, sort_order')
    .eq('team_id', teamId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
}

export async function createFlashAction({ teamId, label, prompt }) {
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('content_flash_actions')
    .insert({ team_id: teamId, user_id: user?.id ?? null, label, prompt })
    .select()
    .single()
}

export async function deleteFlashAction(id) {
  return supabase.from('content_flash_actions').delete().eq('id', id)
}
