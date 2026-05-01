// src/components/delivery/TaskTimerButton.jsx
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

/**
 * Inline-Timer-Button für Kanban-Cards / Task-Listen.
 *
 * Props:
 *   projectId         (required)
 *   taskId            (optional)
 *   activityTypeId    (optional)
 *   isActive          (optional) — true wenn auf diesem Task der aktive Timer läuft
 *   size              'sm' | 'md'  Default 'sm'
 *   onStarted         Callback nach erfolgreichem Start
 */
export default function TaskTimerButton({
  projectId,
  taskId = null,
  activityTypeId = null,
  isActive = false,
  size = 'sm',
  onStarted,
}) {
  const { activeTeamId } = useTeam()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleClick = useCallback(async (e) => {
    e.stopPropagation()
    if (!projectId || !activeTeamId) return
    if (isActive) return
    setBusy(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Nicht eingeloggt')

      await supabase
        .from('pm_time_entries')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('ended_at', null)

      const { data, error: insertErr } = await supabase
        .from('pm_time_entries')
        .insert({
          team_id: activeTeamId,
          user_id: user.id,
          project_id: projectId,
          task_id: taskId,
          activity_type_id: activityTypeId,
          started_at: new Date().toISOString(),
          ended_at: null,
        })
        .select()
        .single()

      if (insertErr) throw insertErr
      if (onStarted) onStarted(data)
    } catch (err) {
      setError(err.message || 'Timer konnte nicht gestartet werden')
    } finally {
      setBusy(false)
    }
  }, [projectId, taskId, activityTypeId, activeTeamId, isActive, onStarted])

  const isSmall = size === 'sm'
  const baseStyle = {
    padding: isSmall ? '4px 8px' : '6px 12px',
    fontSize: isSmall ? 12 : 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 4,
    cursor: busy ? 'wait' : (isActive ? 'default' : 'pointer'),
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isActive ? '#10b981' : 'rgba(0,0,0,0.06)',
    color: isActive ? 'white' : 'rgb(55, 65, 81)',
    opacity: busy ? 0.6 : 1,
    transition: 'background-color 120ms',
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || isActive}
        title={isActive ? 'Timer läuft auf diesem Task' : 'Timer starten'}
        style={baseStyle}
        onMouseEnter={(e) => { if (!isActive && !busy) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.12)' }}
        onMouseLeave={(e) => { if (!isActive && !busy) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)' }}
      >
        {isActive ? '● Läuft' : (busy ? '…' : '▶')}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>
      )}
    </span>
  )
}
