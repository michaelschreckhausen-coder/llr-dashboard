// src/hooks/useActiveTimer.js
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const SELECT_WITH_JOINS = `
  *,
  pm_projects(id, name),
  pm_tasks(id, title),
  pm_activity_types(id, name, color)
`

export function useActiveTimer() {
  const { activeTeamId } = useTeam()
  const [entry, setEntry] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef(null)

  // Initial fetch + Realtime
  useEffect(() => {
    let mounted = true
    let channel = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return
      userIdRef.current = user.id

      const { data, error } = await supabase
        .from('pm_time_entries')
        .select(SELECT_WITH_JOINS)
        .eq('user_id', user.id)
        .is('ended_at', null)
        .maybeSingle()

      if (error) console.error('[useActiveTimer]', error)
      if (!mounted) return
      setEntry(data || null)
      setLoading(false)

      channel = supabase
        .channel(`time-entries-self-${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'pm_time_entries',
          filter: `user_id=eq.${user.id}`
        }, async () => {
          const { data: refreshed } = await supabase
            .from('pm_time_entries')
            .select(SELECT_WITH_JOINS)
            .eq('user_id', user.id)
            .is('ended_at', null)
            .maybeSingle()
          if (mounted) setEntry(refreshed || null)
        })
        .subscribe()
    }

    init()
    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Tick alle 1s
  useEffect(() => {
    if (!entry?.started_at) {
      setElapsed(0)
      return
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - new Date(entry.started_at).getTime()) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [entry?.started_at])

  const stop = useCallback(async () => {
    if (!entry) return null
    const { data, error } = await supabase
      .from('pm_time_entries')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', entry.id)
      .select()
      .single()
    if (error) throw error
    setEntry(null)
    return data
  }, [entry])

  const start = useCallback(async ({ projectId, taskId = null, activityTypeId = null, description = null }) => {
    if (!activeTeamId) throw new Error('Kein aktives Team')
    const userId = userIdRef.current
    if (!userId) throw new Error('Nicht eingeloggt')

    if (entry) await stop()

    const { data, error } = await supabase
      .from('pm_time_entries')
      .insert({
        team_id: activeTeamId,
        user_id: userId,
        project_id: projectId,
        task_id: taskId,
        activity_type_id: activityTypeId,
        description,
        started_at: new Date().toISOString(),
        ended_at: null,
      })
      .select(SELECT_WITH_JOINS)
      .single()

    if (error) throw error
    setEntry(data)
    return data
  }, [activeTeamId, entry, stop])

  const switchTo = useCallback(async (ctx) => {
    await stop()
    return start(ctx)
  }, [stop, start])

  return { entry, elapsed, loading, start, stop, switch: switchTo }
}

export function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}
