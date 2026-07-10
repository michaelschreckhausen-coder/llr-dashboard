-- LinkedIn-Automation Greenfield · Phase 5 · Hardening: Relations-Pull-Chunking (gegen EF-Wall-Clock).
-- la_audiences bekommt Cursor-Checkpoint (sync_cursor) + sync_done. la-audience verarbeitet nur N Seiten/Invoke
-- und checkpointet; der Relations-Cron feuert in-progress-Audiences JEDEN Tick weiter, bis sync_done. Idempotent.

BEGIN;

ALTER TABLE public.la_audiences ADD COLUMN IF NOT EXISTS sync_cursor text;
ALTER TABLE public.la_audiences ADD COLUMN IF NOT EXISTS sync_done boolean NOT NULL DEFAULT true;

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
  -- Täglichen Refresh in der Hash-Stunde STARTEN (Cursor reset → sync_done=false).
  UPDATE public.la_audiences a SET sync_done = false, sync_cursor = NULL
  FROM public.la_campaigns c JOIN public.la_accounts acc ON acc.id = c.account_id
  WHERE a.kind = 'relations' AND a.sync_done = true
    AND c.audience_id = a.id AND c.team_id = a.team_id
    AND (abs(hashtext(acc.unipile_account_id)) % 24) = extract(hour FROM (now() AT TIME ZONE 'utc'))::int;
  -- Alle in-progress relations-Audiences (weiter-)feuern — bis la-audience sie auf sync_done=true setzt.
  FOR r IN
    SELECT DISTINCT a.id AS audience_id, c.id AS campaign_id
    FROM public.la_audiences a
    JOIN public.la_campaigns c ON c.audience_id = a.id AND c.team_id = a.team_id
    WHERE a.kind = 'relations' AND a.sync_done = false
  LOOP
    PERFORM net.http_post(
      url     := base_url || '/la-audience',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body    := jsonb_build_object('audience_id', r.audience_id, 'campaign_id', r.campaign_id)
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE '[la-relations-sync] % in-progress relations-Audiences gefeuert', n;
END $fn$;

COMMIT;
