import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TeamContext = createContext(null)

const STORAGE_KEY = 'leadesk_active_team_id'

export function TeamProvider({ session, children }) {
  const [allTeams, setAllTeams]   = useState([])   // alle Teams des Users
  const [team, setTeam]           = useState(null)  // aktives Team (rückwärtskompatibel)
  const [myRole, setMyRole]       = useState(null)
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    console.log('[TeamContext] useEffect fired', {
      hasSession: !!session,
      userId: session?.user?.id ?? 'NONE',
      timestamp: new Date().toISOString()
    })
    if (!session?.user?.id) { setLoading(false); return }
    load(session)
  }, [session?.user?.id])

  // Re-Fetch bei Auth-State-Change ohne UUID-Wechsel. TOKEN_REFRESHED + INITIAL_SESSION bewusst ignoriert.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[TeamContext] auth event', { event, hasSession: !!s })
      if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return
      if (s?.user?.id) load(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Re-Fetch bei Tab-Refocus, falls vorheriger Mount-Versuch fehlschlug (team === null trotz Session).
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && team === null && session?.user?.id) load(session)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [team, session?.user?.id])

  async function load(s) {
    console.log('[TeamContext] load() called', { uid: (s || session)?.user?.id })
    const sess = s || session
    if (!sess?.user?.id) return
    setLoading(true)
    const uid = sess.user.id

    // Alle aktiven Team-Mitgliedschaften laden
    const { data: rows, error } = await supabase
      .from('team_members')
      .select('role, team_id, teams(id, name, slug, plan, max_seats)')
      .eq('user_id', uid)

    console.log('[TeamContext] team_members query result', {
      hasData: !!rows,
      rowCount: rows?.length,
      error: error ? { message: error.message, code: error.code, status: error.status } : null
    })

    if (!rows || rows.length === 0) { setLoading(false); return }

    const teams = rows.map(r => ({ ...r.teams, role: r.role }))
    setAllTeams(teams)

    // Aktives Team aus localStorage oder erstes Team
    const savedId  = localStorage.getItem(STORAGE_KEY)
    const active   = teams.find(t => t.id === savedId) || teams[0]
    const activeRow = rows.find(r => r.team_id === active.id)

    setTeam(active)
    setMyRole(activeRow?.role || null)

    // Mitglieder des aktiven Teams laden
    await loadMembers(active.id)
    setLoading(false)
  }

  async function loadMembers(teamId) {
    const { data: memberRows } = await supabase
      .from('team_members')
      .select('id, user_id, role, joined_at')
      .eq('team_id', teamId)

    if (!memberRows?.length) { setMembers([]); return }
    const uids = memberRows.map(m => m.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', uids)
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
    setMembers(memberRows.map(m => ({ ...m, profile: profileMap[m.user_id] || null })))
  }

  // Team wechseln — speichert in localStorage
  async function switchTeam(teamId) {
    const target = allTeams.find(t => t.id === teamId)
    if (!target) return
    localStorage.setItem(STORAGE_KEY, teamId)
    setTeam(target)
    setMyRole(target.role)
    await loadMembers(teamId)
  }

  async function shareLeadWithTeam(leadId) {
    if (!team) return { error: 'Kein Team' }
    return supabase.from('leads').update({ team_id: team.id, is_shared: true }).eq('id', leadId)
  }
  async function unshareLeadFromTeam(leadId) {
    return supabase.from('leads').update({ team_id: null, is_shared: false }).eq('id', leadId)
  }
  async function shareListWithTeam(listId) {
    if (!team) return { error: 'Kein Team' }
    return supabase.from('lead_lists').update({ team_id: team.id, is_shared: true }).eq('id', listId)
  }
  async function unshareListFromTeam(listId) {
    return supabase.from('lead_lists').update({ team_id: null, is_shared: false }).eq('id', listId)
  }
  async function shareBrandVoiceWithTeam(bvId) {
    if (!team) return { error: 'Kein Team' }
    return supabase.from('brand_voices').update({ team_id: team.id, is_shared: true }).eq('id', bvId)
  }

  return (
    <TeamContext.Provider value={{
      team, allTeams, myRole, members, loading,
      activeTeamId: team?.id || null,   // für Query-Filtering
      isOwner:  myRole === 'owner',
      isAdmin:  myRole === 'owner' || myRole === 'admin' || myRole === 'team_admin',
      isMember: !!myRole,
      reload:   load,
      switchTeam,
      shareLeadWithTeam, unshareLeadFromTeam,
      shareListWithTeam, unshareListFromTeam,
      shareBrandVoiceWithTeam,
    }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  return useContext(TeamContext) || {}
}
