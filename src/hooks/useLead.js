// src/hooks/useLead.js
//
// Single-Lead-Fetcher für die Detail-Page.
//
// Usage:
//   const { lead, isLoading, error, refetch, updateLead } = useLead(id)
//
//   - lead: Lead-Row oder null (not-found ist explicit null)
//   - isLoading: true bei initial fetch + bei refetches
//   - error: PostgrestError oder null
//   - refetch: manual trigger (e.g. nach Edit)
//   - updateLead(patch): optimistic update + supabase.update,
//     returns { data, error }. Rollt bei Fehler über fetchLead zurück.
//     Caveat: status separat updaten (Top-Fallstrick #1 in CLAUDE.md) —
//     ENUM-/CHECK-Felder dürfen nicht im selben update() mit Text bundlen.
//
// Spalten: LEADS_SELECT aus useLeads (DRY, single source of truth).
// Realtime: einzelner Channel mit id-Filter — kein Bulk-Subscribe-Overhead.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { LEADS_SELECT } from './useLeads';

export function useLead(id) {
  const [lead, setLead] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchLead = useCallback(async () => {
    if (!id) {
      setLead(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    const { data, error: fetchError } = await supabase
      .from('leads')
      .select(LEADS_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (!mountedRef.current) return;

    if (fetchError) {
      setError(fetchError);
      setLead(null);
    } else {
      setError(null);
      setLead(data); // null wenn not-found (maybeSingle)
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    fetchLead();

    if (!id) return;

    // Realtime auf genau diesen einen Lead — Postgres-CDC mit id-Filter.
    const channel = supabase
      .channel(`lead-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `id=eq.${id}` },
        () => fetchLead()
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [id, fetchLead]);

  // Optimistic Update — schreibt patch lokal sofort und sendet supabase.update.
  // Bei Fehler: vollständiger refetch als Rollback.
  // Bei Erfolg: Realtime-Subscription liefert eh den authoritativen State
  // nach; das hier ist nur die UI-Sofort-Reaktion.
  const updateLead = useCallback(async (patch) => {
    if (!id) return { error: { message: 'no lead id' } };
    if (!patch || Object.keys(patch).length === 0) return { data: null };

    // Optimistic: lokalen State sofort patchen
    setLead((prev) => (prev ? { ...prev, ...patch } : prev));

    const { data, error: updateError } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', id)
      .select(LEADS_SELECT)
      .maybeSingle();

    if (!mountedRef.current) return { data, error: updateError };

    if (updateError) {
      // Rollback via Re-Fetch (sicherer als manual revert)
      fetchLead();
      return { error: updateError };
    }

    if (data) setLead(data);
    return { data };
  }, [id, fetchLead]);

  return useMemo(
    () => ({ lead, isLoading, error, refetch: fetchLead, updateLead }),
    [lead, isLoading, error, fetchLead, updateLead]
  );
}
