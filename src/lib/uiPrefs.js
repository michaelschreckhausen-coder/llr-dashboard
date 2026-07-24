// uiPrefs — geräteübergreifende UI-Präferenzen über user_preferences.ui_state (jsonb).
// -----------------------------------------------------------------------------
// Phase 3.5: Client-State, der bisher nur pro Browser (localStorage) galt, wird
// pro User serverseitig gespiegelt. Muster: localStorage bleibt schneller Cache,
// der Server ist die Source-of-Truth über Geräte hinweg.

import { supabase } from './supabase'

export async function loadUiState() {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return {}
  const { data } = await supabase
    .from('user_preferences')
    .select('ui_state')
    .eq('user_id', uid)
    .maybeSingle()
  return data?.ui_state || {}
}

// Merge-Patch: liest den aktuellen ui_state frisch, damit parallele Writes
// sich nicht gegenseitig überschreiben.
export async function patchUiState(patch) {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return
  const { data } = await supabase
    .from('user_preferences')
    .select('ui_state')
    .eq('user_id', uid)
    .maybeSingle()
  const next = { ...(data?.ui_state || {}), ...patch }
  await supabase
    .from('user_preferences')
    .upsert({ user_id: uid, ui_state: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
}
