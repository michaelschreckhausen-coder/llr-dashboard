// src/hooks/useLeadActivities.js
//
// Activity-Feed-Hook für die Lead-Detail-Page Aktivitäten-Tab.
//
// Liest aus dem SQL-View public.lead_activity_feed (Migration
// 20260522130000_lead_activity_feed_view.sql), der 3 Source-Tabellen
// unifiziert: activities + lead_field_history (whitelist) + lead_tasks
// (task_created + task_completed events).
//
// Rückgabe: { items, profilesById, isLoading, error, refetch }
//
// Row-Shape vom View:
//   { source, id, lead_id, type, timestamp, actor_id, payload (jsonb) }
//
// Profiles-Lookup separat via .in('id', actorIds) — kein PostgREST-Embed
// weil profiles keinen FK auf auth.users hat (CLAUDE.md Schema-Drift #11).
// NULL actor_id (z.B. field_history) wird übersprungen, render-side als
// System dargestellt.
//
// Out-of-scope für Phase 1:
//   - vernetzungen (Hetzner-Drift, deferred)
//   - linkedin_messages / email_send_log (kein lead_id-FK)
//   - Realtime-Subscription (Tab-Refresh reicht erstmal, kommt in Phase 2)
//   - Pagination (Limit 200 sollte für die meisten Leads reichen)

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Score-Spam-Filter: KI-Algorithm kann Score 5×/min ändern. Statt jede
// einzelne Field-History-Row als Event zu rendern, gruppieren wir
// aufeinanderfolgende lead_score-Changes innerhalb eines 5-Min-Windows
// zu einem einzigen Event mit from=ältester old_value, to=neuester new_value
// und collapsed_count für UI-Hint („3 Score-Updates in 5min").
//
// Items kommen sortiert nach timestamp DESC. Iteration newest→oldest;
// Cluster hält den neuesten Stand + absorbiert ältere Items rückwärts.
const SCORE_SPAM_WINDOW_MS = 5 * 60 * 1000;

function aggregateScoreSpam(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const result = [];
  let cluster = null;
  for (const item of items) {
    const isScoreEvent = item.type === 'field_changed_lead_score';
    if (
      isScoreEvent &&
      cluster &&
      cluster.lead_id === item.lead_id &&
      (new Date(cluster.timestamp).getTime() - new Date(item.timestamp).getTime()) < SCORE_SPAM_WINDOW_MS
    ) {
      // Extend cluster rückwärts: old_value wird auf den älteren Wert dieses Items gesetzt
      cluster.payload = { ...cluster.payload, old_value: item.payload?.old_value ?? cluster.payload?.old_value };
      cluster.collapsed_count = (cluster.collapsed_count || 1) + 1;
      continue;
    }
    if (isScoreEvent) {
      // Start neuer Cluster — Item wird mutiertes Objekt in result
      cluster = { ...item, payload: { ...item.payload }, collapsed_count: 1 };
      result.push(cluster);
    } else {
      // Non-score Event: Cluster reset, Item normal pushen
      cluster = null;
      result.push(item);
    }
  }
  return result;
}

export function useLeadActivities(leadId) {
  const [items, setItems] = useState([]);
  const [profilesById, setProfilesById] = useState(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchFeed = useCallback(async () => {
    if (!leadId) {
      setItems([]);
      setProfilesById(new Map());
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);

    const { data, error: fetchError } = await supabase
      .from('lead_activity_feed')
      .select('source, id, lead_id, type, timestamp, actor_id, payload')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false })
      .limit(200);

    if (!mountedRef.current) return;

    if (fetchError) {
      setError(fetchError);
      setItems([]);
      setIsLoading(false);
      return;
    }

    const rows = data || [];
    setItems(aggregateScoreSpam(rows));

    // Profiles für nicht-NULL actor_ids fetchen (separates Query — kein
    // PostgREST-Embed, weil profiles.id keinen FK auf auth.users hat).
    const actorIds = Array.from(
      new Set(rows.map(r => r.actor_id).filter(Boolean))
    );
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, email, avatar_url')
        .in('id', actorIds);
      if (mountedRef.current && Array.isArray(profiles)) {
        setProfilesById(new Map(profiles.map(p => [p.id, p])));
      }
    } else {
      if (mountedRef.current) setProfilesById(new Map());
    }

    setError(null);
    setIsLoading(false);
  }, [leadId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFeed();
    return () => { mountedRef.current = false; };
  }, [fetchFeed]);

  // Realtime-Subscription auf die 3 Source-Tabellen des lead_activity_feed-Views.
  // Einkanal-Pattern mit drei .on()-Listenern — gemeinsamer Channel pro Lead,
  // jede Tabelle hat ihren eigenen Filter auf lead_id. Jeder Event triggert
  // fetchFeed() das den unifizierten View neu lädt.
  //
  // Realtime-Voraussetzungen (siehe Migrations):
  //   - lead_tasks:         supabase_realtime + REPLICA IDENTITY FULL (20260522150000 + 20260526090000)
  //   - activities:         supabase_realtime + REPLICA IDENTITY FULL (20260526100000)
  //   - lead_field_history: supabase_realtime + REPLICA IDENTITY FULL (20260526100000)
  //
  // RLS-Filter greift serverseitig — User sieht nur Events auf eigenen Rows.
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`lead-activities-${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activities', filter: `lead_id=eq.${leadId}` },
        () => fetchFeed()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_field_history', filter: `lead_id=eq.${leadId}` },
        () => fetchFeed()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_tasks', filter: `lead_id=eq.${leadId}` },
        () => fetchFeed()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vernetzungen', filter: `lead_id=eq.${leadId}` },
        () => fetchFeed()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, fetchFeed]);

  return useMemo(
    () => ({ items, profilesById, isLoading, error, refetch: fetchFeed }),
    [items, profilesById, isLoading, error, fetchFeed]
  );
}
