// src/hooks/useProfiles.js
//
// Batched Profile-Fetcher für Owner-Display + ähnliche User→Profil-Lookups.
//
// Usage:
//   const { profilesById, isLoading } = useProfiles(userIds)
//   const owner = profilesById.get(someUserId)  // Profil-Row, null, oder undefined
//
// Hintergrund:
//   - `profiles.id` hat keinen FK auf `auth.users(id)` (siehe CLAUDE.md
//     Schema-Drift-Tracker), daher kann PostgREST keinen Embed
//     `owner:profiles!fk_name(...)` resolven. Workaround: separate
//     Batch-Query auf profiles + In-Memory-Map.
//
// Implementation:
//   - Module-Level-Cache (geteilt über alle Konsumenten) → keine
//     redundanten Fetches bei mehreren Components mit gleichen IDs
//   - Dedup via Set + Sort als stabile useEffect-Dep
//   - Missing-Profile-IDs werden mit `null` gecached → kein Re-Fetch
//     für tote owner_ids
//   - Realtime-Subscription auf profiles bewusst NICHT in dieser Iteration
//     (Backlog, falls Multi-User-Profil-Edits an einem Lead-View live
//     reflektiert werden sollen)

import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Module-Level Cache, persists across component lifecycles.
const cache = new Map(); // id → profile-row | null

async function fetchMissing(missingIds) {
  if (missingIds.length === 0) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url')
    .in('id', missingIds);

  if (error) {
    console.error('[useProfiles] fetch error:', error);
    // Bei Fehler nicht cachen — beim nächsten Render wird erneut versucht.
    return;
  }

  const found = new Set();
  for (const row of data || []) {
    cache.set(row.id, row);
    found.add(row.id);
  }
  // IDs ohne Profile-Row mit null cachen, damit wir nicht endlos re-fetchen.
  for (const id of missingIds) {
    if (!found.has(id)) cache.set(id, null);
  }
}

export function useProfiles(userIds) {
  // Stabile Dep-Signature: dedup + sort, damit useEffect nur bei echter
  // ID-Set-Änderung re-runt.
  const dedupedKey = useMemo(() => {
    const set = new Set((userIds || []).filter(Boolean));
    return Array.from(set).sort().join(',');
  }, [userIds]);

  // Initial-State aus Cache (synchron, ohne Flash für bereits geladene IDs).
  const [profilesById, setProfilesById] = useState(() => {
    const map = new Map();
    for (const id of (userIds || []).filter(Boolean)) {
      if (cache.has(id)) map.set(id, cache.get(id));
    }
    return map;
  });
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const ids = dedupedKey ? dedupedKey.split(',').filter(Boolean) : [];

    if (ids.length === 0) {
      setProfilesById(new Map());
      setIsLoading(false);
      return;
    }

    const missing = ids.filter((id) => !cache.has(id));

    if (missing.length === 0) {
      const map = new Map();
      for (const id of ids) map.set(id, cache.get(id));
      setProfilesById(map);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchMissing(missing).then(() => {
      if (!mountedRef.current) return;
      const map = new Map();
      for (const id of ids) map.set(id, cache.get(id));
      setProfilesById(map);
      setIsLoading(false);
    });

    return () => {
      mountedRef.current = false;
    };
  }, [dedupedKey]);

  return { profilesById, isLoading };
}
