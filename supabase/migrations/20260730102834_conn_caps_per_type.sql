-- get_brand_connection_caps: 'connected' korrekt je Marken-Typ.
--  personal      -> eigener unipile_account mit status OK
--  company_page  -> linkedin_org_id gesetzt UND acting-Account lebt (status OK)
-- Zusatzfeld org_connected. Rueckwaertskompatibel (connected/status/account_type/caps bleiben).
CREATE OR REPLACE FUNCTION public.get_brand_connection_caps(p_brand_voice_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE bv public.brand_voices%ROWTYPE;
        v_type text; v_status text; v_caps jsonb; v_connected boolean;
BEGIN
  IF NOT public.has_brand_access(p_brand_voice_id) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  SELECT * INTO bv FROM public.brand_voices WHERE id = p_brand_voice_id LIMIT 1;
  IF bv.id IS NULL THEN RETURN jsonb_build_object('connected', false, 'account_type','personal', 'caps','{}'::jsonb); END IF;
  v_type := COALESCE(bv.account_type::text, 'personal');

  IF v_type = 'company_page' THEN
    SELECT ua.status, ua.capabilities INTO v_status, v_caps
      FROM public.unipile_accounts ua
      WHERE ua.unipile_account_id = bv.linkedin_acting_account_id AND ua.status = 'OK' LIMIT 1;
    v_connected := (bv.linkedin_org_id IS NOT NULL) AND (v_status IS NOT NULL);
  ELSE
    SELECT ua.status, ua.capabilities INTO v_status, v_caps
      FROM public.unipile_accounts ua
      WHERE ua.brand_voice_id = bv.id AND ua.status = 'OK' LIMIT 1;
    v_connected := (v_status IS NOT NULL);
  END IF;

  RETURN jsonb_build_object(
    'connected', v_connected, 'status', v_status, 'account_type', v_type,
    'org_connected', (bv.linkedin_org_id IS NOT NULL), 'caps', COALESCE(v_caps, '{}'::jsonb));
END $function$;
