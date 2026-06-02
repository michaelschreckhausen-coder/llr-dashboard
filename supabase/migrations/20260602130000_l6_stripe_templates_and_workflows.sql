-- File: 20260602130000_l6_stripe_templates_and_workflows.sql
-- Sprint L.6 — Stripe-Templates + Workflows + Event-Triggers seeden
--
-- Atomic Migration:
--   1. 3 Templates: subscription_started (transactional), subscription_cancelled
--      (transactional), invoice_payment_failed (billing) — alle locale='de',
--      status='published'. MJML aus outputs/tier1-email-templates-de.md
--   2. 3 Workflows + Steps + Event-Triggers:
--      - Default Stripe Subscription Started  → stripe.subscription.started
--      - Default Stripe Subscription Cancelled → stripe.subscription.cancelled
--      - Default Stripe Invoice Payment Failed → stripe.invoice.payment_failed
--
-- Idempotent via ON CONFLICT — re-runnable.
--
-- Voraussetzung: L.1+L.4 V1+V1.1+V2 applied (Workflow-System bereit).

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. Templates seeden
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.email_templates (
  template_key, name, description, category, mjml_source, subject, preheader, variable_schema, status, locale
) VALUES (
  'subscription_started',
  'Subscription Started',
  'Bestätigungs-Mail nach erfolgreichem Stripe-Plan-Kauf (zusätzlich zur Stripe-Receipt).',
  'transactional',
  $MJML$
<mjml>
  <mj-head>
    <mj-title>Plan aktiviert</mj-title>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" />
      <mj-text color="#0F172A" font-size="15px" line-height="1.5" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F8FAFC">
    <mj-section padding="32px 0 16px 0">
      <mj-column>
        <mj-image src="{{brand_logo_url}}" width="60px" align="left" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" border-radius="16px" padding="32px">
      <mj-column>
        <mj-text font-size="22px" font-weight="800" color="#0F172A" padding="0 0 12px 0">
          Plan aktiviert ✓
        </mj-text>
        <mj-text padding="0 0 16px 0">
          {{user.first_name}}, dein <strong>{{plan.name}}</strong>-Plan ist ab sofort aktiv. Abgerechnet wird {{plan.period_label}} mit {{price_eur_pretty}}.
        </mj-text>
        <mj-text padding="0 0 24px 0">
          Die offizielle Quittung erhältst du gleich separat von Stripe an deine hinterlegte Email-Adresse.
        </mj-text>
        <mj-button background-color="{{brand_primary_color}}" color="#FFFFFF" border-radius="10px" font-weight="700" href="{{app_url}}/settings/konto" padding="0">
          Account-Übersicht öffnen
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
  $MJML$,
  '{{plan.name}} ist aktiv — willkommen an Bord',
  'Deine Quittung folgt separat von Stripe.',
  '{"user":{"first_name":"string"},"plan":{"name":"string","period_label":"monatlich|jährlich"},"price_eur_pretty":"string"}'::jsonb,
  'published',
  'de'
)
ON CONFLICT (template_key, locale) DO UPDATE SET
  mjml_source = EXCLUDED.mjml_source,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  variable_schema = EXCLUDED.variable_schema,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.email_templates (
  template_key, name, description, category, mjml_source, subject, preheader, variable_schema, status, locale
) VALUES (
  'subscription_cancelled',
  'Subscription Cancelled',
  'Bestätigung der Kündigung. Plan bleibt bis period_end aktiv.',
  'transactional',
  $MJML$
<mjml>
  <mj-head>
    <mj-title>Plan gekündigt</mj-title>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" />
      <mj-text color="#0F172A" font-size="15px" line-height="1.5" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F8FAFC">
    <mj-section padding="32px 0 16px 0">
      <mj-column>
        <mj-image src="{{brand_logo_url}}" width="60px" align="left" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" border-radius="16px" padding="32px">
      <mj-column>
        <mj-text font-size="22px" font-weight="800" color="#0F172A" padding="0 0 12px 0">
          Kündigung bestätigt
        </mj-text>
        <mj-text padding="0 0 16px 0">
          {{user.first_name}}, dein <strong>{{plan.name}}</strong>-Plan ist gekündigt. Bis zum <strong>{{period_end_pretty}}</strong> kannst du alle Funktionen weiterhin im vollen Umfang nutzen.
        </mj-text>
        <mj-text padding="0 0 24px 0">
          Nach diesem Datum wird dein Account auf den kostenfreien Lese-Modus zurückgesetzt — deine Daten bleiben erhalten.
        </mj-text>
        <mj-text padding="0 0 16px 0" font-size="13px" color="#475569">
          Was hätte besser laufen können? Wir lesen jede Antwort auf diese Mail und nutzen dein Feedback, um Leadesk besser zu machen.
        </mj-text>
        <mj-button background-color="{{brand_primary_color}}" color="#FFFFFF" border-radius="10px" font-weight="700" href="{{app_url}}/settings/konto" padding="0">
          Doch fortsetzen?
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
  $MJML$,
  'Plan gekündigt — bis {{period_end_pretty}} weiter verfügbar',
  'Wir bedauern deinen Abschied. Bis zum Period-Ende bleibt alles wie gewohnt.',
  '{"user":{"first_name":"string"},"plan":{"name":"string"},"period_end_pretty":"string"}'::jsonb,
  'published',
  'de'
)
ON CONFLICT (template_key, locale) DO UPDATE SET
  mjml_source = EXCLUDED.mjml_source,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  variable_schema = EXCLUDED.variable_schema,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.email_templates (
  template_key, name, description, category, mjml_source, subject, preheader, variable_schema, status, locale
) VALUES (
  'invoice_payment_failed',
  'Invoice Payment Failed',
  'Kritische Mail bei fehlgeschlagener Zahlung. User muss handeln (Karten-Update).',
  'billing',
  $MJML$
<mjml>
  <mj-head>
    <mj-title>Zahlung fehlgeschlagen</mj-title>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" />
      <mj-text color="#0F172A" font-size="15px" line-height="1.5" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#FFFBEB">
    <mj-section padding="32px 0 16px 0">
      <mj-column>
        <mj-image src="{{brand_logo_url}}" width="60px" align="left" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" border-radius="16px" padding="32px" border="1px solid #FDE68A">
      <mj-column>
        <mj-text font-size="22px" font-weight="800" color="#92400E" padding="0 0 12px 0">
          ⚠️ Zahlung konnte nicht eingezogen werden
        </mj-text>
        <mj-text padding="0 0 16px 0">
          {{user.first_name}}, wir konnten {{amount_eur_pretty}} für deinen <strong>{{plan.name}}</strong>-Plan nicht von deiner hinterlegten Zahlungsmethode einziehen.
        </mj-text>
        <mj-text padding="0 0 16px 0">
          <strong>Nächster automatischer Versuch:</strong> {{next_retry_pretty}}<br />
          Solange die Zahlung offen ist, kann es zu Funktions-Einschränkungen kommen.
        </mj-text>
        <mj-button background-color="#DC2626" color="#FFFFFF" border-radius="10px" font-weight="700" href="{{app_url}}/settings/konto" padding="0">
          Zahlungsmethode aktualisieren
        </mj-button>
        <mj-text padding="20px 0 0 0" font-size="13px" color="#475569">
          Häufige Ursachen: abgelaufene Karte, Limit erreicht, oder 3D-Secure-Authentifizierung erforderlich. Falls du Hilfe brauchst, antworte einfach auf diese Mail.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
  $MJML$,
  '⚠️ Zahlung fehlgeschlagen — bitte Zahlungsmethode prüfen',
  'Wir konnten deinen {{plan.name}}-Plan nicht abrechnen.',
  '{"user":{"first_name":"string"},"plan":{"name":"string"},"amount_eur_pretty":"string","next_retry_pretty":"string"}'::jsonb,
  'published',
  'de'
)
ON CONFLICT (template_key, locale) DO UPDATE SET
  mjml_source = EXCLUDED.mjml_source,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  variable_schema = EXCLUDED.variable_schema,
  status = EXCLUDED.status,
  updated_at = now();

