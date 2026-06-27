-- 20260629350000_affiliate_applications.sql
-- Affiliate-System Phase 12 (Foundation) — externe Bewerbungs-Pipeline.
-- Table + RLS (admin-read, Writes via Public-EF/RPCs) + 4 Email-Templates (DE).
-- EN-Templates + EFs (submit/verify mit reCAPTCHA) + Admin-Surface = Folge-Schritte.

BEGIN;

CREATE TABLE IF NOT EXISTS public.affiliate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  company_or_channel text,
  reach_channels jsonb,                 -- ['linkedin','youtube',...]
  audience_size text NOT NULL,          -- '<1k','1-10k','10-100k','100k+'
  motivation text NOT NULL,
  code_wish text NOT NULL,
  recaptcha_score numeric,              -- v3 score 0.0-1.0
  email_verify_token text UNIQUE,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending_email_verify',
    -- pending_email_verify | pending | auto_approved | approved | rejected
  decision_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  affiliate_id uuid REFERENCES public.affiliates(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT affiliate_applications_status_chk CHECK (status IN
    ('pending_email_verify','pending','auto_approved','approved','rejected')),
  CONSTRAINT affiliate_applications_audience_chk CHECK (audience_size IN ('<1k','1-10k','10-100k','100k+'))
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.affiliate_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_email ON public.affiliate_applications(email);

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;
-- Nur Admin liest; Writes laufen über die EFs (service-role) bzw. Admin-RPCs.
DROP POLICY IF EXISTS affiliate_applications_admin_read ON public.affiliate_applications;
CREATE POLICY affiliate_applications_admin_read ON public.affiliate_applications FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));
GRANT SELECT ON public.affiliate_applications TO authenticated;
GRANT ALL ON public.affiliate_applications TO service_role;

-- 4 Email-Templates (DE, transactional — Antworten auf User-Aktion, opt-out-fest)
INSERT INTO public.email_templates (template_key, locale, status, category, name, subject, mjml_source, variable_schema)
SELECT * FROM (VALUES
  ('affiliate_application_email_verify', 'de', 'published', 'transactional',
   'Affiliate-Bewerbung E-Mail-Verify', 'Bestätige deine E-Mail für deine Leadesk-Affiliate-Bewerbung',
   $m$<mjml><mj-body><mj-section><mj-column>
     <mj-text font-size="15px" line-height="1.6"><p>Hallo {{name}},</p><p>danke für deine Bewerbung zum Leadesk-Affiliate-Programm. Bitte bestätige deine E-Mail-Adresse, damit wir deine Bewerbung bearbeiten können:</p></mj-text>
     <mj-button href="{{verify_url}}" background-color="#0052CC" color="#ffffff">E-Mail bestätigen →</mj-button>
     <mj-text font-size="13px" color="#6B7280"><p>Wenn du dich nicht beworben hast, ignoriere diese Mail einfach.</p></mj-text>
   </mj-column></mj-section></mj-body></mjml>$m$,
   '{"name":"string","verify_url":"string"}'::jsonb),
  ('affiliate_application_received', 'de', 'published', 'transactional',
   'Affiliate-Bewerbung eingegangen', 'Deine Leadesk-Affiliate-Bewerbung ist eingegangen',
   $m$<mjml><mj-body><mj-section><mj-column>
     <mj-text font-size="15px" line-height="1.6"><p>Hallo {{name}},</p><p>deine Bewerbung ist eingegangen und wird von unserem Team geprüft. Du hörst innerhalb von 48 Stunden von uns.</p><p>Beste Grüße,<br/>Dein Leadesk-Team</p></mj-text>
   </mj-column></mj-section></mj-body></mjml>$m$,
   '{"name":"string"}'::jsonb),
  ('affiliate_application_approved', 'de', 'published', 'transactional',
   'Affiliate-Bewerbung angenommen', '🎉 Willkommen im Leadesk-Affiliate-Programm',
   $m$<mjml><mj-body><mj-section><mj-column>
     <mj-text font-size="15px" line-height="1.6"><p>Hallo {{name}},</p><p>herzlich willkommen — deine Affiliate-Bewerbung ist angenommen! Dein Code ist <strong>{{code}}</strong>.</p><p>Richte jetzt dein Konto ein und verbinde Stripe für die Auszahlungen:</p></mj-text>
     <mj-button href="{{setup_url}}" background-color="#0052CC" color="#ffffff">Konto einrichten →</mj-button>
   </mj-column></mj-section></mj-body></mjml>$m$,
   '{"name":"string","code":"string","setup_url":"string"}'::jsonb),
  ('affiliate_application_rejected', 'de', 'published', 'transactional',
   'Affiliate-Bewerbung Update', 'Update zu deiner Leadesk-Affiliate-Bewerbung',
   $m$<mjml><mj-body><mj-section><mj-column>
     <mj-text font-size="15px" line-height="1.6"><p>Hallo {{name}},</p><p>danke für dein Interesse am Leadesk-Affiliate-Programm. Leider können wir deine Bewerbung aktuell nicht annehmen.</p><p>{{reason}}</p><p>Beste Grüße,<br/>Dein Leadesk-Team</p></mj-text>
   </mj-column></mj-section></mj-body></mjml>$m$,
   '{"name":"string","reason":"string"}'::jsonb)
) AS v(template_key, locale, status, category, name, subject, mjml_source, variable_schema)
ON CONFLICT (template_key, locale) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
