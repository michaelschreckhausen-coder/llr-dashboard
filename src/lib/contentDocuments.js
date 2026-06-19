import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// CRUD für content_documents (Dokumenten-Editor / Text-Werkstatt).
// team_id wird vom Caller (aktives Team aus TeamContext) übergeben — RLS verlangt
// team_id ∈ get_my_team_ids(). Jede Funktion gibt das supabase-{data,error}-Objekt
// zurück (gleicher Idiom wie im Rest der App).
// ─────────────────────────────────────────────────────────────────────────────

const LIST_COLS = 'id, title, content_text, status, brand_voice_id, source_chat_id, updated_at, created_at'

export async function createDocument({
  teamId,
  title = 'Unbenanntes Dokument',
  contentJson = {},
  contentText = '',
  sourceChatId = null,
  brandVoiceId = null,
}) {
  const { data: { user } } = await supabase.auth.getUser()
  const res = await supabase
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
  // n:m-Zuordnung: Dokument dem erzeugenden Chat zuordnen
  if (!res.error && res.data && sourceChatId) {
    await linkDocumentToChat(res.data.id, sourceChatId)
  }
  return res
}

export async function listDocumentsForChat(chatId) {
  if (!chatId) return { data: [] }
  const { data, error } = await supabase
    .from('content_document_chats')
    .select('last_opened_at, content_documents!inner(id, title, content_text, updated_at, created_at, source_chat_id)')
    .eq('chat_id', chatId)
    .order('last_opened_at', { ascending: false })
  if (error) return { data: [], error }
  const docs = (data || []).map(r => r.content_documents).filter(Boolean)
  return { data: docs }
}

// Alle Chats, mit denen ein Dokument bearbeitet wurde (für den Auswahldialog),
// sortiert nach Aktualität (zuletzt bearbeitender Chat zuerst).
export async function listChatsForDocument(docId) {
  if (!docId) return { data: [] }
  const { data, error } = await supabase
    .from('content_document_chats')
    .select('chat_id, last_opened_at, content_chats!inner(id, title, updated_at)')
    .eq('document_id', docId)
    .order('last_opened_at', { ascending: false })
  if (error) return { data: [], error }
  const chats = (data || []).map(r => r.content_chats && ({ ...r.content_chats, last_opened_at: r.last_opened_at })).filter(Boolean)
  return { data: chats }
}

// Dokument↔Chat-Verknüpfung anlegen ODER Aktualität bumpen (Upsert).
export async function linkDocumentToChat(docId, chatId) {
  if (!docId || !chatId) return { data: null }
  return supabase
    .from('content_document_chats')
    .upsert({ document_id: docId, chat_id: chatId, last_opened_at: new Date().toISOString() }, { onConflict: 'document_id,chat_id' })
}

export async function getDocument(id) {
  return supabase.from('content_documents').select('*').eq('id', id).maybeSingle()
}

export async function listDocuments(teamId, brandVoiceId = null) {
  let q = supabase.from('content_documents').select(LIST_COLS).eq('team_id', teamId)
  if (brandVoiceId) q = q.eq('brand_voice_id', brandVoiceId)
  return q.order('updated_at', { ascending: false })
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

export async function addDocumentToChat(docId, chatId) {
  // Bestehendes Dokument diesem Chat zuordnen / Aktualität bumpen (Junction-Upsert).
  return linkDocumentToChat(docId, chatId)
}

export async function deleteDocument(id) {
  return supabase.from('content_documents').delete().eq('id', id)
}

// Inline-Markdown (**fett**, __fett__, *kursiv*, _kursiv_) → TipTap-Inline-Nodes.
// Leere Text-Nodes werden vermieden (TipTap verbietet sie).
export function parseInlineMarks(text) {
  const src = String(text || '')
  const nodes = []
  const push = (t, marks) => { if (t) nodes.push(marks ? { type:'text', text:t, marks } : { type:'text', text:t }) }
  const regex = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g
  let last = 0, m
  while ((m = regex.exec(src)) !== null) {
    if (m.index > last) push(src.slice(last, m.index))
    const bold = m[2] != null ? m[2] : m[3]
    const italic = m[4] != null ? m[4] : m[5]
    if (bold != null) push(bold, [{ type:'bold' }])
    else if (italic != null) push(italic, [{ type:'italic' }])
    last = m.index + m[0].length
  }
  if (last < src.length) push(src.slice(last))
  return nodes
}

// Text (mit Markdown + Absatzlogik) → TipTap-Doc-JSON.
// - Absätze werden durch Leerzeilen getrennt (= sichtbarer Absatz-Abstand).
// - Einzelne Zeilenumbrüche INNERHALB eines Absatzes bleiben enge Zeilen (hardBreak),
//   z.B. Aufzählungen — exakt wie die Vorschau im Chat (white-space:pre-wrap).
// - **fett**/*kursiv* werden als echte Marks übernommen.
export function textToDoc(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = raw.split(/\n[ \t]*\n+/).map(b => b.replace(/\s+$/,'')).filter(b => b.trim().length)
  if (!blocks.length) return { type:'doc', content:[{ type:'paragraph' }] }
  const content = blocks.map(block => {
    const lines = block.split('\n')
    const inline = []
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type:'hardBreak' })
      inline.push(...parseInlineMarks(line))
    })
    return inline.length ? { type:'paragraph', content: inline } : { type:'paragraph' }
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
