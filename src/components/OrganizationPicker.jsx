// src/components/OrganizationPicker.jsx
// Autocomplete-Picker für Organisationen — verwendbar in Lead-Formular und DealModal.
// Zeigt Liste existierender Orgas + Option "Neu anlegen".
// Ausschließlich Inline-Styles. Liefert per onChange(orgId|null, orgName|null).

import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

export default function OrganizationPicker({ value, valueName, onChange, placeholder, disabled }) {
  // value     = organization_id (uuid oder null)
  // valueName = Anzeigename, falls value noch nicht gesetzt ist (z.B. für initial-Text aus leads.company)
  const { activeTeamId } = useTeam()
  const [query,   setQuery]   = useState('')
  const [display, setDisplay] = useState('')
  const [options, setOptions] = useState([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating,setCreating]= useState(false)
  const boxRef = useRef(null)

  // Initial: wenn eine ID da ist, Name aus DB holen — sonst valueName als Anzeige
  useEffect(() => {
    let cancelled = false
    async function loadSelected() {
      if (!value) { setDisplay(valueName || ''); return }
      const { data } = await supabase.from('organizations').select('id,name').eq('id', value).maybeSingle()
      if (!cancelled && data) setDisplay(data.name)
    }
    loadSelected()
    return () => { cancelled = true }
  }, [value, valueName])

  // Suche beim Tippen
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      let q = supabase.from('organizations').select('id,name,city,industry_slug').order('name').limit(20)
      if (activeTeamId) q = q.eq('team_id', activeTeamId)
      if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
      const { data } = await q
      if (!cancelled) setOptions(data || [])
      setLoading(false)
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, open, activeTeamId])

  // Klick außerhalb → schließen
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function selectOrg(o) {
    setDisplay(o.name)
    setQuery('')
    setOpen(false)
    onChange?.(o.id, o.name)
  }

  async function clearOrg() {
    setDisplay('')
    setQuery('')
    onChange?.(null, null)
  }

  async function createNew(name) {
    if (!name?.trim()) return
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        name: name.trim(),
        user_id: activeTeamId ? null : user?.id,
        team_id: activeTeamId || null,
        created_by: user?.id,
      }
      const { data, error } = await supabase.from('organizations').insert(payload).select('id,name').single()
      if (error) { alert('Anlegen fehlgeschlagen: ' + error.message); return }
      setDisplay(data.name)
      setQuery('')
      setOpen(false)
      onChange?.(data.id, data.name)
    } finally { setCreating(false) }
  }

  const showCreateOption = query.trim() && !options.some(o => o.name.toLowerCase() === query.trim().toLowerCase())

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={open ? query : display}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder={placeholder || 'Firma suchen oder neu anlegen…'}
          style={{
            flex: 1, padding: '8px 12px',
            border: '1.5px solid #E4E7EC', borderRadius: 10,
            fontSize: 13, outline: 'none', background: 'var(--surface)',
            color: 'var(--text-primary, #111827)',
          }}
        />
        {display && !disabled && (
          <button type="button" onClick={clearOrg}
            style={{ padding: '6px 10px', border: '1px solid #E4E7EC', background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>
            ×
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 500, maxHeight: 280, overflowY: 'auto',
        }}>
          {loading && <div style={{ padding: 12, fontSize: 12, color: '#9CA3AF' }}>Suche…</div>}
          {!loading && options.length === 0 && !showCreateOption && (
            <div style={{ padding: 12, fontSize: 12, color: '#9CA3AF' }}>Keine Treffer</div>
          )}
          {options.map(o => (
            <button key={o.id} type="button" onClick={() => selectOrg(o)}
              style={{ display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', borderBottom: '1px solid #F3F4F6',
                background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#111827' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 600 }}>🏢 {o.name}</div>
              {o.city && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{o.city}</div>}
            </button>
          ))}
          {showCreateOption && (
            <button type="button" onClick={() => createNew(query)}
              disabled={creating}
              style={{ display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', border: 'none', borderTop: options.length > 0 ? '1px solid #F3F4F6' : 'none',
                background: 'rgba(49,90,231,0.04)', cursor: 'pointer', fontSize: 13,
                color: PRIMARY, fontWeight: 700 }}>
              {creating ? '⏳ Wird angelegt…' : `+ "${query.trim()}" als neue Organisation anlegen`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
