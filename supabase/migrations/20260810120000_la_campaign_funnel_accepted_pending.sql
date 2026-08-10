-- la_campaign_funnel: accepted/invited/pending ergänzen.
--
-- Bug: Der Funnel-Monitor + Analytics-Kampagnen-Tab zeigten "Accepted 0 / Angenommen 0",
-- obwohl die Reconciliation (la-accept-reconcile) accepted_at real befüllt. Ursache: die RPC
-- lieferte gar kein accepted/pending; das Frontend rechnete Accepted aus falschen Feldern
-- (enrollments.replied + done_by_action.message → beide 0).
--
-- Verlässliches Signal ist la_enrollments.accepted_at (monoton, von la_mark_accepted gesetzt).
-- NICHT relation_status: das wird von den Scan-Crons (relations-refresh/inprogress) laufend
-- auf 'unknown' zurückgesetzt und ist daher als Annahme-Signal unbrauchbar.
--   accepted = Enrollments der Kampagne mit accepted_at IS NOT NULL
--   invited  = erledigte Invite-Jobs der Kampagne (= done_by_action.invite)
--   pending  = invited - accepted (nicht-negativ)

CREATE OR REPLACE FUNCTION public.la_campaign_funnel(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_res jsonb; v_accepted integer; v_invited integer;
BEGIN
  SELECT team_id INTO v_team FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT public.user_in_team(v_team) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;

  SELECT count(*) INTO v_accepted
    FROM public.la_enrollments
   WHERE campaign_id = p_campaign_id AND accepted_at IS NOT NULL;

  SELECT count(*) INTO v_invited
    FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
   WHERE e.campaign_id = p_campaign_id AND j.action = 'invite' AND j.state = 'done';

  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'status', (SELECT status FROM public.la_campaigns WHERE id = p_campaign_id),
    'enrollment_total', (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id),
    -- NEU: verlässliche Annahme-Zahlen (Quelle accepted_at, nicht relation_status).
    'accepted', v_accepted,
    'invited',  v_invited,
    'pending',  GREATEST(0, v_invited - v_accepted),
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
    -- Pre-Scan-Prognose je aktivem Enrollment (relation_status).
    'real_invites',      (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'not_connected'),
    'already_connected', (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status IN ('first_degree','pending')),
    'unknown',           (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'unknown'),
    'scan_complete',     (SELECT count(*) = 0 FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'unknown')
  ) INTO v_res;
  RETURN v_res;
END $function$;
