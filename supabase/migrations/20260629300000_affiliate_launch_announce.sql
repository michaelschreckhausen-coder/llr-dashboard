-- 20260629300000_affiliate_launch_announce.sql
-- Affiliate-System Phase 11 — Customer-Launch-Announce-Mail (marketing, opt-out-able).
-- email_templates (de+en, category='marketing' → send-templated-email respektiert
-- opted_out_marketing + Frequency-Cap, braucht user_id im Body). Idempotenz via
-- affiliate_launch_sends (1 Send pro User). RPC mit dry-run-Default.

BEGIN;

-- 1. Template (de+en, marketing)
INSERT INTO public.email_templates (template_key, locale, status, category, name, subject, mjml_source, variable_schema)
SELECT * FROM (VALUES
  ('affiliate_program_announce', 'de', 'published', 'marketing',
   'Affiliate-Programm Launch-Announce',
   '💰 Verdiene mit Leadesk — empfiehl uns weiter und bekomme 20% Provision',
   $mjml$<mjml>
  <mj-body>
    <mj-section><mj-column>
      <mj-text font-size="15px" line-height="1.6">
        <p>Hallo {{name}},</p>
        <p>du bist jetzt seit {{customer_since_months}} Monaten bei Leadesk — vielen Dank für dein Vertrauen.</p>
        <p>Wenn du Leadesk weiterempfiehlst, kannst du jetzt <strong>20% Provision für 12 Monate</strong> pro geworbenem Kunden verdienen.</p>
      </mj-text>
      <mj-button href="https://app.leadesk.de/settings/affiliate" background-color="#0052CC" color="#ffffff">Jetzt Affiliate werden →</mj-button>
      <mj-text font-size="15px" line-height="1.6">
        <p><strong>So einfach geht's:</strong></p>
        <ol>
          <li>Eigenen Affiliate-Code wählen (1 Minute)</li>
          <li>Persönlichen Link teilen</li>
          <li>Provisionen sammeln — monatlich automatisch ausgezahlt ab 25 €</li>
        </ol>
        <p><strong>Beispiel:</strong> ein geworbener Kunde mit 49 €-Plan bringt dir 117,60 € über 12 Monate.</p>
        <p>Beste Grüße,<br/>Dein Leadesk-Team</p>
      </mj-text>
    </mj-column></mj-section>
  </mj-body>
</mjml>$mjml$,
   '{"name":"string","customer_since_months":"number"}'::jsonb),
  ('affiliate_program_announce', 'en', 'published', 'marketing',
   'Affiliate program launch announce',
   '💰 Earn with Leadesk — refer us and get 20% commission',
   $mjml$<mjml>
  <mj-body>
    <mj-section><mj-column>
      <mj-text font-size="15px" line-height="1.6">
        <p>Hi {{name}},</p>
        <p>you've been with Leadesk for {{customer_since_months}} months — thank you for your trust.</p>
        <p>When you refer Leadesk to others, you can now earn <strong>20% commission for 12 months</strong> per referred customer.</p>
      </mj-text>
      <mj-button href="https://app.leadesk.de/settings/affiliate" background-color="#0052CC" color="#ffffff">Become an affiliate →</mj-button>
      <mj-text font-size="15px" line-height="1.6">
        <p><strong>How it works:</strong></p>
        <ol><li>Pick your affiliate code (1 minute)</li><li>Share your personal link</li><li>Collect commissions — paid out monthly from €25</li></ol>
        <p><strong>Example:</strong> a referred customer on a €49 plan earns you €117.60 over 12 months.</p>
        <p>Best,<br/>The Leadesk team</p>
      </mj-text>
    </mj-column></mj-section>
  </mj-body>
</mjml>$mjml$,
   '{"name":"string","customer_since_months":"number"}'::jsonb)
) AS v(template_key, locale, status, category, name, subject, mjml_source, variable_schema)
ON CONFLICT (template_key, locale) DO NOTHING;

-- 2. Idempotenz-Table
CREATE TABLE IF NOT EXISTS public.affiliate_launch_sends (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now()
);
ALTER TABLE public.affiliate_launch_sends ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.affiliate_launch_sends TO service_role;

-- 3. RPC — dry-run-default Mass-Send
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
    -- idempotent: erst markieren (Doppel-Run schützt), dann senden (send-templated-email
    -- macht Opt-Out/Frequency-Cap-Check intern via user_id).
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
  VALUES (v_admin, 'affiliate_launch_announce', 'affiliate_launch_sends', NULL, 'mass_send',
          jsonb_build_object('eligible', v_eligible), jsonb_build_object('sent', v_sent), 'Affiliate-Launch-Announce Mass-Send');

  RETURN jsonb_build_object('dry_run', false, 'eligible', v_eligible, 'sent', v_sent);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_trigger_affiliate_launch_announce(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_trigger_affiliate_launch_announce(boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
