-- Unipile-Kontakte-Import-Sprint · Build-Step 4
-- Trigger für den Relations-Auto-Sync: Wrapper-Fn (GUC + net.http_post, Muster trigger_process_automation_jobs)
-- feuert import-unipile-relations pro OK-Account (fire-and-forget via pg_net) + pg_cron 1×/Tag.
-- Relations ändern sich langsam → 1×/Tag reicht; Import ist idempotent (Dedup provider_id).

BEGIN;

CREATE OR REPLACE FUNCTION public.trigger_import_unipile_relations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  base_url    text := current_setting('app.supabase_functions_url', true);
  service_key text := current_setting('app.supabase_service_role_key', true);
  r record;
  n int := 0;
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[unipile-relations-cron] app.supabase_functions_url oder app.supabase_service_role_key fehlt';
    RETURN;
  END IF;
  -- pro OK-Account einen fire-and-forget-Call. Accounts sind verschiedene LinkedIn-Sessions
  -- (kein geteiltes Limit); EF drosselt intern via Pagination. Bei künftig vielen Accounts hier
  -- zeitlich staffeln (z.B. Tages-Bucket via hashtext(unipile_account_id) % 7).
  FOR r IN
    SELECT DISTINCT unipile_account_id
    FROM public.unipile_accounts
    WHERE status = 'OK' AND team_id IS NOT NULL AND unipile_account_id IS NOT NULL
  LOOP
    PERFORM net.http_post(
      url     := base_url || '/import-unipile-relations',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body    := jsonb_build_object('unipile_account_id', r.unipile_account_id)
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE '[unipile-relations-cron] % OK-Accounts gefeuert', n;
END $function$;

-- pg_cron 1×/Tag 04:10 (nach den früheren Jobs, off-peak). Idempotent: cron.schedule upsertet per jobname.
SELECT cron.schedule('import-unipile-relations', '10 4 * * *', $$SELECT public.trigger_import_unipile_relations()$$);

COMMIT;
