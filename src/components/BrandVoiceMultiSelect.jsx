// src/components/BrandVoiceMultiSelect.jsx
// Multi-Select fuer Auftritte — verwendet in ZG- und KB-Editor.
// Speichert M:N-Verknuepfung in target_audience_brand_voices /
// knowledge_base_brand_voices.

import React, { useState, useEffect } from 'react'
import { User, Building2, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useTeam } from '../context/TeamContext'

const ACCOUNT_ICONS = { personal: <User size={14} strokeWidth={1.75}/>, company_page: <Building2 size={14} strokeWidth={1.75}/>, other: <Sparkles size={14} strokeWidth={1.75}/> }

/**
 * @param {string} entityType - 'target_audience' | 'knowledge_base'
 * @param {string|null} entityId - id der ZG / KB-Entry (null = noch nicht gespeichert)
 * @param {function} onSelectionChange - (selectedBvIds[]) für die Save-Logik
 */
export default function BrandVoiceMultiSelect({ entityType, entityId, onSelectionChange }) {
  const { brandVoices } = useBrandVoice()
  const { activeTeamId } = useTeam()
  const [selected, setSelected] = useState(new Set())
  const [loaded, setLoaded] = useState(false)

  const tableMap = {
    target_audience: { table: 'target_audience_brand_voices', fkCol: 'target_audience_id' },
    knowledge_base:  { table: 'knowledge_base_brand_voices',  fkCol: 'knowledge_base_id' },
  }
  const cfg = tableMap[entityType]

  // Laden der existing M:N-Zuordnungen
  useEffect(() => {
    if (!entityId || !cfg) { setLoaded(true); return }
    supabase.from(cfg.table)
      .select('brand_voice_id')
      .eq(cfg.fkCol, entityId)
      .then(({ data }) => {
        setSelected(new Set((data || []).map(r => r.brand_voice_id)))
        setLoaded(true)
      })
  }, [entityId])

  function toggle(bvId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(bvId)) next.delete(bvId); else next.add(bvId)
      if (onSelectionChange) onSelectionChange(Array.from(next))
      return next
    })
  }

  // Helper: speichert die M:N-Beziehung (von Parent-Component aufrufbar)
  // siehe persistSelection() unten.

  if (!brandVoices.length) {
    return (
      <div style={{ padding:'12px 14px', background:'#F8FAFC', borderRadius:10, border:'1px dashed var(--border)', fontSize:12, color:'var(--text-muted)' }}>
        Noch keine Auftritte angelegt — leg in Brand Voice einen Auftritt an, um diese Zielgruppe einem Auftritt zuzuordnen.
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
      {brandVoices.map(bv => {
        const sel = selected.has(bv.id)
        const icon = ACCOUNT_ICONS[bv.account_type] || '✨'
        return (
          <button key={bv.id} type="button"
            onClick={() => toggle(bv.id)}
            style={{
              padding:'7px 13px', borderRadius:99,
              border: '1.5px solid ' + (sel ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--border)'),
              background: sel ? 'rgba(49,90,231,0.08)' : 'var(--surface)',
              color: sel ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--text-muted)',
              fontSize: 12, fontWeight: sel ? 700 : 600,
              cursor: 'pointer', display:'inline-flex', alignItems:'center', gap:6,
              transition: 'all .12s',
            }}>
            <span>{icon}</span>
            <span>{bv.name}</span>
            {sel && <span style={{ marginLeft:2 }}>✓</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Helper-Funktion zum Persistieren der M:N-Zuordnungen.
 * Aufgerufen vom Parent nach dem Save der eigentlichen Entity (target_audience / knowledge_base).
 */
export async function persistBrandVoiceLinks({ entityType, entityId, teamId, selectedBvIds = [] }) {
  if (!entityId || !teamId) return
  const tableMap = {
    target_audience: { table: 'target_audience_brand_voices', fkCol: 'target_audience_id' },
    knowledge_base:  { table: 'knowledge_base_brand_voices',  fkCol: 'knowledge_base_id' },
  }
  const cfg = tableMap[entityType]
  if (!cfg) return

  // Alle existierenden Links der Entity loeschen
  await supabase.from(cfg.table).delete().eq(cfg.fkCol, entityId)

  // Neue Links einfuegen
  if (selectedBvIds.length > 0) {
    const rows = selectedBvIds.map(bvId => ({
      [cfg.fkCol]: entityId,
      brand_voice_id: bvId,
      team_id: teamId,
    }))
    await supabase.from(cfg.table).insert(rows)
  }
}
