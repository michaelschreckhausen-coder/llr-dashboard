-- 2026-06-05 — Daily-Task-Digest Phase 4: pg_cron-Job + Worker-Function
--
-- Pattern analog zu existing public.process_scheduled_email_workflows():
--   - SECURITY DEFINER PG-Function als Worker
--   - current_setting('app.service_role_key', true) für Auth
--   - net.http_post() gegen interne Docker-URL (http://kong:8000/...)
--   - Defensive Check + EXCEPTION-Handler
--
-- Cron-Schedule: 05:00 UTC täglich = 07:00 Berlin Sommerzeit.
-- DST-Drift im Winter auf 06:00 Berlin akzeptiert (Refactor falls Beschwerden).
--
-- Optional p_body-Parameter erlaubt Test-Calls mit force/user_ids/dry_run
-- ohne neuen pg_cron-Job zu brauchen.

BEGIN;

CREATE OR REPLACE FUNCTION public.send_daily_task_digest_cron(
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_svc_key text;
  v_request_id bigint;
BEGIN
  v_svc_key := current_setting('app.service_role_key', true);

  IF v_svc_key IS NULL OR length(v_svc_key) < 50 THEN
    RAISE WARNING 'send_daily_task_digest_cron: app.service_role_key not set (length=%)', COALESCE(length(v_svc_key), 0);
    RETURN jsonb_build_object('error', 'no_service_role_key');
  END IF;

  BEGIN
    v_request_id := net.http_post(
      url     := 'http://kong:8000/functions/v1/send-daily-task-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_svc_key
      ),
      body    := p_body
    );
    RETURN jsonb_build_object(
      'queued', true,
      'request_id', v_request_id,
      'body_keys', (SELECT array_agg(k) FROM jsonb_object_keys(p_body) k)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'send_daily_task_digest_cron failed: %', SQLERRM;
    RETURN jsonb_build_object('error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.send_daily_task_digest_cron(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_daily_task_digest_cron(jsonb) TO service_role;
-- (kein GRANT für authenticated — Auth-Sensitive)

-- Cron-Schedule: idempotent via try-delete-then-create
DO $$
BEGIN
  -- existing job mit gleichem Namen droppen (idempotent re-apply)
  PERFORM cron.unschedule('send-daily-task-digest')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-task-digest');
EXCEPTION WHEN OTHERS THEN
  -- cron.unschedule wirft wenn Job nicht da → ignorieren
  NULL;
END $$;

SELECT cron.schedule(
  'send-daily-task-digest',
  '0 5 * * *',
  $job$SELECT public.send_daily_task_digest_cron();$job$
);

-- Verifikation
DO $$
DECLARE
  v_jobid bigint;
  v_schedule text;
  v_active boolean;
BEGIN
  SELECT jobid, schedule, active INTO v_jobid, v_schedule, v_active
  FROM cron.job WHERE jobname = 'send-daily-task-digest';

  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'send-daily-task-digest cron job not created';
  END IF;

  RAISE NOTICE 'pg_cron OK: jobid=%, schedule=%, active=%', v_jobid, v_schedule, v_active;
END $$;

COMMIT;
