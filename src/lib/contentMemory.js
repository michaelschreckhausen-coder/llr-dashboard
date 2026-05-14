// src/lib/contentMemory.js
// Memory-Engine fuer Content: protokolliert AI-Generations + Edit-Diffs +
// liefert Few-Shot-Examples aus der Vergangenheit. Alles team-scoped via RLS.
//
// Opt-In: user_preferences.memory_enabled muss true sein. Wenn null oder false,
// ist die ganze Lib ein No-Op (Calls return ohne DB-Write).

import { supabase } from './supabase'

// ─── Opt-In Check ──────────────────────────────────────────────────────────
let _memoryEnabledCache = null
let _memoryEnabledCachedFor = null

export async function isMemoryEnabled(userId) {
  if (!userId) return false
  if (_memoryEnabledCachedFor === userId && _memoryEnabledCache !== null) {
    return _memoryEnabledCache
  }
  const { data } = await supabase
    .from('user_preferences')
    .select('memory_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const enabled = data?.memory_enabled === true
  _memoryEnabledCache = enabled
  _memoryEnabledCachedFor = userId
  return enabled
}

export async function setMemoryEnabled(userId, enabled) {
  if (!userId) return { error: 'no user' }
  _memoryEnabledCache = enabled
  _memoryEnabledCachedFor = userId
  const payload = {
    user_id: userId,
    memory_enabled: enabled,
    memory_consented_at: new Date().toISOString(),
  }
  // upsert
  const { error } = await supabase
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' })
  return { error }
}

// ─── Record Generation ─────────────────────────────────────────────────────
/**
 * Wird unmittelbar nach einer Generate-Antwort aufgerufen. Variants ist ein
 * Array von Strings (oder JSON-Objekten). picked_variant_index kann spaeter
 * via recordPickedVariant updaten.
 */
export async function recordGeneration({
  userId, teamId, postId = null, kind, model,
  promptInput, resolvedPrompt = null,
  brandVoiceId = null, targetAudienceId = null,
  variants = [], creditsUsed = 0,
}) {
  if (!await isMemoryEnabled(userId)) return null
  if (!teamId) return null

  const { data, error } = await supabase
    .from('content_generations')
    .insert({
      user_id: userId, team_id: teamId, post_id: postId,
      kind, model,
      prompt_input: promptInput,
      resolved_prompt: resolvedPrompt,
      brand_voice_id: brandVoiceId,
      target_audience_id: targetAudienceId,
      variants,
      credits_used: creditsUsed,
    })
    .select()
    .single()

  if (error) {
    console.warn('[memory] recordGeneration failed:', error.message)
    return null
  }
  return data
}

export async function recordPickedVariant(generationId, variantIndex) {
  if (!generationId) return
  await supabase
    .from('content_generations')
    .update({
      picked_variant_index: variantIndex,
      picked_at: new Date().toISOString(),
    })
    .eq('id', generationId)
}

// ─── Edit-Diff Capture ────────────────────────────────────────────────────
/**
 * Wird beim Speichern eines Posts aufgerufen, der aus einer AI-Generation
 * stammt. Berechnet einen einfachen Diff-Ratio (Levenshtein-aehnlich, aber
 * billig).
 */
export async function recordEdit({
  userId, teamId, postId, generationId,
  aiText = '', finalText = '',
}) {
  if (!await isMemoryEnabled(userId)) return null
  if (!teamId || !postId) return null
  if (!aiText || !finalText) return null
  if (aiText === finalText) return null  // kein Edit, kein Lern-Signal

  const diffRatio = computeDiffRatio(aiText, finalText)
  const diffChars = Math.abs(finalText.length - aiText.length)

  const { data, error } = await supabase
    .from('content_edits')
    .insert({
      user_id: userId, team_id: teamId,
      post_id: postId, generation_id: generationId,
      ai_text: aiText, final_text: finalText,
      diff_chars: diffChars,
      diff_ratio: Math.min(diffRatio, 1).toFixed(3),
    })
    .select()
    .single()

  if (error) {
    console.warn('[memory] recordEdit failed:', error.message)
    return null
  }
  return data
}

function computeDiffRatio(a, b) {
  // Bigram-Jaccard-Distanz als billige Diff-Approximation
  const bigrams = s => {
    const out = new Set()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const A = bigrams(a.toLowerCase())
  const B = bigrams(b.toLowerCase())
  if (A.size === 0 && B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : 1 - inter / union
}

// ─── Feedback ───────────────────────────────────────────────────────────────
export async function recordFeedback({ userId, teamId, generationId, variantIndex, reaction, note = null }) {
  if (!await isMemoryEnabled(userId)) return null
  if (!teamId || !generationId) return null
  await supabase.from('content_feedback').insert({
    user_id: userId, team_id: teamId,
    generation_id: generationId, variant_index: variantIndex,
    reaction, note,
  })
}

// ─── Few-Shot-Examples ──────────────────────────────────────────────────────
/**
 * Liefert die N relevantesten "kept" Beispiele aus der jüngeren Vergangenheit
 * als Few-Shot fuer einen neuen Generate-Call. Memory-aware Personalisierung.
 *
 * Strategie (v1, einfach): die letzten N picked_variants vom Team, gleicher
 * kind, optional gleiche brand_voice_id.
 */
export async function getFewShotExamples({ userId, teamId, kind, brandVoiceId = null, limit = 3 }) {
  if (!await isMemoryEnabled(userId)) return []
  if (!teamId) return []

  let q = supabase
    .from('content_generations')
    .select('id, variants, picked_variant_index, prompt_input, brand_voice_id, created_at')
    .eq('team_id', teamId)
    .eq('kind', kind)
    .not('picked_variant_index', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3)  // overshoot, dann filtern

  if (brandVoiceId) q = q.eq('brand_voice_id', brandVoiceId)

  const { data, error } = await q
  if (error || !data) return []

  return data
    .slice(0, limit)
    .map(g => {
      const variant = g.variants?.[g.picked_variant_index]
      return typeof variant === 'string' ? variant : variant?.text || JSON.stringify(variant)
    })
    .filter(Boolean)
}

// ─── Insight-View: "Was hat Leadesk gelernt" ───────────────────────────────
/**
 * Aggregierte Statistik fuer eine Memory-Settings-Page.
 */
export async function getMemoryStats(teamId) {
  if (!teamId) return null
  const { count: genCount } = await supabase
    .from('content_generations')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
  const { count: editCount } = await supabase
    .from('content_edits')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
  return {
    generations: genCount || 0,
    edits: editCount || 0,
  }
}
