-- LinkedIn-Automation Greenfield · Phase 3 · Audiences.
-- (1) la_claim_jobs härten: NUR Jobs AKTIVER Kampagnen claimen → paused/draft-Kampagnen senden nichts
--     (Anti-Massen-Send-Invariante; P3 reiht viele Enrollments ein, aber ohne aktive Kampagne geht nichts raus).
-- (2) trigger_la_relations_sync: täglicher Relations-Pull, Accounts gestaffelt via Hash-Stunde (geteilter Key).
-- (3) pg_cron la-relations-sync (stündlich :05; jeder Account 1×/Tag in seiner Hash-Stunde).
-- Idempotent. On-demand-Suche = manueller la-audience-Invoke (kein Cron).

BEGIN;

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
      AND c.status = 'active'                         -- paused/draft → wird NIE geclaimt
    ORDER BY j2.scheduled_at
    FOR UPDATE OF j2 SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
$fn$;

CREATE OR REPLACE FUNCTION public.trigger_la_relations_sync()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  base_url    text := current_setting('app.supabase_functions_url', true);
  service_key text := current_setting('app.service_role_key', true);
  r record; n int := 0;
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[la-relations-sync] app.supabase_functions_url oder app.service_role_key fehlt'; RETURN;
  END IF;
  FOR r IN
    SELECT DISTINCT a.id AS audience_id, c.id AS campaign_id
    FROM public.la_audiences a
    JOIN public.la_campaigns c ON c.audience_id = a.id AND c.team_id = a.team_id
    JOIN public.la_accounts acc ON acc.id = c.account_id
    WHERE a.kind = 'relations'
      AND (abs(hashtext(acc.unipile_account_id)) % 24) = extract(hour FROM (now() AT TIME ZONE 'utc'))::int
  LOOP
    PERFORM net.http_post(
      url     := base_url || '/la-audience',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body    := jsonb_build_object('audience_id', r.audience_id, 'campaign_id', r.campaign_id)
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE '[la-relations-sync] % relations-Audiences (Hash-Stunde %) gefeuert', n, extract(hour FROM (now() AT TIME ZONE 'utc'))::int;
END $fn$;

SELECT cron.schedule('la-relations-sync', '5 * * * *', $$SELECT public.trigger_la_relations_sync()$$);

COMMIT;
