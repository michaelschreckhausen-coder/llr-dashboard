-- 2026-05-27 — Phase G — RLS-Policy-Alignment Staging ↔ Prod
--
-- Staging hatte 1–2 simple ALL-Policies pro Tabelle.
-- Prod hat 5–7 granulare Policies + 3 Helper-Functions.
--
-- Migration:
--   1) CREATE FUNCTION user_in_team — fehlt auf Staging
--   2) CREATE FUNCTION get_my_team_ids — fehlt auf Staging
--   3) activities: 1 simple → 7 granular Policies
--   4) lead_tasks: 1 simple → 5 Policies (lead_tasks_own behalten + 4 neue)
--   5) leads: 2 simple → 6 granular Policies
--
-- Voraussetzungen (verifiziert via Pre-Flight 2026-05-27):
--   - crm_is_team_member() existiert auf BEIDEN (identical Definition)
--   - team_members.is_active existiert auf Staging
--   - is_shared + team_id auf leads (Phase B hat sie bestätigt vorhanden)
--
-- Functional-Identity: Prod-Policies sind in Summe äquivalent zu Staging-
-- Policies (gleiche Visibility-Rules), nur granular per Operation gesplittet.
-- PERMISSIVE-Policies sind OR-verknüpft → keine Sichtbarkeits-Reduktion erwartet.
--
-- Risiko-Profil: Medium. Atomic in BEGIN/COMMIT — kein Zwischenstand wo
-- Policies komplett fehlen. Frontend-Regression-Risiko ist niedrig weil
-- die effektive Visibility-Logik identisch bleibt.

BEGIN;

-- ─── Step 1: CREATE FUNCTION user_in_team ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_in_team(p_team_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = p_user_id
      AND is_active = true
  );
$$;

-- ─── Step 2: CREATE FUNCTION get_my_team_ids ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_team_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(team_id), '{}'::uuid[])
  FROM public.team_members
  WHERE user_id = auth.uid() AND is_active = true;
$$;

-- ─── Step 3: activities — DROP old + CREATE 7 Prod-style ───────────────────

DROP POLICY IF EXISTS activities_user_team ON public.activities;

DROP POLICY IF EXISTS act_insert ON public.activities;
CREATE POLICY act_insert ON public.activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS act_select ON public.activities;
CREATE POLICY act_select ON public.activities
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS act_update ON public.activities;
CREATE POLICY act_update ON public.activities
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS team_activities_delete ON public.activities;
CREATE POLICY team_activities_delete ON public.activities
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS team_activities_insert ON public.activities;
CREATE POLICY team_activities_insert ON public.activities
  FOR INSERT WITH CHECK (crm_is_team_member(team_id));

DROP POLICY IF EXISTS team_activities_select ON public.activities;
CREATE POLICY team_activities_select ON public.activities
  FOR SELECT USING (crm_is_team_member(team_id));

DROP POLICY IF EXISTS team_activities_update ON public.activities;
CREATE POLICY team_activities_update ON public.activities
  FOR UPDATE USING (user_id = auth.uid());

-- ─── Step 4: lead_tasks — 4 zusätzliche Policies (lead_tasks_own bleibt) ───

DROP POLICY IF EXISTS tasks_delete ON public.lead_tasks;
CREATE POLICY tasks_delete ON public.lead_tasks
  FOR DELETE USING (created_by = auth.uid());

DROP POLICY IF EXISTS tasks_insert ON public.lead_tasks;
CREATE POLICY tasks_insert ON public.lead_tasks
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS tasks_select ON public.lead_tasks;
CREATE POLICY tasks_select ON public.lead_tasks
  FOR SELECT USING (
    (created_by = auth.uid())
    OR (assigned_to = auth.uid())
    OR ((team_id IS NOT NULL) AND user_in_team(team_id))
  );

DROP POLICY IF EXISTS tasks_update ON public.lead_tasks;
CREATE POLICY tasks_update ON public.lead_tasks
  FOR UPDATE USING (
    (created_by = auth.uid()) OR (assigned_to = auth.uid())
  );

-- ─── Step 5: leads — DROP 2 simple + CREATE 6 Prod-style ───────────────────

DROP POLICY IF EXISTS leads_own       ON public.leads;
DROP POLICY IF EXISTS leads_user_team ON public.leads;

DROP POLICY IF EXISTS leads_owner ON public.leads;
CREATE POLICY leads_owner ON public.leads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS own_leads ON public.leads;
CREATE POLICY own_leads ON public.leads
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS leads_team_delete ON public.leads;
CREATE POLICY leads_team_delete ON public.leads
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS leads_team_insert ON public.leads;
CREATE POLICY leads_team_insert ON public.leads
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS leads_team_select ON public.leads;
CREATE POLICY leads_team_select ON public.leads
  FOR SELECT USING (
    (user_id = auth.uid())
    OR ((is_shared = true) AND (team_id = ANY (get_my_team_ids())))
  );

DROP POLICY IF EXISTS leads_team_update ON public.leads;
CREATE POLICY leads_team_update ON public.leads
  FOR UPDATE USING (
    (user_id = auth.uid())
    OR ((is_shared = true) AND (team_id = ANY (get_my_team_ids())))
  );

-- ─── Step 6: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  fn_user_in_team        boolean;
  fn_get_my_team_ids     boolean;
  act_policy_count       integer;
  task_policy_count      integer;
  lead_policy_count      integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname='user_in_team' AND n.nspname='public'
  ) INTO fn_user_in_team;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname='get_my_team_ids' AND n.nspname='public'
  ) INTO fn_get_my_team_ids;

  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='activities' INTO act_policy_count;
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='lead_tasks' INTO task_policy_count;
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='leads' INTO lead_policy_count;

  IF NOT fn_user_in_team    THEN RAISE EXCEPTION 'user_in_team function missing'; END IF;
  IF NOT fn_get_my_team_ids THEN RAISE EXCEPTION 'get_my_team_ids function missing'; END IF;
  IF act_policy_count != 7  THEN RAISE EXCEPTION 'activities expected 7 policies, got %', act_policy_count; END IF;
  IF task_policy_count != 5 THEN RAISE EXCEPTION 'lead_tasks expected 5 policies, got %', task_policy_count; END IF;
  IF lead_policy_count != 6 THEN RAISE EXCEPTION 'leads expected 6 policies, got %', lead_policy_count; END IF;

  RAISE NOTICE 'Phase G verification PASSED — 2 Functions, % activities Policies, % lead_tasks Policies, % leads Policies',
    act_policy_count, task_policy_count, lead_policy_count;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
