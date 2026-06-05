-- 2026-06-05 — Recursion-Fix fuer lead_task_assignees-Policies (Round 2)
--
-- Bug-Symptom (Prod, beim Anlegen neuer Task mit Multi-Assignee via NewTaskModal):
--   ERROR:  infinite recursion detected in policy for relation "lead_tasks"
--
-- Root-Cause: Migration 20260602190000 hat `is_task_coassignee()` als SECURITY
-- DEFINER eingefuehrt, um den Junction-Self-Reference-Pfad abzusichern. Aber
-- der `lta_select`-Creator-Branch hat WEITERHIN ein inline-EXISTS auf
-- lead_tasks:
--
--   USING (
--     user_id = auth.uid()
--     OR EXISTS (SELECT 1 FROM lead_tasks t WHERE t.id = task_id AND t.created_by = auth.uid())  -- ← inline
--     OR is_task_coassignee(task_id)
--   )
--
-- Bei INSERT mit RETURNING (Frontend nutzt .select().single()) triggert die
-- tasks_select-Policy `EXISTS (SELECT ... FROM lead_task_assignees ...)`, was
-- lta_select evaluiert. Der Creator-EXISTS auf lead_tasks triggert tasks_select
-- wieder → Recursion.
--
-- Fix: zweite SECURITY-DEFINER-Function `is_task_creator(task_id)` analog
-- is_task_coassignee. Alle 3 Junction-Policies (lta_select/insert/delete)
-- nutzen die Function statt inline-EXISTS.
--
-- Risiko: NULL — beide Policies bleiben funktional identisch, nur der
-- Evaluations-Pfad bypasst RLS auf dem inneren Read.

BEGIN;

-- ─── 1. Neue SECURITY DEFINER Function ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_task_creator(
  p_task_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_tasks
    WHERE id = p_task_id AND created_by = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_task_creator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_creator(uuid, uuid) TO service_role;

-- ─── 2. Junction-Policies via Function (kein inline-EXISTS mehr) ───────

DROP POLICY IF EXISTS lta_select ON public.lead_task_assignees;
CREATE POLICY lta_select ON public.lead_task_assignees
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_task_creator(lead_task_assignees.task_id)
    OR public.is_task_coassignee(lead_task_assignees.task_id)
  );

DROP POLICY IF EXISTS lta_insert ON public.lead_task_assignees;
CREATE POLICY lta_insert ON public.lead_task_assignees
  FOR INSERT
  WITH CHECK (
    assigned_by = auth.uid()
    AND (
      public.is_task_creator(lead_task_assignees.task_id)
      OR public.is_task_coassignee(lead_task_assignees.task_id)
    )
  );

DROP POLICY IF EXISTS lta_delete ON public.lead_task_assignees;
CREATE POLICY lta_delete ON public.lead_task_assignees
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_task_creator(lead_task_assignees.task_id)
  );

-- ─── 3. Verifikation ───────────────────────────────────────────────────

DO $$
DECLARE
  fn_creator        boolean;
  junction_policies integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'is_task_creator' AND n.nspname = 'public' AND p.prosecdef
  ) INTO fn_creator;

  SELECT COUNT(*) INTO junction_policies
  FROM pg_policies WHERE schemaname='public' AND tablename='lead_task_assignees';

  IF NOT fn_creator THEN
    RAISE EXCEPTION 'is_task_creator SECURITY DEFINER function missing';
  END IF;
  IF junction_policies <> 3 THEN
    RAISE EXCEPTION 'lead_task_assignees expected 3 policies, got %', junction_policies;
  END IF;

  RAISE NOTICE 'Recursion-fix migration OK: is_task_creator function present, % junction policies', junction_policies;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
