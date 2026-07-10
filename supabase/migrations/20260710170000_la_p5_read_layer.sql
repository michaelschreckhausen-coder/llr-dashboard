-- LinkedIn-Automation Greenfield · Phase 5 · Read-Layer für den Funnel-Monitor.
-- la_campaign_funnel(campaign_id): team-scoped Aggregat (Enrollment-States + Job-States + ältester pending).
-- la_runner_health: globaler System-Indikator (Heartbeat-Alter, offene pending, Dead-Letter). Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION public.la_campaign_funnel(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_team uuid; v_res jsonb;
BEGIN
  SELECT team_id INTO v_team FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT public.user_in_team(v_team) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'status', (SELECT status FROM public.la_campaigns WHERE id = p_campaign_id),
    'enrollment_total', (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id),
    'enrollments', COALESCE((SELECT jsonb_object_agg(state, n) FROM
      (SELECT state, count(*) n FROM public.la_enrollments WHERE campaign_id = p_campaign_id GROUP BY state) s), '{}'::jsonb),
    'jobs', COALESCE((SELECT jsonb_object_agg(st, n) FROM
      (SELECT j.state st, count(*) n FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id GROUP BY j.state) s), '{}'::jsonb),
    'done_by_action', COALESCE((SELECT jsonb_object_agg(act, n) FROM
      (SELECT j.action act, count(*) n FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'done' GROUP BY j.action) s), '{}'::jsonb),
    'oldest_pending', (SELECT min(j.scheduled_at) FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'pending')
  ) INTO v_res;
  RETURN v_res;
END $fn$;
REVOKE ALL ON FUNCTION public.la_campaign_funnel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.la_campaign_funnel(uuid) TO authenticated, service_role;

-- Globaler Runner-Indikator (interner Monitor; View-Owner supabase_admin → Aggregat über alle Jobs).
CREATE OR REPLACE VIEW public.la_runner_health AS
SELECT
  h.last_run_at,
  EXTRACT(EPOCH FROM (now() - h.last_run_at))::int AS heartbeat_age_s,
  h.last_claimed, h.last_error,
  (SELECT count(*) FROM public.la_jobs WHERE state = 'pending' AND scheduled_at <= now()) AS pending_due,
  (SELECT count(*) FROM public.la_jobs WHERE state = 'pending') AS pending_total,
  (SELECT count(*) FROM public.la_jobs WHERE state = 'dead') AS dead_total,
  (SELECT min(scheduled_at) FROM public.la_jobs WHERE state = 'pending' AND scheduled_at <= now()) AS oldest_due_pending
FROM public.la_runner_heartbeat h;
GRANT SELECT ON public.la_runner_health TO authenticated, service_role;

COMMIT;
