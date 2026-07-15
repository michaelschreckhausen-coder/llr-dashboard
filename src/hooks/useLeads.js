// src/hooks/useLeads.js
//
// Supabase-Hook für die Leads-Seite.
//
// Wichtige Defaults für Leadesk:
//   - EXPLIZITER team_id-Filter (NICHT auf RLS verlassen) — sonst sieht ein
//     User, der Member in mehreren Teams ist, alle Teams gleichzeitig und
//     der Team-Switch wirkt nicht. Bug-Fix 2026-05-29.
//   - Solo-User-Fallback: ohne activeTeamId → user_id=uid + team_id IS NULL
//     (analog Aufgaben.jsx / Organizations.jsx)
//   - status-Werte: 'Lead' | 'LQL' | 'MQL' | 'MQN' | 'SQL' (siehe leads_crm_status_check)
//   - archived-Filter via showArchived-Param (Default false = Prod-Default;
//     showArchived=true liefert die archivierten Leads für eine Archiv-Ansicht)
//   - Optimistic Update bei Drag-Drop im Kanban
//   - Realtime-Subscription mit activeTeamId im Channel-Namen +
//     Postgres-Filter, damit der Sub beim Team-Wechsel sauber rebuiltet
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
import { useTeam } from '../context/TeamContext';

export const LEADS_SELECT = `
  id,
  first_name,
  last_name,
  email,
  phone,
  company,
  organization_id,
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
  archived,
  enriched_at,
  created_at,
  updated_at
`;

export function useLeads({ showArchived = false } = {}) {
  const { activeTeamId } = useTeam() || {};
  const [uid, setUid] = useState(null);
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Damit Re-Subscribes nicht race-conditionen
  const mountedRef = useRef(true);

  // uid einmalig holen (nicht in fetchLeads-Closure, sonst extra round-trip)
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUid(data?.user?.id || null);
    });
    return () => { mounted = false; };
  }, []);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);

    let q = supabase
      .from('leads')
      .select(LEADS_SELECT)
      .eq('archived', !!showArchived);

    if (activeTeamId) {
      q = q.eq('team_id', activeTeamId);
    } else if (uid) {
      // Solo-User-Pfad (kein Team) — analog Aufgaben.jsx / Organizations.jsx
      q = q.eq('user_id', uid).is('team_id', null);
    } else {
      // Noch kein uid + kein activeTeamId → leerer Array, kein blinder Fetch
      if (!mountedRef.current) return;
      setLeads([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await q.order('updated_at', { ascending: false });

    if (!mountedRef.current) return;

    if (error) {
      console.warn('[useLeads] fetch error:', error.message);
      setError(error);
      setIsLoading(false);
      return;
    }

    setLeads(data || []);
    setIsLoading(false);
  }, [activeTeamId, uid, showArchived]);

  useEffect(() => {
    mountedRef.current = true;
    fetchLeads();

    // Realtime: nur Changes für das aktive Team (Channel-Name + Filter
    // enthalten activeTeamId, damit der Sub beim Wechsel sauber rebuiltet)
    const channelKey = activeTeamId || `solo-${uid || 'anon'}`;
    const channel = supabase
      .channel(`leads-changes-${channelKey}`)
      .on(
        'postgres_changes',
        activeTeamId
          ? { event: '*', schema: 'public', table: 'leads', filter: `team_id=eq.${activeTeamId}` }
          : { event: '*', schema: 'public', table: 'leads' },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [fetchLeads, activeTeamId, uid]);

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

  // Sprint B4 · Inline-Edit-Pfad für die Liste.
  // Generisches Update für beliebige Felder (text/number/date).
  // ACHTUNG (CLAUDE.md Top-Fallstrick #1): ENUM-Felder (z.B. status, deal_stage)
  // dürfen NICHT mit anderen Feldern in einem Update kombiniert werden — silent
  // fail. Für ENUMs ist updateLeadStatus zu verwenden.
  const updateLead = useCallback(async (leadId, patch) => {
    if (!leadId || !patch) return { error: new Error('Invalid args') };

    // Optimistic
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l))
    );

    const { error } = await supabase
      .from('leads')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (error) {
      console.error('[useLeads] updateLead fehlgeschlagen, refetch:', error);
      fetchLeads();
      return { error };
    }
    return {};
  }, [fetchLeads]);

  // Stable refs (useMemo, damit Consumer-Memo greift)
  const value = useMemo(
    () => ({ leads, isLoading, error, refetch: fetchLeads, updateLeadStatus, updateLead }),
    [leads, isLoading, error, fetchLeads, updateLeadStatus, updateLead]
  );

  return value;
}
