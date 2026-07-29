-- Auto-Refresh der LinkedIn-Capabilities: Cron feuert unipile-detect-capabilities
-- regelmaessig (alle 6h) fuer alle verbundenen Accounts.
CREATE OR REPLACE FUNCTION public.trigger_detect_capabilities()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE base_url text := current_setting('app.supabase_functions_url', true);
        service_key text := current_setting('app.service_role_key', true);
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN RAISE WARNING '[detect-capabilities] GUCs fehlen'; RETURN; END IF;
  PERFORM net.http_post(
    url     := base_url || '/unipile-detect-capabilities',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || service_key),
    body    := '{}'::jsonb);
END $$;
