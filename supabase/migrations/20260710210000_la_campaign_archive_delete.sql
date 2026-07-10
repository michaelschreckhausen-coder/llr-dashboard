-- LinkedIn-Automation Greenfield · Kampagnen Archivieren + Löschen (User-selbst-bedienbar).
-- Archivieren = SOFT + reversibel, ORTHOGONAL zum status-enum (eigene Spalte archived_at).
-- Löschen = HARD, nur wenn status != 'active'; Cascade über bestehende FKs
-- (la_steps/la_enrollments/la_jobs alle ON DELETE CASCADE auf la_campaigns).
-- Runner-Härtung: la_claim_jobs überspringt archivierte Kampagnen (belt-and-suspenders,
-- archiviert impliziert i.d.R. paused, aber nie geclaimt).
-- Team-Check-Konvention wie la_campaign_funnel: public.user_in_team(team_id).
-- Idempotent. Composite-FK/Team-Invariante unangetastet.

BEGIN;

-- 1) Soft-Archive-Spalte + partieller Index (nur archivierte Rows).
ALTER TABLE public.la_campaigns ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS la_campaigns_archived_idx
  ON public.la_campaigns (team_id, archived_at)
  WHERE archived_at IS NOT NULL;

-- 2) Runner-Härtung: archivierte Kampagnen nie claimen.
CREATE OR REPLACE FUNCTION public.la_claim_jobs(p_limit int DEFAULT 5)
RETURNS SETOF public.la_jobs
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $fn$
  UPDATE public.la_jobs j SET state = 'claimed', updated_at = now()
  WHERE j.id IN (
    SELECT j2.id
    FROM public.la_jobs j2
    JOIN public.la_enrollments e ON e.id = j2.enrollment_id
    JOIN public.la_campaigns  c ON c.id = e.campaign_id
    WHERE j2.state = 'pending' AND j2.scheduled_at <= now()
      AND c.status = 'active'
      AND c.archived_at IS NULL                        -- archiviert → NIE geclaimt
    ORDER BY j2.scheduled_at
    FOR UPDATE OF j2 SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
$fn$;

-- 3a) Archivieren/Wiederherstellen (reversibel, orthogonal zu status).
CREATE OR REPLACE FUNCTION public.la_campaign_set_archived(p_campaign_id uuid, p_archived boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_team uuid; v_at timestamptz;
BEGIN
  SELECT team_id INTO v_team FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.la_campaigns
    SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
        updated_at  = now()
  WHERE id = p_campaign_id
  RETURNING archived_at INTO v_at;

  RETURN jsonb_build_object('id', p_campaign_id, 'archived', v_at IS NOT NULL, 'archived_at', v_at);
END $fn$;

-- 3b) Löschen (hart). Blockt bei status='active' → erst stoppen. Cascade räumt
--     enrollments/jobs/steps. Rückgabe: gelöschte Counts (vor dem DELETE gezählt).
CREATE OR REPLACE FUNCTION public.la_campaign_delete(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_team uuid; v_status text; v_enr int; v_jobs int;
BEGIN
  SELECT team_id, status INTO v_team, v_status FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_status = 'active' THEN RAISE EXCEPTION 'campaign_active_stop_first'; END IF;

  SELECT count(*) INTO v_enr FROM public.la_enrollments WHERE campaign_id = p_campaign_id;
  SELECT count(*) INTO v_jobs FROM public.la_jobs j
    JOIN public.la_enrollments e ON e.id = j.enrollment_id
    WHERE e.campaign_id = p_campaign_id;

  DELETE FROM public.la_campaigns WHERE id = p_campaign_id;  -- Cascade: steps/enrollments/jobs

  RETURN jsonb_build_object('deleted_campaign', p_campaign_id,
                            'deleted_enrollments', v_enr, 'deleted_jobs', v_jobs);
END $fn$;

REVOKE ALL ON FUNCTION public.la_campaign_set_archived(uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.la_campaign_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.la_campaign_set_archived(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.la_campaign_delete(uuid) TO authenticated, service_role;

COMMIT;
