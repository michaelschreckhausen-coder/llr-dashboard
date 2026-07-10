import React, { useEffect, useRef, useState } from 'react'
import { Bot, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MODELS = [
  { group: 'Anthropic', label: 'Anthropic', icon: <Bot size={16} strokeWidth={1.75}/>, models: [
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', badge: 'Top' },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  ]},
  { group: 'OpenAI', label: 'OpenAI', icon: <Star size={16} strokeWidth={1.75}/>, models: [
    { id: 'gpt-5.5', name: 'GPT-5.5', badge: 'Top' },
    { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
  ]},
  { group: 'Google', label: 'Google Gemini', icon: '✦', models: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', badge: 'Top' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
  ]},
  { group: 'Mistral', label: 'Mistral', icon: '🌬', models: [
    { id: 'mistral-large-latest', name: 'Mistral Large 3', badge: 'Top' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium 3.5' },
    { id: 'magistral-medium-latest', name: 'Magistral Medium (Reasoning)' },
    { id: 'mistral-small-latest', name: 'Mistral Small' },
  ]},
]

export const DEFAULT_MODEL = 'claude-opus-4-8'

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
  const [dropUp, setDropUp] = useState(false)
  const btnRef = useRef(null)
  const curr = MODELS.flatMap(g => g.models).find(m => m.id === model) || { name: model, id: model }
  const icon = getModelIcon(model || '')
  const p = size === 'small'
               ? { pad: '4px 10px', fs: 12, gap: 6 }
               : { pad: '8px 14px', fs: 13, gap: 8 }

  function handleOpen() {
    if (disabled) return
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setDropUp(spaceBelow < 280)
    }
    setOpen(v => !v)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="lk-btn lk-btn-ghost"
        ref={btnRef}
        onClick={handleOpen}
        style={{ display: 'flex', alignItems: 'center', gap: p.gap, opacity: disabled ? 0.6 : 1 }}
      >
        <span>{icon}</span>
        <span>{curr.name}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        />
      )}

      {open && (
        <div style={{
          position: 'absolute',
          ...(dropUp
            ? { bottom: 'calc(100% + 6px)', top: 'auto' }
            : { top: 'calc(100% + 6px)', bottom: 'auto' }
          ),
          left: 0, zIndex: 1000,
          borderRadius: 10, border: '1.5px solid var(--border, #dde3ea)',
          background: 'var(--surface, #fff)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          minWidth: 220, maxWidth: 260,
          maxHeight: 280, overflowY: 'auto',
          padding: 6,
        }}>
          {MODELS.map(g => (
            <div key={g.group}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888', padding: '6px 8px 2px', letterSpacing: '0.05em', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface, #fff)' }}>
                {g.icon} {g.label}
              </div>
              {g.models.map(m => (
                <button className="lk-btn lk-btn-primary" key={m.id} onClick={() => { onChange(m.id); setOpen(false) }}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
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
