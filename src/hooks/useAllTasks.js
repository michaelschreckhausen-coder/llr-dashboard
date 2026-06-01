// src/hooks/useAllTasks.js
//
// Hook für die /aufgaben-Hub-Page. Lädt alle Aufgaben-Quellen via
// src/lib/taskSources.js, normalisiert sie und gibt ein einheitliches
// Array zurück.
//
// Returns:
//   {
//     tasks,           // Array<NormalizedTask>
//     loading,
//     refetch,
//     toggleLeadTask,  // (rawId, currentStatus) → Promise — nur für source==='lead_task'
//     deleteLeadTask,  // (rawId) → Promise — nur für source==='lead_task'
//     dismissSsi,      // () → void — SSI-Daily-Karte für heute ausblenden
//   }
//
// Realtime: Subscribed nur auf lead_tasks (die einzige editierbare Quelle).
// Polling: alle 60s für die virtuellen Quellen.

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';
import { loadAllTaskSources, dismissSsiToday } from '../lib/taskSources';

export function useAllTasks({ session, enabledSources = null } = {}) {
  const { activeTeamId } = useTeam() || {};
  const uid = session?.user?.id || null;

  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!uid) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await loadAllTaskSources({ uid, activeTeamId, enabledSources });
    if (!mountedRef.current) return;
    setTasks(data);
    setLoading(false);
  }, [uid, activeTeamId, enabledSources]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    // Polling für virtuelle Quellen (lead_tasks läuft separat via Realtime)
    const interval = setInterval(fetchAll, 60_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchAll]);

  // Realtime nur auf lead_tasks (sync mit LeadDetail-TasksTab, Co-Editing)
  useEffect(() => {
    if (!uid) return;
    const filter = activeTeamId
      ? `team_id=eq.${activeTeamId}`
      : `created_by=eq.${uid}`;
    const channel = supabase
      .channel(`lead-tasks-hub-${activeTeamId || uid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lead_tasks', filter },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [uid, activeTeamId, fetchAll]);

  // ─── Mutations für echte lead_tasks ────────────────────────────────────
  const toggleLeadTask = useCallback(async (rawId, currentStatus) => {
    const done = currentStatus !== 'done';
    await supabase.from('lead_tasks').update({
      status: done ? 'done' : 'open',
      completed_at: done ? new Date().toISOString() : null,
    }).eq('id', rawId);
    // Realtime feuert load() — kein optimistic-update nötig
  }, []);

  const deleteLeadTask = useCallback(async (rawId) => {
    await supabase.from('lead_tasks').delete().eq('id', rawId);
  }, []);

  const dismissSsi = useCallback(() => {
    dismissSsiToday();
    fetchAll();
  }, [fetchAll]);

  return {
    tasks,
    loading,
    refetch: fetchAll,
    toggleLeadTask,
    deleteLeadTask,
    dismissSsi,
  };
}
