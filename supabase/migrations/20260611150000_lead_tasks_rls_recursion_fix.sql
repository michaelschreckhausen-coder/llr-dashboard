-- HOTFIX: Infinite recursion zwischen lead_tasks und lead_task_assignees Policies.
-- Beide Policies referenzierten die jeweils andere Tabelle direkt via EXISTS-Subquery
-- → endlose Rekursion bei jeder INSERT/SELECT.
--
-- Loesung: SECURITY DEFINER Helper is_task_assignee() — umgeht RLS auf der
-- assignees-Tabelle. Analog zu existierendem is_task_creator(task_id).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_task_assignee(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lead_task_assignees
    WHERE task_id = p_task_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_task_assignee(uuid) TO authenticated, anon;

-- lead_tasks: assignee-Check via Helper statt direkter Subquery
DROP POLICY IF EXISTS lead_tasks_team_select ON public.lead_tasks;
DROP POLICY IF EXISTS lead_tasks_team_update ON public.lead_tasks;

CREATE POLICY lead_tasks_team_select ON public.lead_tasks FOR SELECT USING (
  (team_id IS NULL AND created_by = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
  OR is_task_assignee(id)
);
CREATE POLICY lead_tasks_team_update ON public.lead_tasks FOR UPDATE USING (
  (team_id IS NULL AND created_by = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
  OR is_task_assignee(id)
);

-- lead_task_assignees: kein Lookup auf lead_tasks mehr — Assignee sieht eigene
-- Zuordnung via user_id = auth.uid(), Creator via is_task_creator() Helper
DROP POLICY IF EXISTS lta_team_select ON public.lead_task_assignees;

CREATE POLICY lta_team_select ON public.lead_task_assignees FOR SELECT USING (
  user_id = auth.uid()
  OR is_task_creator(task_id)
);

COMMIT;

-- verify
SELECT tablename, policyname, regexp_replace(qual::text,'\s+',' ','g') AS using_clause
FROM pg_policies WHERE schemaname='public' AND tablename IN ('lead_tasks','lead_task_assignees')
  AND cmd IN ('SELECT','UPDATE') ORDER BY tablename, policyname;
