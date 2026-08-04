// src/hooks/useInboxLists.js
//
// Inbox-Listen — reusable Auswahl-Sammlungen von linkedin_inbox-Kontakten.
// Getrennt von automation_campaigns (Kampagnen = Outreach).
//
// Team-Scoping mit EXPLIZITEM Filter (CLAUDE.md Top-Fallstrick #14). Listen
// zusaetzlich marken-gescopet (brand_voice_id), so kommen geteilte Marken-Listen
// mit (RLS erlaubt via has_brand_access).
//
// WICHTIG (Bugfix 04.08.2026): Mitgliederzahlen kommen server-seitig via RPC
// `inbox_list_counts` — NICHT mehr durch Laden aller inbox_list_members-Zeilen
// (das lief in PostgRESTs 1000-Zeilen-Default und schnitt bei Marken mit >1000
// Membern gesamt einzelne Listen ab -> "Liste nach Refresh leer"). Der
// tatsaechliche Listeninhalt wird in LinkedInInbox via `inbox_list_feed` geladen.
//
// API:
//   const { lists, countsByList, isLoading,
//           createList, addToList, removeFromList, deleteList,
//           renameList, toggleShareList, refresh } = useInboxLists({ activeTeamId, activeBrandVoiceId })
//   countsByList: Map<list_id, number>

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useInboxLists({ activeTeamId, activeBrandVoiceId } = {}) {
  const [lists, setLists] = useState([])
  const [countsByList, setCountsByList] = useState(() => new Map())
  const [uid, setUid] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const mountedRef = useRef(true)

  // Echte Mitgliederzahlen fuer die gegebenen Listen server-seitig holen.
  const loadCounts = useCallback(async (listIds) => {
    const ids = [...new Set((listIds || []).filter(Boolean))]
    if (!ids.length) { if (mountedRef.current) setCountsByList(new Map()); return }
    const { data, error } = await supabase.rpc('inbox_list_counts', { p_list_ids: ids })
    if (!mountedRef.current || error) return
    const m = new Map()
    for (const id of ids) m.set(id, 0)          // Listen ohne Member = 0
    for (const r of (data || [])) m.set(r.list_id, Number(r.n) || 0)
    if (mountedRef.current) setCountsByList(m)
  }, [])

  const refreshCount = useCallback(async (listId) => {
    if (!listId) return
    const { data } = await supabase.rpc('inbox_list_counts', { p_list_ids: [listId] })
    if (!mountedRef.current) return
    const n = Number((data || [])[0]?.n) || 0
    setCountsByList(prev => { const nm = new Map(prev); nm.set(listId, n); return nm })
  }, [])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!mountedRef.current) return
    if (!user) { setLists([]); setCountsByList(new Map()); setIsLoading(false); return }
    setUid(user.id)

    let q = supabase
      .from('inbox_lists')
      .select('id, name, color, user_id, team_id, brand_voice_id, kind, is_shared, created_at, updated_at')
      .order('created_at', { ascending: true })
    if (activeBrandVoiceId) {
      q = q.or(`brand_voice_id.eq.${activeBrandVoiceId},and(brand_voice_id.is.null,team_id.eq.${activeTeamId})`)
    } else if (activeTeamId) {
      q = q.eq('team_id', activeTeamId)
    } else {
      q = q.eq('user_id', user.id).is('team_id', null)
    }
    const { data: listData, error: listErr } = await q

    if (!mountedRef.current) return
    if (listErr) { console.warn('[useInboxLists] Laden fehlgeschlagen:', listErr.message); setLists([]); setCountsByList(new Map()); setIsLoading(false); return }

    const rows = listData || []
    setLists(rows)
    await loadCounts(rows.map(l => l.id))
    setIsLoading(false)
  }, [activeTeamId, activeBrandVoiceId, loadCounts])

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    return () => { mountedRef.current = false }
  }, [fetchAll])

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  const createList = useCallback(async (name, color, kind) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return { error: new Error('Name fehlt') }
    let ownerId = uid
    if (!ownerId) { const { data } = await supabase.auth.getUser(); ownerId = data?.user?.id || null }
    const payload = {
      name: trimmed,
      color: color || null,
      user_id: ownerId,
      team_id: activeTeamId || null,
      brand_voice_id: activeBrandVoiceId || null,
      kind: (kind === 'connection' ? 'connection' : 'prospect'),
      is_shared: false,
    }
    const { data, error } = await supabase
      .from('inbox_lists')
      .insert(payload)
      .select('id, name, color, user_id, team_id, brand_voice_id, kind, is_shared, created_at, updated_at')
      .single()
    if (error) return { error }
    if (mountedRef.current) {
      setLists(prev => [...prev, data])
      setCountsByList(prev => { const n = new Map(prev); n.set(data.id, 0); return n })
    }
    return { data }
  }, [uid, activeTeamId, activeBrandVoiceId])

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
    // Echte Zahl server-seitig nachziehen (Dedupe -> exakter Count).
    refreshCount(listId)
    return { data: { added: ids.length } }
  }, [uid, refreshCount])

  const renameList = useCallback(async (listId, name) => {
    const trimmed = (name || '').trim()
    if (!listId || !trimmed) return { error: new Error('Name fehlt') }
    const { data, error } = await supabase
      .from('inbox_lists')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', listId)
      .select('id, name, color, user_id, team_id, brand_voice_id, kind, is_shared, created_at, updated_at')
      .single()
    if (error) return { error }
    if (mountedRef.current) setLists(prev => prev.map(l => (l.id === listId ? { ...l, ...data } : l)))
    return { data }
  }, [])

  const deleteList = useCallback(async (listId) => {
    if (!listId) return { error: new Error('Liste fehlt') }
    // inbox_list_members cascadet via FK (ON DELETE CASCADE) — linkedin_inbox bleibt.
    const { error } = await supabase.from('inbox_lists').delete().eq('id', listId)
    if (error) return { error }
    if (mountedRef.current) {
      setLists(prev => prev.filter(l => l.id !== listId))
      setCountsByList(prev => { const n = new Map(prev); n.delete(listId); return n })
    }
    return { data: { deleted: listId } }
  }, [])

  const removeFromList = useCallback(async (listId, inboxId) => {
    if (!listId || !inboxId) return { error: new Error('Liste oder Kontakt fehlt') }
    const { error } = await supabase
      .from('inbox_list_members')
      .delete()
      .eq('list_id', listId)
      .eq('inbox_id', inboxId)
    if (error) return { error }
    refreshCount(listId)
    return { data: { removed: 1 } }
  }, [refreshCount])

  const toggleShareList = useCallback(async (listId, share) => {
    const { data, error } = await supabase
      .from('inbox_lists')
      .update({ is_shared: !!share, updated_at: new Date().toISOString() })
      .eq('id', listId)
      .select('id, name, color, user_id, team_id, brand_voice_id, kind, is_shared, created_at, updated_at')
      .single()
    if (error) return { error }
    if (mountedRef.current) setLists(prev => prev.map(l => l.id === listId ? { ...l, ...data } : l))
    return { data }
  }, [])

  return useMemo(() => ({
    lists,
    countsByList,
    isLoading,
    createList,
    addToList,
    removeFromList,
    renameList,
    deleteList,
    toggleShareList,
    refresh: fetchAll,
  }), [lists, countsByList, isLoading, createList, addToList, removeFromList, renameList, deleteList, toggleShareList, fetchAll])
}
