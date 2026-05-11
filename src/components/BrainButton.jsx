// src/components/BrainButton.jsx
// Premium "KI-Modell"-Selector — sieht aus wie eine bewusste Designentscheidung
// statt ein unscheinbarer Chip.
//
// Verwendung:
//   <BrainButton selectedModel={m} onChange={setM} />
//
// Intern: nutzt den existing ModelSelector — wir wrappen ihn nur visuell.

import React from 'react'
import ModelSelector, { getModelLabel } from './ModelSelector'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function BrainButton({ model, onChange, session, eyebrow = 'Schreibt mit' }) {
  const [open, setOpen] = React.useState(false)
  const label = getModelLabel ? getModelLabel(model) : model
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px 10px 12px',
          background: 'linear-gradient(135deg, rgba(49,90,231,.08) 0%, rgba(124,58,237,.06) 100%)',
          border: '1.5px solid rgba(49,90,231,.25)',
          borderRadius: 14,
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(49,90,231,.08)',
          fontFamily: 'inherit',
          transition: 'all .15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(49,90,231,.16)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = '0 2px 10px rgba(49,90,231,.08)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 11,
          background: 'linear-gradient(135deg, rgb(49,90,231) 0%, #7C3AED 100%)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18,
          boxShadow: '0 2px 6px rgba(49,90,231,.30)',
        }}>
          🧠
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 10.5, color: '#6B7280', lineHeight: 1, marginBottom: 3, letterSpacing: '.02em' }}>{eyebrow}</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: P, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {label || 'Modell wählen'}
            <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 2 }}>{open ? '▴' : '▾'}</span>
          </div>
        </div>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          background: '#fff',
          border: '1px solid var(--border, #E5E7EB)',
          borderRadius: 12,
          padding: 8,
          boxShadow: '0 8px 24px rgba(15,23,42,.12)',
          zIndex: 50,
          minWidth: 260,
        }}>
          <div style={{ fontSize: 11, color: '#6B7280', padding: '4px 10px 8px', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>
            KI-Modell wählen
          </div>
          <ModelSelector
            model={model}
            onChange={(m) => { onChange(m); setOpen(false) }}
            size="small"
          />
        </div>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 49,
            background: 'transparent',
          }}
        />
      )}
    </div>
  )
}
