-- File: 20260603100000_l7_schedule_triggers_pg_cron.sql
-- Sprint L.7 V1 — Schedule-Triggers via pg_cron
--
-- Schließt zeitbasierte Email-Triggers an das Workflow-System an. Daily-6-Uhr
-- (Europe/Berlin) Tick scannt alle aktiven schedule-Trigger, matched per anchor
-- + offset_days gegen accounts.trial_ends_at, und enqueue't matching Workflows.
--
-- 4 Layer atomic:
--   1. 2 Templates seeden (trial_reminder_day_before + trial_expired)
--   2. 2 Workflows + Steps + Schedule-Triggers (anchor=trial_ends_at, offset=-1 / 0)
--   3. RPC process_scheduled_email_workflows() — TZ-pinned, idempotent
--   4. Idempotenz-Index auf email_workflow_runs (für dedupe via NOT EXISTS)
--   5. pg_cron-Job '0 6 * * *' → process_scheduled_email_workflows()
--
-- V1-Scope: nur anchor=trial_ends_at. subscription.current_period_end + user.created_at
-- kommen in V2 (Schema-Drift-Check der subscriptions-Tabelle nötig).
--
-- Voraussetzung: pg_cron 1.6 + pg_net 0.14 + cron.database_name='postgres' (verified).

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. Templates seeden
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.email_templates (
  template_key, name, description, category, mjml_source, subject, preheader, variable_schema, status, locale
) VALUES (
  'trial_reminder_day_before',
  'Trial Reminder Day Before',
  'L.7: Tag X-1 vor trial_ends_at — Reminder + Plan-CTA.',
  'lifecycle',
  $MJML$
<mjml>
  <mj-head>
    <mj-title>Trial endet morgen</mj-title>
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
          {{user.first_name}}, dein Trial endet morgen ⏳
        </mj-text>
        <mj-text padding="0 0 16px 0">
          Dein Leadesk-Trial läuft am <strong>{{trial_ends_at_pretty}}</strong> aus. Damit dein Workflow nahtlos weiterläuft, wähle jetzt deinen Plan.
        </mj-text>
        <mj-button background-color="{{brand_primary_color}}" color="#FFFFFF" border-radius="10px" font-weight="700" href="{{app_url}}/settings/konto" padding="0">
          Plan wählen
        </mj-button>
        <mj-text padding="20px 0 0 0" font-size="13px" color="#475569">
          Nach Ablauf des Trials wird dein Account auf den kostenfreien Lese-Modus gesetzt — deine Daten bleiben erhalten, aber neue KI-Generierungen sind dann pausiert.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
  $MJML$,
  'Morgen läuft dein Leadesk-Trial ab',
  'Sichere dir jetzt deinen Plan, damit nichts unterbrochen wird.',
  '{"user":{"first_name":"string"},"trial_ends_at_pretty":"string"}'::jsonb,
  'published', 'de'
)
ON CONFLICT (template_key, locale) DO UPDATE SET
  mjml_source = EXCLUDED.mjml_source, subject = EXCLUDED.subject, preheader = EXCLUDED.preheader,
  variable_schema = EXCLUDED.variable_schema, status = EXCLUDED.status, updated_at = now();

INSERT INTO public.email_templates (
  template_key, name, description, category, mjml_source, subject, preheader, variable_schema, status, locale
) VALUES (
  'trial_expired',
  'Trial Expired',
  'L.7: Tag 0 (trial_ends_at = heute) — Trial vorbei, Conversion-Push.',
  'lifecycle',
  $MJML$
<mjml>
  <mj-head>
    <mj-title>Trial abgelaufen</mj-title>
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
          {{user.first_name}}, dein Trial ist ausgelaufen
        </mj-text>
        <mj-text padding="0 0 16px 0">
          Schade, dass du in der Trial-Phase nicht zu einem bezahlten Plan gewechselt bist. Alle deine Daten bleiben sicher gespeichert — du musst nur einen Plan wählen, um weiterzuarbeiten.
        </mj-text>
        <mj-button background-color="{{brand_primary_color}}" color="#FFFFFF" border-radius="10px" font-weight="700" href="{{app_url}}/settings/konto" padding="0">
          Jetzt Plan wählen
        </mj-button>
        <mj-text padding="20px 0 0 0" font-size="13px" color="#475569">
          Wenn du Feedback hast, was wir besser machen können — antworte einfach auf diese Mail. Wir lesen jede Antwort.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
  $MJML$,
  'Dein Leadesk-Trial ist ausgelaufen',
  'Wähle jetzt einen Plan, um weiterzumachen.',
  '{"user":{"first_name":"string"}}'::jsonb,
  'published', 'de'
)
ON CONFLICT (template_key, locale) DO UPDATE SET
  mjml_source = EXCLUDED.mjml_source, subject = EXCLUDED.subject, preheader = EXCLUDED.preheader,
  variable_schema = EXCLUDED.variable_schema, status = EXCLUDED.status, updated_at = now();

