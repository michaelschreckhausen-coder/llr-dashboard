// src/hooks/useReportsData.js
//
// Single-Hook für die Reports-Page — fetched parallel aus 7 Tabellen,
// abhängig vom Time-Range (7/30/90 Tage) und activeTeamId.
//
// Returns: { leads, deals, activities, tasks, organizations, ssiScores, members, isLoading, error, refetch }
//
// Designed für Neu-Reports.jsx (2026-05-29). Range-Filter trifft nur
// time-bounded Queries (activities, tasks-completed); leads/deals/organizations
// werden komplett geladen, weil Verteilungen + Pipeline-Stats den
// gesamten Pool brauchen.
//
// 2026-05-29 update: deals-Tabelle als eigene Source ergänzt, weil
// Pipeline-Wert/Stage-Verteilung in der modernen Datenarchitektur aus
// deals (eigene Tabelle mit value/stage/probability) kommt — nicht aus
// leads.deal_value/deal_stage (Legacy-Felder direkt im Lead).

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

const REPORTS_LEADS_SELECT = `
  id, first_name, last_name, name, company, email, phone, linkedin_url,
  status, lead_score, source, tags, owner_id, organization_id,
  deal_stage, deal_value, next_followup, is_favorite, archived,
  li_connection_status, li_connected_at, li_connection_requested_at,
  li_reply_behavior,
  ai_buying_intent, ai_need_detected, ai_pain_points,
  ai_last_analysis_at, ai_last_analysis_model,
  industry, company_size,
  hs_score,
  created_at, updated_at
`;

