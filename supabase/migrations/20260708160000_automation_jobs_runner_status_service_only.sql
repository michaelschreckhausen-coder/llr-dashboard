-- URGENT-Cutover: automation_jobs runner-exklusiv machen (nur service_role/EF darf Runner-Status setzen).
-- Root Cause: Chrome-Extension (DOM) UND Unipile-EF claimen parallel dieselbe Queue; Extension gewinnt das
-- connect-Race und markiert done OHNE echten Invite. Web-Store-Release wäre zu langsam → serverseitig via RLS.
-- authenticated (Extension via User-JWT) darf status NICHT auf running/done/error/skipped setzen
-- (das sind Runner-Outcomes). Frontend setzt nur pending/cancelled/draft/payload → unberührt.
-- service_role hat bypassrls=true → EF komplett unbetroffen. RESTRICTIVE = AND-verknüpft, vetoed den Claim.
-- Idempotent.

BEGIN;

DROP POLICY IF EXISTS automation_jobs_runner_status_service_only ON public.automation_jobs;
CREATE POLICY automation_jobs_runner_status_service_only ON public.automation_jobs
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status <> 'running' AND status <> 'done' AND status <> 'error' AND status <> 'skipped');

COMMIT;
