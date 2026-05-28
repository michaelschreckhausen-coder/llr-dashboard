// src/hooks/useDashboardData.js
//
// Single-Hook für die Dashboard-Tagesreise.
// Parallel-Fetch aus den Quellen die das Layout heute braucht:
//   - leads:         Hot-Leads-Liste + Counts (im aktiven Team)
//   - deals:         Pipeline-Wert + Win-Rate + Deal-Counts (moderne
//                    Datenquelle, siehe CLAUDE.md Top-Fallstrick #15)
//   - lead_tasks:    Überfällige + heute fällige Aufgaben
//   - ssi_scores:    User-LinkedIn-SSI (user-scoped, nicht team-scoped)
//
// Returns: {
//   leads, deals, tasks, ssi, hasSSI,
//   activeTeamId, userId, firstName,
//   isLoading, error, refetch
// }
//
// Solo-Fallback (kein activeTeamId) analog Aufgaben.jsx / useLeads.
// Team-Switch-Re-Fetch über activeTeamId-Dep.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

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

const DASHBOARD_TASKS_SELECT = `
  id, lead_id, title, status, priority, due_date,
  completed_at, assigned_to, created_by, created_at,
  leads(id, first_name, last_name, name, company)
`;

export function useDashboardData({ session } = {}) {
  const { activeTeamId } = useTeam() || {};
  const userId = session?.user?.id || null;
  const meta = session?.user?.user_metadata || {};
  const firstName = (meta.full_name || meta.name || session?.user?.email?.split('@')[0] || 'User').split(' ')[0];

  const [leads, setLeads]       = useState([]);
  const [deals, setDeals]       = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [ssi, setSsi]           = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!userId && !activeTeamId) {
      setLeads([]); setDeals([]); setTasks([]); setSsi(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Helper: Team-Scope mit Solo-Fallback. owner-Spalte parametrisch
    // (leads + organizations: user_id; lead_tasks + deals: created_by).
    const scope = (q, ownerCol = 'user_id') => activeTeamId
      ? q.eq('team_id', activeTeamId)
      : userId ? q.eq(ownerCol, userId).is('team_id', null) : q;

    const [leadsRes, dealsRes, tasksRes, ssiRes] = await Promise.allSettled([
      scope(supabase.from('leads').select(DASHBOARD_LEADS_SELECT).eq('archived', false)),
      scope(supabase.from('deals').select(DASHBOARD_DEALS_SELECT), 'created_by'),
      // Aufgaben: nur open + fällig bis morgen
      scope(
        supabase.from('lead_tasks')
          .select(DASHBOARD_TASKS_SELECT)
          .eq('status', 'open')
          .lte('due_date', tomorrowStr)
          .order('due_date', { ascending: true })
          .limit(20),
        'created_by'
      ),
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

    // Defensive error logging — kein silent swallow
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
    setTasks(tasksRes.status === 'fulfilled' ? (tasksRes.value.data || []) : []);
    setSsi(ssiRes.status === 'fulfilled' ? ((ssiRes.value.data || [])[0] || null) : null);
    setIsLoading(false);
  }, [activeTeamId, userId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    // Auto-Refresh alle 60s (entspricht alter Dashboard-Polling-Frequenz)
    const t = setInterval(fetchAll, 60000);
    return () => {
      mountedRef.current = false;
      clearInterval(t);
    };
  }, [fetchAll]);

  // Derived state — wird memoized damit Consumer-Memo greift
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

    // Überfällige + heute fällige Tasks
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today);
    const todayTasks = tasks.filter(t => t.due_date === today);

    // Leads mit überfälligem next_followup
    const overdueLeads = leads.filter(l => l.next_followup && new Date(l.next_followup) < now);

    // Vernetzte Leads
    const connectedCount = leads.filter(l => l.li_connection_status === 'verbunden').length;

    // SSI-Verfügbarkeit
    const hasSSI = Boolean(ssi?.total_score);

    return {
      activeDeals, wonDeals, lostDeals,
      pipelineValue, wonValue, winRate,
      hotLeads, overdueTasks, todayTasks, overdueLeads,
      connectedCount, hasSSI,
    };
  }, [leads, deals, tasks, ssi]);

  return useMemo(
    () => ({
      // Raw data
      leads, deals, tasks, ssi,
      // Context
      activeTeamId, userId, firstName,
      // State
      isLoading, error, refetch: fetchAll,
      // Derived
      ...derived,
    }),
    [leads, deals, tasks, ssi, activeTeamId, userId, firstName, isLoading, error, fetchAll, derived]
  );
}