export function useReportsData({ rangeDays = 30, activeTeamId, userId } = {}) {
  const [leads, setLeads]                 = useState([]);
  const [deals, setDeals]                 = useState([]);
  const [activities, setActivities]       = useState([]);
  const [tasks, setTasks]                 = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [ssiScores, setSsiScores]         = useState([]);
  const [members, setMembers]             = useState([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [error, setError]                 = useState(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const sinceISO = new Date(Date.now() - rangeDays * 86400000).toISOString();

    // Helper: team_id-Filter oder user_id-Fallback wenn kein Team aktiv.
    // ⚠️ lead_tasks hat seit Phase A (20260527090000) KEIN user_id mehr —
    // Hardening 2026-06-11: STRICT team_id-Filter. Ohne activeTeamId nur
    // Solo-Rows (team_id IS NULL + owner=userId). Niemals ungefiltert.
    const scope = (q) => activeTeamId
      ? q.eq('team_id', activeTeamId)
      : (userId ? q.eq('user_id', userId).is('team_id', null) : q.eq('id', '00000000-0000-0000-0000-000000000000'));
    const scopeOwner = (q, ownerCol) => activeTeamId
      ? q.eq('team_id', activeTeamId)
      : (userId ? q.eq(ownerCol, userId).is('team_id', null) : q.eq('id', '00000000-0000-0000-0000-000000000000'));

    // Parallel-Fetch via Promise.allSettled — eine fehlende Tabelle bricht
    // nicht die ganze Page (z.B. ssi_scores fehlt auf manchen Envs).
    const [
      leadsRes,
      dealsRes,
      activitiesRes,
      tasksRes,
      orgsRes,
      ssiRes,
      membersRes,
    ] = await Promise.allSettled([
      scope(supabase.from('leads').select(REPORTS_LEADS_SELECT).eq('archived', false)),
      // deals-Tabelle: owner-Spalte ist created_by (analog lead_tasks).
      // ⚠️ expected_close existiert auf Hetzner nicht — nur expected_close_date.
      // won_at/lost_at/lost_reason auch defensiv weggelassen weil nicht in
      // der UI gerendert + Schema-Drift möglich.
      scopeOwner(
        supabase.from('deals').select('id, lead_id, organization_id, title, value, stage, probability, expected_close_date, created_by, created_at, updated_at'),
        'created_by'
      ),
      supabase.from('lead_activity_feed')
        .select('source, id, lead_id, type, timestamp, actor_id, payload')
        .gte('timestamp', sinceISO)
        .order('timestamp', { ascending: false })
        .limit(500),
      scopeOwner(
        supabase.from('lead_tasks').select('id, lead_id, title, status, priority, due_date, completed_at, assigned_to, created_by, created_at'),
        'created_by'
      ),
      scope(supabase.from('organizations').select('id, name, industry_slug, city, leads(count), deals(count)')),
      userId
        ? supabase.from('ssi_scores')
            .select('total_score, build_brand, find_people, engage_insights, build_relationships, recorded_at')
            .eq('user_id', userId)
            .order('recorded_at', { ascending: true })
            .limit(60)
        : Promise.resolve({ data: [] }),
      // team_members→profiles PostgREST-Embed scheitert (FK fehlt).
      // Stattdessen 2-step Query: erst Members, dann Profiles batched
      // (analog src/hooks/useProfiles.js).
      activeTeamId
        ? supabase.from('team_members')
            .select('user_id, role')
            .eq('team_id', activeTeamId)
        : Promise.resolve({ data: [] }),
    ]);

    if (!mountedRef.current) return;

    // Members: Step 2 — Profiles dazujoinen
    let mergedMembers = [];
    if (membersRes.status === 'fulfilled' && (membersRes.value.data?.length || 0) > 0) {
      const memberRows = membersRes.value.data;
      const memberIds = [...new Set(memberRows.map(m => m.user_id).filter(Boolean))];
      if (memberIds.length > 0) {
        // ⚠️ Auf Hetzner hat profiles weder first_name noch last_name —
        // nur full_name + email + avatar_url. memberName() in Reports.jsx
        // fällt clean auf full_name → email-Truncation zurück.
        const profilesRes = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .in('id', memberIds);
        if (profilesRes.error) {
          console.warn('[useReportsData] member-profiles fetch error:', profilesRes.error.message);
        }
        const profilesById = new Map((profilesRes.data || []).map(p => [p.id, p]));
        mergedMembers = memberRows.map(m => ({
          ...m,
          profile: profilesById.get(m.user_id) || null,
        }));
      } else {
        mergedMembers = memberRows;
      }
    }

    if (!mountedRef.current) return;

    // Errors loggen aber nicht crashen
    [
      ['leads', leadsRes],
      ['deals', dealsRes],
      ['activities', activitiesRes],
      ['tasks', tasksRes],
      ['organizations', orgsRes],
      ['ssi', ssiRes],
      ['members', membersRes],
    ].forEach(([name, res]) => {
      if (res.status === 'rejected') {
        console.warn(`[useReportsData] ${name} fetch rejected:`, res.reason);
      } else if (res.value?.error) {
        console.warn(`[useReportsData] ${name} fetch error:`, res.value.error.message);
      }
    });

    setLeads(leadsRes.status === 'fulfilled' ? (leadsRes.value.data || []) : []);
    setDeals(dealsRes.status === 'fulfilled' ? (dealsRes.value.data || []) : []);
    setActivities(activitiesRes.status === 'fulfilled' ? (activitiesRes.value.data || []) : []);
    setTasks(tasksRes.status === 'fulfilled' ? (tasksRes.value.data || []) : []);
    setOrganizations(orgsRes.status === 'fulfilled' ? (orgsRes.value.data || []) : []);
    setSsiScores(ssiRes.status === 'fulfilled' ? (ssiRes.value.data || []) : []);
    setMembers(mergedMembers);

    setIsLoading(false);
  }, [rangeDays, activeTeamId, userId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => { mountedRef.current = false; };
  }, [fetchAll]);

  return useMemo(
    () => ({ leads, deals, activities, tasks, organizations, ssiScores, members, isLoading, error, refetch: fetchAll }),
    [leads, deals, activities, tasks, organizations, ssiScores, members, isLoading, error, fetchAll]
  );
}
