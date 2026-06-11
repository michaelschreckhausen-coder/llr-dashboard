-- Cross-Team-Isolation: alte user_id-only RLS-Policies droppen.
-- Hintergrund: PostgreSQL OR-verknüpft Policies. Wir hatten pro Tabelle
-- zwei Generationen (alt user_id-only, neu team-aware) -> alte erlaubte
-- Cross-Team-Reads wenn auth.uid()=user_id matched.
--
-- Ziel: pro Tabelle nur noch die team_id-aware Policies behalten.
-- Plus: lead_tasks bekommt explizite Team-RLS (war bisher nur via
-- created_by/assignee gefiltert).

BEGIN;

-- ── LEADS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leads_owner ON public.leads;
DROP POLICY IF EXISTS own_leads   ON public.leads;
-- behalten: leads_team_select / _update / _delete / _insert

-- ── DEALS ───────────────────────────────────────────────────────────
-- alt: deals_select uebte created_by-Match -> Cross-Team
DROP POLICY IF EXISTS deals_select ON public.deals;
DROP POLICY IF EXISTS deals_update ON public.deals;
DROP POLICY IF EXISTS deals_delete ON public.deals;
DROP POLICY IF EXISTS deals_insert ON public.deals;
-- behalten: team_deals_*

-- ── ACTIVITIES ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS act_select ON public.activities;
DROP POLICY IF EXISTS act_update ON public.activities;
DROP POLICY IF EXISTS act_insert ON public.activities;
-- behalten: team_activities_*

-- ── CONTACT NOTES ───────────────────────────────────────────────────
DROP POLICY IF EXISTS cn_select ON public.contact_notes;
DROP POLICY IF EXISTS cn_update ON public.contact_notes;
DROP POLICY IF EXISTS cn_insert ON public.contact_notes;
-- behalten: team_notes_*

-- ── LEAD LISTS ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS own_lead_lists  ON public.lead_lists;
DROP POLICY IF EXISTS lead_lists_owner ON public.lead_lists;
-- behalten: lead_lists_team_*

-- ── LEAD_TASKS — neue Team-RLS hinzufuegen ──────────────────────────
-- Spalte team_id existiert, war aber bisher nicht im RLS-Check verwendet.
-- Wir behalten den created_by/assignee-Pfad als zusaetzliche Personal-Access,
-- weil ein Task einem User direkt zugewiesen sein kann (auch ohne Team-Member).
DROP POLICY IF EXISTS tasks_select ON public.lead_tasks;
DROP POLICY IF EXISTS tasks_update ON public.lead_tasks;
DROP POLICY IF EXISTS tasks_insert ON public.lead_tasks;
DROP POLICY IF EXISTS tasks_delete ON public.lead_tasks;

CREATE POLICY lead_tasks_team_select ON public.lead_tasks FOR SELECT USING (
  (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
  OR (created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM lead_task_assignees a WHERE a.task_id = lead_tasks.id AND a.user_id = auth.uid())
);
CREATE POLICY lead_tasks_team_update ON public.lead_tasks FOR UPDATE USING (
  (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
  OR (created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM lead_task_assignees a WHERE a.task_id = lead_tasks.id AND a.user_id = auth.uid())
);
CREATE POLICY lead_tasks_team_delete ON public.lead_tasks FOR DELETE USING (
  created_by = auth.uid()
);
CREATE POLICY lead_tasks_team_insert ON public.lead_tasks FOR INSERT WITH CHECK (
  -- Insert erlaubt wenn neuer Task ins eigene Team oder Solo (team_id NULL + created_by self)
  (team_id IS NULL AND created_by = auth.uid())
  OR (team_id = ANY(get_my_team_ids()))
);

-- ── LEAD_FIELD_HISTORY — Join-Check ueber lead.team_id statt lead.user_id
DROP POLICY IF EXISTS lfh_select ON public.lead_field_history;
DROP POLICY IF EXISTS team_history_select ON public.lead_field_history;
CREATE POLICY lfh_team_select ON public.lead_field_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_field_history.lead_id
          AND ((l.team_id IS NOT NULL AND l.team_id = ANY(get_my_team_ids()))
               OR l.user_id = auth.uid()))
);

-- ── LEAD_TASK_ASSIGNEES — Cross-Team-Hardening ueber Task->Team
DROP POLICY IF EXISTS lta_select ON public.lead_task_assignees;
CREATE POLICY lta_team_select ON public.lead_task_assignees FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.id = lead_task_assignees.task_id
             AND ((lt.team_id IS NOT NULL AND lt.team_id = ANY(get_my_team_ids()))
                  OR lt.created_by = auth.uid()))
);

COMMIT;

-- Verifikation: kein OR-Stack mehr auf den kritischen Tabellen
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('leads','deals','activities','contact_notes','lead_lists','lead_tasks','lead_field_history','lead_task_assignees')
GROUP BY tablename ORDER BY tablename;
