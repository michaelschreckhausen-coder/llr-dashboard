import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const IND = 'var(--wl-primary, rgb(49,90,231))'

const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>

const CRM_TABLES = [
  { key:'leads',      label:'Leads & Interessenten',   desc:'Alle Lead-Datensätze mit CRM-Feldern, Scores, AI-Daten', icon:'👤', direct:'user_id' },
  { key:'activities', label:'Aktivitäten (Timeline)',   desc:'Alle Calls, Meetings, E-Mails, LinkedIn-Aktivitäten',    icon:'📋', direct:'user_id' },
  { key:'notes',      label:'Notizen',                  desc:'Alle Kontakt-Notizen aus dem Notizen-Tab',               icon:'📝', direct:'user_id', table:'contact_notes' },
  { key:'history',    label:'Feld-Verlauf (Audit)',     desc:'Alle CRM-Änderungshistorie',                             icon:'🔍', via:'leads' },
]

function CrmDeleteModal({ member, onClose, onDone }) {
  const [opts, setOpts]       = useState({ leads:true, activities:true, notes:true, history:true })
  const [saving, setSaving]   = useState(false)
  const [result, setResult]   = useState(null)
  const name = member.profile?.full_name || member.profile?.email || '—'
  const userId = member.user_id

  async function run() {
    setSaving(true)
    setResult(null)
    const deleted = {}
    const errors  = []

    for (const tbl of CRM_TABLES) {
      if (!opts[tbl.key]) continue
      try {
        const tableName = tbl.table || tbl.key
        if (tbl.direct) {
          const { count } = await supabase.from(tableName).select('*', { count:'exact', head:true }).eq(tbl.direct, userId)
          deleted[tableName] = count || 0
          const { error } = await supabase.from(tableName).delete().eq(tbl.direct, userId)
          if (error) errors.push(`${tableName}: ${error.message}`)
        } else if (tbl.via === 'leads') {
          // lead_field_history via lead_id → leads.user_id
          const { data: leadRows } = await supabase.from('leads').select('id').eq('user_id', userId)
          if (leadRows && leadRows.length > 0) {
            const ids = leadRows.map(l => l.id)
            const { count } = await supabase.from('lead_field_history').select('*', { count:'exact', head:true }).in('lead_id', ids)
            deleted['lead_field_history'] = count || 0
            const { error } = await supabase.from('lead_field_history').delete().in('lead_id', ids)
            if (error) errors.push(`lead_field_history: ${error.message}`)
          } else {
            deleted['lead_field_history'] = 0
          }
        }
      } catch (e) {
        errors.push(`${tbl.key}: ${e.message}`)
      }
    }

    setSaving(false)
    const total = Object.values(deleted).reduce((s, v) => s + v, 0)
    setResult({ deleted, errors, total })
    if (errors.length === 0) onDone(`CRM-Daten von ${name} gelöscht: ${total} Einträge entfernt.`)
  }

  const anySelected = Object.values(opts).some(Boolean)
  const s = { overlay:{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }, box:{ background:'var(--surface)', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width:500, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' } }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'var(--text-strong)' }}>🗑 CRM-Daten löschen</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:20, padding:'0 4px' }}>×</button>
        </div>

        <div style={{ padding:'20px 24px' }}>
          {/* User */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FFF7F7', borderRadius:10, marginBottom:16, border:'1px solid #FCA5A5' }}>
            <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#EF4444,#F87171)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
              {name.substring(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:'var(--text-strong)' }}>{name}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>{member.profile?.email}</div>
            </div>
          </div>

          {/* Warnung */}
          <div style={{ display:'flex', gap:10, padding:'10px 14px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, marginBottom:16 }}>
            <span>⚠️</span>
            <div style={{ fontSize:12, color:'#92400E', lineHeight:1.5 }}>
              Löscht unwiderruflich die gewählten CRM-Daten. Der Account und die Zugangsdaten bleiben erhalten.
            </div>
          </div>

          {/* Checkboxen */}
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
            Was soll gelöscht werden?
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {CRM_TABLES.map(({ key, label, desc, icon }) => (
              <label key={key} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 14px', borderRadius:10, border:'1.5px solid '+(opts[key]?'#EF444440':'#E2E8F0'), background:opts[key]?'#FFF7F7':'#FAFAFA', cursor:'pointer' }}>
                <input type="checkbox" checked={opts[key]}
                  onChange={e => setOpts(o => ({ ...o, [key]: e.target.checked }))}
                  style={{ marginTop:2, accentColor:'#EF4444', width:16, height:16, flexShrink:0 }}/>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--text-strong)' }}>{icon} {label}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Ergebnis */}
          {result && (
            <div style={{ padding:'12px 16px', background:result.errors.length>0?'#FEF2F2':'#F0FDF4', border:'1px solid '+(result.errors.length>0?'#FCA5A5':'#86EFAC'), borderRadius:8, marginBottom:8 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:result.errors.length>0?'#991B1B':'#166534' }}>
                {result.errors.length>0 ? '❌ Teilweise Fehler' : `✅ ${result.total} Einträge gelöscht`}
              </div>
              {Object.entries(result.deleted).map(([t, n]) => (
                <div key={t} style={{ fontSize:12, color:'var(--text-primary)', display:'flex', justifyContent:'space-between', padding:'2px 0' }}>
                  <span>{t}</span><strong>{n} Einträge</strong>
                </div>
              ))}
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize:11, color:'#EF4444', marginTop:4 }}>{e}</div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'space-between', borderTop:'1px solid #F1F5F9' }}>
          <button onClick={onClose} style={{ padding:'9px 22px', borderRadius:999, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {result ? 'Schließen' : 'Abbrechen'}
          </button>
          {!result && (
            <button onClick={run} disabled={saving || !anySelected}
              style={{ padding:'9px 22px', borderRadius:999, border:'none', background:saving||!anySelected?'#CBD5E1':'#EF4444', color:'#fff', fontSize:13, fontWeight:700, cursor:saving||!anySelected?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:7 }}>
              {saving ? '⏳ Lösche...' : <><TrashIcon/> CRM-Daten löschen</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TeamSettings({ session }) {
  const [team, setTeam]             = useState(null)
  const [members, setMembers]       = useState([])
  const [invites, setInvites]       = useState([])
  const [licenses, setLicenses]     = useState([])
  const [assignments, setAssignments] = useState([])
  const [flash, setFlash]           = useState(null)
  const [invEmail, setInvEmail]     = useState('')
  const [invRole, setInvRole]       = useState('user')
  const [tab, setTab]               = useState('members')
  const [crmMember, setCrmMember]   = useState(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [allUsers, setAllUsers]     = useState([])
  const [addSearch, setAddSearch]   = useState('')
  const [addingSaving, setAddingSaving] = useState(false)
  const [sharedLeads, setSharedLeads]   = useState([])
  const [sharedLists, setSharedLists]   = useState([])
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [newTeamName, setNewTeamName]   = useState('')
  const [teamCreating, setTeamCreating] = useState(false)
  const [sharedBVs, setSharedBVs]       = useState([])
  const { isAdmin, allTeams, switchTeam } = useTeam()
  const [removingSaving, setRemovingSaving] = useState(null)
  const [roleChanging, setRoleChanging] = useState(null)

  const flash_ = (msg, type) => { setFlash({ msg, type: type||'ok' }); setTimeout(() => setFlash(null), 4000) }

  useEffect(() => { load() }, [])

  async function load(overrideTeamId) {
    const uid = session.user.id
    // Alle Teams des Users laden
    const { data:rows } = await supabase.from('team_members').select('*, teams(*)').eq('user_id', uid).eq('is_active', true)
    if (!rows || rows.length === 0) return
    // Aktives Team aus Override, localStorage oder erstes Team
    const savedId = overrideTeamId || localStorage.getItem('leadesk_active_team_id')
    const tm = rows.find(r => r.team_id === savedId) || rows[0]
    if (!tm) return
    const teamId = tm.team_id
    setTeam(tm.teams)
    const [a, b, cc, d] = await Promise.all([
      supabase.from('team_members').select('id,user_id,role,joined_at').eq('team_id', teamId).eq('is_active', true),
      supabase.from('invites').select('*').eq('team_id', teamId).eq('status', 'pending'),
      supabase.from('licenses').select('*').eq('team_id', teamId).eq('status', 'active'),
      supabase.from('license_assignments').select('id,user_id,license_id,licenses(feature_key)').eq('team_id', teamId).eq('is_active', true),
    ])
    const memberRows = a.data || []
    const userIds = memberRows.map(m => m.user_id)
    let profileMap = {}
    if (userIds.length > 0) {
      const { data:profs } = await supabase.from('profiles').select('id,full_name,email,global_role').in('id', userIds)
      ;(profs||[]).forEach(p => { profileMap[p.id] = p })
    }
    setMembers(memberRows.map(m => ({ ...m, profile: profileMap[m.user_id]||null })))
    setInvites(b.data||[])
    setLicenses(cc.data||[])
    setAssignments(d.data||[])
    // Alle User laden für "Nutzer hinzufügen"
    const { data: allProfs } = await supabase.from('profiles').select('id,full_name,email,avatar_url,account_status').order('full_name')
    setAllUsers(allProfs||[])

    // Geteilte Inhalte laden
    const [sLeads, sLists, sBVs] = await Promise.all([
      supabase.from('leads').select('id,first_name,last_name,name,company,hs_score,user_id,created_at').eq('team_id', teamId).eq('is_shared', true).order('created_at', { ascending: false }).limit(50),
      supabase.from('lead_lists').select('id,name,color,user_id,created_at').eq('team_id', teamId).eq('is_shared', true).order('created_at', { ascending: false }),
      supabase.from('brand_voices').select('id,name,user_id,created_at,updated_at').eq('team_id', teamId).eq('is_shared', true).order('updated_at', { ascending: false }),
    ])
    setSharedLeads(sLeads.data || [])
    setSharedLists(sLists.data || [])
    setSharedBVs(sBVs.data || [])
  }

  async function sendInvite() {
    if (!invEmail.trim() || !team) return
    const { error } = await supabase.from('invites').insert({ team_id:team.id, email:invEmail, role:invRole, invited_by:session.user.id })
    if (!error) { flash_('Einladung gesendet'); setInvEmail(''); load() } else flash_(error.message, 'err')
  }

  // Bestehenden User direkt zum Team hinzufügen
  async function addUserToTeam(userId) {
    if (!team) return
    setAddingSaving(userId)
    // Prüfe ob bereits Mitglied
    const already = members.find(m => m.user_id === userId)
    if (already) { flash_('Dieser User ist bereits Mitglied', 'err'); setAddingSaving(null); return }
    const { error } = await supabase.from('team_members').insert({
      team_id: team.id, user_id: userId, role: 'member', is_active: true, invited_by: session.user.id
    })
    if (error) { flash_(error.message, 'err') } else { flash_('✅ Nutzer zum Team hinzugefügt!'); load() }
    setAddingSaving(null)
  }

  // Mitglied aus Team entfernen
  async function removeMember(memberId, userId) {
    if (!confirm('Mitglied aus dem Team entfernen?')) return
    setRemovingSaving(memberId)
    const { error } = await supabase.from('team_members').update({ is_active: false }).eq('id', memberId)
    if (error) { flash_(error.message, 'err') } else { flash_('Mitglied entfernt'); load() }
    setRemovingSaving(null)
  }

  // Rolle ändern
  async function changeRole(memberId, newRole) {
    setRoleChanging(memberId)
    const { error } = await supabase.from('team_members').update({ role: newRole }).eq('id', memberId)
    if (error) { flash_(error.message, 'err') } else { flash_('Rolle aktualisiert'); load() }
    setRoleChanging(null)
  }

  async function revokeInvite(id) {
    const { error } = await supabase.from('invites').update({ status:'revoked' }).eq('id', id)
    if (!error) { flash_('Einladung widerrufen'); load() } else flash_(error.message, 'err')
  }

  async function assignLicense(licId, userId) {
    if (!team) return
    const { error } = await supabase.from('license_assignments').upsert({ license_id:licId, user_id:userId, team_id:team.id, is_active:true, assigned_by:session.user.id }, { onConflict:'license_id,user_id' })
    if (!error) { flash_('Lizenz zugewiesen'); load() } else flash_(error.message, 'err')
  }

  async function revokeLicense(assignId) {
    const { error } = await supabase.from('license_assignments').update({ is_active:false, revoked_at:new Date().toISOString() }).eq('id', assignId)
    if (!error) { flash_('Lizenz entzogen'); load() } else flash_(error.message, 'err')
  }

  const rC = { admin:'#7C3AED', team_member:'#2563EB', user:'#6B7280' }
  const rB = { admin:'#EDE9FE', team_member:'#DBEAFE', user:'#F3F4F6' }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return
    setTeamCreating(true)
    try {
      const slug = newTeamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
      const uid  = session.user.id
      // Team anlegen
      const { data: newTeam, error: tErr } = await supabase
        .from('teams')
        .insert({ name: newTeamName.trim(), slug: slug + '-' + Date.now(), owner_id: uid, plan: 'free', max_seats: 5 })
        .select()
        .single()
      if (tErr) { alert('Fehler: ' + tErr.message); setTeamCreating(false); return }
      // User als Mitglied eintragen
      const { error: mErr } = await supabase
        .from('team_members')
        .insert({ team_id: newTeam.id, user_id: uid, role: 'admin', is_active: true, joined_at: new Date().toISOString() })
      if (mErr) { alert('Team erstellt, aber Mitglied-Eintrag fehlgeschlagen: ' + mErr.message); setTeamCreating(false); return }
      // Seite neu laden
      window.location.reload()
    } catch(e) { alert('Fehler: ' + e.message) }
    setTeamCreating(false)
  }

  if (!team) return (
    <div style={{ maxWidth:480, margin:'80px auto', padding:'0 20px', textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>👥</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'var(--text-strong)', marginBottom:8 }}>Noch kein Team vorhanden</h2>
      <p style={{ fontSize:14, color:'var(--text-muted)', marginBottom:32, lineHeight:1.6 }}>
        Erstelle ein Team um Leads, Listen und Inhalte mit Kollegen zu teilen.
      </p>
      {!creatingTeam ? (
        <button onClick={() => setCreatingTeam(true)}
          style={{ padding:'12px 28px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          + Neues Team erstellen
        </button>
      ) : (
        <div style={{ background:'var(--surface)', border:'1px solid #E4E7EC', borderRadius:12, padding:'24px', textAlign:'left' }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:12 }}>Team-Name</div>
          <input
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            placeholder="z.B. Sales Team DACH"
            onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #E4E7EC', borderRadius:8, fontSize:14, outline:'none', marginBottom:16, boxSizing:'border-box' }}
            autoFocus
          />
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || teamCreating}
              style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:newTeamName.trim()?'var(--wl-primary, rgb(49,90,231))':' #E4E7EC', color:newTeamName.trim()?'#fff':'#9CA3AF', fontSize:13, fontWeight:700, cursor:newTeamName.trim()?'pointer':'default' }}>
              {teamCreating ? '⏳ Erstelle…' : 'Team erstellen'}
            </button>
            <button onClick={() => setCreatingTeam(false)}
              style={{ padding:'10px 16px', borderRadius:8, border:'1px solid #E4E7EC', background:'var(--surface)', color:'var(--text-primary)', fontSize:13, cursor:'pointer' }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth:960 }}>
      <style>{`
        .ts-tab{padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-size:13px;font-weight:700}
        .ts-tab.on{background:rgb(49,90,231);color:white}
        .ts-tab:not(.on){background:white;color:#6B7280;border:1px solid #E5E7EB}
        .ts-tab:not(.on):hover{border-color:rgb(49,90,231);color:rgb(49,90,231)}
        .ts-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .ts-tbl th{padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;background:#F9FAFB;border-bottom:1px solid #E5E7EB}
        .ts-tbl td{padding:10px 14px;border-bottom:1px solid #F9FAFB;color:rgb(20,20,43)}
        .ts-tbl tr:hover td{background:#F9FAFB}
        .ts-bg{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700}
        .ts-bx{padding:5px 11px;border-radius:8px;border:1px solid #E5E7EB;background:white;font-size:11px;font-weight:700;cursor:pointer;color:#374151}
        .ts-bx:hover{border-color:rgb(49,90,231);color:rgb(49,90,231)}
        .ts-bxr{padding:5px 11px;border-radius:8px;border:1px solid #FCA5A5;background:white;font-size:11px;font-weight:700;cursor:pointer;color:#DC2626}
        .ts-bp{background:rgb(49,90,231);color:white;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}
        .ts-ip{padding:9px 12px;border:1px solid #E5E7EB;border-radius:9px;font-size:13px;outline:none}
        .ts-crm-btn{padding:5px 10px;border-radius:8px;border:1px solid #FCA5A5;background:white;font-size:11px;font-weight:700;cursor:pointer;color:#DC2626;display:inline-flex;align-items:center;gap:5px}
        .ts-crm-btn:hover{background:#FEF2F2}
      `}</style>

      {flash && (
        <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:700, background:flash.type==='err'?'#FEF2F2':'#F0FDF4', color:flash.type==='err'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='err'?'#FCA5A5':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Team-Switcher Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, padding:'14px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Aktives Team</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'var(--wl-primary, rgb(49,90,231))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14, flexShrink:0 }}>
              {team?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>{team?.name}</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>{team?.plan || 'free'} · {members.length} Mitglieder</div>
            </div>
          </div>
        </div>

        {/* Team-Dropdown wenn mehrere Teams */}
        {allTeams?.length > 1 && (
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Team wechseln</div>
            <select
              value={team?.id || ''}
              onChange={async e => {
                localStorage.setItem('leadesk_active_team_id', e.target.value)
                await switchTeam(e.target.value)
                await load(e.target.value)
                // Kurz warten dann Leads-Seite neu laden mit neuem Team-Kontext
                setTimeout(() => window.location.href = '/leads', 300)
              }}
              style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text-primary)', background:'var(--surface)', cursor:'pointer', outline:'none' }}>
              {(allTeams||[]).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Neues Team erstellen */}
        {!creatingTeam ? (
          <button onClick={() => setCreatingTeam(true)}
            style={{ padding:'8px 14px', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface-muted)', fontSize:12, fontWeight:600, color:'var(--text-primary)', cursor:'pointer', flexShrink:0 }}>
            + Neues Team
          </button>
        ) : (
          <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
            <input
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              placeholder="Team-Name…"
              onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
              style={{ padding:'7px 12px', border:'1.5px solid var(--wl-primary, rgb(49,90,231))', borderRadius:8, fontSize:13, outline:'none', width:180 }}
              autoFocus
            />
            <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || teamCreating}
              style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              {teamCreating ? '⏳' : 'Erstellen'}
            </button>
            <button onClick={() => { setCreatingTeam(false); setNewTeamName('') }}
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', fontSize:12, cursor:'pointer', color:'var(--text-primary)' }}>
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        {[
          { l:'Mitglieder',          v:members.length,                                                   c:'var(--wl-primary, rgb(49,90,231))' },
          { l:'Geteilte Leads',      v:(sharedLeads||[]).length,                                               c:'#10b981' },
          { l:'Offene Einladungen',  v:invites.length,                                                   c:'#F59E0B' },
        ].map(s => (
          <div key={s.l} style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:'16px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>{s.l}</div>
            <div style={{ fontSize:28, fontWeight:900, color:s.c, lineHeight:1 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:18 }}>
        {[['members','Mitglieder'], ['shared','👥 Geteilt'], ['invites','Einladungen'], ['licenses','Lizenzen']].map(([k, l]) => (
          <button key={k} className={'ts-tab'+(tab===k?' on':'')} onClick={e => { e.preventDefault(); e.stopPropagation(); setTab(k) }}>{l}</button>
        ))}
      </div>

      {/* Mitglieder Tab */}
      {tab === 'members' && (
        <div style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:14, fontWeight:800 }}>Mitglieder ({members.length})</div>
            <button onClick={() => { setShowAddUser(true); setAddSearch('') }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:9, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              + Nutzer hinzufügen
            </button>
          </div>
          <table className='ts-tbl'>
            <thead>
              <tr>
                <th>Name / E-Mail</th>
                <th>Rolle im Team</th>
                <th>Beigetreten</th>
                <th style={{ textAlign:'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {(members||[]).map(m => {
                const isMe = m.user_id === session.user.id
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>
                          {(m.profile?.full_name||m.profile?.email||'?').substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                            {m.profile?.full_name || '—'}
                            {isMe && <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 7px', borderRadius:999, border:'1px solid #BFDBFE' }}>Ich</span>}
                          </div>
                          <div style={{ color:'var(--text-muted)', fontSize:11 }}>{m.profile?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className='ts-bg' style={{ background:rB[m.role||'user'], color:rC[m.role||'user'] }}>
                        {m.role || 'user'}
                      </span>
                    </td>
                    <td style={{ color:'var(--text-muted)' }}>
                      {new Date(m.joined_at).toLocaleDateString('de-DE')}
                    </td>
                    <td>
                      <select value={m.role||'member'} onChange={e => changeRole(m.id, e.target.value)}
                        disabled={roleChanging === m.id || isMe}
                        style={{ padding:'4px 8px', borderRadius:7, border:'1.5px solid #E2E8F0', fontSize:12, fontWeight:600, color:rC[m.role||'user']||'#64748B', background:'var(--surface-muted)', cursor:'pointer' }}>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                    </td>
                    <td style={{ textAlign:'right' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end', alignItems:'center' }}>
                        <button className='ts-crm-btn' onClick={() => setCrmMember(m)}
                          title="CRM-Daten löschen" style={{ marginRight:0 }}>
                          <TrashIcon/> CRM
                        </button>
                        {!isMe && (
                          <button onClick={() => removeMember(m.id, m.user_id)}
                            disabled={removingSaving === m.id}
                            style={{ padding:'4px 10px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {removingSaving === m.id ? '⏳' : '× Entfernen'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Nutzer hinzufügen */}
      {showAddUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
          onClick={() => setShowAddUser(false)}>
          <div style={{ background:'var(--surface)', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width:480, maxWidth:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:800, fontSize:15 }}>👥 Nutzer zum Team hinzufügen</div>
              <button onClick={() => setShowAddUser(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:22 }}>×</button>
            </div>
            <div style={{ padding:'14px 20px' }}>
              <input
                value={addSearch} onChange={e => setAddSearch(e.target.value)}
                placeholder="🔍 Nach Name oder E-Mail suchen…"
                autoFocus
                style={{ width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:14, outline:'none', boxSizing:'border-box' }}/>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'0 20px 16px' }}>
              {allUsers
                .filter(u => {
                  const q = addSearch.toLowerCase()
                  return (!q || (u.full_name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q))
                })
                .map(u => {
                  const isMember = members.some(m => m.user_id === u.id)
                  const isMe = u.id === session.user.id
                  return (
                    <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, marginBottom:6,
                      background: isMember ? '#F0FDF4' : '#F8FAFC', border:'1px solid '+(isMember?'#A7F3D0':'#E5E7EB') }}>
                      <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#8B5CF6)', color:'#fff', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {(u.full_name||u.email||'?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:'var(--text-strong)', display:'flex', alignItems:'center', gap:6 }}>
                          {u.full_name||'—'}
                          {isMe && <span style={{ fontSize:10, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 6px', borderRadius:99 }}>Ich</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{u.email}</div>
                      </div>
                      {isMember ? (
                        <span style={{ fontSize:11, fontWeight:700, color:'#16A34A', background:'#F0FDF4', padding:'3px 10px', borderRadius:99, border:'1px solid #A7F3D0' }}>✓ Mitglied</span>
                      ) : (
                        <button onClick={() => addUserToTeam(u.id)} disabled={addingSaving === u.id}
                          style={{ padding:'6px 14px', borderRadius:8, background:'#0A66C2', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer', opacity:addingSaving===u.id?0.6:1, flexShrink:0 }}>
                          {addingSaving === u.id ? '⏳' : '+ Hinzufügen'}
                        </button>
                      )}
                    </div>
                  )
                })}
              {(allUsers||[]).filter(u => {
                const q = addSearch.toLowerCase()
                return (!q || (u.full_name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q))
              }).length === 0 && (
                <div style={{ textAlign:'center', color:'#CBD5E1', fontSize:13, padding:'24px 0' }}>Kein User gefunden</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Einladungen Tab */}
      {tab === 'invites' && (
        <div>
          <div style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', fontSize:14, fontWeight:800 }}>
              Offene Einladungen ({invites.length})
            </div>
            <table className='ts-tbl'>
              <thead><tr><th>E-Mail</th><th>Rolle</th><th>Läuft ab</th><th>Aktionen</th></tr></thead>
              <tbody>
                {(invites||[]).map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight:600 }}>{i.email}</td>
                    <td><span className='ts-bg' style={{ background:rB[i.role||'user'], color:rC[i.role||'user'] }}>{i.role}</span></td>
                    <td style={{ color:'var(--text-muted)' }}>{new Date(i.expires_at).toLocaleDateString('de-DE')}</td>
                    <td><button className='ts-bxr' onClick={() => revokeInvite(i.id)}>Widerrufen</button></td>
                  </tr>
                ))}
                {invites.length === 0 && <tr><td colSpan={4} style={{ textAlign:'center', color:'#9CA3AF', padding:24 }}>Keine offenen Einladungen</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:'18px 20px' }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Neues Mitglied einladen</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10 }}>
              <input className='ts-ip' type='email' value={invEmail} onChange={e => setInvEmail(e.target.value)}
                placeholder='email@beispiel.de' onKeyDown={e => e.key === 'Enter' && sendInvite()}/>
              <select className='ts-ip' value={invRole} onChange={e => setInvRole(e.target.value)}>
                <option value='user'>User</option>
                <option value='team_member'>Team Admin</option>
              </select>
              <button className='ts-bp' onClick={sendInvite}>Einladen</button>
            </div>
          </div>
        </div>
      )}

      {/* Lizenzen Tab */}
      {tab === 'licenses' && (
        <div>
          {(licenses||[]).map(lic => (
            <div key={lic.id} style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', marginBottom:16 }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:800 }}>{lic.feature_key}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                    {lic.used_seats}/{lic.total_seats} Seats belegt — {lic.total_seats - lic.used_seats} verfügbar
                  </div>
                </div>
                <div style={{ width:100, height:8, background:'var(--surface-muted)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:(lic.total_seats>0?lic.used_seats/lic.total_seats*100:0)+'%', height:'100%', background:lic.used_seats/lic.total_seats>.8?'#EF4444':'var(--wl-primary, rgb(49,90,231))', borderRadius:4 }}/>
                </div>
              </div>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', fontSize:12, fontWeight:700, color:'#9CA3AF', background:'#FAFAFA' }}>MITGLIED ZUWEISEN</div>
              <div style={{ padding:'12px 18px', display:'flex', flexWrap:'wrap', gap:8 }}>
                {(members||[]).map(m => {
                  const assigned = assignments.find(a => a.license_id === lic.id && a.user_id === m.user_id)
                  return (
                    <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, border:'1px solid '+(assigned?'#A7F3D0':'#E5E7EB'), background:assigned?'#F0FDF4':'white' }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>{m.profile?.full_name || m.profile?.email || '—'}</span>
                      {assigned
                        ? <button className='ts-bxr' onClick={() => revokeLicense(assigned.id)} style={{ padding:'3px 8px' }}>Entziehen</button>
                        : <button className='ts-bx' onClick={() => assignLicense(lic.id, m.user_id)} style={{ padding:'3px 8px' }}>Zuweisen</button>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {licenses.length === 0 && (
            <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:40, textAlign:'center', color:'#9CA3AF' }}>
              Noch keine Lizenzen vorhanden. Bitte beim Admin anfragen.
            </div>
          )}
        </div>
      )}

      {/* ── Geteilte Inhalte Tab ─────────────────────────── */}
      {tab === 'shared' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Geteilte Leads */}
          <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>👥 Geteilte Leads</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Leads die alle Teammitglieder sehen und bearbeiten können</div>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--wl-primary, rgb(49,90,231))', background:'#EFF6FF', padding:'4px 12px', borderRadius:99 }}>{(sharedLeads||[]).length}</span>
            </div>
            {(sharedLeads||[]).length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                Noch keine geteilten Leads.<br/>
                <span style={{ fontSize:12 }}>In der Lead-Liste den 👤-Button klicken um Leads zu teilen.</span>
              </div>
            ) : (
              <table className='ts-tbl'>
                <thead><tr>
                  <th>Name</th><th>Unternehmen</th><th>Score</th><th>Erstellt</th>
                  {isAdmin && <th>Sharing aufheben</th>}
                </tr></thead>
                <tbody>
                  {(sharedLeads||[]).map(lead => {
                    const name = ((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || 'Unbekannt'
                    return (
                      <tr key={lead.id}>
                        <td style={{ fontWeight:600 }}>{name}</td>
                        <td style={{ color:'var(--text-muted)' }}>{lead.company || '—'}</td>
                        <td><span style={{ fontWeight:700, color:lead.hs_score>=70?'#ef4444':lead.hs_score>=40?'#f59e0b':'#3b82f6' }}>{lead.hs_score || 0}</span></td>
                        <td style={{ color:'var(--text-muted)', fontSize:12 }}>{new Date(lead.created_at).toLocaleDateString('de-DE')}</td>
                        {isAdmin && (
                          <td>
                            <button className='ts-bxr' style={{ padding:'3px 10px' }} onClick={async () => {
                              await supabase.from('leads').update({ team_id:null, is_shared:false }).eq('id', lead.id)
                              setSharedLeads(prev => prev.filter(l => l.id !== lead.id))
                              flash_('Sharing aufgehoben')
                            }}>Aufheben</button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Geteilte Listen */}
          <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>📋 Geteilte Lead-Listen</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Listen die das gesamte Team einsehen kann</div>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--wl-primary, rgb(49,90,231))', background:'#EFF6FF', padding:'4px 12px', borderRadius:99 }}>{(sharedLists||[]).length}</span>
            </div>
            {(sharedLists||[]).length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Noch keine geteilten Listen</div>
            ) : (
              <div style={{ padding:'8px 16px', display:'flex', flexWrap:'wrap', gap:8 }}>
                {(sharedLists||[]).map(lst => (
                  <div key={lst.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:99, border:`1px solid ${lst.color||'#3b82f6'}44`, background:lst.color ? lst.color+'11' : '#EFF6FF' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:lst.color||'#3b82f6', display:'inline-block' }}/>
                    <span style={{ fontSize:13, fontWeight:600, color:lst.color||'#3b82f6' }}>{lst.name}</span>
                    {isAdmin && <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:12, padding:'0 2px' }} onClick={async () => {
                      await supabase.from('lead_lists').update({ team_id:null, is_shared:false }).eq('id', lst.id)
                      setSharedLists(prev => prev.filter(l => l.id !== lst.id))
                      flash_('Liste-Sharing aufgehoben')
                    }}>✕</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Geteilte Brand Voices */}
          <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>🎤 Geteilte Brand Voices</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Gemeinsamer Markenstil für Content-Erstellung</div>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--wl-primary, rgb(49,90,231))', background:'#EFF6FF', padding:'4px 12px', borderRadius:99 }}>{sharedBVs.length}</span>
            </div>
            {sharedBVs.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Noch keine geteilten Brand Voices.<br/><span style={{ fontSize:12 }}>In den Brand Voice Einstellungen teilen.</span></div>
            ) : (
              <table className='ts-tbl'>
                <thead><tr><th>Name</th><th>Zuletzt geändert</th>{isAdmin && <th>Sharing aufheben</th>}</tr></thead>
                <tbody>
                  {sharedBVs.map(bv => (
                    <tr key={bv.id}>
                      <td style={{ fontWeight:600 }}>🎤 {bv.name}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:12 }}>{new Date(bv.updated_at).toLocaleDateString('de-DE')}</td>
                      {isAdmin && <td><button className='ts-bxr' style={{ padding:'3px 10px' }} onClick={async () => {
                        await supabase.from('brand_voices').update({ team_id:null, is_shared:false }).eq('id', bv.id)
                        setSharedBVs(prev => prev.filter(b => b.id !== bv.id))
                        flash_('Brand Voice Sharing aufgehoben')
                      }}>Aufheben</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CRM Delete Modal */}
      {crmMember && (
        <CrmDeleteModal
          member={crmMember}
          onClose={() => setCrmMember(null)}
          onDone={msg => { flash_(msg); setCrmMember(null) }}
        />
      )}
    </div>
  )
}
