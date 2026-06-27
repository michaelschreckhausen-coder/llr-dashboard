-- 20260629280000_affiliate_invite_email.sql
-- Affiliate-System F/G — Onboarding-Email (interne email_templates-Pipeline, NICHT
-- Postmark-Alias) + Auto-Trigger in admin_approve_affiliate (nur pending → active).
-- Echtes Schema: subject/mjml_source/variable_schema/status/locale (de+en separate Rows).
-- send-templated-email matcht status='published'. Variablen {{name}} + {{code}}.

BEGIN;

INSERT INTO public.email_templates (template_key, locale, status, category, name, subject, mjml_source, variable_schema)
SELECT * FROM (VALUES
  ('affiliate_stripe_connect_invite', 'de', 'published', 'transactional',
   'Affiliate — Stripe-Connect-Einladung',
   'Hi {{name}}, verbinde dein Stripe-Konto für Auszahlungen',
   $mjml$<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="15px" line-height="1.6">
          <p>Hallo {{name}},</p>
          <p>dein Affiliate-Konto bei Leadesk ist freigeschaltet. Damit wir dir deine Provisionen monatlich automatisch auszahlen können, verbinde bitte dein Stripe-Konto:</p>
        </mj-text>
        <mj-button href="https://affiliate.leadesk.de/einstellungen" background-color="#0052CC" color="#ffffff">Stripe-Konto verbinden →</mj-button>
        <mj-text font-size="15px" line-height="1.6">
          <p>Dauert 5 Minuten. Du kannst auch erstmal werben — wir sammeln deine Provisionen automatisch und zahlen aus, sobald dein Konto verbunden ist (ab 25 €).</p>
          <p>Dein Affiliate-Code: <strong>{{code}}</strong></p>
          <p>Beste Grüße,<br/>Dein Leadesk-Team</p>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>$mjml$,
   '{"name":"string","code":"string"}'::jsonb),
  ('affiliate_stripe_connect_invite', 'en', 'published', 'transactional',
   'Affiliate — Stripe Connect invite',
   'Hi {{name}}, connect your Stripe account for payouts',
   $mjml$<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="15px" line-height="1.6">
          <p>Hi {{name}},</p>
          <p>your Leadesk affiliate account is approved. To receive your monthly commission payouts automatically, please connect your Stripe account:</p>
        </mj-text>
        <mj-button href="https://affiliate.leadesk.de/einstellungen" background-color="#0052CC" color="#ffffff">Connect Stripe account →</mj-button>
        <mj-text font-size="15px" line-height="1.6">
          <p>Takes 5 minutes. You can start referring right away — we collect your commissions and pay out once your account is connected (from €25).</p>
          <p>Your affiliate code: <strong>{{code}}</strong></p>
          <p>Best,<br/>The Leadesk team</p>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>$mjml$,
   '{"name":"string","code":"string"}'::jsonb)
) AS v(template_key, locale, status, category, name, subject, mjml_source, variable_schema)
ON CONFLICT (template_key, locale) DO NOTHING;

-- admin_approve_affiliate: + Auto-Send der Onboarding-Mail NUR bei pending → active.
CREATE OR REPLACE FUNCTION public.admin_approve_affiliate(p_affiliate_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_old   text;
  v_email text;
  v_code  text;
  v_name  text;
  v_svc   text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;

  SELECT status INTO v_old FROM public.affiliates WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate % not found', p_affiliate_id; END IF;
  IF v_old NOT IN ('pending', 'suspended') THEN
    RAISE EXCEPTION 'approve nur aus pending/suspended (aktuell: %)', v_old; END IF;

  UPDATE public.affiliates SET status = 'active', approved_at = now(), approved_by = v_admin WHERE id = p_affiliate_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_approved', 'affiliates', p_affiliate_id, 'status',
          jsonb_build_object('status', v_old), jsonb_build_object('status', 'active'), p_reason);

  -- Onboarding-Mail nur beim ERSTEN Freischalten (pending → active), nicht bei reactivate.
  IF v_old = 'pending' THEN
    BEGIN
      SELECT u.email, a.code,
             COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1))
        INTO v_email, v_code, v_name
      FROM public.affiliates a JOIN auth.users u ON u.id = a.user_id WHERE a.id = p_affiliate_id;
      v_svc := current_setting('app.service_role_key', true);
      IF v_email IS NOT NULL AND v_svc IS NOT NULL AND length(v_svc) > 20 THEN
        PERFORM net.http_post(
          url     := 'http://kong:8000/functions/v1/send-templated-email',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_svc),
          body    := jsonb_build_object(
            'template_key','affiliate_stripe_connect_invite',
            'recipient_email', v_email,
            'variables', jsonb_build_object('name', v_name, 'code', v_code)
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'affiliate approve onboarding-mail failed: %', SQLERRM;
    END;
  END IF;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
