// src/components/BrainButton.jsx
// Premium "KI-Modell"-Selector mit eigenem Dropdown (kein Wrapper-Dialog).
// Klick → direkt Liste aller Modelle als hübsches Menü.

import React, { useEffect, useRef, useState } from 'react'
import { Bot, Sparkles, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDefaultModel } from './ModelSelector'

export { useDefaultModel }

const P = 'var(--wl-primary, rgb(49,90,231))'

const MODELS = [
  { group: 'Anthropic', icon: <Bot size={16} strokeWidth={1.75}/>, color: '#D97757', models: [
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', badge: 'Top' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  ]},
  { group: 'OpenAI', icon: <Star size={16} strokeWidth={1.75}/>, color: '#10A37F', models: [
    // gpt-5.5 entfernt 2026-05-28 — Modell existiert nicht in OpenAI-API
    { id: 'gpt-5.4', name: 'GPT-5.4', badge: 'Top' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
  ]},
  { group: 'Google Gemini', icon: '✦', color: '#4285F4', models: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ]},
  { group: 'Mistral', icon: '🌬', color: '#FF7A00', models: [
    { id: 'mistral-large-latest', name: 'Mistral Large', badge: 'Top' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium' },
    { id: 'mistral-small-latest', name: 'Mistral Small' },
  ]},
]

function getModelInfo(modelId) {
  for (const g of MODELS) {
    const m = g.models.find(m => m.id === modelId)
    if (m) return { ...m, group: g.group, icon: g.icon, color: g.color }
  }
  return { name: modelId, icon: <Bot size={16} strokeWidth={1.75}/>, color: '#6B7280', group: '' }
}

export default function BrainButton({ model, onChange, eyebrow = 'Schreibt mit', disabled = false, size = 'normal' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null) // { top, left, dropUp, dropLeft }
  const ref = useRef(null)
  const info = getModelInfo(model)

  useEffect(() => {
    if (!open) return
    // Position berechnen — position:fixed damit kein Vorfahren-overflow:hidden clippt.
    function recompute() {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const dropdownHeight = 440
      const dropdownWidth  = 280
      const gap = 8

      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const dropUp = spaceBelow < dropdownHeight + gap && spaceAbove > spaceBelow

      const spaceRight = window.innerWidth - rect.left
      const spaceLeft  = rect.right
      const dropLeft = spaceLeft < dropdownWidth && spaceRight > spaceLeft

      const top  = dropUp ? null : Math.round(rect.bottom + gap)
      const bot  = dropUp ? Math.round(window.innerHeight - rect.top + gap) : null
      const left = dropLeft ? Math.round(rect.left) : null
      const right= dropLeft ? null : Math.round(window.innerWidth - rect.right)

      setCoords({ top, bottom: bot, left, right, dropUp, dropLeft })
    }
    recompute()
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => { if (disabled) return; setOpen(o => !o) }}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: size === 'small' ? 9 : 12,
          padding: size === 'small' ? '7px 12px 7px 8px' : '10px 16px 10px 12px',
          background: open ? 'rgba(49,90,231,0.06)' : 'var(--surface,#fff)',
          border: '1px solid ' + (open ? 'rgba(49,90,231,.45)' : 'var(--border,#E5E7EB)'),
          borderRadius: size === 'small' ? 11 : 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: 'none',
          fontFamily: 'inherit',
          transition: 'all .15s',
          opacity: disabled ? .55 : 1,
        }}
        onMouseEnter={e => { if (open) return; e.currentTarget.style.background = '#F4F6FA' }}
        onMouseLeave={e => { if (open) return; e.currentTarget.style.background = 'var(--surface,#fff)' }}
      >
        <div style={{
          width: size === 'small' ? 26 : 36, height: size === 'small' ? 26 : 36, borderRadius: size === 'small' ? 8 : 11,
          background: 'rgba(49,90,231,0.10)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: P,
          boxShadow: 'none',
        }}>
          <Sparkles size={size === 'small' ? 14 : 18} strokeWidth={1.75}/>
        </div>
        <div style={{ textAlign: 'left' }}>
          {size !== 'small' && <div style={{ fontSize: 10.5, color: '#6B7280', lineHeight: 1, marginBottom: 3, letterSpacing: '.02em' }}>{eyebrow}</div>}
          <div style={{ fontSize: size === 'small' ? 12.5 : 13.5, fontWeight: 700, color: 'var(--text-primary, #1d2939)', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {info.name}
            <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 2 }}>{open ? '▴' : '▾'}</span>
          </div>
        </div>
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          ...(coords?.top != null ? { top: coords.top } : {}),
          ...(coords?.bottom != null ? { bottom: coords.bottom } : {}),
          ...(coords?.left != null ? { left: coords.left } : {}),
          ...(coords?.right != null ? { right: coords.right } : {}),
          background: '#fff',
          border: '1px solid var(--border, #E5E7EB)',
          borderRadius: 14,
          padding: 6,
          boxShadow: coords?.dropUp
            ? '0 -12px 32px rgba(15,23,42,.16), 0 -4px 12px rgba(15,23,42,.06)'
            : '0 12px 32px rgba(15,23,42,.16), 0 4px 12px rgba(15,23,42,.06)',
          zIndex: 100,
          minWidth: 280,
          maxHeight: 440,
          overflowY: 'auto',
        }}>
          {MODELS.map(group => (
            <div key={group.group} style={{ marginBottom: 4 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px 6px',
                fontSize: 10,
                fontWeight: 700,
                color: group.color,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}>
                <span style={{ fontSize: 13 }}>{group.icon}</span>
                <span>{group.group}</span>
              </div>
              {group.models.map(m => {
                const isActive = m.id === model
                return (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false); try { supabase.from('profiles').update({ default_ai_model: m.id }).eq('id', (supabase.auth?.user?.()?.id || '')); } catch(e){} }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 12px',
                      background: isActive ? 'rgba(49,90,231,.08)' : 'transparent',
                      border: 'none',
                      borderRadius: 9,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F9FAFB' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: isActive ? P : '#E5E7EB',
                      flexShrink: 0,
                    }}/>
                    <span style={{
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? P : 'var(--text-primary, rgb(20,20,43))',
                      flex: 1,
                    }}>{m.name}</span>
                    {m.badge && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'rgba(245,158,11,.15)',
                        color: '#92400E',
                        letterSpacing: '.05em',
                      }}>{m.badge}</span>
                    )}
                    {isActive && (
                      <span style={{ fontSize: 12, color: P, marginLeft: 2 }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
