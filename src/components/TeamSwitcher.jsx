import React, { useState, useRef, useEffect } from 'react'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const ROLE_LABEL = {
  owner: 'Owner',
  admin: 'Admin',
  team_admin: 'Admin',
  member: 'Member',
}

export default function TeamSwitcher({ isCollapsed = false }) {
  const { team: activeTeam, allTeams, switchTeam } = useTeam()
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const wrapperRef = useRef(null)
  const itemsRef = useRef([])

  // Hooks IMMER vor den Early-Returns (Rules of Hooks / CLAUDE.md). Bodies sind
  // gegen fehlendes activeTeam/allTeams abgesichert.

  // Outside-Click + ESC/Pfeile schließen bzw. navigieren
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      const teams = allTeams || []
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx(i => Math.min(teams.length - 1, i + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx(i => Math.max(0, i - 1))
      }
      if (e.key === 'Enter' && focusIdx >= 0) {
        e.preventDefault()
        const target = teams[focusIdx]
        if (target && target.id !== activeTeam?.id) {
          setOpen(false)
          switchTeam(target.id)
        }
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, focusIdx, allTeams, activeTeam?.id, switchTeam])

  // Beim Öffnen Focus auf aktive Position
  useEffect(() => {
    if (open) {
      const activeIdx = (allTeams || []).findIndex(t => t.id === activeTeam?.id)
      setFocusIdx(activeIdx)
    }
  }, [open, allTeams, activeTeam?.id])

  if (!activeTeam) return null
  if (!allTeams || allTeams.length < 2) return null
  if (isCollapsed) return null

  function handleSelect(teamId) {
    setOpen(false)
    if (teamId === activeTeam.id) return
    switchTeam(teamId)
  }

  return (
    <div ref={wrapperRef} style={{ margin: '0 12px 12px', position: 'relative' }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-soft, #6B7280)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
        paddingLeft: 2,
      }}>
        Team
      </div>

      {/* Trigger-Pill */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '7px 10px',
          borderRadius: 10,
          border: '1.5px solid ' + (open ? PRIMARY : 'var(--border, #E5E7EB)'),
          background: 'var(--surface, #fff)',
          cursor: 'pointer',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: open ? '0 0 0 3px rgba(10,111,176,0.10)' : 'none',
          fontFamily: 'inherit',
        }}
      >
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 13, fontWeight: 600,
          color: 'var(--text-primary, #0F172A)',
          textAlign: 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activeTeam.name}
        </div>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
          style={{
            color: 'var(--text-soft, #94A3B8)', flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown-Card */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0, right: 0,
            background: 'var(--surface, #fff)',
            borderRadius: 12,
            border: '1px solid var(--border, #E5E7EB)',
            boxShadow: '0 12px 32px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
            zIndex: 1000,
            overflow: 'hidden',
            animation: 'team-dropdown-in 0.15s ease-out',
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          <div style={{
            padding: '10px 14px 8px',
            fontSize: 10, fontWeight: 700,
            color: 'var(--text-soft, #6B7280)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            borderBottom: '1px solid var(--border, #F1F5F9)',
          }}>
            Team wechseln
          </div>

          {allTeams.map((t, idx) => {
            const isActive = t.id === activeTeam.id
            const isFocus = idx === focusIdx
            const roleLabel = ROLE_LABEL[t.role] || 'Member'
            return (
              <button
                key={t.id}
                ref={el => (itemsRef.current[idx] = el)}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(t.id)}
                onMouseEnter={() => setFocusIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px',
                  border: 'none',
                  background: isActive
                    ? 'rgba(10,111,176,0.08)'
                    : isFocus ? 'var(--surface-muted, #F8FAFC)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                  fontFamily: 'inherit',
                  borderLeft: isActive ? `3px solid ${PRIMARY}` : '3px solid transparent',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: 'var(--text-primary, #0F172A)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-soft, #94A3B8)',
                    marginTop: 1,
                  }}>
                    {roleLabel}
                  </div>
                </div>
                {isActive && (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                    style={{ color: PRIMARY, flexShrink: 0 }}>
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )
          })}

          <style>{`
            @keyframes team-dropdown-in {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
