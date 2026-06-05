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

  // Realtime auf lead_tasks (sync mit LeadDetail-TasksTab, Co-Editing) +
  // lead_task_assignees (Multi-Assignee-Change soll Hub refreshen).
  // 2026-06-02: Junction-Channel ohne Filter — RLS scoped serverseitig auf
  // eigene/Co-Assignee-Rows, das ist die richtige Sichtbarkeit fuer den Hub.
  useEffect(() => {
    if (!uid) return;
    const filter = activeTeamId
      ? `team_id=eq.${activeTeamId}`
      : `created_by=eq.${uid}`;
    const tasksChannel = supabase
      .channel(`lead-tasks-hub-${activeTeamId || uid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lead_tasks', filter },
        () => fetchAll()
      )
      .subscribe();
    const assigneesChannel = supabase
      .channel(`lead-task-assignees-hub-${activeTeamId || uid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lead_task_assignees' },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(assigneesChannel);
    };
  }, [uid, activeTeamId, fetchAll]);

  // ─── Mutations für echte lead_tasks ────────────────────────────────────
  // 2026-06-02 fix: optimistic-update + error-handling. Vorher wurde der Realtime-
  // Tick abgewartet (gefühlt "Checkbox tut nichts"), plus jeder RLS-Fail oder
  // Replication-Lag stumm geschluckt. Jetzt: UI updated sofort, Rollback wenn DB
  // ablehnt, console.warn bei Fehlern damit der Bug nicht silent ist.
  const toggleLeadTask = useCallback(async (rawId, currentStatus) => {
    const done = currentStatus !== 'done';
    const newStatus = done ? 'done' : 'open';
    const completedAt = done ? new Date().toISOString() : null;

    // Optimistic-Update: sofortiges UI-Feedback (Checkbox grün)
    setTasks(prev => prev.map(t =>
      t.source === 'lead_task' && t.rawId === rawId
        ? { ...t, status: newStatus, completed_at: completedAt }
        : t
    ));

    const { error } = await supabase.from('lead_tasks').update({
      status: newStatus,
      completed_at: completedAt,
    }).eq('id', rawId);

    if (error) {
      console.warn('[useAllTasks] toggleLeadTask failed:', error.message, '— rolling back');
      // Rollback: zurück zum vorigen Status
      setTasks(prev => prev.map(t =>
        t.source === 'lead_task' && t.rawId === rawId
          ? { ...t, status: currentStatus, completed_at: done ? null : t.completed_at }
          : t
      ));
      // Realtime/refetch zieht eh den korrekten DB-Stand wenn doch was klemmt
      fetchAll();
    }
  }, [fetchAll]);

  const deleteLeadTask = useCallback(async (rawId) => {
    // Optimistic-Remove
    setTasks(prev => prev.filter(t => !(t.source === 'lead_task' && t.rawId === rawId)));
    const { error } = await supabase.from('lead_tasks').delete().eq('id', rawId);
    if (error) {
      console.warn('[useAllTasks] deleteLeadTask failed:', error.message, '— refetching');
      fetchAll();
    }
  }, [fetchAll]);

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
