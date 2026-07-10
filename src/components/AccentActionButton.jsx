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
    <button className="lk-btn lk-btn-primary"
      onClick={onClick}
      disabled={disabled || loading}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, fontFamily: 'inherit', opacity: disabled ? .5 : 1, ...style }}
      
      
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
