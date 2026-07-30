-- request_network_sync — user-getriggerter Abgleich der 1.-Grad-Verbindungen (Netzwerk)
-- der aktiven Marke. Brand-Gate via has_brand_access. Ruft import-unipile-relations
-- fuer den verbundenen OK-Account. Analog request_inbox_sync (Postfach).
CREATE OR REPLACE FUNCTION public.request_network_sync(p_brand_voice_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE base_url text := current_setting('app.supabase_functions_url', true);
        service_key text := current_setting('app.service_role_key', true);
        v_acc text;
BEGIN
  IF NOT public.has_brand_access(p_brand_voice_id) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  SELECT unipile_account_id INTO v_acc FROM public.unipile_accounts WHERE brand_voice_id = p_brand_voice_id AND status='OK' LIMIT 1;
  IF v_acc IS NULL THEN RETURN jsonb_build_object('error','no_connection'); END IF;
  IF base_url IS NULL OR service_key IS NULL THEN RETURN jsonb_build_object('error','guc_missing'); END IF;
  PERFORM net.http_post(url := base_url||'/import-unipile-relations',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
    body := jsonb_build_object('unipile_account_id', v_acc, 'max_pages', 50));
  RETURN jsonb_build_object('ok', true, 'account', v_acc);
END $function$;
GRANT EXECUTE ON FUNCTION public.request_network_sync(uuid) TO authenticated;
