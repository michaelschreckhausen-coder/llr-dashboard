// src/hooks/useLeads.js
//
// Supabase-Hook für die Leads-Seite.
//
// Wichtige Defaults für Leadesk:
//   - team_id Filter wird VIA RLS auf der DB durchgesetzt, hier nicht nochmal
//   - status-Werte: 'Lead' | 'LQL' | 'MQL' | 'MQN' | 'SQL' (siehe leads_crm_status_check)
//   - archived=false Filter (Prod-Default)
//   - Optimistic Update bei Drag-Drop im Kanban
//   - Realtime-Subscription für Multi-User-Editing
//
// PR 2 Schema-Mapping (zu Prod-Schema):
//   position    → job_title
//   score       → lead_score
//   description → notes
//   next_action_at → next_followup
//   owners[]    → owner_id (raw uuid)   ← PR 3 ersetzt das durch
//                                          useProfiles(ownerIds)-Lookup;
//                                          Profile-Join via PostgREST-Embed
//                                          nicht möglich (profiles.id hat
//                                          keinen FK auf auth.users.id —
//                                          siehe CLAUDE.md Schema-Drift)

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const LEADS_SELECT = `
  id,
  first_name,
  last_name,
  email,
  phone,
  company,
  job_title,
  linkedin_url,
  location,
  status,
  lead_score,
  source,
  tags,
  notes,
  deal_value,
  next_followup,
  owner_id,
  is_favorite,
  created_at,
  updated_at
`;

export function useLeads() {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Damit Re-Subscribes nicht race-conditionen
  const mountedRef = useRef(true);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select(LEADS_SELECT)
      .eq('archived', false)
      .order('updated_at', { ascending: false });

    if (!mountedRef.current) return;

    if (error) {
      setError(error);
      setIsLoading(false);
      return;
    }

    setLeads(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchLeads();

    // Realtime: alle leads-Changes für unser Team (RLS-gefiltert)
    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  // Optimistic status update — für Drag-Drop im Kanban
  const updateLeadStatus = useCallback(async (leadId, newStatus) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );

    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (error) {
      // Rollback bei Fehler
      console.error('Status-Update fehlgeschlagen:', error);
      fetchLeads();
    }
  }, [fetchLeads]);

  // Stable refs (useMemo, damit Consumer-Memo greift)
  const value = useMemo(
    () => ({ leads, isLoading, error, refetch: fetchLeads, updateLeadStatus }),
    [leads, isLoading, error, fetchLeads, updateLeadStatus]
  );

  return value;
}
