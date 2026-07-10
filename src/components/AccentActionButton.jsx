// src/components/AccentActionButton.jsx
// Premium voll-breiter "Akzent"-Action-Button mit Dashed-Border und Icon-Avatar.
// Für Haupt-Aktionen am generierten Content (KI-Nachbessern, KI-Generieren etc.).
//
// Verwendung:
//   <AccentActionButton icon="✎" label="Text mit KI verbessern" onClick={...} />

import React from 'react'

const P = 'var(--wl-primary, #0A6FB0)'

export default function AccentActionButton({
  icon = '✎',
  label,
  sublabel,
  onClick,
  disabled,
  loading,
  active,
  variant = 'dashed',  // 'dashed' (subtler, mehr "Slot zum andocken") oder 'filled'
  style = {},
}) {
  const isDashed = variant === 'dashed'
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%',
        padding: '13px 16px',
        background: active
          ? `linear-gradient(135deg, ${P} 0%, #003060 100%)`
          : isDashed
            ? 'linear-gradient(135deg, rgba(10,111,176,.06) 0%, rgba(0,48,96,.04) 100%)'
            : 'linear-gradient(135deg, rgba(10,111,176,.10) 0%, rgba(0,48,96,.08) 100%)',
        border: active
          ? '1.5px solid transparent'
          : isDashed
            ? '1.5px dashed rgba(10,111,176,.40)'
            : '1.5px solid rgba(10,111,176,.30)',
        borderRadius: 12,
        color: active ? '#fff' : P,
        fontWeight: 700,
        fontSize: 13.5,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 11,
        fontFamily: 'inherit',
        transition: 'all .15s',
        opacity: disabled ? .5 : 1,
        boxShadow: active ? '0 4px 14px rgba(10,111,176,.25)' : 'none',
        ...style,
      }}
      onMouseEnter={e => {
        if (disabled || loading || active) return
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(10,111,176,.12) 0%, rgba(0,48,96,.10) 100%)'
        e.currentTarget.style.borderColor = 'rgba(10,111,176,.55)'
      }}
      onMouseLeave={e => {
        if (disabled || loading || active) return
        e.currentTarget.style.background = isDashed
          ? 'linear-gradient(135deg, rgba(10,111,176,.06) 0%, rgba(0,48,96,.04) 100%)'
          : 'linear-gradient(135deg, rgba(10,111,176,.10) 0%, rgba(0,48,96,.08) 100%)'
        e.currentTarget.style.borderColor = isDashed ? 'rgba(10,111,176,.40)' : 'rgba(10,111,176,.30)'
      }}
    >
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: active ? 'rgba(255,255,255,.20)' : P,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        flexShrink: 0,
      }}>
        {loading ? '⏳' : icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
        <span style={{ lineHeight: 1.2 }}>{loading ? 'KI arbeitet…' : label}</span>
        {sublabel && (
          <span style={{ fontSize: 11, fontWeight: 400, color: active ? 'rgba(255,255,255,.85)' : '#6B7280', marginTop: 2 }}>
            {sublabel}
          </span>
        )}
      </div>
    </button>
  )
}
