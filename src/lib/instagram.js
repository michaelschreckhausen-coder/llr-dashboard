// src/lib/instagram.js
//
// Frontend-Helper fuer die Instagram-Growth-Suite-Integration. Alle Calls
// laufen ueber die Edge Function `instagram-proxy` (Master-Key serverseitig).
// Attribution via external_ref = team_id (Partner-API-Update 2026-06-26):
// Onboarding ueber Connect-Link, danach external_ref-gescopeter Sync.

import { supabase } from './supabase'

async function call(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('instagram-proxy', {
    body: { action, ...payload },
  })
  if (error) {
    let detail = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) detail = ctx.error
    } catch (_) { /* ignore */ }
    throw new Error(detail || 'Instagram-Anfrage fehlgeschlagen')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Onboarding-Link fuer den Endkunden ({ connect_url, expires_in_hours }).
export function createConnectLink() {
  return call('create_connect_link')
}

// Konten via external_ref ziehen + lokalen Cache aktualisieren. Liefert die
// aktuelle Verbindung (oder null).
export function syncConnection() {
  return call('sync').then(d => d.connection || null)
}

// Aktuelle Verbindung des aktiven Teams aus dem Cache (oder null).
export function getConnectionStatus() {
  return call('status').then(d => d.connection || null)
}

// Lokale Verbindung trennen (Partner-Seite bleibt unberuehrt).
export function disconnectAccount() {
  return call('disconnect')
}

// Insights/Posts/Demografie des verbundenen Kontos (AccountDetail-Shape).
export function getAnalytics() {
  return call('get_analytics').then(d => d.detail || null)
}

// Instagram-Leads des verbundenen Kontos.
export function listLeads() {
  return call('list_leads').then(d => d.leads || [])
}

// Beitrag veroeffentlichen. media_url muss oeffentlich erreichbar sein
// (z.B. Supabase Signed URL). Liefert { ok, id }.
export function publishToInstagram({ mediaUrl, caption = '', mediaType = 'IMAGE' }) {
  return call('publish', { media_url: mediaUrl, caption, media_type: mediaType })
}
