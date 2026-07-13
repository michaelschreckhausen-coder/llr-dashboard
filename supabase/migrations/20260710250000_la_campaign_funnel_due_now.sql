-- la_campaign_funnel um 'due_now' erweitern: Anzahl pending Jobs mit scheduled_at <= now()
-- = wie viele reale Aktionen beim Aktivieren SOFORT feuern (für das Aktivieren-Confirm-Gate).
-- 'jobs.pending' ist die Gesamtzahl (auch zukünftig gestaffelte); due_now ist die sofort-fällige.
-- CREATE OR REPLACE (GRANTs bleiben). Idempotent.

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
       WHERE e.campaign_id = p_campaign_id AND j.state = 'pending'),
    -- NEU: sofort fällige pending-Jobs (feuern beim Aktivieren direkt).
    'due_now', (SELECT count(*) FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'pending' AND j.scheduled_at <= now())
  ) INTO v_res;
  RETURN v_res;
END $fn$;

COMMIT;
