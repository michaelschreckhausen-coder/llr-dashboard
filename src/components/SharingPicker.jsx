// src/components/SharingPicker.jsx
// Gemeinsamer Sharing-Picker für Brand Voices, Zielgruppen, Wissensbasis.
//
// Zwei Ebenen:
//  A) Sichtbarkeit IM eigenen (Heimat-)Team: privat / ganzes Team / ausgewählte Mitglieder
//  B) Mit ANDEREN Teams teilen (nur Teams in denen man selbst Mitglied ist).
//     Das empfangende Team kann den Eintrag + angehängte Inhalte sehen UND bearbeiten.
//     Persistiert in <entity>_team_shares.
//
// Usage:
//   <SharingPicker entityType="brand_voice" entityId={v.id} entityUserId={v.user_id}
//     initialIsShared={v.is_shared} team={team} members={members}
//     onSaved={({ is_shared, team_id, shareUserIds, teamShareIds }) => ...} />

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { Eye, Lock, Users, UserPlus, Building2 } from 'lucide-react'

const P = 'var(--wl-primary, #0A6FB0)'

// Pro-Person-Junction
const SHARE_TABLE = {
  brand_voice:      { table: 'brand_voice_shares',     fk: 'brand_voice_id'     },
  target_audience:  { table: 'target_audience_shares', fk: 'target_audience_id' },
  knowledge_base:   { table: 'knowledge_base_shares',  fk: 'knowledge_base_id'  },
}
// Pro-Team-Junction (Cross-Team-Sharing)
const TEAM_SHARE_TABLE = {
  brand_voice:      { table: 'brand_voice_team_shares',     fk: 'brand_voice_id'     },
  target_audience:  { table: 'target_audience_team_shares', fk: 'target_audience_id' },
  knowledge_base:   { table: 'knowledge_base_team_shares',  fk: 'knowledge_base_id'  },
}
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
  const teamCfg = TEAM_SHARE_TABLE[entityType]
  const parentTable = PARENT_TABLE[entityType]
  const { allTeams } = useTeam() || {}
  if (!cfg || !parentTable) {
    return <div style={{ fontSize:11, color:'#b91c1c' }}>SharingPicker: unbekannter entityType {entityType}</div>
  }

  const [mode, setMode] = useState('private')          // 'private' | 'team' | 'selective'
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [selectedTeamIds, setSelectedTeamIds] = useState([])   // Cross-Team-Shares
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const otherMembers = (members || []).filter(m => m.user_id !== entityUserId)
  // andere Teams = alle Teams des Users außer dem Heimat-/aktiven Team
  const otherTeams = (allTeams || []).filter(t => t.id !== (team?.id))

  useEffect(() => {
    if (!entityId) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const [{ data: shares }, { data: teamShares }] = await Promise.all([
        supabase.from(cfg.table).select('user_id').eq(cfg.fk, entityId),
        supabase.from(teamCfg.table).select('team_id').eq(teamCfg.fk, entityId),
      ])
      const sharedIds = (shares || []).map(s => s.user_id)
      setSelectedUserIds(sharedIds)
      setSelectedTeamIds((teamShares || []).map(s => s.team_id))
      if (initialIsShared) setMode('team')
      else if (sharedIds.length > 0) setMode('selective')
      else setMode('private')
      setLoading(false)
    })()
  }, [entityId, initialIsShared])

  function toggleUser(uid) {
    setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }
  function toggleTeam(tid) {
    setSelectedTeamIds(prev => prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid])
  }

  async function save() {
    if (!entityId) return
    setSaving(true)
    try {
      const parentPatch = mode === 'team'
        ? { is_shared: true,  team_id: team?.id || null }
        : mode === 'selective'
          ? { is_shared: false, team_id: team?.id || null }
          : { is_shared: false, team_id: null }
      // Heimat-Team niemals auf null setzen wenn es schon ein Team gibt (NOT NULL!)
      if (parentPatch.team_id == null && team?.id) parentPatch.team_id = team.id
      const { error: upErr } = await supabase.from(parentTable).update(parentPatch).eq('id', entityId)
      if (upErr) throw upErr

      // Pro-Person-Shares sync
      const { data: existing } = await supabase.from(cfg.table).select('user_id').eq(cfg.fk, entityId)
      const existingIds = (existing || []).map(s => s.user_id)
      const targetIds = mode === 'selective' ? selectedUserIds : []
      const toInsert = targetIds.filter(id => !existingIds.includes(id))
      const toDelete = existingIds.filter(id => !targetIds.includes(id))
      const { data: { user } } = await supabase.auth.getUser()
      if (toDelete.length > 0) {
        const { error } = await supabase.from(cfg.table).delete().eq(cfg.fk, entityId).in('user_id', toDelete)
        if (error) console.warn('[share-delete]', error)
      }
      if (toInsert.length > 0) {
        const rows = toInsert.map(uid => ({ [cfg.fk]: entityId, user_id: uid, created_by: user?.id || null }))
        const { error } = await supabase.from(cfg.table).insert(rows)
        if (error) console.warn('[share-insert]', error)
      }

      // Cross-Team-Shares sync
      const { data: existingTeam } = await supabase.from(teamCfg.table).select('team_id').eq(teamCfg.fk, entityId)
      const existingTeamIds = (existingTeam || []).map(s => s.team_id)
      const teamToInsert = selectedTeamIds.filter(id => !existingTeamIds.includes(id))
      const teamToDelete = existingTeamIds.filter(id => !selectedTeamIds.includes(id))
      if (teamToDelete.length > 0) {
        const { error } = await supabase.from(teamCfg.table).delete().eq(teamCfg.fk, entityId).in('team_id', teamToDelete)
        if (error) console.warn('[team-share-delete]', error)
      }
      if (teamToInsert.length > 0) {
        const rows = teamToInsert.map(tid => ({ [teamCfg.fk]: entityId, team_id: tid, shared_by: user?.id || null }))
        const { error } = await supabase.from(teamCfg.table).insert(rows)
        if (error) console.warn('[team-share-insert]', error)
      }

      if (onSaved) onSaved({
        is_shared: parentPatch.is_shared,
        team_id: parentPatch.team_id,
        shareUserIds: targetIds,
        teamShareIds: selectedTeamIds,
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
  function memberAvatar(m) { return m.profile?.avatar_url || null }

  if (loading) return <div style={{ fontSize:12, color:'var(--text-muted)', padding:'10px 0' }}>Lade Sharing-Einstellungen…</div>

  if (compact) {
    const labelText = mode === 'team' ? 'Team' : mode === 'selective' ? `${selectedUserIds.length}` : 'Privat'
    const teamSuffix = selectedTeamIds.length > 0 ? ` +${selectedTeamIds.length} Team(s)` : ''
    return <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{labelText}{teamSuffix}</span>
  }

  return (
    <div style={{ padding:'14px 16px', background:'#F9FAFB', border:'1px solid var(--border)', borderRadius:10 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:6 }}>
        <Eye size={13} strokeWidth={1.75}/>Sichtbarkeit
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:10 }}>
        <OptionRow active={mode==='private'} onClick={() => setMode('private')}
          icon={<Lock size={17} strokeWidth={1.75}/>} title="Privat — nur du" subtitle="Niemand außer dir sieht diesen Eintrag" />
        {team && (
          <OptionRow active={mode==='team'} onClick={() => setMode('team')}
            icon={<Users size={17} strokeWidth={1.75}/>} title={`Mit ${team.name || 'Team'} teilen`}
            subtitle={`Alle ${(members||[]).length} Team-Mitglieder sehen diesen Eintrag`} />
        )}
        {team && otherMembers.length > 0 && (
          <OptionRow active={mode==='selective'} onClick={() => setMode('selective')}
            icon={<UserPlus size={17} strokeWidth={1.75}/>} title="Mit ausgewählten Mitgliedern teilen"
            subtitle="Du wählst gezielt aus, wer Zugriff hat" />
        )}
      </div>

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
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 8px', borderRadius:7, cursor:'pointer', background: checked ? 'rgba(10,111,176,0.06)' : 'transparent' }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--tint-cyan, #EAF8FE)' }}
                  onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleUser(m.user_id)}
                    style={{ width:14, height:14, cursor:'pointer', accentColor: P }}/>
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

      {/* ── Cross-Team-Sharing ───────────────────────────────────── */}
      {otherTeams.length > 0 && (
        <div style={{ marginTop:6, marginBottom:12, padding:'10px 12px', background:'#fff', border:'1px solid var(--border)', borderRadius:9 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
            <Building2 size={13} strokeWidth={1.75}/>Auch mit anderen Teams teilen
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, lineHeight:1.5 }}>
            Ausgewählte Teams können diesen Eintrag samt zugehöriger Inhalte (Beiträge, Visuals, Chats) sehen und bearbeiten.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {otherTeams.map(t => {
              const checked = selectedTeamIds.includes(t.id)
              return (
                <label key={t.id}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 8px', borderRadius:7, cursor:'pointer', background: checked ? 'rgba(10,111,176,0.06)' : 'transparent' }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--tint-cyan, #EAF8FE)' }}
                  onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleTeam(t.id)}
                    style={{ width:14, height:14, cursor:'pointer', accentColor: P }}/>
                  <div style={{ width:24, height:24, borderRadius:7, background:'#EAF6FC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color: P }}>{(t.name||'T').charAt(0).toUpperCase()}</div>
                  <span style={{ fontSize:13, color:'var(--text-primary)' }}>{t.name || t.id.slice(0,8)}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
        <button className="lk-btn lk-btn-primary" onClick={save} disabled={saving || (mode === 'selective' && selectedUserIds.length === 0 && otherMembers.length > 0)}
          >
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
        background: active ? 'rgba(10,111,176,0.06)' : '#fff',
        border: '1.5px solid ' + (active ? P : 'var(--border)'),
        textAlign:'left', fontFamily:'inherit',
      }}>
      <div style={{ fontSize:18, lineHeight:1, marginTop:2 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color: active ? P : 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, lineHeight:1.5 }}>{subtitle}</div>
      </div>
      <div style={{
        width:18, height:18, borderRadius:'50%', flexShrink:0,
        border: '2px solid ' + (active ? P : 'var(--border)'),
        background: active ? P : '#fff',
        display:'flex', alignItems:'center', justifyContent:'center', marginTop:2,
      }}>
        {active && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
      </div>
    </button>
  )
}
