-- Unipile-Integration (Staging zuerst)
-- unipile_accounts (Unipile hostet die LinkedIn-Session; wir speichern nur die account_id)
-- + automation_jobs.provider_id/unipile_account_id
-- + Cron-Wrapper-Fn (GUC-Pattern wie trigger_due_linkedin_publishes) — NOCH NICHT via cron.schedule scharf.
-- Idempotent. Self-Host: GRANT nicht vergessen (sonst 42501).

BEGIN;

CREATE TABLE IF NOT EXISTS public.unipile_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,                    -- Leadesk-User, dem der LinkedIn-Account gehört
  unipile_account_id  text NOT NULL,                    -- von Unipile vergeben
  provider_public_id  text,                             -- LinkedIn public identifier des verbundenen Profils
  status              text NOT NULL DEFAULT 'PENDING',  -- OK | CREDENTIALS | PENDING | ERROR (Unipile-Status)
  connected_at        timestamptz DEFAULT now(),
  last_status_update  timestamptz DEFAULT now(),
  CONSTRAINT unipile_accounts_unipile_account_id_key UNIQUE (unipile_account_id)
);
CREATE INDEX IF NOT EXISTS idx_unipile_accounts_user ON public.unipile_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_unipile_accounts_team ON public.unipile_accounts(team_id);

GRANT ALL ON public.unipile_accounts TO authenticated;
GRANT ALL ON public.unipile_accounts TO service_role;

ALTER TABLE public.unipile_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unipile_accounts_team_select ON public.unipile_accounts;
CREATE POLICY unipile_accounts_team_select ON public.unipile_accounts
  FOR SELECT TO authenticated USING (public.user_in_team(team_id));
-- Writes laufen über service_role (Edge Functions) — keine authenticated-write-Policy nötig.

ALTER TABLE public.automation_jobs
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS unipile_account_id text;

-- Cron-Wrapper (GUC-Pattern). NICHT scharf — cron.schedule folgt erst nach manuellem EF-Test.
CREATE OR REPLACE FUNCTION public.trigger_process_automation_jobs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  base_url    text := current_setting('app.supabase_functions_url', true);
  service_key text := current_setting('app.supabase_service_role_key', true);
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[automation-cron] app.supabase_functions_url oder app.supabase_service_role_key fehlt';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := base_url || '/process-automation-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body    := '{}'::jsonb
  );
END $$;

COMMIT;
