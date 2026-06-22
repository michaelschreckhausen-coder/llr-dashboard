-- 20260629340000_affiliate_launch_audit_fix.sql
-- Fix: admin_trigger_affiliate_launch_announce schrieb target_id=NULL ins
-- admin_audit_log (NOT NULL) → Mass-Send brach am Ende ab (atomarer Rollback,
-- nichts gesendet). Fix: target_id := v_admin (Mass-Send hat kein Single-Target).
-- Sonst identisch zu 20260629300000.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_trigger_affiliate_launch_announce(p_dry_run boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_svc   text;
  v_eligible int;
  v_sent  int := 0;
  rec     record;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;

  SELECT count(*) INTO v_eligible FROM auth.users u
  LEFT JOIN public.user_email_preferences p ON p.user_id = u.id
  WHERE u.email NOT LIKE '%@leadesk.de' AND u.email_confirmed_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.owner_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.affiliates af WHERE af.user_id = u.id)
    AND COALESCE(p.opted_out_marketing, false) = false
    AND NOT EXISTS (SELECT 1 FROM public.affiliate_launch_sends s WHERE s.user_id = u.id);

  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'eligible', v_eligible,
      'already_sent', (SELECT count(*) FROM public.affiliate_launch_sends));
  END IF;

  v_svc := current_setting('app.service_role_key', true);
  IF v_svc IS NULL OR length(v_svc) < 20 THEN RAISE EXCEPTION 'app.service_role_key not set'; END IF;

  FOR rec IN
    SELECT u.id, u.email,
           COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1)) AS name,
           GREATEST(1, (EXTRACT(YEAR FROM age(now(), u.created_at))*12 + EXTRACT(MONTH FROM age(now(), u.created_at)))::int) AS months
    FROM auth.users u
    LEFT JOIN public.user_email_preferences p ON p.user_id = u.id
    WHERE u.email NOT LIKE '%@leadesk.de' AND u.email_confirmed_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.owner_user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.affiliates af WHERE af.user_id = u.id)
      AND COALESCE(p.opted_out_marketing, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.affiliate_launch_sends s WHERE s.user_id = u.id)
  LOOP
    INSERT INTO public.affiliate_launch_sends (user_id) VALUES (rec.id) ON CONFLICT (user_id) DO NOTHING;
    PERFORM net.http_post(
      url     := 'http://kong:8000/functions/v1/send-templated-email',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_svc),
      body    := jsonb_build_object('template_key','affiliate_program_announce','recipient_email', rec.email,
                   'user_id', rec.id, 'variables', jsonb_build_object('name', rec.name, 'customer_since_months', rec.months))
    );
    v_sent := v_sent + 1;
  END LOOP;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_launch_announce', 'affiliate_launch_sends', v_admin, 'mass_send',
          jsonb_build_object('eligible', v_eligible), jsonb_build_object('sent', v_sent), 'Affiliate-Launch-Announce Mass-Send');

  RETURN jsonb_build_object('dry_run', false, 'eligible', v_eligible, 'sent', v_sent);
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