-- ════════════════════════════════════════════════════════════════
-- 2. 3 Workflows + Steps + Triggers seeden
-- ════════════════════════════════════════════════════════════════

-- Workflow A: Subscription Started
INSERT INTO public.email_workflows (id, name, description, status, is_active, account_id)
VALUES (
  '00000000-0000-0000-0000-000000000020'::uuid,
  'Default Stripe Subscription Started (System)',
  'L.6: Triggert auf stripe.subscription.started → sendet subscription_started.',
  'published', true, NULL
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO public.email_workflow_steps (id, workflow_id, step_index, step_type, template_key)
VALUES (
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000020'::uuid,
  1, 'email', 'subscription_started'
)
ON CONFLICT (workflow_id, step_index) DO UPDATE SET step_type = EXCLUDED.step_type, template_key = EXCLUDED.template_key;

INSERT INTO public.email_workflow_triggers (id, workflow_id, trigger_type, event_name, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000022'::uuid,
  '00000000-0000-0000-0000-000000000020'::uuid,
  'event', 'stripe.subscription.started', true
)
ON CONFLICT (id) DO UPDATE SET trigger_type = EXCLUDED.trigger_type, event_name = EXCLUDED.event_name, is_active = EXCLUDED.is_active;

-- Workflow B: Subscription Cancelled
INSERT INTO public.email_workflows (id, name, description, status, is_active, account_id)
VALUES (
  '00000000-0000-0000-0000-000000000030'::uuid,
  'Default Stripe Subscription Cancelled (System)',
  'L.6: Triggert auf stripe.subscription.cancelled → sendet subscription_cancelled.',
  'published', true, NULL
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO public.email_workflow_steps (id, workflow_id, step_index, step_type, template_key)
VALUES (
  '00000000-0000-0000-0000-000000000031'::uuid,
  '00000000-0000-0000-0000-000000000030'::uuid,
  1, 'email', 'subscription_cancelled'
)
ON CONFLICT (workflow_id, step_index) DO UPDATE SET step_type = EXCLUDED.step_type, template_key = EXCLUDED.template_key;

INSERT INTO public.email_workflow_triggers (id, workflow_id, trigger_type, event_name, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000032'::uuid,
  '00000000-0000-0000-0000-000000000030'::uuid,
  'event', 'stripe.subscription.cancelled', true
)
ON CONFLICT (id) DO UPDATE SET trigger_type = EXCLUDED.trigger_type, event_name = EXCLUDED.event_name, is_active = EXCLUDED.is_active;

-- Workflow C: Invoice Payment Failed
INSERT INTO public.email_workflows (id, name, description, status, is_active, account_id)
VALUES (
  '00000000-0000-0000-0000-000000000040'::uuid,
  'Default Stripe Invoice Payment Failed (System)',
  'L.6: Triggert auf stripe.invoice.payment_failed → sendet invoice_payment_failed.',
  'published', true, NULL
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO public.email_workflow_steps (id, workflow_id, step_index, step_type, template_key)
VALUES (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000040'::uuid,
  1, 'email', 'invoice_payment_failed'
)
ON CONFLICT (workflow_id, step_index) DO UPDATE SET step_type = EXCLUDED.step_type, template_key = EXCLUDED.template_key;

INSERT INTO public.email_workflow_triggers (id, workflow_id, trigger_type, event_name, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000040'::uuid,
  'event', 'stripe.invoice.payment_failed', true
)
ON CONFLICT (id) DO UPDATE SET trigger_type = EXCLUDED.trigger_type, event_name = EXCLUDED.event_name, is_active = EXCLUDED.is_active;

-- ════════════════════════════════════════════════════════════════
-- 3. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_templates integer;
  v_workflows integer;
  v_triggers integer;
BEGIN
  SELECT count(*) INTO v_templates FROM public.email_templates
   WHERE template_key IN ('subscription_started','subscription_cancelled','invoice_payment_failed')
     AND locale = 'de' AND status = 'published';
  SELECT count(*) INTO v_workflows FROM public.email_workflows
   WHERE id IN ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000040')
     AND status = 'published' AND is_active = true;
  SELECT count(*) INTO v_triggers FROM public.email_workflow_triggers
   WHERE event_name IN ('stripe.subscription.started','stripe.subscription.cancelled','stripe.invoice.payment_failed')
     AND trigger_type = 'event' AND is_active = true;

  IF v_templates != 3 OR v_workflows != 3 OR v_triggers != 3 THEN
    RAISE EXCEPTION 'L.6 verification failed: templates=%, workflows=%, triggers=%', v_templates, v_workflows, v_triggers;
  END IF;

  RAISE NOTICE 'Sprint L.6 Migration verification PASSED (3 templates + 3 workflows + 3 triggers)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
