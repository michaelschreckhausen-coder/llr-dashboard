-- 20260608230000_lead_tasks_task_type.sql
--
-- Aufgaben-Typ fuer lead_tasks: termin | telefonat | email | linkedin | notiz | aufgabe.
-- Plain text (kein CHECK) — Frontend-Select schraenkt ein, vermeidet Silent-Fail
-- beim kombinierten Insert/Update (Top-Fallstrick #1). Default 'aufgabe'.
-- Idempotent.

ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'aufgabe';

NOTIFY pgrst, 'reload schema';
