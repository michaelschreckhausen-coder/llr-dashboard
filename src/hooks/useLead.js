// src/hooks/useLead.js
//
// Single-Lead-Fetcher für die Detail-Page.
//
// Usage:
//   const { lead, isLoading, error, refetch } = useLead(id)
//
//   - lead: Lead-Row oder null (not-found ist explicit null)
//   - isLoading: true bei initial fetch + bei refetches
//   - error: PostgrestError oder null
//   - refetch: manual trigger (e.g. nach Edit)
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

  return useMemo(
    () => ({ lead, isLoading, error, refetch: fetchLead }),
    [lead, isLoading, error, fetchLead]
  );
}
