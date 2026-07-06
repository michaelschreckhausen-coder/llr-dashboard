-- message-Entwurf-Modus: automation_jobs.status um 'draft' erweitern.
-- message-Steps erzeugen Jobs als 'draft' → Runner claimt sie NICHT (nur 'pending').
-- Freigabe im UI setzt 'draft' → 'pending' → Runner sendet. Verwerfen → 'cancelled'.
-- DROP vor ADD (Constraint-Ersatz), idempotent.

BEGIN;
ALTER TABLE public.automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_status_check;
ALTER TABLE public.automation_jobs ADD CONSTRAINT automation_jobs_status_check
  CHECK (status = ANY (ARRAY['pending','running','done','error','skipped','cancelled','draft']));
COMMIT;
