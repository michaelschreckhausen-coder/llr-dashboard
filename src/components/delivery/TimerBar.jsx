// src/components/delivery/TimerBar.jsx
import { useState } from 'react'
import { useActiveTimer, formatElapsed } from '../../hooks/useActiveTimer'

export default function TimerBar() {
  const { entry, elapsed, loading, stop } = useActiveTimer()
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState(null)

  if (loading || !entry) return null

  const project = entry.pm_projects
  const task = entry.pm_tasks
  const activity = entry.pm_activity_types

  const handleStop = async () => {
    setStopping(true); setError(null)
    try { await stop() }
    catch (e) { setError(e.message || 'Stoppen fehlgeschlagen') }
    finally { setStopping(false) }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      backgroundColor: 'rgb(17, 24, 39)', color: 'white',
      borderTop: '3px solid var(--wl-primary, rgb(49,90,231))',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 1000, boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
      fontSize: 14,
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        backgroundColor: '#10b981', flexShrink: 0,
      }} />

      <div style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600, fontSize: 16, minWidth: 80,
      }}>
        {formatElapsed(elapsed)}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
        <div style={{
          fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project?.name || 'Projekt unbekannt'}
        </div>
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.7)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task?.title || 'Ohne Task'}
          {activity?.name && (
            <span style={{
              marginLeft: 8, padding: '1px 6px', borderRadius: 4,
              backgroundColor: activity.color || 'rgba(255,255,255,0.2)',
              fontSize: 11,
            }}>
              {activity.name}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: '#fca5a5', fontSize: 12, maxWidth: 200 }}>{error}</div>
      )}

      <button
        onClick={handleStop}
        disabled={stopping}
        style={{
          padding: '8px 16px', backgroundColor: '#dc2626', color: 'white',
          border: 'none', borderRadius: 6, fontWeight: 600,
          cursor: stopping ? 'not-allowed' : 'pointer',
          opacity: stopping ? 0.6 : 1, fontSize: 14,
        }}
      >
        {stopping ? 'Stoppt…' : '■ Stop'}
      </button>
    </div>
  )
}
