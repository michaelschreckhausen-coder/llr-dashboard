// src/lib/instagramUnipile.js
//
// Frontend-Helper für den UNIPILE-Strang des Instagram-Moduls (DM-Inbox + Outreach).
//
// Abgrenzung zu src/lib/instagram.js: das ist der Growth-Suite-/Graph-Strang
// (Insights, Demografie, Publishing) und bleibt in der Hybrid-Architektur
// unverändert bestehen. Beide Stränge laufen parallel, im UI zusammengeführt.
// Siehe docs/instagram-unipile-rebuild-konzept.md.
//
// Lesen (Chats/Nachrichten) läuft direkt über supabase-js (RLS + expliziter
// team_id-Filter, Top-Fallstrick #14). Nur Verbinden/Syncen geht über EFs.

import { supabase } from './supabase'

async function callFn(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let detail = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.message || ctx?.error) detail = ctx.message || ctx.error
    } catch (_) { /* ignore */ }
    throw new Error(detail || 'Instagram-Anfrage fehlgeschlagen')
  }
  if (data?.error) throw new Error(data.message || data.error)
  return data
}

// ── P0: Verbindung ─────────────────────────────────────────────────────────

// Hosted-Auth-Link erzeugen ({ url } von Unipile).
export function createUnipileConnectLink() {
  return callFn('instagram-unipile-connect', {
    action: 'create_link',
    app_base: window.location.origin,
  })
}

// Aktuelle Unipile-Verbindung des aktiven Teams (oder null).
export function getUnipileConnection() {
  return callFn('instagram-unipile-connect', { action: 'status' }).then(d => d.connection || null)
}

// Fallback nach Rückkehr vom Hosted-Auth, falls der Webhook verzögert war.
export function reconcileUnipileConnection() {
  return callFn('instagram-unipile-connect', { action: 'reconcile' })
}

// Lokale Verbindung trennen (Unipile-Seite bleibt unberührt).
export function disconnectUnipile() {
  return callFn('instagram-unipile-connect', { action: 'disconnect' })
}

// ── P1: Inbox ──────────────────────────────────────────────────────────────

// Chats + Nachrichten von Unipile nachziehen. full=true → Initial-Sync.
export function syncInbox({ full = false } = {}) {
  return callFn('instagram-unipile-sync', { full })
}

// Chat-Liste des aktiven Teams. Expliziter team_id-Filter (Fallstrick #14):
// RLS allein lässt bei Multi-Team-Membership alle Member-Teams durch.
export async function listChats(activeTeamId, { limit = 100 } = {}) {
  if (!activeTeamId) return []
  const { data, error } = await supabase
    .from('instagram_chats')
    .select('id, unipile_chat_id, attendee_provider_id, attendee_username, attendee_name, attendee_avatar_url, last_message_at, last_message_text, last_message_is_outbound, unread_count, lead_id')
    .eq('team_id', activeTeamId)
    .eq('is_archived', false)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data || []
}

// Verlauf eines Chats, chronologisch aufsteigend (älteste oben).
export async function listMessages(chatId, { limit = 100 } = {}) {
  if (!chatId) return []
  const { data, error } = await supabase
    .from('instagram_messages')
    .select('id, unipile_message_id, sender_provider_id, is_outbound, text, attachments, reactions, is_read, sent_at')
    .eq('chat_id', chatId)
    .order('sent_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data || []
}
