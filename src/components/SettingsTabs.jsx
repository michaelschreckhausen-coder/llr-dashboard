import React from 'react'
import { NavLink } from 'react-router-dom'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

const TABS = [
  { to: '/settings/profil', label: 'Profil' },
  { to: '/settings/team',   label: 'Team' },
  { to: '/settings/konto',  label: 'Konto & Abo' },
]

export default function SettingsTabs() {
  return (
    <div style={{
      display:'flex',
      gap:4,
      marginBottom:24,
      borderBottom:'1px solid var(--border, #E5E7EB)',
    }}>
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end
          style={({ isActive }) => ({
            padding:'10px 18px',
            fontSize:13,
            fontWeight:700,
            textDecoration:'none',
            color: isActive ? PRIMARY : 'var(--text-soft, #6B7280)',
            borderBottom: isActive ? `2px solid ${PRIMARY}` : '2px solid transparent',
            marginBottom:-1,
            transition:'color 0.15s, border-color 0.15s',
          })}
        >
          {label}
        </NavLink>
      ))}
    </div>
  )
}
