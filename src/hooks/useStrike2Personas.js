// useStrike2Personas — Strike2-Personas-Liste (Phase 2, /branding/strike2-personas).
// Team-gescopet (Fallstrick #14: expliziter team_id-Filter) + Realtime.
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const SELECT = 'id, name, status, current_step, generation_status, created_at, updated_at'

export function useStrike2Personas() {
  const { activeTeamId } = useTeam() || {}
  const [uid, setUid] = useState(null)
  const [personas, setPersonas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    let m = true
    supabase.auth.getUser().then(({ data }) => { if (m) setUid(data?.user?.id || null) })
    return () => { m = false }
  }, [])

  const fetchPersonas = useCallback(async () => {
    let q = supabase.from('strike2_personas').select(SELECT)
    if (activeTeamId) {
      q = q.eq('team_id', activeTeamId)
    } else if (uid) {
      q = q.eq('user_id', uid)
    } else {
      if (mountedRef.current) { setPersonas([]); setIsLoading(false) }
      return
    }
    const { data, error } = await q.order('created_at', { ascending: false })
    if (!mountedRef.current) return
    if (error) { console.warn('[useStrike2Personas] fetch error:', error.message); setIsLoading(false); return }
    setPersonas(data || []); setIsLoading(false)
  }, [activeTeamId, uid])

  useEffect(() => {
    mountedRef.current = true
    fetchPersonas()
    const key = activeTeamId || `solo-${uid || 'anon'}`
    const ch = supabase
      .channel(`s2p-changes-${key}`)
      .on('postgres_changes',
        activeTeamId
          ? { event: '*', schema: 'public', table: 'strike2_personas', filter: `team_id=eq.${activeTeamId}` }
          : { event: '*', schema: 'public', table: 'strike2_personas' },
        () => fetchPersonas())
      .subscribe()
    return () => { mountedRef.current = false; supabase.removeChannel(ch) }
  }, [fetchPersonas, activeTeamId, uid])

  return { personas, isLoading, refresh: fetchPersonas }
}
