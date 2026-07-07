// src/hooks/useInboxLists.js
//
// Inbox-Listen — reusable Auswahl-Sammlungen von linkedin_inbox-Kontakten.
// Getrennt von automation_campaigns (Kampagnen = Outreach). Befüllt in
// /linkedin-inbox, auswählbar in Automatisierung (Lead-Step) + Vernetzungen.
//
// Team-Scoping mit EXPLIZITEM Filter (CLAUDE.md Top-Fallstrick #14): RLS allein
// reicht bei Multi-Team-Membership nicht — mit activeTeamId auf team_id filtern,
// Solo-Fallback auf eigene team-lose Listen. useEffect-Dep auf [activeTeamId].
//
// API:
//   const { lists, membersByList, isLoading,
//           createList, addToList, removeFromList, refresh } = useInboxLists({ activeTeamId });
//   membersByList: Map<list_id, Set<inbox_id>>

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useInboxLists({ activeTeamId } = {}) {
  const [lists, setLists] = useState([])
  const [membersByList, setMembersByList] = useState(() => new Map())
  const [uid, setUid] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!mountedRef.current) return
    if (!user) { setLists([]); setMembersByList(new Map()); setIsLoading(false); return }
    setUid(user.id)

    // Listen team-gescopet (expliziter Filter, Top-Fallstrick #14).
    let q = supabase
      .from('inbox_lists')
      .select('id, name, color, user_id, team_id, is_shared, created_at, updated_at')
      .order('created_at', { ascending: true })
    if (activeTeamId) {
      q = q.eq('team_id', activeTeamId)
    } else {
      q = q.eq('user_id', user.id).is('team_id', null)
    }
    const { data: listData, error: listErr } = await q

    if (!mountedRef.current) return
    if (listErr) { console.warn('[useInboxLists] Laden fehlgeschlagen:', listErr.message); setLists([]); setMembersByList(new Map()); setIsLoading(false); return }

    const rows = listData || []
    setLists(rows)

    // Mitgliedschaften für die geladenen Listen.
    const listIds = rows.map(l => l.id)
    const m = new Map()
    if (listIds.length) {
      const { data: memData } = await supabase
        .from('inbox_list_members')
        .select('list_id, inbox_id')
        .in('list_id', listIds)
      if (!mountedRef.current) return
      for (const r of (memData || [])) {
        if (!r.list_id || !r.inbox_id) continue
        let set = m.get(r.list_id)
        if (!set) { set = new Set(); m.set(r.list_id, set) }
        set.add(r.inbox_id)
      }
    }
    setMembersByList(m)
    setIsLoading(false)
  }, [activeTeamId])

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    return () => { mountedRef.current = false }
  }, [fetchAll])

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  const createList = useCallback(async (name, color) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return { error: new Error('Name fehlt') }
    let ownerId = uid
    if (!ownerId) { const { data } = await supabase.auth.getUser(); ownerId = data?.user?.id || null }
    const payload = {
      name: trimmed,
      color: color || null,
      user_id: ownerId,
      team_id: activeTeamId || null, // NOT-NULL-Sicherheit (Multi-Tenant-Konvention)
      is_shared: false,
    }
    const { data, error } = await supabase
      .from('inbox_lists')
      .insert(payload)
      .select('id, name, color, user_id, team_id, is_shared, created_at, updated_at')
      .single()
    if (error) return { error }
    if (mountedRef.current) {
      setLists(prev => [...prev, data])
      setMembersByList(prev => { const n = new Map(prev); n.set(data.id, new Set()); return n })
    }
    return { data }
  }, [uid, activeTeamId])

  const addToList = useCallback(async (listId, inboxIds) => {
    const ids = [...new Set((inboxIds || []).filter(Boolean))]
    if (!listId || !ids.length) return { error: new Error('Liste oder Kontakte fehlen') }
    let ownerId = uid
    if (!ownerId) { const { data } = await supabase.auth.getUser(); ownerId = data?.user?.id || null }
    const rows = ids.map(inbox_id => ({ list_id: listId, inbox_id, user_id: ownerId }))
    // UNIQUE(list_id, inbox_id) → Duplikate ignorieren statt Fehler.
    const { error } = await supabase
      .from('inbox_list_members')
      .upsert(rows, { onConflict: 'list_id,inbox_id', ignoreDuplicates: true })
    if (error) return { error }
    if (mountedRef.current) {
      setMembersByList(prev => {
        const n = new Map(prev)
        const set = new Set(n.get(listId) || [])
        ids.forEach(i => set.add(i))
        n.set(listId, set)
        return n
      })
    }
    return { data: { added: ids.length } }
  }, [uid])

  const removeFromList = useCallback(async (listId, inboxId) => {
    if (!listId || !inboxId) return { error: new Error('Liste oder Kontakt fehlt') }
    const { error } = await supabase
      .from('inbox_list_members')
      .delete()
      .eq('list_id', listId)
      .eq('inbox_id', inboxId)
    if (error) return { error }
    if (mountedRef.current) {
      setMembersByList(prev => {
        const n = new Map(prev)
        const set = new Set(n.get(listId) || [])
        set.delete(inboxId)
        n.set(listId, set)
        return n
      })
    }
    return { data: { removed: 1 } }
  }, [])

  return useMemo(() => ({
    lists,
    membersByList,
    isLoading,
    createList,
    addToList,
    removeFromList,
    refresh: fetchAll,
  }), [lists, membersByList, isLoading, createList, addToList, removeFromList, fetchAll])
}
