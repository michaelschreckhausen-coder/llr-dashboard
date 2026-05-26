-- ============================================================
-- LinkedIn OAuth Foundation — Posts API + Auto-Publishing
--
-- Phase 1a/1b der Content-Suite-Anbindung (Roadmap 2026-05-26):
--   * Personenprofil-Posting via w_member_social-Scope
--   * Token-Storage pro Brand Voice (Multi-BV-fähig)
--   * pg_cron-Worker für post_publish_queue
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS,
-- ADD COLUMN IF NOT EXISTS, CREATE EXTENSION IF NOT EXISTS.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 2) linkedin_oauth_states — CSRF-Schutz beim OAuth-Flow
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linkedin_oauth_states (
  state           text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  brand_voice_id  uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE,
  redirect_origin text NOT NULL,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_oauth_states_expires_at
  ON public.linkedin_oauth_states(expires_at);

-- ============================================================
-- 3) linkedin_oauth_tokens — OAuth-Tokens pro Brand Voice
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linkedin_oauth_tokens (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id                    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  brand_voice_id             uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE,

  member_urn                 text NOT NULL,
  member_id                  text NOT NULL,
  display_name               text,
  avatar_url                 text,
  email                      text,

  access_token               text NOT NULL,
  access_token_expires_at    timestamptz NOT NULL,
  refresh_token              text,
  refresh_token_expires_at   timestamptz,
  scopes                     text[] NOT NULL DEFAULT '{}'::text[],

  last_used_at               timestamptz,
  last_refresh_at            timestamptz,
  refresh_failed_at          timestamptz,
  refresh_failure_reason     text,
  revoked_at                 timestamptz,

  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_oauth_tokens_active_per_bv
  ON public.linkedin_oauth_tokens(brand_voice_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_linkedin_oauth_tokens_team
  ON public.linkedin_oauth_tokens(team_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_oauth_tokens_expires_at
  ON public.linkedin_oauth_tokens(access_token_expires_at)
  WHERE revoked_at IS NULL;

-- ============================================================
-- 4) post_publish_queue erweitern
-- ============================================================
ALTER TABLE public.post_publish_queue
  ADD COLUMN IF NOT EXISTS linkedin_connection_id uuid REFERENCES public.linkedin_oauth_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_response_status int,
  ADD COLUMN IF NOT EXISTS last_response_body text;

-- ============================================================
-- 5) updated_at-Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END $fn$;

DO $$ BEGIN
  CREATE TRIGGER trg_linkedin_oauth_tokens_updated_at
    BEFORE UPDATE ON public.linkedin_oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6) RLS
-- ============================================================
ALTER TABLE public.linkedin_oauth_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS linkedin_oauth_states_own ON public.linkedin_oauth_states;
CREATE POLICY linkedin_oauth_states_own ON public.linkedin_oauth_states
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.linkedin_oauth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS linkedin_oauth_tokens_own ON public.linkedin_oauth_tokens;
DROP POLICY IF EXISTS linkedin_oauth_tokens_team ON public.linkedin_oauth_tokens;
CREATE POLICY linkedin_oauth_tokens_own ON public.linkedin_oauth_tokens
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 7) Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_oauth_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_oauth_tokens  TO authenticated;

-- ============================================================
-- 8) Cleanup-Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.linkedin_oauth_states WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $fn$;

-- ============================================================
-- 9) pg_cron — Cleanup-Job
-- ============================================================
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-linkedin-oauth-states');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-linkedin-oauth-states',
  '*/15 * * * *',
  $cron$ SELECT public.cleanup_expired_oauth_states(); $cron$
);

-- ============================================================
-- 10) Publisher-Trigger-Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_due_linkedin_publishes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  q record;
  base_url     text;
  service_key  text;
  triggered    int := 0;
BEGIN
  base_url := current_setting('app.supabase_functions_url', true);
  service_key := current_setting('app.supabase_service_role_key', true);

  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[linkedin-publish-cron] app.supabase_functions_url oder app.supabase_service_role_key fehlt';
    RETURN 0;
  END IF;

  FOR q IN
    UPDATE public.post_publish_queue
    SET status = 'in_progress',
        last_attempt_at = now(),
        attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM public.post_publish_queue
      WHERE status = 'pending'
        AND scheduled_for <= now()
        AND attempts < 3
      ORDER BY scheduled_for ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, post_id
  LOOP
    PERFORM net.http_post(
      url     := base_url || '/linkedin-publish-post',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body    := jsonb_build_object('queue_id', q.id, 'post_id', q.post_id)
    );
    triggered := triggered + 1;
  END LOOP;

  RETURN triggered;
END $fn$;

DO $$ BEGIN
  PERFORM cron.unschedule('process-linkedin-publish-queue');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'process-linkedin-publish-queue',
  '*/5 * * * *',
  $cron$ SELECT public.trigger_due_linkedin_publishes(); $cron$
);

COMMIT;

SELECT 'pg_cron jobs' AS section, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('cleanup-linkedin-oauth-states','process-linkedin-publish-queue')
ORDER BY jobname;

SELECT 'linkedin tables' AS section, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('linkedin_oauth_tokens','linkedin_oauth_states','post_publish_queue')
ORDER BY table_name;
