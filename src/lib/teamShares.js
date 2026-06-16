// src/lib/teamShares.js
// Helfer für Cross-Team-Sharing: liefert die IDs von Entitäten (oder Brand Voices),
// die mit dem aktiven Team geteilt wurden, und baut den PostgREST-.or()-Filter.
//
// Modell: <entity>_team_shares (entity_fk, team_id). Eine Entität ist im aktiven Team
// sichtbar, wenn sie dort beheimatet ist (team_id = activeTeamId) ODER per Team-Share
// freigegeben wurde.

import { supabase } from './supabase'

const ENTITY_SHARE = {
  brand_voices:     { table: 'brand_voice_team_shares',     fk: 'brand_voice_id'     },
  target_audiences: { table: 'target_audience_team_shares', fk: 'target_audience_id' },
  knowledge_base:   { table: 'knowledge_base_team_shares',  fk: 'knowledge_base_id'  },
}

// IDs der Entitäten, die mit dem aktiven Team geteilt sind
export async function sharedEntityIds(entityTable, activeTeamId) {
  const cfg = ENTITY_SHARE[entityTable]
  if (!cfg || !activeTeamId) return []
  const { data, error } = await supabase.from(cfg.table).select(cfg.fk).eq('team_id', activeTeamId)
  if (error) { console.warn('[sharedEntityIds]', entityTable, error); return [] }
  return [...new Set((data || []).map(r => r[cfg.fk]).filter(Boolean))]
}

// IDs der Brand Voices, die mit dem aktiven Team geteilt sind (für angehängte Inhalte)
export async function sharedBrandVoiceIds(activeTeamId) {
  return sharedEntityIds('brand_voices', activeTeamId)
}

// wendet "team_id = aktiv ODER id IN (sharedIds)" auf eine Query an
export function scopeByTeamOrShared(query, activeTeamId, sharedIds, idCol = 'id') {
  if (sharedIds && sharedIds.length > 0) {
    return query.or(`team_id.eq.${activeTeamId},${idCol}.in.(${sharedIds.join(',')})`)
  }
  return query.eq('team_id', activeTeamId)
}

// wendet "team_id = aktiv ODER brand_voice_id IN (sharedBvIds)" an (für Content/Visuals)
export function scopeContentByTeamOrSharedBV(query, activeTeamId, sharedBvIds) {
  if (sharedBvIds && sharedBvIds.length > 0) {
    return query.or(`team_id.eq.${activeTeamId},brand_voice_id.in.(${sharedBvIds.join(',')})`)
  }
  return query.eq('team_id', activeTeamId)
}
