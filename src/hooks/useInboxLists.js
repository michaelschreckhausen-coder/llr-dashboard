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
// 2026-08-18 (Bug FSV Frankfurt 1899, gemeldet auf /linkedin-inbox): der
// Marken-Filter unten hat mit MIR GETEILTE Listen verschluckt. Eine Freigabe
// laeuft seit 20260810150000 ueber inbox_list_team_shares; die Liste behaelt
// dabei die brand_voice_id + team_id des TEILERS. Bei aktiver Marke „Thomas
// Sarkadi" fiel die Liste „Local Hero >51 Umkreis Arena" (Marke Markus Klepzig,
// gleiches Team) aus beiden OR-Zweigen — kein Chip, obwohl die RLS-Policy
// inbox_lists_brand_read sie ueber inbox_list_ids_shared_with_me() durchlaesst
// und inbox_feed die 23 Rows mit own_brand=false schon liefert. Deshalb jetzt
// ein dritter Zweig aus inbox_list_team_shares. Reines Frontend, kein DDL.
//
// API:
//   const { lists, membersByList, isLoading,
//           createList, addToList, removeFromList, refresh } = useInboxLists({ activeTeamId });
//   membersByList: Map<list_id, Set<inbox_id>>

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useInboxLists({ activeTeamId, activeBrandVoiceId } = {}) {
  const [lists, setLists] = useState([])
  const [membersByList, setMembersByList] = useState(() => new Map())
  // Status-Aufschluesselung je Liste (Mitglieder / fuer Kampagnen / aussortiert).
  // Kommt aus der SECURITY-DEFINER-RPC inbox_list_status_counts: eine Abfrage fuer ALLE
  // Listen (kein N+1), und sie zaehlt ohne Zeilen-RLS. Eine Zaehlung unter RLS haette bei
  // einer eigenen, nicht geteilten Liste in einer Marke ohne network-Scope zu wenig
  // gezaehlt — und damit genau das naechste „drei Zahlen, eine Liste" gebaut, das der
  // Tooltip aufloesen soll. la-audience liest mit service_role, hier muss dieselbe Menge
  // herauskommen.
  const [countsByList, setCountsByList] = useState(() => new Map())
  const [uid, setUid] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!mountedRef.current) return
    if (!user) { setLists([]); setMembersByList(new Map()); setIsLoading(false); return }
    setUid(user.id)

    // Mit dem AKTIVEN Team geteilte Listen zuerst holen — deren IDs sind der dritte
    // Sichtbarkeits-Zweig unten.
    // Der Filter auf team_id ist NICHT Doppelarbeit zur RLS (Top-Fallstrick #14):
    // ilts_select laesst alle Teams des Users durch, also erschienen im FSV-Kontext
    // zusaetzlich die Chips fremder Teams („LinkedIn Insights Wue" aus Vogel,
    // „Testliste zum Ueben" aus Taubitz) und der Team-Switch wirkte nicht mehr.
    // Ohne aktives Team gibt es nichts zu holen — eine Freigabe zielt immer auf ein Team.
    // Fehler ist nicht fatal: dann fehlt nur der Zweig.
    let sharedIds = []
    if (activeTeamId) {
      const { data: shareRows, error: shareErr } = await supabase
        .from('inbox_list_team_shares')
        .select('inbox_list_id')
        .eq('team_id', activeTeamId)
      if (shareErr) console.warn('[useInboxLists] Freigaben laden fehlgeschlagen:', shareErr.message)
      else sharedIds = [...new Set((shareRows || []).map(r => r.inbox_list_id).filter(Boolean))]
    }

    // Listen team-gescopet (expliziter Filter, Top-Fallstrick #14).
    // select('*') statt Spaltenliste: es gibt kein Migrations-Ledger, und
    // inbox_lists.kind existiert auf Prod ohne Migration im Repo. Eine harte
    // Spaltenliste 400t auf jeder Umgebung, der eine Spalte fehlt — und dann
    // sind ALLE Chips weg, nicht nur einer.
    let q = supabase
      .from('inbox_lists')
      .select('*')
      .order('created_at', { ascending: true })
    // Marken-gescopet: die Listen der AKTIVEN Marke laden — so kommen auch
    // Listen einer marken-übergreifend GETEILTEN Marke mit (RLS erlaubt via
    // has_brand_access). Plus Legacy-Listen ohne Marke im aktiven Team. Plus
    // die mit meinem Team geteilten Listen fremder Marken (siehe Header).
    const sharedOr = sharedIds.length ? `id.in.(${sharedIds.join(',')})` : null
    if (activeBrandVoiceId) {
      const parts = [`brand_voice_id.eq.${activeBrandVoiceId}`]
      if (activeTeamId) parts.push(`and(brand_voice_id.is.null,team_id.eq.${activeTeamId})`)
      if (sharedOr) parts.push(sharedOr)
      q = q.or(parts.join(','))
    } else if (activeTeamId) {
      q = sharedOr ? q.or(`team_id.eq.${activeTeamId},${sharedOr}`) : q.eq('team_id', activeTeamId)
    } else if (sharedOr) {
      q = q.or(`and(user_id.eq.${user.id},team_id.is.null),${sharedOr}`)
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

    // listIds ist oben bereits aus den geladenen Listen gebildet — nicht neu deklarieren.
    if (listIds.length) {
      const { data: cnt, error: cntErr } = await supabase.rpc('inbox_list_status_counts', { p_list_ids: listIds })
      if (cntErr) console.warn('[useInboxLists] Status-Zaehler:', cntErr.message)
      else if (mountedRef.current) {
        const cm = new Map()
        for (const r of (cnt || [])) cm.set(r.list_id, { mitglieder: r.mitglieder, fuerKampagnen: r.fuer_kampagnen, aussortiert: r.aussortiert })
        setCountsByList(cm)
      }
    } else setCountsByList(new Map())

    setIsLoading(false)
  }, [activeTeamId, activeBrandVoiceId])

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
      team_id: activeTeamId || null, // NOT-NULL-Sicherheit (Multi-Tenant-Konvention)
      brand_voice_id: activeBrandVoiceId || null, // Liste gehoert der aktiven Marke (teilbar via is_shared)
      kind: (kind === 'connection' ? 'connection' : 'prospect'), // Prospects- vs Verbindungen-Liste
      is_shared: false,
    }
    const { data, error } = await supabase
      .from('inbox_lists')
      .insert(payload)
      .select('*')
      .single()
    if (error) return { error }
    if (mountedRef.current) {
      setLists(prev => [...prev, data])
      setMembersByList(prev => { const n = new Map(prev); n.set(data.id, new Set()); return n })
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

  const renameList = useCallback(async (listId, name) => {
    const trimmed = (name || '').trim()
    if (!listId || !trimmed) return { error: new Error('Name fehlt') }
    const { data, error } = await supabase
      .from('inbox_lists')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', listId)
      .select('*')
      .single()
    if (error) return { error }
    if (mountedRef.current) setLists(prev => prev.map(l => (l.id === listId ? { ...l, ...data } : l)))
    return { data }
  }, [])

  const deleteList = useCallback(async (listId) => {
    if (!listId) return { error: new Error('Liste fehlt') }
    // inbox_list_members cascadet via FK (ON DELETE CASCADE) — linkedin_inbox bleibt.
    //
    // .select('id') ist hier nicht Kosmetik: DELETE darf nur der Ersteller (Policy
    // inbox_lists_own) und seit 20260819120000 der Team-Owner. Gelesen werden darf viel
    // mehr (inbox_lists_brand_read). Bei einer fremden Liste trifft das DELETE also NULL
    // Zeilen — und PostgREST meldet dafuer KEINEN Fehler. Ohne .select() sah der Hook
    // Erfolg, entfernte die Liste optimistisch aus dem State, und beim naechsten Laden
    // war sie wieder da (2026-08-19 gemeldet). Jetzt entscheidet die zurueckgegebene
    // Zeilenzahl, nicht das Fehlen eines Fehlers.
    const { data, error } = await supabase.from('inbox_lists').delete().eq('id', listId).select('id')
    if (error) return { error }
    if (!data || data.length === 0) {
      return { error: new Error('Diese Liste kann nur ihr Ersteller oder der Team-Owner löschen.') }
    }
    if (mountedRef.current) {
      setLists(prev => prev.filter(l => l.id !== listId))
      setMembersByList(prev => { const n = new Map(prev); n.delete(listId); return n })
    }
    return { data: { deleted: listId } }
  }, [])

  const removeFromList = useCallback(async (listId, inboxId) => {
    if (!listId || !inboxId) return { error: new Error('Liste oder Kontakt fehlt') }
    // Gleiche Bauform wie deleteList, gleicher stiller Nulltreffer: ohne .select() waere
    // ein RLS-Fehlschlag (oder ein gar nicht vorhandener Eintrag) von Erfolg nicht zu
    // unterscheiden. Die Policy inbox_list_members_via_list ist breiter als die auf
    // inbox_lists, der Fall ist also seltener — unehrlich war er trotzdem.
    const { data, error } = await supabase
      .from('inbox_list_members')
      .delete()
      .eq('list_id', listId)
      .eq('inbox_id', inboxId)
      .select('inbox_id')
    if (error) return { error }
    if (!data || data.length === 0) {
      return { error: new Error('Kontakt konnte nicht aus der Liste entfernt werden — fehlende Berechtigung oder schon entfernt.') }
    }
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

  const toggleShareList = useCallback(async (listId, share) => {
    const { data, error } = await supabase
      .from('inbox_lists')
      .update({ is_shared: !!share, updated_at: new Date().toISOString() })
      .eq('id', listId)
      .select('*')
      .single()
    if (error) return { error }
    if (mountedRef.current) setLists(prev => prev.map(l => l.id === listId ? data : l))
    return { data }
  }, [])

  return useMemo(() => ({
    lists,
    membersByList,
    countsByList,
    isLoading,
    createList,
    addToList,
    removeFromList,
    renameList,
    deleteList,
    toggleShareList,
    refresh: fetchAll,
  }), [lists, membersByList, countsByList, isLoading, createList, addToList, removeFromList, renameList, deleteList, toggleShareList, fetchAll])
}
