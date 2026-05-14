// src/hooks/useLeads.js
//
// Supabase-Hook für die Leads-Seite.
//
// Wichtige Defaults für Leadesk:
//   - team_id Filter wird VIA RLS auf der DB durchgesetzt, hier nicht nochmal
//   - status-Werte: 'Lead' | 'LQL' | 'MQL' | 'MQN' | 'SQL' (siehe leads_crm_status_check)
//   - Optimistic Update bei Drag-Drop im Kanban
//   - Realtime-Subscription für Multi-User-Editing

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Spalten die wir für die List-/Board-View brauchen.
// next_action_at/score/deal_value sind optional — wenn die Spalten in eurer
// DB noch nicht existieren, einfach aus dem select() raus.
const LEADS_SELECT = `
  id,
  first_name,
  last_name,
  email,
  phone,
  company,
  position,
  linkedin_url,
  location,
  status,
  score,
  source,
  tags,
  description,
  deal_value,
  next_action_at,
  created_at,
  updated_at,
  owners:lead_owners(
    user_id,
    role,
    profile:profiles(id, first_name, last_name, avatar_url)
  )
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
      .order('updated_at', { ascending: false });

    if (!mountedRef.current) return;

    if (error) {
      setError(error);
      setIsLoading(false);
      return;
    }

    // Owner-Shape von Supabase normalisieren — von
    //   { user_id, role, profile: { first_name, ... } }
    // zu
    //   { id, first_name, last_name, role }
    const normalized = (data || []).map((lead) => ({
      ...lead,
      owners: (lead.owners || [])
        .map((o) => o.profile && {
          id: o.profile.id,
          first_name: o.profile.first_name,
          last_name: o.profile.last_name,
          avatar_url: o.profile.avatar_url,
          role: o.role,
        })
        .filter(Boolean),
    }));

    setLeads(normalized);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchLeads();

    // Realtime: alle leads-Changes für unser Team
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
