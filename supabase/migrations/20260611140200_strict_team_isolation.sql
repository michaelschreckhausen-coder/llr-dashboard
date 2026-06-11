-- Strict-Team-Isolation Phase 2:
-- Bei den SELECT-Policies sind noch user_id/created_by-OR-Pfade die
-- Cross-Team-Leak ermoeglichen wenn jemand Mitglied mehrerer Teams ist.
-- Loesung: user_id-Pfad nur fuer Solo-Rows (team_id IS NULL) zulassen.

BEGIN;

-- ── LEADS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leads_team_select ON public.leads;
DROP POLICY IF EXISTS leads_team_update ON public.leads;

CREATE POLICY leads_team_select ON public.leads FOR SELECT USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);
CREATE POLICY leads_team_update ON public.leads FOR UPDATE USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);

-- ── LEAD_TASKS ──────────────────────────────────────────────────────
-- bisher: team_id OR created_by OR assignee
-- neu: team_id (gated), oder Solo (team_id NULL + created_by), oder assignee (immer)
DROP POLICY IF EXISTS lead_tasks_team_select ON public.lead_tasks;
DROP POLICY IF EXISTS lead_tasks_team_update ON public.lead_tasks;

CREATE POLICY lead_tasks_team_select ON public.lead_tasks FOR SELECT USING (
  (team_id IS NULL AND created_by = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
  OR EXISTS (SELECT 1 FROM lead_task_assignees a WHERE a.task_id = lead_tasks.id AND a.user_id = auth.uid())
);
CREATE POLICY lead_tasks_team_update ON public.lead_tasks FOR UPDATE USING (
  (team_id IS NULL AND created_by = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
  OR EXISTS (SELECT 1 FROM lead_task_assignees a WHERE a.task_id = lead_tasks.id AND a.user_id = auth.uid())
);

-- ── LEAD_FIELD_HISTORY ──────────────────────────────────────────────
DROP POLICY IF EXISTS lfh_team_select ON public.lead_field_history;
CREATE POLICY lfh_team_select ON public.lead_field_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_field_history.lead_id
          AND ((l.team_id IS NULL AND l.user_id = auth.uid())
               OR (l.team_id IS NOT NULL AND l.team_id = ANY(get_my_team_ids()))))
);

-- ── LEAD_TASK_ASSIGNEES ─────────────────────────────────────────────
DROP POLICY IF EXISTS lta_team_select ON public.lead_task_assignees;
CREATE POLICY lta_team_select ON public.lead_task_assignees FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.id = lead_task_assignees.task_id
             AND ((lt.team_id IS NULL AND lt.created_by = auth.uid())
                  OR (lt.team_id IS NOT NULL AND lt.team_id = ANY(get_my_team_ids()))))
);

COMMIT;

SELECT tablename, policyname, cmd, regexp_replace(qual::text, '\s+', ' ', 'g') AS using_clause
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('leads','lead_tasks','lead_field_history','lead_task_assignees')
  AND cmd IN ('SELECT','UPDATE')
ORDER BY tablename, policyname;
