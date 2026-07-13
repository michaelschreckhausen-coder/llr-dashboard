-- B1 Audience-Pre-Scan: relation_status pro Enrollment cachen + Funnel um exakte Vorhersage erweitern.
-- Der Runtime-Relation-Gate im la-runner bleibt Autorität beim Senden; der Pre-Scan verbessert nur die
-- Confirm-Gate-Vorhersage (exakte Zahl statt "bis zu N"). Idempotent.

BEGIN;

-- ── (1) Schema: relation_* auf la_enrollments ──
ALTER TABLE public.la_enrollments
  ADD COLUMN IF NOT EXISTS relation_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS relation_source text,
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz;

-- Enum-artiger CHECK (idempotent).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'la_enrollments_relation_status_check') THEN
    ALTER TABLE public.la_enrollments ADD CONSTRAINT la_enrollments_relation_status_check
      CHECK (relation_status IN ('not_connected','first_degree','pending','unknown'));
  END IF;
END $$;

-- Partial-Index für schnelle Zählung je Kampagne.
CREATE INDEX IF NOT EXISTS idx_la_enrollments_campaign_relation
  ON public.la_enrollments (campaign_id, relation_status);

-- ── (2) Funnel-RPC um Pre-Scan-Prognose erweitern (CREATE OR REPLACE, GRANTs bleiben) ──
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
    -- sofort fällige pending-Jobs (feuern beim Aktivieren direkt).
    'due_now', (SELECT count(*) FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'pending' AND j.scheduled_at <= now()),
    -- NEU (B1): Pre-Scan-Prognose je aktivem Enrollment (relation_status).
    --   real_invites = noch nicht vernetzt (gehen real raus); already_connected = 1st-degree/pending (Runtime-Gate skippt);
    --   unknown = noch nicht gescannt; scan_complete = keine Unbekannten mehr.
    'real_invites',      (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'not_connected'),
    'already_connected', (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status IN ('first_degree','pending')),
    'unknown',           (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'unknown'),
    'scan_complete',     (SELECT count(*) = 0 FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'unknown')
  ) INTO v_res;
  RETURN v_res;
END $fn$;

COMMIT;
