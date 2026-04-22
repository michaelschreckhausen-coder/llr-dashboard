import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const MODELS = [
  { group: 'Anthropic', label: 'Anthropic', icon: '🤖', models: [
    { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6', badge: 'Neuest' },
    { id: 'claude-sonnet-4-5-20250929',name: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4-20250514',   name: 'Claude Sonnet 4'   },
  ]},
  { group: 'OpenAI', label: 'OpenAI', icon: '⭐', models: [
    { id: 'gpt-5.4',      name: 'GPT-5.4',      badge: 'Neuest' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
  ]},
  { group: 'Google', label: 'Google Gemini', icon: '✦', models: [
    { id: 'gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   badge: 'Neuest' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ]},
  { group: 'Mistral', label: 'Mistral', icon: '🌬', models: [
    { id: 'mistral-large-latest', name: 'Mistral Large', badge: 'Neuest' },
    { id: 'mistral-small-latest', name: 'Mistral Small' },
  ]},
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export function getModelLabel(modelId) {
  for (const g of MODELS) {
    const f = g.models.find(m => m.id === modelId)
    if (f) return f.name
  }
  return modelId
}

export function getModelIcon(modelId) {
  if (modelId.startsWith('claude'))  return '🤖'
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) return '⭐'
  if (modelId.startsWith('gemini')) return '✦'
  return '🌬'
}

// Hook: lädt das Standardmodell des Users
export function useDefaultModel(session) {
  const [model, setModel] = useState(DEFAULT_MODEL)
  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('profiles').select('default_ai_model').eq('id', session.user.id).single()
      .then(({data}) => { if (data?.default_ai_model) setModel(data.default_ai_model) })
  }, [session?.user?.id])
  return [model, setModel]
}

export default function ModelSelector({ model, onChange, disabled = false, size = 'normal' }) {
  const [open, setOpen] = useState(false)
  const curr = MODELS.flatMap(g => g.models).find(m => m.id === model) || { name: model, id: model }
  const icon = getModelIcon(model || '')
  const p = size === 'small'
               ? { pad: '4px 10px', fs: 12, gap: 6 }
               : { pad: '8px 14px', fs: 13, gap: 8 }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => !disabled && setOpen(v => !v)}
        style={{
          padding: p.pad, borderRadius: 8, border: '1.5px solid var(--border, #dde3ea)',
          background: 'var(--surface, #fff)', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: p.gap, fontSize: p.fs,
          color: 'var(--text-primary, #333)', opacity: disabled ? 0.6 : 1,
          fontWeight: 500,
        }}
      >
        <span>{icon}</span>
        <span>{curr.name}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        />
      )}

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 1000,
          borderRadius: 10, border: '1.5px solid var(--border, #dde3ea)',
          background: 'var(--surface, #fff)', boxShadow: '0 8px 16px rgba(0,0,0,0.09)',
          minWidth: 220, padding: 6,
        }}>
          {MODELS.map(g => (
            <div key={g.group}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888', padding: '6px 8px 2px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {g.icon} {g.label}
              </div>
              {g.models.map(m => (
                <button key={m.id} onClick={() => { onChange(m.id); setOpen(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '7px 12px',
                    borderRadius: 7, border: 'none',
                    background: m.id === model ? 'var(--wl-primary-soft, rgba(49,90,231,0.08))' : 'none',
                    color: m.id === model ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--text-primary, #333)',
                    fontWeight: m.id === model ? 600 : 400,
                    fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span>{m.name}</span>
                  {m.badge && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: '#22c55e20', color: '#16a34a', fontWeight: 700 }}>{m.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
