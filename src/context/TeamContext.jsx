import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TeamContext = createContext(null)

export function TeamProvider({ session, children }) {
  const [team, setTeam]       = useState(null)
  const [myRole, setMyRole]   = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return }
    load()
  }, [session?.user?.id])

  async function load() {
    setLoading(true)
    const uid = session.user.id
    const { data: tm } = await supabase
      .from('team_members')
      .select('role, team_id, teams(id, name, slug, plan, max_seats)')
      .eq('user_id', uid)
      .eq('is_active', true)
      .maybeSingle()

    if (!tm) { setLoading(false); return }
    setTeam(tm.teams)
    setMyRole(tm.role)

    const { data: memberRows } = await supabase
      .from('team_members')
      .select('id, user_id, role, joined_at')
      .eq('team_id', tm.team_id)
      .eq('is_active', true)

    if (memberRows?.length > 0) {
      const uids = memberRows.map(m => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', uids)
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
      setMembers(memberRows.map(m => ({ ...m, profile: profileMap[m.user_id] || null })))
    }
    setLoading(false)
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
      team, myRole, members, loading,
      isOwner: myRole === 'owner',
      isAdmin: myRole === 'owner' || myRole === 'admin',
      isMember: !!myRole,
      reload: load,
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
