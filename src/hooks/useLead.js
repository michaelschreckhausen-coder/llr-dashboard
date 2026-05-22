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
// Spalten: LEAD_DETAIL_SELECT — Superset von LEAD_DETAIL_SELECT um Detail-only-Felder
// (li_connection_status, ai_*, industry, company_*, last_*, recommended_action,
// headline, avatar_url, team_id). Bewusst NICHT in LEAD_DETAIL_SELECT gemerged,
// damit die Listen-Query nicht zusätzliche Bytes pro Row schleppt.
// Realtime: einzelner Channel mit id-Filter — kein Bulk-Subscribe-Overhead.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Schema-Drift Hetzner-Staging vs Repo-Migration (verifiziert 2026-05-22):
// folgende Spalten existieren auf Hetzner-Staging NICHT, würden aber per
// 20260416000001_staging_schema.sql existieren — vermutlich post-Cutover
// gedroppt oder nie migriert. Bewusst aus dem SELECT raus, sonst feuert
// PostgREST 400 "column leads.X does not exist".
// Helper-Components in LeadDetail.jsx sind null-tolerant — wenn die Spalten
// per Migration nachgepflegt werden, einfach wieder in SELECT aufnehmen.
//   - recommended_action       → RecommendationBanner rendert dann
//   - company_website          → CompanyInfoBlock Website-Link
//   - company_address          → CompanyInfoBlock Adresse-Row
//   - last_activity_at         → LastActivityFooter
//   - last_action_at           → LastActivityFooter
export const LEAD_DETAIL_SELECT = `
  id,
  first_name,
  last_name,
  email,
  phone,
  company,
  job_title,
  headline,
  linkedin_url,
  avatar_url,
  location,
  city,
  country,
  status,
  lead_score,
  source,
  tags,
  notes,
  deal_value,
  next_followup,
  owner_id,
  team_id,
  is_favorite,
  li_connection_status,
  li_connection_requested_at,
  li_connected_at,
  li_about_summary,
  ai_buying_intent,
  ai_need_detected,
  ai_pain_points,
  industry,
  company_size,
  created_at,
  updated_at
`;

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
      .select(LEAD_DETAIL_SELECT)
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
      .select(LEAD_DETAIL_SELECT)
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
