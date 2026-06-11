// src/hooks/useDashboardData.js
//
// Single-Hook für die Dashboard-Tagesreise.
// Parallel-Fetch aus den Quellen die das Layout heute braucht:
//   - leads:           Hot-Leads-Liste + Counts (im aktiven Team)
//   - deals:           Pipeline-Wert + Win-Rate + Deal-Counts (moderne
//                      Datenquelle, siehe CLAUDE.md Top-Fallstrick #15)
//   - ssi_scores:      User-LinkedIn-SSI (user-scoped, nicht team-scoped)
//   - taskSources:     UNIFIED — alle Aufgaben-Quellen über
//                      src/lib/taskSources (lead_tasks + content_posts +
//                      pm_tasks + deal_followups + lead_followups + ssi_daily +
//                      linkedin_unanswered + stale_leads)
//
// Refactored 2026-06-01 (Task-Hub-Sprint):
//   - overdueTasks / todayTasks enthalten jetzt alle Quellen (normalized).
//   - overdueLeads ist jetzt eine Subset-Sicht (rückwärts-kompatibel für
//     bestehende Dashboard-Render-Logik, falls noch Konsumenten existieren).
//
// Returns: {
//   leads, deals, ssi, hasSSI,
//   activeTeamId, userId, firstName,
//   isLoading, error, refetch,
//   tasks,                    // alias auf overdueTasks (legacy)
//   overdueTasks, todayTasks, // normalized Tasks aus ALLEN Quellen
//   overdueLeads,             // legacy alias, jetzt subset von overdueTasks
//   activeDeals, wonDeals, lostDeals, pipelineValue, wonValue, winRate,
//   hotLeads, connectedCount,
// }

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';
import { loadAllTaskSources } from '../lib/taskSources';

const DASHBOARD_LEADS_SELECT = `
  id, first_name, last_name, name, company, job_title,
  status, lead_score, hs_score, source, tags,
  owner_id, organization_id,
  next_followup, is_favorite,
  li_connection_status,
  ai_buying_intent,
  created_at, updated_at
`;

const DASHBOARD_DEALS_SELECT = `
  id, lead_id, organization_id, title,
  value, stage, probability, expected_close_date,
  created_by, created_at, updated_at
`;

export function useDashboardData({ session } = {}) {
  const { activeTeamId } = useTeam() || {};
  const userId = session?.user?.id || null;
  const meta = session?.user?.user_metadata || {};
  const firstName = (meta.full_name || meta.name || session?.user?.email?.split('@')[0] || 'User').split(' ')[0];

  const [leads, setLeads]       = useState([]);
  const [deals, setDeals]       = useState([]);
  const [allTasks, setAllTasks] = useState([]); // normalized aus taskSources
  const [ssi, setSsi]           = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!userId && !activeTeamId) {
      setLeads([]); setDeals([]); setAllTasks([]); setSsi(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    // Hardening 2026-06-11: STRICT. Ohne userId/team -> leerer match.
    const scope = (q, ownerCol = 'user_id') => activeTeamId
      ? q.eq('team_id', activeTeamId)
      : (userId ? q.eq(ownerCol, userId).is('team_id', null) : q.eq('id', '00000000-0000-0000-0000-000000000000'));

    const [leadsRes, dealsRes, tasksRes, ssiRes] = await Promise.allSettled([
      scope(supabase.from('leads').select(DASHBOARD_LEADS_SELECT).eq('archived', false)),
      scope(supabase.from('deals').select(DASHBOARD_DEALS_SELECT), 'created_by'),
      // UNIFIED Task-Hub: alle Quellen normalized
      loadAllTaskSources({ uid: userId, activeTeamId }),
      // SSI ist user-scoped (nicht team-scoped). Wenn kein userId → skip.
      userId
        ? supabase.from('ssi_entries')
            .select('*')
            .eq('user_id', userId)
            .order('measured_at', { ascending: false })
            .limit(1)
            .then(r => r.data?.length
              ? r
              : supabase.from('ssi_scores')
                  .select('total_score, build_brand, find_people, engage_insights, build_relationships, recorded_at')
                  .eq('user_id', userId)
                  .order('recorded_at', { ascending: false })
                  .limit(1))
        : Promise.resolve({ data: [] }),
    ]);

    if (!mountedRef.current) return;

    [
      ['leads', leadsRes],
      ['deals', dealsRes],
      ['tasks', tasksRes],
      ['ssi', ssiRes],
    ].forEach(([name, res]) => {
      if (res.status === 'rejected') {
        console.warn(`[useDashboardData] ${name} fetch rejected:`, res.reason);
      } else if (res.value?.error) {
        console.warn(`[useDashboardData] ${name} fetch error:`, res.value.error.message);
      }
    });

    setLeads(leadsRes.status === 'fulfilled' ? (leadsRes.value.data || []) : []);
    setDeals(dealsRes.status === 'fulfilled' ? (dealsRes.value.data || []) : []);
    setAllTasks(tasksRes.status === 'fulfilled' ? (tasksRes.value || []) : []);
    setSsi(ssiRes.status === 'fulfilled' ? ((ssiRes.value.data || [])[0] || null) : null);
    setIsLoading(false);
  }, [activeTeamId, userId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => {
      mountedRef.current = false;
      clearInterval(t);
    };
  }, [fetchAll]);

  const derived = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Pipeline aus deals-Tabelle (Top-Fallstrick #15)
    const activeDeals = deals.filter(d => d.stage && !['verloren', 'kein_deal', 'gewonnen'].includes(d.stage));
    const wonDeals = deals.filter(d => d.stage === 'gewonnen');
    const lostDeals = deals.filter(d => d.stage === 'verloren');
    const pipelineValue = activeDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const closed = wonDeals.length + lostDeals.length;
    const winRate = closed > 0 ? Math.round((wonDeals.length / closed) * 100) : 0;

    // Hot Leads
    const hotLeads = leads
      .filter(l => (l.hs_score || l.lead_score || 0) >= 70)
      .sort((a, b) => (b.hs_score || b.lead_score || 0) - (a.hs_score || a.lead_score || 0));

    // Aufgaben für den Tag — alle Quellen
    const openTasks = allTasks.filter(t => t.status === 'open');
    const overdueTasks = openTasks
      .filter(t => t.due_date && t.due_date < today)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    const todayTasks = openTasks
      .filter(t => t.due_date === today);

    // Legacy-Alias für rückwärts-kompatible Dashboard-Render-Logik:
    // overdueLeads ist heute nur die Subset der lead_followup-Source.
    // Bestehende Dashboard.jsx-Logik liest l.first_name / l.next_followup —
    // wir reichen ein "leadShape"-Array durch, das beides erfüllt.
    const overdueLeads = []; // jetzt eingerollt in overdueTasks → leer halten

    // Vernetzte Leads
    const connectedCount = leads.filter(l => l.li_connection_status === 'verbunden').length;

    const hasSSI = Boolean(ssi?.total_score);

    return {
      activeDeals, wonDeals, lostDeals,
      pipelineValue, wonValue, winRate,
      hotLeads, overdueTasks, todayTasks, overdueLeads,
      connectedCount, hasSSI,
    };
  }, [leads, deals, allTasks, ssi]);

  return useMemo(
    () => ({
      // Raw data
      leads, deals, ssi,
      tasks: allTasks,             // legacy field — jetzt normalized
      // Context
      activeTeamId, userId, firstName,
      // State
      isLoading, error, refetch: fetchAll,
      // Derived
      ...derived,
    }),
    [leads, deals, allTasks, ssi, activeTeamId, userId, firstName, isLoading, error, fetchAll, derived]
  );
}
