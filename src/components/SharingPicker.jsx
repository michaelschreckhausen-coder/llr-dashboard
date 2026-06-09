// src/components/SharingPicker.jsx
// Gemeinsamer Sharing-Picker für Brand Voices, Zielgruppen, Wissensbasis.
//
// Drei Modi:
//   - private:   nur Owner sieht (is_shared=false, Junction leer)
//   - team:      alle Team-Member sehen (is_shared=true, Junction ignoriert)
//   - selective: nur ausgewählte Member (is_shared=false, Junction gefüllt)
//
// Resolution in DB beim Save:
//   private    → UPDATE is_shared=false, team_id=null  + DELETE alle shares
//   team       → UPDATE is_shared=true,  team_id=team.id + DELETE alle shares
//   selective  → UPDATE is_shared=false, team_id=team.id + INSERT/DELETE diff
//
// Usage:
//   <SharingPicker
//     entityType="brand_voice"       // oder 'target_audience' | 'knowledge_base'
//     entityId={v.id}
//     entityUserId={v.user_id}        // wer ist Owner (für Self-Filter)
//     initialIsShared={v.is_shared}
//     team={team}
//     members={members}
//     onSaved={({ is_shared, shareUserIds }) => updateRowLocally(...)}
//   />

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const P = 'var(--wl-primary, rgb(49,90,231))'

// Junction-Tabelle pro Entity-Typ
const SHARE_TABLE = {
  brand_voice:      { table: 'brand_voice_shares',     fk: 'brand_voice_id'     },
  target_audience:  { table: 'target_audience_shares', fk: 'target_audience_id' },
  knowledge_base:   { table: 'knowledge_base_shares',  fk: 'knowledge_base_id'  },
}

// Parent-Tabelle pro Entity-Typ (für UPDATE is_shared/team_id)
const PARENT_TABLE = {
  brand_voice:     'brand_voices',
  target_audience: 'target_audiences',
  knowledge_base:  'knowledge_base',
}

