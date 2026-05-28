// src/hooks/useLeadViews.js
//
// Sprint B · Saved Views ("Ansichten") für die Leads-Page.
//
// Liefert CRUD über public.lead_views + Tracking der aktiven View
// in user_preferences.active_lead_view_id.
//
// Architektur-Entscheidungen:
//   - Default-View-Seed passiert hier (Frontend), NICHT im handle_new_user-Trigger.
//     Damit funktioniert es auch für bestehende User retroaktiv und vermeidet
//     den heikelsten Trigger der App (CLAUDE.md Top-Fallstrick #10).
//   - currentUser wird einmal beim Mount geladen und gecached — RLS macht den
//     Rest auf der DB-Seite.
//   - Realtime-Subscription auf lead_views, damit Team-Member-Views live
//     auftauchen sobald jemand mit is_shared=true speichert.
//
// API:
//   const { views, activeViewId, isLoading, error,
//           refetch, createView, updateView, deleteView,
//           setActiveView, currentUserId } = useLeadViews();
//
// filter_json-Schema (siehe Leads.jsx):
//   { quickFilter, stageTab, listFilter, tagsFilter, ownerFilter, sortBy, search }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_VIEW_NAME = 'Meine Kontakte';

export function useLeadViews({ activeTeamId } = {}) {
  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewIdState] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const seedAttemptedRef = useRef(false);

  // ─── Initial-Load: views + active_lead_view_id + currentUser ──────────
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!mountedRef.current) return;
    if (!user) { setIsLoading(false); return; }
    setCurrentUserId(user.id);

    // Views via RLS (eigene + team-shared)
    const { data: viewsData, error: viewsErr } = await supabase
      .from('lead_views')
      .select('id, user_id, team_id, name, filter_json, is_shared, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!mountedRef.current) return;
    if (viewsErr) {
      setError(viewsErr);
      setIsLoading(false);
      return;
    }

    setViews(viewsData || []);

    // Active-View-ID aus user_preferences (maybeSingle → null wenn kein Pref-Row)
    const { data: prefRow } = await supabase
      .from('user_preferences')
      .select('active_lead_view_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!mountedRef.current) return;
    // Nur setzen wenn die referenzierte View auch noch existiert (RLS könnte
    // sie zwischenzeitlich aus dem Result rausgefiltert haben, z.B. is_shared
    // wurde abgedreht)
    const activeId = prefRow?.active_lead_view_id || null;
    if (activeId && (viewsData || []).some(v => v.id === activeId)) {
      setActiveViewIdState(activeId);
    } else {
      setActiveViewIdState(null);
    }

    setIsLoading(false);
  }, []);

  // ─── Default-Seed: "Meine Leads" anlegen wenn User noch keine Views hat ──
  // Idempotent durch Server-Check (views-Array vom letzten fetch) + Lock-Ref
  // gegen Doppel-Seed bei Race-Conditions (z.B. zwei Tabs).
  const ensureDefaultView = useCallback(async () => {
    if (seedAttemptedRef.current) return;
    if (isLoading) return;
    if (!currentUserId) return;
    if (views.length > 0) return;
    seedAttemptedRef.current = true;

    const { data, error: createErr } = await supabase
      .from('lead_views')
      .insert({
        user_id: currentUserId,
        team_id: activeTeamId || null,
        name: DEFAULT_VIEW_NAME,
        filter_json: { ownerFilter: currentUserId, quickFilter: 'all' },
        is_shared: false,
        sort_order: 0,
      })
      .select()
      .single();

    if (createErr) {
      console.warn('[useLeadViews] Default-Seed fehlgeschlagen:', createErr.message);
      // Bei Race-Conditions (UNIQUE-Violation o.ä.) kein refetch-Loop,
      // sondern auf nächsten Trigger warten
      return;
    }

    if (!mountedRef.current) return;
    setViews(prev => [...prev, data]);
  }, [isLoading, currentUserId, views.length, activeTeamId]);

  // ─── Initial-Load + Realtime-Subscription ───────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    fetchAll();

    const channel = supabase
      .channel('lead-views-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lead_views' },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  // Default-Seed nach Initial-Load (nicht in fetchAll, sonst race)
  useEffect(() => { ensureDefaultView(); }, [ensureDefaultView]);

  // ─── CRUD ─────────────────────────────────────────────────────────────
  const createView = useCallback(async ({ name, filter_json, is_shared = false, team_id }) => {
    if (!currentUserId) return { error: new Error('Kein User eingeloggt') };
    const payload = {
      user_id: currentUserId,
      team_id: is_shared ? (team_id || activeTeamId || null) : null,
      name: (name || '').trim() || 'Neue Ansicht',
      filter_json: filter_json || {},
      is_shared: !!is_shared,
      sort_order: (views.length || 0),
    };
    const { data, error } = await supabase
      .from('lead_views')
      .insert(payload)
      .select()
      .single();
    if (error) return { error };
    if (mountedRef.current) {
      setViews(prev => [...prev, data]);
    }
    return { data };
  }, [currentUserId, activeTeamId, views.length]);

  const updateView = useCallback(async (id, patch) => {
    // Optimistic
    setViews(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
    const { data, error } = await supabase
      .from('lead_views')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[useLeadViews] Update failed, refetching:', error);
      fetchAll();
      return { error };
    }
    return { data };
  }, [fetchAll]);

  const deleteView = useCallback(async (id) => {
    // Optimistic + Active-View-Reset wenn nötig
    setViews(prev => prev.filter(v => v.id !== id));
    if (activeViewId === id) setActiveViewIdState(null);
    const { error } = await supabase
      .from('lead_views')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[useLeadViews] Delete failed, refetching:', error);
      fetchAll();
      return { error };
    }
    return {};
  }, [activeViewId, fetchAll]);

  // ─── Active-View-Tracking via user_preferences ─────────────────────────
  const setActiveView = useCallback(async (viewId) => {
    if (!currentUserId) return;
    setActiveViewIdState(viewId); // optimistic
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: currentUserId,
        active_lead_view_id: viewId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) {
      console.warn('[useLeadViews] active_lead_view_id persist fehlgeschlagen:', error.message);
      // Nicht zurückrollen — die UI-Selection ist wichtiger als die Persistenz
    }
  }, [currentUserId]);

  return useMemo(() => ({
    views,
    activeViewId,
    currentUserId,
    isLoading,
    error,
    refetch: fetchAll,
    createView,
    updateView,
    deleteView,
    setActiveView,
  }), [views, activeViewId, currentUserId, isLoading, error, fetchAll, createView, updateView, deleteView, setActiveView]);
}
