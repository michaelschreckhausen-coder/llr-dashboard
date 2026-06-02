-- 2026-06-02 — Bug-Fix: lead_tasks UPDATE-Policy WITH-CHECK-Luecke
--
-- Phase G (20260527150000) hat tasks_update mit nur USING erstellt,
-- ohne expliziten WITH CHECK. Postgres faellt auf WITH CHECK = USING
-- zurueck — beide pruefen (created_by = uid OR assigned_to = uid).
--
-- Konsequenz:
--   - Reassign (assigned_to von uid auf Kollegen aendern) durch User
--     der nur assigned_to ist (nicht created_by) → DENIED, weil neue
--     Row weder created_by=uid noch assigned_to=uid hat.
--   - Checkbox/Edit auf Team-Task durch Team-Member, der weder
--     created_by noch assigned_to ist → DENIED.
--
-- Symptom (Frontend, ab Commit d0cdf0d sichtbar):
--   "new row violates row-level security policy for table lead_tasks"
--
-- Fix:
--   tasks_update USING + WITH CHECK um den team_id-Pfad ergaenzen,
--   analog zu tasks_select. Team-Member duerfen Team-Tasks updaten
--   und reassignieren.
--
-- Idempotent durch DROP IF EXISTS + CREATE.
-- Funktion user_in_team() existiert seit Phase G (selbe Migration).

BEGIN;

DROP POLICY IF EXISTS tasks_update ON public.lead_tasks;

CREATE POLICY tasks_update ON public.lead_tasks
  FOR UPDATE
  USING (
    (created_by = auth.uid())
    OR (assigned_to = auth.uid())
    OR ((team_id IS NOT NULL) AND user_in_team(team_id))
  )
  WITH CHECK (
    (created_by = auth.uid())
    OR (assigned_to = auth.uid())
    OR ((team_id IS NOT NULL) AND user_in_team(team_id))
  );

-- Verifikation
DO $$
DECLARE
  has_with_check boolean;
  using_text text;
  check_text text;
BEGIN
  SELECT
    (with_check IS NOT NULL),
    qual::text,
    with_check::text
  INTO has_with_check, using_text, check_text
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'lead_tasks'
    AND policyname = 'tasks_update';

  IF NOT has_with_check THEN
    RAISE EXCEPTION 'tasks_update WITH CHECK still missing after migration';
  END IF;

  RAISE NOTICE 'tasks_update USING:      %', using_text;
  RAISE NOTICE 'tasks_update WITH CHECK: %', check_text;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
