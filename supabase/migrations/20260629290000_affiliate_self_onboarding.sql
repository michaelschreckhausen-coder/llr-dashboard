-- 20260629290000_affiliate_self_onboarding.sql
-- Affiliate-System Phase 8 — Bestandskunden-Self-Onboarding (auto-approve).
-- 3 RPCs (SECURITY DEFINER, caller=auth.uid()):
--   suggest_affiliate_code()        → kebab-case-Vorschlag aus Name/Email, unique
--   affiliate_code_available(code)  → bool (RLS-bypass! sonst false-positive da
--                                     affiliates-RLS nur die eigene Row zeigt)
--   self_onboard_as_affiliate(code, tos) → INSERT status='active' + Onboarding-Mail

BEGIN;

CREATE OR REPLACE FUNCTION public.suggest_affiliate_code()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_base text; v_code text; v_i int := 1;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT lower(COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1)))
    INTO v_base FROM auth.users u WHERE u.id = v_uid;
  v_base := replace(replace(replace(replace(COALESCE(v_base,''), 'ä','ae'), 'ö','oe'), 'ü','ue'), 'ß','ss');
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '(^-+|-+$)', '', 'g');
  v_base := left(v_base, 30);
  IF length(v_base) < 4 THEN v_base := 'partner'; END IF;

  v_code := v_base;
  WHILE EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_code) LOOP
    v_i := v_i + 1;
    v_code := left(v_base, 28) || '-' || v_i;
  END LOOP;
  RETURN v_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.affiliate_code_available(p_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_code text := lower(trim(COALESCE(p_code,'')));
BEGIN
  IF v_code !~ '^[a-z0-9][a-z0-9-]{3,29}$' THEN RETURN false; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.self_onboard_as_affiliate(p_code text, p_accepted_tos boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_code  text := lower(trim(COALESCE(p_code,'')));
  v_id    uuid; v_email text; v_name text; v_svc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_accepted_tos IS NOT TRUE THEN RAISE EXCEPTION 'Affiliate-Bedingungen müssen akzeptiert werden'; END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9-]{3,29}$' THEN RAISE EXCEPTION 'Code ungültig (4-30 Zeichen, a-z/0-9/-, Start alphanumerisch)'; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = v_uid) THEN RAISE EXCEPTION 'already affiliate'; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_code) THEN RAISE EXCEPTION 'code already taken'; END IF;

  INSERT INTO public.affiliates (user_id, code, status, commission_rate_bps, commission_duration_months, approved_at, approved_by)
  VALUES (v_uid, v_code, 'active', 2000, 12, now(), NULL)
  RETURNING id INTO v_id;

  -- Onboarding-Mail (gleicher Pfad wie admin_approve_affiliate F/G)
  BEGIN
    SELECT u.email, COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1))
      INTO v_email, v_name FROM auth.users u WHERE u.id = v_uid;
    v_svc := current_setting('app.service_role_key', true);
    IF v_email IS NOT NULL AND v_svc IS NOT NULL AND length(v_svc) > 20 THEN
      PERFORM net.http_post(
        url     := 'http://kong:8000/functions/v1/send-templated-email',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_svc),
        body    := jsonb_build_object('template_key','affiliate_stripe_connect_invite','recipient_email',v_email,
                     'variables', jsonb_build_object('name', v_name, 'code', v_code))
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'self-onboard onboarding-mail failed: %', SQLERRM;
  END;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.suggest_affiliate_code() FROM public;
REVOKE ALL ON FUNCTION public.affiliate_code_available(text) FROM public;
REVOKE ALL ON FUNCTION public.self_onboard_as_affiliate(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.suggest_affiliate_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_code_available(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_onboard_as_affiliate(text, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
