-- Kampagnen-Startzeitpunkt: la_claim_jobs respektiert schedule.start_at —
-- vor diesem Zeitpunkt wird KEIN Job der Kampagne ausgefuehrt (zusaetzlich zum Zeitfenster).
-- Regex-Guard verhindert Cast-Fehler bei kaputtem Wert (Runner darf nie crashen).
CREATE OR REPLACE FUNCTION public.la_claim_jobs(p_limit integer DEFAULT 5)
RETURNS SETOF la_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.la_jobs j SET state = 'claimed', updated_at = now()
  WHERE j.id IN (
    SELECT j2.id
    FROM public.la_jobs j2
    JOIN public.la_enrollments e ON e.id = j2.enrollment_id
    JOIN public.la_campaigns  c ON c.id = e.campaign_id
    WHERE j2.state = 'pending' AND j2.scheduled_at <= now()
      AND c.status = 'active'
      AND c.archived_at IS NULL
      AND public.la_in_schedule(c.schedule)
      AND (NOT (c.schedule ? 'start_at')
           OR (c.schedule->>'start_at') !~ '^\d{4}-'
           OR now() >= (c.schedule->>'start_at')::timestamptz)
    ORDER BY j2.scheduled_at
    FOR UPDATE OF j2 SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
$function$;
