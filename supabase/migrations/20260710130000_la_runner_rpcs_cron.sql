-- LinkedIn-Automation Greenfield · Phase 1 · Runner-Helfer.
-- (1) la_claim_jobs: atomarer Claim mit FOR UPDATE SKIP LOCKED (supabase-js kann das nicht ausdrücken → RPC).
-- (2) trigger_la_runner: GUC-Wrapper für pg_cron (net.http_post an die la-runner-EF, fire-and-forget,
--     Muster wie trigger_process_automation_jobs). Cron-Scheduling separat NACH EF-Deploy.
-- Idempotent (CREATE OR REPLACE). Runner läuft als service_role.

BEGIN;

CREATE OR REPLACE FUNCTION public.la_claim_jobs(p_limit int DEFAULT 5)
RETURNS SETOF public.la_jobs
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $fn$
  UPDATE public.la_jobs j SET state = 'claimed', updated_at = now()
  WHERE j.id IN (
    SELECT id FROM public.la_jobs
    WHERE state = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
$fn$;
REVOKE ALL ON FUNCTION public.la_claim_jobs(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.la_claim_jobs(int) TO service_role;

-- Materialisiert den nächsten Step (position+1) nach 'done'. Interval-Math (now()+wait_after) + Idempotenz
-- (idempotency_key = enrollment:step) im SQL. P1: nur condition='always'; if_accepted/if_no_reply → P2 (Webhooks).
CREATE OR REPLACE FUNCTION public.la_materialize_next(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_enr public.la_enrollments; v_step public.la_steps; v_next int; v_job_id uuid;
BEGIN
  SELECT * INTO v_enr FROM public.la_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'enrollment_not_found'); END IF;
  v_next := v_enr.current_position + 1;
  SELECT * INTO v_step FROM public.la_steps WHERE campaign_id = v_enr.campaign_id AND position = v_next;
  IF NOT FOUND THEN
    UPDATE public.la_enrollments SET state = 'completed', current_position = v_next, updated_at = now() WHERE id = p_enrollment_id;
    RETURN jsonb_build_object('completed', true);
  END IF;
  UPDATE public.la_enrollments SET current_position = v_next, updated_at = now() WHERE id = p_enrollment_id;
  IF v_step.condition <> 'always' THEN
    RETURN jsonb_build_object('waiting_for_condition', v_step.condition, 'position', v_next);
  END IF;
  INSERT INTO public.la_jobs (enrollment_id, team_id, step_id, action, scheduled_at, idempotency_key)
  VALUES (v_enr.id, v_enr.team_id, v_step.id, v_step.action, now() + v_step.wait_after,
          v_enr.id::text || ':' || v_step.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('materialized_job', v_job_id, 'action', v_step.action, 'position', v_next);
END $fn$;
REVOKE ALL ON FUNCTION public.la_materialize_next(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.la_materialize_next(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_la_runner()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  base_url    text := current_setting('app.supabase_functions_url', true);
  service_key text := current_setting('app.service_role_key', true);
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[la-runner-cron] app.supabase_functions_url oder app.service_role_key fehlt';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := base_url || '/la-runner',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body    := '{}'::jsonb
  );
END $fn$;

COMMIT;
