// src/hooks/useListTeamShares.js
//
// Team-Freigaben für Inbox-Listen (inbox_list_team_shares). Eigene, schlanke
// Sharing-Schicht — unabhängig von useInboxLists, damit branch-übergreifend
// identisch verwendbar (develop-Hook hinkt main's kind-Variante hinterher).
//
// Modell: eine Liste kann mit MEHREREN Teams geteilt werden (Join-Tabelle).
// Setzen läuft über die SECURITY-DEFINER-RPC set_inbox_list_team_shares
// (Owner-Guard + Ziel-Teams ⊆ eigene Teams, diff't INSERT/DELETE, synct is_shared).
//
// API:
//   const { sharesByList, setListTeamShares, refreshShares } = useListTeamShares(listIds)
//   sharesByList: Map<inbox_list_id, [{ team_id, team_name }]>

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useListTeamShares(listIds) {
  const [sharesByList, setSharesByList] = useState(() => new Map())
  const mountedRef = useRef(true)
  const ids = (listIds || []).filter(Boolean)
  const key = ids.join(',')

  const refresh = useCallback(async () => {
    if (!ids.length) { setSharesByList(new Map()); return }
    const { data, error } = await supabase
      .from('inbox_list_team_shares')
      .select('inbox_list_id, team_id, teams(name)')
      .in('inbox_list_id', ids)
    if (error) { console.warn('[useListTeamShares] Laden fehlgeschlagen:', error.message); return }
    const m = new Map()
    for (const r of (data || [])) {
      if (!r.inbox_list_id || !r.team_id) continue
      let arr = m.get(r.inbox_list_id)
      if (!arr) { arr = []; m.set(r.inbox_list_id, arr) }
      arr.push({ team_id: r.team_id, team_name: r.teams?.name || null })
    }
    if (mountedRef.current) setSharesByList(m)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => { mountedRef.current = false }
  }, [refresh])

  // Setzt die Team-Menge einer Liste (leeres Array = Freigabe komplett zurücknehmen).
  const setListTeamShares = useCallback(async (listId, teamIds) => {
    const { data, error } = await supabase.rpc('set_inbox_list_team_shares', {
      p_list_id: listId,
      p_team_ids: teamIds || [],
    })
    if (error) return { error }
    const next = (data || []).map(r => ({ team_id: r.team_id, team_name: r.team_name }))
    if (mountedRef.current) {
      setSharesByList(prev => { const n = new Map(prev); n.set(listId, next); return n })
    }
    return { data: next }
  }, [])

  return { sharesByList, setListTeamShares, refreshShares: refresh }
}
