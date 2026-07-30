-- Rueckweg-Statusabgleich: markiert unipile_accounts, deren Unipile-Account nicht mehr
-- existiert (oder gestoerte Session hat), als DISCONNECTED/entsprechend. Gegenstueck zu
-- unipile-webhook (Realtime) + unipile-account-reap (Kostenreap). EF: unipile-account-reconcile.
CREATE OR REPLACE FUNCTION public.trigger_reconcile_accounts()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE base_url text := current_setting('app.supabase_functions_url', true);
        service_key text := current_setting('app.service_role_key', true);
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN RAISE WARNING '[account-reconcile] GUCs fehlen'; RETURN; END IF;
  PERFORM net.http_post(
    url     := base_url || '/unipile-account-reconcile',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || service_key),
    body    := '{}'::jsonb);
END $function$;

-- Cron alle 30 min (als supabase_admin ausfuehren!). Idempotent: alten Job entfernen, neu setzen.
DO $$ BEGIN
  PERFORM cron.unschedule('account-reconcile');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('account-reconcile', '5,35 * * * *', 'SELECT public.trigger_reconcile_accounts()');
