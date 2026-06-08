// src/hooks/useAuralis.js
//
// Frontend-Hook für das KI-Sichtbarkeits-Add-on (Auralis). Spricht
// ausschließlich die Edge-Function 'auralis-proxy' an — der zentrale
// Auralis-Key bleibt server-seitig.
//
// Response-Contract der EF: { ok:true, data } | { ok:false, error, code }.
// Erwartete App-Codes: ADDON_INACTIVE, NOT_PROVISIONED, NO_REPORT,
// INVALID_INPUT, UPSTREAM.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

export function useAuralis() {
  const { activeTeamId } = useTeam() || {}

  const [status, setStatus]           = useState(null)   // { provisioned, full_name, topic_query, language }
  const [scores, setScores]           = useState(null)   // /scores/latest payload
  const [competitors, setCompetitors] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)   // { error, code }

  // Generischer EF-Call. Gibt { ok, data } | { ok:false, error, code } zurück.
  const call = useCallback(async (action, params = {}) => {
    const { data, error: invErr } = await supabase.functions.invoke('auralis-proxy', {
      body: { action, team_id: activeTeamId || undefined, ...params },
    })
    if (invErr) {
      return { ok: false, error: invErr.message || 'Funktionsaufruf fehlgeschlagen', code: 'INVOKE' }
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error || 'Unbekannter Fehler', code: data?.code || 'ERROR' }
    }
    return { ok: true, data: data.data }
  }, [activeTeamId])

  const reloadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await call('status')
    if (!r.ok) {
      setError({ error: r.error, code: r.code })
      setStatus(null)
    } else {
      setStatus(r.data)
    }
    setLoading(false)
    return r
  }, [call])

  useEffect(() => { reloadStatus() }, [reloadStatus])

  const provision = useCallback(async ({ full_name, topic_query, language }) => {
    const r = await call('provision', { full_name, topic_query, language })
    if (r.ok) await reloadStatus()
    return r
  }, [call, reloadStatus])

  const loadScores = useCallback(async () => {
    const r = await call('scores_latest')
    if (r.ok) setScores(r.data)
    return r // NO_REPORT muss der Aufrufer behandeln (noch keine Analyse)
  }, [call])

  const analyzeSelf = useCallback(async () => {
    const r = await call('analyze_self')
    if (r.ok) await loadScores()
    return r
  }, [call, loadScores])

  // Thema ändern (legt intern ein neues Auralis-Topic an, altes wird gelöscht →
  // Scores zurücksetzen, der Nutzer analysiert das neue Thema frisch).
  const updateTopic = useCallback(async (topic_query) => {
    const r = await call('update_topic', { topic_query })
    if (r.ok) {
      setScores(null)
      await reloadStatus()
    }
    return r
  }, [call, reloadStatus])

  const loadCompetitors = useCallback(async () => {
    const r = await call('competitors_list')
    if (r.ok) setCompetitors(r.data?.competitors || [])
    return r
  }, [call])

  const addCompetitor = useCallback(async ({ name, topics, language }) => {
    const r = await call('competitor_create', { name, topics, language })
    if (r.ok) await loadCompetitors()
    return r
  }, [call, loadCompetitors])

  const removeCompetitor = useCallback(async (competitorId) => {
    const r = await call('competitor_delete', { competitor_id: competitorId })
    if (r.ok) await loadCompetitors()
    return r
  }, [call, loadCompetitors])

  const analyzeCompetitor = useCallback(async (competitorId) => {
    const r = await call('competitor_analyze', { competitor_id: competitorId })
    if (r.ok) await loadCompetitors()
    return r
  }, [call, loadCompetitors])

  return {
    status, scores, competitors, loading, error,
    reloadStatus, provision,
    loadScores, analyzeSelf, updateTopic,
    loadCompetitors, addCompetitor, removeCompetitor, analyzeCompetitor,
    call,
  }
}
