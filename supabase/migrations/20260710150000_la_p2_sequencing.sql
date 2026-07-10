-- LinkedIn-Automation Greenfield · Phase 2 · Sequencing (Bedingungs-Schritte, event-getrieben).
-- always: nach Vorgänger-done materialisieren (zeitbasiert). if_no_reply: ebenso, aber Runner prüft
-- vor Send enrollment.state=replied → skip. if_accepted: NICHT bei done — nur via new_relation-Event.
-- + 'skipped'-State (Reply-Stop / replied-Skip). + la_materialize_accepted + la_reply_stop. Idempotent.

BEGIN;

-- (1) 'skipped'-State ergänzen (robust: alten state-CHECK finden+droppen, neuen setzen)
DO $c$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid='public.la_jobs'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%state%' LOOP
    EXECUTE 'ALTER TABLE public.la_jobs DROP CONSTRAINT '||quote_ident(c);
  END LOOP;
END $c$;
ALTER TABLE public.la_jobs ADD CONSTRAINT la_jobs_state_check
  CHECK (state IN ('pending','claimed','running','done','failed','dead','skipped'));

-- (2) la_materialize_next: always + if_no_reply zeitbasiert; if_accepted event-getrieben (nicht hier).
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
  IF v_step.condition = 'if_accepted' THEN
    RETURN jsonb_build_object('waiting_for', 'accepted', 'position', v_next);  -- event-getrieben
  END IF;
  INSERT INTO public.la_jobs (enrollment_id, team_id, step_id, action, scheduled_at, idempotency_key)
  VALUES (v_enr.id, v_enr.team_id, v_step.id, v_step.action, now() + v_step.wait_after,
          v_enr.id::text || ':' || v_step.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('materialized_job', v_job_id, 'action', v_step.action, 'condition', v_step.condition, 'position', v_next);
END $fn$;

-- (3) la_materialize_accepted: new_relation-Event → Step at current_position (if_accepted) materialisieren.
CREATE OR REPLACE FUNCTION public.la_materialize_accepted(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_enr public.la_enrollments; v_step public.la_steps; v_job_id uuid;
BEGIN
  SELECT * INTO v_enr FROM public.la_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'enrollment_not_found'); END IF;
  IF v_enr.state = 'replied' THEN RETURN jsonb_build_object('skipped', 'already_replied'); END IF;
  SELECT * INTO v_step FROM public.la_steps WHERE campaign_id = v_enr.campaign_id AND position = v_enr.current_position;
  IF NOT FOUND OR v_step.condition <> 'if_accepted' THEN
    RETURN jsonb_build_object('no_accepted_step_pending', true, 'position', v_enr.current_position);
  END IF;
  INSERT INTO public.la_jobs (enrollment_id, team_id, step_id, action, scheduled_at, idempotency_key)
  VALUES (v_enr.id, v_enr.team_id, v_step.id, v_step.action, now() + v_step.wait_after,
          v_enr.id::text || ':' || v_step.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('materialized_job', v_job_id, 'action', v_step.action, 'position', v_enr.current_position);
END $fn$;

-- (4) la_reply_stop: eingehende Nachricht → Enrollment replied + offene (pending) Jobs skippen.
CREATE OR REPLACE FUNCTION public.la_reply_stop(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_killed int;
BEGIN
  UPDATE public.la_enrollments SET state = 'replied', updated_at = now() WHERE id = p_enrollment_id;
  UPDATE public.la_jobs SET state = 'skipped', error = 'reply_stop', updated_at = now()
    WHERE enrollment_id = p_enrollment_id AND state = 'pending';
  GET DIAGNOSTICS v_killed = ROW_COUNT;
  RETURN jsonb_build_object('enrollment', 'replied', 'killed_jobs', v_killed);
END $fn$;

REVOKE ALL ON FUNCTION public.la_materialize_accepted(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.la_reply_stop(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.la_materialize_accepted(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.la_reply_stop(uuid) TO service_role;

COMMIT;
