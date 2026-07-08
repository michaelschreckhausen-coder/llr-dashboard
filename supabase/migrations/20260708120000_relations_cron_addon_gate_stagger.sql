-- Unipile-Kontakte-Import · Schritt 4: Relations-Auto-Sync-Cron gaten + staffeln.
-- Gate: nur Teams mit aktivem automation-Addon (kein täglicher Pull für Nicht-Automatisierer).
-- Staffelung: jeder Account feuert nur in seiner Hash-Stunde → verteilt über den Tag, geteilter Unipile-Key geschont.
-- CREATE OR REPLACE (keine Signatur-/Schema-Änderung). Cron-Scheduling separat (nur Prod).

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
  FOR r IN
    SELECT DISTINCT ua.unipile_account_id
    FROM public.unipile_accounts ua
    WHERE ua.status = 'OK' AND ua.team_id IS NOT NULL AND ua.unipile_account_id IS NOT NULL
      AND public.team_has_addon(ua.team_id, 'automation')                                          -- Addon-Gate
      AND (abs(hashtext(ua.unipile_account_id)) % 24) = extract(hour FROM (now() AT TIME ZONE 'utc'))::int  -- Hash-Stunde
  LOOP
    PERFORM net.http_post(
      url     := base_url || '/import-unipile-relations',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body    := jsonb_build_object('unipile_account_id', r.unipile_account_id)
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE '[unipile-relations-cron] % gegatete Accounts (Hash-Stunde %) gefeuert', n, extract(hour FROM (now() AT TIME ZONE 'utc'))::int;
END $function$;

COMMIT;
