// useImportJobs — Sales-Nav-Import-Jobs (Phase 6, /leads/imports).
// Analog useLeads: team_id-Filter (Fallstrick #14: nie auf RLS allein verlassen)
// + Realtime-Subscription, plus 5s-Fallback-Polling solange ein Job aktiv ist.
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const JOBS_SELECT =
  'id, source_type, source_url, source_id, status, total_leads, processed_leads, failed_leads, current_offset, rate_limit_until, error_message, created_at, updated_at'

const ACTIVE_STATES = ['queued', 'running', 'paused']

export function useImportJobs() {
  const { activeTeamId } = useTeam() || {}
  const [uid, setUid] = useState(null)
  const [jobs, setJobs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  const pollRef = useRef(null)

  useEffect(() => {
    let m = true
    supabase.auth.getUser().then(({ data }) => { if (m) setUid(data?.user?.id || null) })
    return () => { m = false }
  }, [])

  const fetchJobs = useCallback(async () => {
    let q = supabase.from('sales_nav_import_jobs').select(JOBS_SELECT)
    if (activeTeamId) {
      q = q.eq('team_id', activeTeamId)
    } else if (uid) {
      q = q.eq('user_id', uid)
    } else {
      if (mountedRef.current) { setJobs([]); setIsLoading(false) }
      return
    }
    const { data, error: qErr } = await q.order('created_at', { ascending: false }).limit(100)
    if (!mountedRef.current) return
    if (qErr) {
      console.warn('[useImportJobs] fetch error:', qErr.message)
      setError(qErr); setIsLoading(false); return
    }
    setJobs(data || []); setError(null); setIsLoading(false)
  }, [activeTeamId, uid])

  // Realtime: re-fetch bei jeder Änderung an den Team-Jobs
  useEffect(() => {
    mountedRef.current = true
    fetchJobs()
    const channelKey = activeTeamId || `solo-${uid || 'anon'}`
    const channel = supabase
      .channel(`snij-changes-${channelKey}`)
      .on(
        'postgres_changes',
        activeTeamId
          ? { event: '*', schema: 'public', table: 'sales_nav_import_jobs', filter: `team_id=eq.${activeTeamId}` }
          : { event: '*', schema: 'public', table: 'sales_nav_import_jobs' },
        () => fetchJobs()
      )
      .subscribe()
    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [fetchJobs, activeTeamId, uid])

  // Fallback-Polling (5s) solange ein Job aktiv ist — fängt Realtime-Ausfälle
  useEffect(() => {
    const hasActive = jobs.some(j => ACTIVE_STATES.includes(j.status))
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (hasActive) {
      pollRef.current = setInterval(() => fetchJobs(), 5000)
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [jobs, fetchJobs])

  return { jobs, isLoading, error, refresh: fetchJobs }
}
