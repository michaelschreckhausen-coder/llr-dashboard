-- File: 20260603110000_l7_v1_1_process_scheduled_date_arithmetic_fix.sql
-- Sprint L.7 V1.1 — Date-Arithmetic-Fix für process_scheduled_email_workflows
--
-- Bug: v_trial_days_remaining := GREATEST(0, EXTRACT(DAY FROM (..)::date - v_today_berlin)::integer)
-- → date - date ergibt in Postgres bereits integer (Anzahl Tage), nicht interval.
-- EXTRACT(DAY FROM <integer>) existiert nicht → Funktion crash't mit
-- "function pg_catalog.extract(unknown, integer) does not exist".
-- Crash passiert vor dem inneren EXCEPTION-Block → ganzer RPC bricht ab.
--
-- Fix: EXTRACT-Hülle + ::integer-Cast weg. date - date ist schon der Tage-Integer.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

BEGIN;

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
  v_today_berlin := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_svc_key := current_setting('app.service_role_key', true);

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
    v_target_date := v_today_berlin - (v_trigger.schedule_offset_days || ' days')::interval;
    v_per_workflow_enqueued := 0;

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
        IF EXISTS (
          SELECT 1 FROM public.email_workflow_runs r
          WHERE r.workflow_id = v_trigger.workflow_id
            AND r.user_id = v_account.owner_user_id
            AND (r.started_at AT TIME ZONE 'Europe/Berlin')::date = v_today_berlin
        ) THEN
          CONTINUE;
        END IF;

        v_first_name := COALESCE(
          split_part(NULLIF(v_account.full_name, ''), ' ', 1),
          split_part(NULLIF(v_account.profile_email, ''), '@', 1),
          split_part(v_account.billing_email, '@', 1),
          'Hallo'
        );
        v_trial_ends_pretty := to_char(v_account.trial_ends_at AT TIME ZONE 'Europe/Berlin', 'TMDD. TMMonth YYYY');

        -- FIX V1.1: date - date ergibt integer (Anzahl Tage), kein interval.
        -- Vorher hatte hier eine EXTRACT-Hülle gestanden, die einen integer
        -- als Argument bekam → undefined function. Siehe Migration-Header.
        v_trial_days_remaining := GREATEST(0,
          (v_account.trial_ends_at AT TIME ZONE 'Europe/Berlin')::date - v_today_berlin
        );

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

    v_workflow_breakdown := v_workflow_breakdown || jsonb_build_object(v_trigger.workflow_id::text, v_per_workflow_enqueued);
  END LOOP;

  RETURN jsonb_build_object(
    'total_enqueued', v_total_enqueued,
    'today_berlin', v_today_berlin,
    'per_workflow', v_workflow_breakdown
  );
END;
$function$;

COMMENT ON FUNCTION public.process_scheduled_email_workflows() IS
  'Sprint L.7 V1.1 (2026-06-03): Date-arithmetic-fix — date - date ergibt integer, kein interval. EXTRACT-Hülle entfernt.';

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'process_scheduled_email_workflows' AND pronamespace = 'public'::regnamespace;
  IF v_def ~ 'EXTRACT\(DAY FROM' THEN
    RAISE EXCEPTION 'process_scheduled_email_workflows still contains buggy EXTRACT-Hülle';
  END IF;
  RAISE NOTICE 'Sprint L.7 V1.1 Date-Arithmetic-Fix verification PASSED';
END $$;

COMMIT;
