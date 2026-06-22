-- 20260629330000_self_onboard_block_internal.sql
-- Affiliate-System — self_onboard_as_affiliate blockt jetzt @leadesk.de-Accounts
-- (interner Staff soll sich nicht versehentlich als Affiliate anlegen; entdeckt beim
-- michael-schreck-Prod-Test). Sonst identisch zu Phase 8 (20260629290000).

BEGIN;

CREATE OR REPLACE FUNCTION public.self_onboard_as_affiliate(p_code text, p_accepted_tos boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_code  text := lower(trim(COALESCE(p_code,'')));
  v_id    uuid; v_email text; v_name text; v_svc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT u.email, COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1))
    INTO v_email, v_name FROM auth.users u WHERE u.id = v_uid;

  -- Interner Staff darf sich nicht selbst als Affiliate anlegen.
  IF v_email ILIKE '%@leadesk.de' THEN
    RAISE EXCEPTION 'Interne @leadesk.de-Accounts können nicht am Affiliate-Programm teilnehmen';
  END IF;

  IF p_accepted_tos IS NOT TRUE THEN RAISE EXCEPTION 'Affiliate-Bedingungen müssen akzeptiert werden'; END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9-]{3,29}$' THEN RAISE EXCEPTION 'Code ungültig (4-30 Zeichen, a-z/0-9/-, Start alphanumerisch)'; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = v_uid) THEN RAISE EXCEPTION 'already affiliate'; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_code) THEN RAISE EXCEPTION 'code already taken'; END IF;

  INSERT INTO public.affiliates (user_id, code, status, commission_rate_bps, commission_duration_months, approved_at, approved_by)
  VALUES (v_uid, v_code, 'active', 2000, 12, now(), NULL)
  RETURNING id INTO v_id;

  BEGIN
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

COMMIT;

NOTIFY pgrst, 'reload schema';