-- ════════════════════════════════════════════════════════════════
-- 2. Workflows + Steps + Schedule-Triggers
-- ════════════════════════════════════════════════════════════════

-- Workflow A: Trial-Reminder Day-Before
INSERT INTO public.email_workflows (id, name, description, status, is_active, account_id)
VALUES (
  '00000000-0000-0000-0000-000000000050'::uuid,
  'Default Trial Reminder Day Before (System)',
  'L.7: Schedule-Trigger anchor=trial_ends_at, offset=-1. Tgl. 6 Uhr Berlin-TZ Tick.',
  'published', true, NULL
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO public.email_workflow_steps (id, workflow_id, step_index, step_type, template_key)
VALUES (
  '00000000-0000-0000-0000-000000000051'::uuid,
  '00000000-0000-0000-0000-000000000050'::uuid,
  1, 'email', 'trial_reminder_day_before'
)
ON CONFLICT (workflow_id, step_index) DO UPDATE SET step_type = EXCLUDED.step_type, template_key = EXCLUDED.template_key;

INSERT INTO public.email_workflow_triggers (id, workflow_id, trigger_type, schedule_anchor, schedule_offset_days, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000052'::uuid,
  '00000000-0000-0000-0000-000000000050'::uuid,
  'schedule', 'trial_ends_at', -1, true
)
ON CONFLICT (id) DO UPDATE SET trigger_type = EXCLUDED.trigger_type, schedule_anchor = EXCLUDED.schedule_anchor, schedule_offset_days = EXCLUDED.schedule_offset_days, is_active = EXCLUDED.is_active;

-- Workflow B: Trial-Expired
INSERT INTO public.email_workflows (id, name, description, status, is_active, account_id)
VALUES (
  '00000000-0000-0000-0000-000000000060'::uuid,
  'Default Trial Expired (System)',
  'L.7: Schedule-Trigger anchor=trial_ends_at, offset=0. Tgl. 6 Uhr Berlin-TZ Tick.',
  'published', true, NULL
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO public.email_workflow_steps (id, workflow_id, step_index, step_type, template_key)
VALUES (
  '00000000-0000-0000-0000-000000000061'::uuid,
  '00000000-0000-0000-0000-000000000060'::uuid,
  1, 'email', 'trial_expired'
)
ON CONFLICT (workflow_id, step_index) DO UPDATE SET step_type = EXCLUDED.step_type, template_key = EXCLUDED.template_key;

INSERT INTO public.email_workflow_triggers (id, workflow_id, trigger_type, schedule_anchor, schedule_offset_days, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000062'::uuid,
  '00000000-0000-0000-0000-000000000060'::uuid,
  'schedule', 'trial_ends_at', 0, true
)
ON CONFLICT (id) DO UPDATE SET trigger_type = EXCLUDED.trigger_type, schedule_anchor = EXCLUDED.schedule_anchor, schedule_offset_days = EXCLUDED.schedule_offset_days, is_active = EXCLUDED.is_active;

-- ════════════════════════════════════════════════════════════════
-- 3. Idempotenz-Index für Dedupe-Check
-- ════════════════════════════════════════════════════════════════
-- Performance-Index für NOT EXISTS-Check pro (workflow, user, day)
CREATE INDEX IF NOT EXISTS idx_email_workflow_runs_dedupe
  ON public.email_workflow_runs (workflow_id, user_id, ((started_at AT TIME ZONE 'Europe/Berlin')::date));

-- ════════════════════════════════════════════════════════════════
-- 4. RPC process_scheduled_email_workflows
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.process_scheduled_email_workflows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trigger record;
  v_account record;
  v_target_date date;
  v_today_berlin date;
  v_total_enqueued integer := 0;
  v_per_workflow_enqueued integer;
  v_run_id uuid;
  v_svc_key text;
  v_first_name text;
  v_trial_ends_pretty text;
  v_trial_days_remaining integer;
  v_workflow_breakdown jsonb := '{}'::jsonb;
BEGIN
  -- Berlin-TZ pinning für reproduzierbare Datum-Vergleiche
  v_today_berlin := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_svc_key := current_setting('app.service_role_key', true);

  -- Loop über alle aktiven schedule-Triggers
  FOR v_trigger IN
    SELECT t.workflow_id, t.schedule_anchor, t.schedule_offset_days
      FROM public.email_workflow_triggers t
      JOIN public.email_workflows w ON w.id = t.workflow_id
     WHERE t.trigger_type = 'schedule'
       AND t.is_active = true
       AND t.schedule_anchor IS NOT NULL
       AND w.status = 'published'
       AND w.is_active = true
  LOOP
    -- target_date = today - offset_days
    -- offset=-1 (1 Tag vor anchor) → target = today + 1 (anchor sollte morgen sein)
    -- offset=0  (am anchor-Tag)    → target = today
    v_target_date := v_today_berlin - (v_trigger.schedule_offset_days || ' days')::interval;
    v_per_workflow_enqueued := 0;

    -- V1: nur anchor=trial_ends_at
    IF v_trigger.schedule_anchor = 'trial_ends_at' THEN
      FOR v_account IN
        SELECT a.id, a.owner_user_id, a.billing_email, a.trial_ends_at,
               p.full_name, p.email AS profile_email,
               pl.trial_days
          FROM public.accounts a
          LEFT JOIN public.profiles p ON p.id = a.owner_user_id
          LEFT JOIN public.plans pl ON pl.id = a.plan_id
         WHERE a.trial_ends_at IS NOT NULL
           AND (a.trial_ends_at AT TIME ZONE 'Europe/Berlin')::date = v_target_date
           AND a.billing_email IS NOT NULL
      LOOP
        -- Idempotenz-Check: nicht schon heute für (workflow, user) gesendet?
        IF EXISTS (
          SELECT 1 FROM public.email_workflow_runs r
          WHERE r.workflow_id = v_trigger.workflow_id
            AND r.user_id = v_account.owner_user_id
            AND (r.started_at AT TIME ZONE 'Europe/Berlin')::date = v_today_berlin
        ) THEN
          CONTINUE;  -- Dedupe: skip
        END IF;

        -- Variables resolven
        v_first_name := COALESCE(
          split_part(NULLIF(v_account.full_name, ''), ' ', 1),
          split_part(NULLIF(v_account.profile_email, ''), '@', 1),
          split_part(v_account.billing_email, '@', 1),
          'Hallo'
        );
        v_trial_ends_pretty := to_char(v_account.trial_ends_at AT TIME ZONE 'Europe/Berlin', 'TMDD. TMMonth YYYY');
        v_trial_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_account.trial_ends_at AT TIME ZONE 'Europe/Berlin')::date - v_today_berlin)::integer);

        -- enqueue
        BEGIN
          v_run_id := public.enqueue_email_workflow(
            v_trigger.workflow_id,
            v_account.owner_user_id,
            v_account.billing_email,
            v_account.id,
            jsonb_build_object(
              'user', jsonb_build_object('first_name', v_first_name),
              'trial_ends_at_pretty', v_trial_ends_pretty,
              'trial_days_remaining', v_trial_days_remaining
            )
          );

          v_per_workflow_enqueued := v_per_workflow_enqueued + 1;
          v_total_enqueued := v_total_enqueued + 1;

          -- Runner-EF fire-and-forget
          IF v_svc_key IS NOT NULL AND length(v_svc_key) > 50 THEN
            PERFORM net.http_post(
              url := 'http://kong:8000/functions/v1/email-workflow-runner',
              headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_svc_key),
              body := jsonb_build_object('run_id', v_run_id)::jsonb
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'process_scheduled: enqueue for account % workflow % failed: %', v_account.id, v_trigger.workflow_id, SQLERRM;
        END;
      END LOOP;
    END IF;

    -- TODO L.7 V2: subscription.current_period_end + user.created_at-Anchors

    v_workflow_breakdown := v_workflow_breakdown || jsonb_build_object(v_trigger.workflow_id::text, v_per_workflow_enqueued);
  END LOOP;

  RETURN jsonb_build_object(
    'total_enqueued', v_total_enqueued,
    'today_berlin', v_today_berlin,
    'per_workflow', v_workflow_breakdown
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_scheduled_email_workflows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_scheduled_email_workflows() TO service_role;

COMMENT ON FUNCTION public.process_scheduled_email_workflows() IS
  'Sprint L.7 V1: täglicher Tick für schedule-Triggers. Berlin-TZ-pinned. Match: (anchor AT TIME ZONE Europe/Berlin)::date = today_berlin - offset_days. Dedupe via NOT EXISTS-Check auf (workflow, user, today). V1: nur anchor=trial_ends_at. Returns {total_enqueued, today_berlin, per_workflow}.';

-- ════════════════════════════════════════════════════════════════
-- 5. pg_cron-Job registrieren
-- ════════════════════════════════════════════════════════════════
-- Cron '0 6 * * *' = täglich 06:00 UTC (pg_cron läuft in Server-TZ = UTC).
-- Berlin-Zeit ist 07:00 (CET) / 08:00 (CEST). Trial-Reminder kommt also
-- morgens um 7-8 Uhr lokaler Zeit — Inbox-prime-Time.
-- Wenn 06:00 Berlin gewünscht: '0 5 * * *' (CET) / '0 4 * * *' (CEST) — Sommer-/Winterzeit-Wechsel beachten.
-- V1 wählt 06:00 UTC = 07:00/08:00 Berlin als Kompromiss.

-- Idempotent: erst entschedulen, dann neu schedulen
DO $$
BEGIN
  -- Job mit gleichem Namen entschedulen (falls schon vorhanden)
  PERFORM cron.unschedule('process-scheduled-email-workflows')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-email-workflows');
EXCEPTION WHEN OTHERS THEN
  -- cron.unschedule wirft wenn job nicht existiert — silent ok
  NULL;
END $$;

SELECT cron.schedule(
  'process-scheduled-email-workflows',
  '0 6 * * *',
  $$SELECT public.process_scheduled_email_workflows();$$
);

-- ════════════════════════════════════════════════════════════════
-- 6. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_templates integer;
  v_workflows integer;
  v_triggers integer;
  v_rpc_exists boolean;
  v_cron_job_count integer;
BEGIN
  SELECT count(*) INTO v_templates FROM public.email_templates
   WHERE template_key IN ('trial_reminder_day_before','trial_expired')
     AND locale = 'de' AND status = 'published';
  SELECT count(*) INTO v_workflows FROM public.email_workflows
   WHERE id IN ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000060')
     AND status = 'published' AND is_active = true;
  SELECT count(*) INTO v_triggers FROM public.email_workflow_triggers
   WHERE trigger_type = 'schedule' AND schedule_anchor = 'trial_ends_at'
     AND is_active = true;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_scheduled_email_workflows')
    INTO v_rpc_exists;
  SELECT count(*) INTO v_cron_job_count FROM cron.job
   WHERE jobname = 'process-scheduled-email-workflows';

  IF v_templates != 2 OR v_workflows != 2 OR v_triggers != 2 OR NOT v_rpc_exists OR v_cron_job_count != 1 THEN
    RAISE EXCEPTION 'L.7 verification failed: templates=%, workflows=%, triggers=%, rpc=%, cron=%',
      v_templates, v_workflows, v_triggers, v_rpc_exists, v_cron_job_count;
  END IF;

  RAISE NOTICE 'Sprint L.7 V1 Migration verification PASSED (2 templates + 2 workflows + 2 schedule-triggers + RPC + cron job)';
END $$;

COMMIT;
