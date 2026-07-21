import React from 'react'
import { NavLink } from 'react-router-dom'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const TABS = [
  { to: '/settings/profil',        label: 'Profil' },
  { to: '/settings/team',          label: 'Team' },
  { to: '/settings/konto',         label: 'Konto & Abo' },
  { to: '/settings/memory',        label: 'Memory' },
  { to: '/settings/extension',     label: 'Browser-Extension' },
  { to: '/settings/notifications', label: 'Benachrichtigungen' },
  { to: '/settings/instagram',     label: 'Instagram' },
  { to: '/settings/affiliate',     label: 'Affiliate' },
]

export default function SettingsTabs() {
  return (
    <>
      {/* CRM-Stil-Kopf (Caveat-Overline + Titel) — einheitlich über alle Settings-Seiten */}
      <div style={{ marginBottom: 18 }}>
        <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:2 }}>Konto &amp; Präferenzen</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.2, margin: 0, color: 'var(--text-strong, #111827)' }}>Einstellungen</h1>
      </div>
      <div style={{
        display:'flex',
        gap:4,
        marginBottom:24,
        borderBottom:'1px solid var(--border, #E5E7EB)',
        flexWrap:'wrap',
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
    </>
  )
}