export default function SharingPicker({
  entityType, entityId, entityUserId,
  initialIsShared,
  team, members,
  onSaved,
  compact = false,
}) {
  const cfg = SHARE_TABLE[entityType]
  const parentTable = PARENT_TABLE[entityType]
  if (!cfg || !parentTable) {
    return <div style={{ fontSize:11, color:'#b91c1c' }}>SharingPicker: unbekannter entityType {entityType}</div>
  }

  // Mode + Selektion State
  const [mode, setMode] = useState('private')          // 'private' | 'team' | 'selective'
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Andere Team-Member (ohne Owner)
  const otherMembers = (members || []).filter(m => m.user_id !== entityUserId)

  // Aktuelle Shares laden + Mode bestimmen
  useEffect(() => {
    if (!entityId) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const { data: shares } = await supabase.from(cfg.table)
        .select('user_id').eq(cfg.fk, entityId)
      const sharedIds = (shares || []).map(s => s.user_id)
      setSelectedUserIds(sharedIds)
      // Mode entscheiden
      if (initialIsShared) setMode('team')
      else if (sharedIds.length > 0) setMode('selective')
      else setMode('private')
      setLoading(false)
    })()
  }, [entityId, initialIsShared])

  function toggleUser(uid) {
    setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }

  async function save() {
    if (!entityId) return
    setSaving(true)
    try {
      // 1. Parent updaten
      const parentPatch = mode === 'team'
        ? { is_shared: true,  team_id: team?.id || null }
        : mode === 'selective'
          ? { is_shared: false, team_id: team?.id || null }
          : { is_shared: false, team_id: null }
      const { error: upErr } = await supabase.from(parentTable).update(parentPatch).eq('id', entityId)
      if (upErr) throw upErr

      // 2. Shares-Junction sync
      // Erst alle bestehenden Shares lesen
      const { data: existing } = await supabase.from(cfg.table).select('user_id').eq(cfg.fk, entityId)
      const existingIds = (existing || []).map(s => s.user_id)

      const targetIds = mode === 'selective' ? selectedUserIds : []
      const toInsert = targetIds.filter(id => !existingIds.includes(id))
      const toDelete = existingIds.filter(id => !targetIds.includes(id))

      if (toDelete.length > 0) {
        const { error } = await supabase.from(cfg.table).delete()
          .eq(cfg.fk, entityId).in('user_id', toDelete)
        if (error) console.warn('[share-delete]', error)
      }
      if (toInsert.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        const rows = toInsert.map(uid => ({
          [cfg.fk]: entityId, user_id: uid, created_by: user?.id || null,
        }))
        const { error } = await supabase.from(cfg.table).insert(rows)
        if (error) console.warn('[share-insert]', error)
      }

      // Callback
      if (onSaved) onSaved({
        is_shared: parentPatch.is_shared,
        team_id: parentPatch.team_id,
        shareUserIds: targetIds,
        mode,
      })
    } catch (e) {
      alert('Fehler beim Speichern: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function memberLabel(m) {
    return m.profile?.full_name?.trim() || m.profile?.email || m.email || m.user_id?.slice(0, 8)
  }
  function memberAvatar(m) {
    return m.profile?.avatar_url || null
  }

  if (loading) return <div style={{ fontSize:12, color:'var(--text-muted)', padding:'10px 0' }}>Lade Sharing-Einstellungen…</div>

  // Kompakt-View (für Karten-Listen) — nur Status-Pill + Klick öffnet Detail-Modal
  if (compact) {
    const labelText = mode === 'team'
      ? `Team`
      : mode === 'selective'
        ? `${selectedUserIds.length}`
        : `Privat`
    return (
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{labelText}</span>
    )
  }

  // Voll-View: Radio-Buttons + Multi-Select bei selektiv + Save-Button
  return (
    <div style={{ padding:'14px 16px', background:'#F9FAFB', border:'1px solid var(--border)', borderRadius:10 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
        🔒 Sichtbarkeit
      </div>

      {/* Drei Radio-Optionen */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:10 }}>
        <OptionRow active={mode==='private'} onClick={() => setMode('private')}
          icon="🔒" title="Privat — nur du" subtitle="Niemand außer dir sieht diesen Eintrag" />
        {team && (
          <OptionRow active={mode==='team'} onClick={() => setMode('team')}
            icon="👥" title={`Mit ${team.name || 'Team'} teilen`}
            subtitle={`Alle ${(members||[]).length} Team-Mitglieder sehen diesen Eintrag`} />
        )}
        {team && otherMembers.length > 0 && (
          <OptionRow active={mode==='selective'} onClick={() => setMode('selective')}
            icon="🧑‍🤝‍🧑" title="Mit ausgewählten Mitgliedern teilen"
            subtitle="Du wählst gezielt aus, wer Zugriff hat" />
        )}
      </div>

      {/* Multi-Select wenn selektiv */}
      {mode === 'selective' && (
        <div style={{ marginTop:6, marginBottom:12, padding:'10px 12px', background:'#fff', border:'1px solid var(--border)', borderRadius:9 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
            Wer soll Zugriff haben?
          </div>
          {otherMembers.length === 0 && (
            <div style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic', padding:'8px 0' }}>
              Keine weiteren Team-Mitglieder vorhanden.
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {otherMembers.map(m => {
              const checked = selectedUserIds.includes(m.user_id)
              const avatar = memberAvatar(m)
              return (
                <label key={m.user_id}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 8px', borderRadius:7, cursor:'pointer', background: checked ? 'rgba(49,90,231,0.06)' : 'transparent' }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleUser(m.user_id)}
                    style={{ width:14, height:14, cursor:'pointer', accentColor: 'rgb(49,90,231)' }}/>
                  {avatar
                    ? <img src={avatar} alt="" style={{ width:24, height:24, borderRadius:'50%', objectFit:'cover' }}/>
                    : <div style={{ width:24, height:24, borderRadius:'50%', background:'#E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#6B7280' }}>{memberLabel(m).charAt(0).toUpperCase()}</div>}
                  <span style={{ fontSize:13, color:'var(--text-primary)' }}>{memberLabel(m)}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Save-Button */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
        <button onClick={save} disabled={saving || (mode === 'selective' && selectedUserIds.length === 0 && otherMembers.length > 0)}
          style={{ padding:'7px 16px', borderRadius:8, border:'none', background: saving ? '#94A3B8' : P, color:'#fff', fontSize:12, fontWeight:700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Speichere…' : 'Sichtbarkeit übernehmen'}
        </button>
      </div>
    </div>
  )
}

function OptionRow({ active, onClick, icon, title, subtitle }) {
  return (
    <button onClick={onClick}
      style={{
        display:'flex', alignItems:'flex-start', gap:10,
        padding:'10px 12px', borderRadius:9, cursor:'pointer',
        background: active ? 'rgba(49,90,231,0.06)' : '#fff',
        border: '1.5px solid ' + (active ? 'rgb(49,90,231)' : 'var(--border)'),
        textAlign:'left', fontFamily:'inherit',
      }}>
      <div style={{ fontSize:18, lineHeight:1, marginTop:2 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color: active ? 'rgb(49,90,231)' : 'var(--text-primary)' }}>
          {title}
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, lineHeight:1.5 }}>
          {subtitle}
        </div>
      </div>
      <div style={{
        width:18, height:18, borderRadius:'50%', flexShrink:0,
        border: '2px solid ' + (active ? 'rgb(49,90,231)' : 'var(--border)'),
        background: active ? 'rgb(49,90,231)' : '#fff',
        display:'flex', alignItems:'center', justifyContent:'center',
        marginTop:2,
      }}>
        {active && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
      </div>
    </button>
  )
}
