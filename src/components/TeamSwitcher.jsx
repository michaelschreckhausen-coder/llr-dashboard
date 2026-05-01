import React from 'react'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

export default function TeamSwitcher({ isCollapsed = false }) {
  const { team: activeTeam, allTeams, switchTeam } = useTeam()

  if (!activeTeam) return null
  if (!allTeams || allTeams.length < 2) return null
  if (isCollapsed) return null

  async function handleChange(e) {
    const newId = e.target.value
    if (newId === activeTeam.id) return
    localStorage.setItem('leadesk_active_team_id', newId)
    await switchTeam(newId)
    window.location.href = '/leads'
  }

  return (
    <div style={{
      margin: '0 12px 12px',
      padding: '8px 10px',
      borderRadius: 10,
      border: '1px solid var(--border, #E5E7EB)',
      background: 'var(--surface-muted, rgba(0,0,0,0.02))',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-soft, #6B7280)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
      }}>
        Team
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: PRIMARY,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 11,
          flexShrink: 0,
        }}>
          {activeTeam.name?.[0]?.toUpperCase() || '?'}
        </div>
        <select
          value={activeTeam.id}
          onChange={handleChange}
          style={{
            flex: 1, minWidth: 0,
            padding: '6px 8px',
            border: '1px solid var(--border, #E5E7EB)',
            borderRadius: 6,
            fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary, #0F172A)',
            background: 'var(--surface, white)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {allTeams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
