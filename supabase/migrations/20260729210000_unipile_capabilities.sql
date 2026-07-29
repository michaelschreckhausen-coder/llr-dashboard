-- LinkedIn-Instanz-Capabilities je verbundenem Account (Premium/InMail/Typ/Pages),
-- damit Leadesk Funktionen passend zur Lizenz/Art des Profils frei-/ausgraut.
ALTER TABLE public.unipile_accounts ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Frontend liest die Capabilities der aktiven Marke (brand-scoped, has_brand_access-gegatet).
CREATE OR REPLACE FUNCTION public.get_brand_connection_caps(p_brand_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_brand_access(p_brand_voice_id) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  SELECT jsonb_build_object(
           'connected',    ua.unipile_account_id IS NOT NULL,
           'status',       ua.status,
           'account_type', COALESCE(bv.account_type::text, 'personal'),
           'caps',         COALESCE(ua.capabilities, '{}'::jsonb)
         )
    INTO v
  FROM public.brand_voices bv
  LEFT JOIN public.unipile_accounts ua ON ua.brand_voice_id = bv.id AND ua.status = 'OK'
  WHERE bv.id = p_brand_voice_id
  LIMIT 1;
  RETURN COALESCE(v, jsonb_build_object('connected', false, 'account_type','personal', 'caps','{}'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.get_brand_connection_caps(uuid) TO authenticated;
