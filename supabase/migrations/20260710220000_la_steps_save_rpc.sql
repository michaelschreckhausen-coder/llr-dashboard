-- LinkedIn-Automation Greenfield · Sequenz-Speichern robust + Re-Materialisierung.
-- Bug: la_jobs.step_id referenziert la_steps RESTRIKTIV → Step-Löschen bei bereits
-- materialisierten Jobs bricht (la_jobs_step_id_fkey). Plus latente Positions-Lücken
-- bei Add/Delete (UNIQUE(campaign_id,position)).
--
-- Fix:
-- 1) FK la_jobs.step_id → ON DELETE SET NULL (step_id ist bereits nullable):
--    historische/done Jobs überleben eine Step-Löschung (Audit bleibt, Referenz NULL).
-- 2) la_campaign_save_steps(campaign, steps[]): atomarer Upsert nach Array-Reihenfolge
--    (= position), entfernte Steps raus (deren PENDING Jobs vorher gecancelt; done via
--    SET NULL unbeschadet), kontiguierliche Positionen (Kollisions-frei via Bump).
-- 3) Re-Materialisierung: verbliebene PENDING Jobs gegen die NEUE Sequenz neu aufbauen
--    (pro Enrollment am current_position; scheduled_at der Staffelung erhalten → kein
--    Massen-Send; kein Step mehr an der Position → Enrollment completed).
-- 4) Guard: Sequenz-Edit einer ACTIVE Kampagne blockt (erst pausieren), analog Löschen.
-- Team-Check via public.user_in_team. Idempotent.

BEGIN;

-- 1) FK auf SET NULL umstellen.
ALTER TABLE public.la_jobs DROP CONSTRAINT IF EXISTS la_jobs_step_id_fkey;
ALTER TABLE public.la_jobs
  ADD CONSTRAINT la_jobs_step_id_fkey
  FOREIGN KEY (step_id) REFERENCES public.la_steps (id) ON DELETE SET NULL;

-- 2+3+4) Atomares Speichern der Sequenz.
CREATE OR REPLACE FUNCTION public.la_campaign_save_steps(p_campaign_id uuid, p_steps jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_team uuid; v_status text;
  v_incoming uuid[];
  v_elem jsonb; v_ord int;
  v_removed int; v_saved int := 0;
  v_remat int := 0; v_completed int := 0;
  v_step public.la_steps; v_rec record;
BEGIN
  SELECT team_id, status INTO v_team, v_status FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_status = 'active' THEN RAISE EXCEPTION 'campaign_active_pause_first'; END IF;
  IF jsonb_typeof(p_steps) <> 'array' THEN RAISE EXCEPTION 'steps_must_be_array'; END IF;

  -- Betroffene Enrollments (mit PENDING Jobs) + Staffelung (scheduled_at) VOR jeder
  -- Änderung erfassen — sonst löscht der Step-Cleanup die Jobs, bevor Re-Mat sie sieht.
  DROP TABLE IF EXISTS _la_remat;
  CREATE TEMP TABLE _la_remat ON COMMIT DROP AS
    SELECT e.id AS enrollment_id, e.team_id, e.current_position, min(j.scheduled_at) AS sched
    FROM public.la_enrollments e JOIN public.la_jobs j ON j.enrollment_id = e.id
    WHERE e.campaign_id = p_campaign_id AND j.state = 'pending' AND e.state = 'active'
    GROUP BY e.id, e.team_id, e.current_position;

  -- Eingehende (bestehende) Step-IDs.
  v_incoming := ARRAY(
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_steps) e WHERE NULLIF(e->>'id','') IS NOT NULL
  );

  -- Entfernte Steps löschen. FK ON DELETE SET NULL entkoppelt referenzierende Jobs
  -- (done → step_id NULL/Audit bleibt; pending werden gleich in der Re-Mat neu gebaut).
  WITH del AS (
    DELETE FROM public.la_steps s
      WHERE s.campaign_id = p_campaign_id AND s.id <> ALL(v_incoming) RETURNING 1
  ) SELECT count(*) INTO v_removed FROM del;

  -- Kollisions-Schutz: bestehende Positionen hochbumpen, dann kontiguierlich setzen.
  UPDATE public.la_steps SET position = position + 100000 WHERE campaign_id = p_campaign_id;

  FOR v_elem, v_ord IN
    SELECT value, ordinality FROM jsonb_array_elements(p_steps) WITH ORDINALITY
  LOOP
    IF NULLIF(v_elem->>'id','') IS NOT NULL THEN
      UPDATE public.la_steps SET
        position  = v_ord - 1,
        action    = v_elem->>'action',
        condition = COALESCE(NULLIF(v_elem->>'condition',''), 'always'),
        template  = COALESCE(v_elem->'template', '{}'::jsonb)
      WHERE id = (v_elem->>'id')::uuid AND campaign_id = p_campaign_id;
    ELSE
      INSERT INTO public.la_steps (campaign_id, position, action, condition, template)
      VALUES (p_campaign_id, v_ord - 1, v_elem->>'action',
              COALESCE(NULLIF(v_elem->>'condition',''), 'always'),
              COALESCE(v_elem->'template', '{}'::jsonb));
    END IF;
    v_saved := v_saved + 1;
  END LOOP;

  -- Re-Materialisierung: jede betroffene Enrollment gegen die NEUE Sequenz (am current_position).
  -- Vorher erfasste PENDING Jobs löschen (auch die an entfernten Steps, jetzt step_id NULL)
  -- und einen frischen Job am current_position bauen; scheduled_at der Staffelung bewahren.
  FOR v_rec IN SELECT * FROM _la_remat LOOP
    DELETE FROM public.la_jobs WHERE enrollment_id = v_rec.enrollment_id AND state = 'pending';
    SELECT * INTO v_step FROM public.la_steps
      WHERE campaign_id = p_campaign_id AND position = v_rec.current_position;
    IF FOUND THEN
      INSERT INTO public.la_jobs (enrollment_id, team_id, step_id, action, scheduled_at, idempotency_key)
      VALUES (v_rec.enrollment_id, v_rec.team_id, v_step.id, v_step.action, COALESCE(v_rec.sched, now()),
              v_rec.enrollment_id::text || ':' || v_step.id::text || ':r' || floor(extract(epoch FROM clock_timestamp()))::text);
      v_remat := v_remat + 1;
    ELSE
      UPDATE public.la_enrollments SET state = 'completed', updated_at = now() WHERE id = v_rec.enrollment_id;
      v_completed := v_completed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('saved_steps', v_saved, 'removed_steps', v_removed,
                            'rematerialized', v_remat, 'completed', v_completed);
END $fn$;

REVOKE ALL ON FUNCTION public.la_campaign_save_steps(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.la_campaign_save_steps(uuid, jsonb) TO authenticated, service_role;

COMMIT;
