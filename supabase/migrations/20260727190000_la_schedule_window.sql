-- Sende-Zeitfenster fuer Automatisierung: la_in_schedule() prueft, ob JETZT im
-- konfigurierten Fenster (Tage/Uhrzeit/Zeitzone) liegt. la_claim_jobs erzwingt es
-- zentral -> deckt step0 UND Folge-Steps ab. Leeres/fehlendes schedule = jederzeit.
BEGIN;

CREATE OR REPLACE FUNCTION public.la_in_schedule(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text; v_lt timestamp; v_dow int; v_time time; v_start time; v_end time; v_ok_day boolean;
BEGIN
  -- Kein Fenster gesetzt -> immer erlaubt (Rueckwaertskompatibel).
  IF p IS NULL OR p = '{}'::jsonb OR NOT (p ? 'days')
     OR jsonb_array_length(COALESCE(p->'days','[]'::jsonb)) = 0 THEN
    RETURN true;
  END IF;
  v_tz := COALESCE(NULLIF(p->>'tz',''), 'Europe/Berlin');
  BEGIN
    v_lt := now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_lt := now() AT TIME ZONE 'Europe/Berlin';
  END;
  v_dow  := extract(isodow from v_lt)::int;   -- 1=Mo .. 7=So
  v_time := v_lt::time;
  v_start := COALESCE(NULLIF(p->>'start','')::time, '00:00'::time);
  v_end   := COALESCE(NULLIF(p->>'end','')::time,   '23:59'::time);
  v_ok_day := EXISTS (SELECT 1 FROM jsonb_array_elements_text(p->'days') d WHERE d::int = v_dow);
  RETURN v_ok_day AND v_time >= v_start AND v_time < v_end;
END $function$;

-- Claim nur innerhalb des Fensters (zentral fuer alle Job-Typen).
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
      AND public.la_in_schedule(c.schedule)          -- NEU: nur im Sende-Zeitfenster
    ORDER BY j2.scheduled_at
    FOR UPDATE OF j2 SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
$function$;

COMMIT;
