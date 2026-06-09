// src/components/TabBar.jsx
// Premium-Tab-Bar — kein hässliches graues Rechteck mehr.
// Pill-Style mit aktivem Highlight + optional Themen-Color pro Tab.
//
// Verwendung:
//   <TabBar
//     tabs={[
//       { v:'marke', label:'Marke', icon: <Building2 size={16} strokeWidth={1.75}/>, color:'blue' },
//       { v:'tonalitaet', label:'Tonalität', icon: <BarChart3 size={16} strokeWidth={1.75}/>, color:'green' },
//     ]}
//     active={tab}
//     onChange={setTab}
//   />

import React from 'react'
import { BarChart3, Building2 } from 'lucide-react'

const P = 'var(--wl-primary, rgb(49,90,231))'

const COLOR_BG = {
  blue: 'rgba(49,90,231,.10)',
  pink: 'rgba(236,72,153,.12)',
  purple: 'rgba(124,58,237,.10)',
  green: 'rgba(34,197,94,.12)',
  amber: 'rgba(245,158,11,.12)',
  teal: 'rgba(20,184,166,.12)',
  coral: 'rgba(244,114,114,.12)',
  brand: 'rgba(49,90,231,.10)',
}
const COLOR_TEXT = {
  blue: '#1E40AF',
  pink: '#9D174D',
  purple: '#5B21B6',
  green: '#15803D',
  amber: '#92400E',
  teal: '#115E59',
  coral: '#9F1239',
  brand: 'rgb(49,90,231)',
}

export default function TabBar({ tabs, active, onChange, style = {} }) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      padding: 5,
      background: 'var(--surface-muted, #F4F5F8)',
      borderRadius: 14,
      border: '1px solid var(--border, #E5E7EB)',
      flexWrap: 'wrap',
      ...style,
    }}>
      {tabs.map(t => {
        const isActive = t.v === active
        const txtColor = t.color && COLOR_TEXT[t.color] ? COLOR_TEXT[t.color] : P
        return (
          <button
            key={t.v}
            onClick={() => onChange(t.v)}
            style={{
              flex: 1,
              minWidth: 100,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '10px 14px',
              border: 'none',
              borderRadius: 10,
              background: isActive
                ? 'var(--surface, #fff)'
                : 'transparent',
              color: isActive ? txtColor : 'var(--text-muted, #6B7280)',
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all .15s',
              boxShadow: isActive ? '0 2px 6px rgba(15,23,42,.06)' : 'none',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-primary, rgb(20,20,43))'
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-muted, #6B7280)'
            }}
          >
            {t.icon && <span style={{ fontSize: 15 }}>{t.icon}</span>}
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
              <span>{t.label}</span>
              {t.sub && <span style={{ fontSize: 10, fontWeight: 400, color: isActive ? txtColor : '#9CA3AF', marginTop: 2, opacity: .85 }}>{t.sub}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
