// src/hooks/useTagRegistry.js
//
// Lädt die Tag-Registry (lead_tag_registry) für das aktive Team (bzw. Solo)
// und füllt den Modul-Cache in tagColors.js (setTagRegistry), damit ALLE
// Tag-Pills die zugewiesene Farbe bekommen. Plus CRUD für den TagManager.
//
// Team-Scoping analog useLeads: expliziter team_id-Filter + Solo-Fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';
import { setTagRegistry } from '../lib/tagColors';

export function useTagRegistry() {
  const { activeTeamId } = useTeam() || {};
  const [uid, setUid] = useState(null);
  const [tags, setTags] = useState([]);   // [{ id, name, color, team_id, user_id }]
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (mounted) setUid(data?.user?.id || null); });
    return () => { mounted = false; };
  }, []);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    let q = supabase.from('lead_tag_registry').select('id, name, color, team_id, user_id').order('name');
    if (activeTeamId) {
      q = q.eq('team_id', activeTeamId);
    } else if (uid) {
      q = q.eq('user_id', uid).is('team_id', null);
    } else {
      setTags([]); setIsLoading(false); return;
    }
    const { data, error } = await q;
    if (!mountedRef.current) return;
    if (error) {
      console.warn('[useTagRegistry] load failed:', error.message);
      setTags([]);
    } else {
      setTags(data || []);
    }
    setIsLoading(false);
  }, [activeTeamId, uid]);

  useEffect(() => {
    mountedRef.current = true;
    if (activeTeamId || uid) fetchTags();
    return () => { mountedRef.current = false; };
  }, [fetchTags, activeTeamId, uid]);

  // Modul-Cache für tagColor() füllen: name(lower) -> color-key + Namen-Liste
  useEffect(() => {
    const map = {};
    const names = [];
    tags.forEach(t => { if (t.name) { map[t.name.trim().toLowerCase()] = t.color; names.push(t.name); } });
    setTagRegistry(map, names);
  }, [tags]);

  const colorByName = useMemo(() => {
    const m = {};
    tags.forEach(t => { if (t.name) m[t.name.trim().toLowerCase()] = t.color; });
    return m;
  }, [tags]);

  const createTag = useCallback(async (name, color = 'indigo') => {
    const clean = (name || '').trim();
    if (!clean) return { error: new Error('Name fehlt') };
    const row = {
      name: clean,
      color,
      team_id: activeTeamId || null,
      user_id: activeTeamId ? null : uid,
    };
    const { data, error } = await supabase.from('lead_tag_registry').insert(row).select('id, name, color, team_id, user_id').single();
    if (error) { console.warn('[useTagRegistry] create failed:', error.message); return { error }; }
    await fetchTags();
    return { data };
  }, [activeTeamId, uid, fetchTags]);

  const updateTag = useCallback(async (id, patch) => {
    const { error } = await supabase.from('lead_tag_registry')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.warn('[useTagRegistry] update failed:', error.message); return { error }; }
    await fetchTags();
    return {};
  }, [fetchTags]);

  const deleteTag = useCallback(async (id) => {
    const { error } = await supabase.from('lead_tag_registry').delete().eq('id', id);
    if (error) { console.warn('[useTagRegistry] delete failed:', error.message); return { error }; }
    await fetchTags();
    return {};
  }, [fetchTags]);

  return { tags, colorByName, isLoading, refetch: fetchTags, createTag, updateTag, deleteTag };
}

// Leichte Sync-Variante (nur Laden + Modul-Cache, kein CRUD) — für Layout,
// damit Tag-Farben app-weit (auch auf der Detailseite) greifen.
export function useTagRegistrySync() {
  const { activeTeamId } = useTeam() || {};
  const [uid, setUid] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (mounted) setUid(data?.user?.id || null); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase.from('lead_tag_registry').select('name, color');
      if (activeTeamId) q = q.eq('team_id', activeTeamId);
      else if (uid) q = q.eq('user_id', uid).is('team_id', null);
      else return;
      const { data, error } = await q;
      if (cancelled || error) return;
      const map = {};
      const names = [];
      (data || []).forEach(t => { if (t.name) { map[t.name.trim().toLowerCase()] = t.color; names.push(t.name); } });
      setTagRegistry(map, names);
    })();
    return () => { cancelled = true; };
  }, [activeTeamId, uid]);
}
