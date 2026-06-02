-- File: 20260602100000_l4_event_dispatcher_and_handle_new_user_hook.sql
-- Sprint L.4 V1 — Event-Dispatcher + handle_new_user-Hook-Erweiterung
--
-- 2 Changes:
--   1. RPC public.dispatch_email_event(event_name, user_id, account_id, recipient_email, variables)
--      → looks up active workflows mit matching event-trigger
--      → enqueue_email_workflow für jedes match
--      → fire-and-forget pg_net.http_post zum workflow-runner-EF
--   2. handle_new_user-Trigger um Phase 8 erweitern (additionalen dispatch_email_event-Call
--      für event 'user.created' NACH Welcome-Email-Hook). Additiv — Phase 7 (Direct
--      welcome) bleibt für Backwards-Compat aktiv. Wenn ein Workflow auf user.created
--      matched, feuert er ZUSÄTZLICH (Drift möglich — Cleanup in L.4 V2).
--
-- Conditions im Workflow-Trigger werden in L.5 evaluiert. L.4 V1: alle matching
-- aktiven Workflows feuern.
--
-- Voraussetzung: pg_net + GUC app.service_role_key (siehe Mig 20260601220000).

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. dispatch_email_event-RPC
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dispatch_email_event(
  p_event_name      text,
  p_user_id         uuid DEFAULT NULL,
  p_account_id      uuid DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_variables       jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trigger record;
  v_run_id uuid;
  v_count integer := 0;
  v_svc_key text;
  v_recipient text;
BEGIN
  IF p_event_name IS NULL OR length(p_event_name) < 3 THEN
    RAISE EXCEPTION 'event_name required';
  END IF;

  v_svc_key := current_setting('app.service_role_key', true);

  -- Recipient resolven (explicit > user-email-lookup)
  IF p_recipient_email IS NOT NULL THEN
    v_recipient := lower(trim(p_recipient_email));
  ELSIF p_user_id IS NOT NULL THEN
    SELECT email INTO v_recipient FROM auth.users WHERE id = p_user_id;
  END IF;

  -- Loop über matching workflows
  FOR v_trigger IN
    SELECT t.id AS trigger_id, t.workflow_id, t.conditions_jsonb
      FROM public.email_workflow_triggers t
      JOIN public.email_workflows w ON w.id = t.workflow_id
     WHERE t.trigger_type = 'event'
       AND t.event_name = p_event_name
       AND t.is_active = true
       AND w.status = 'published'
       AND w.is_active = true
  LOOP
    -- L.5-Scope: conditions_jsonb evaluation. L.4 V1: alle matches feuern.

    BEGIN
      v_run_id := public.enqueue_email_workflow(
        v_trigger.workflow_id,
        p_user_id,
        v_recipient,
        p_account_id,
        p_variables
      );

      v_count := v_count + 1;

      -- Fire workflow-runner-EF (fire-and-forget pg_net.http_post)
      IF v_svc_key IS NOT NULL AND length(v_svc_key) > 50 THEN
        PERFORM net.http_post(
          url := 'http://kong:8000/functions/v1/email-workflow-runner',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_svc_key
          ),
          body := jsonb_build_object('run_id', v_run_id)::jsonb
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_email_event: workflow % failed: %', v_trigger.workflow_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_email_event(text, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_email_event(text, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_email_event(text, uuid, uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.dispatch_email_event(text, uuid, uuid, text, jsonb) IS
  'Sprint L.4 V1: Findet alle aktiven Workflows mit matching event-trigger + enqueue + fire-and-forget runner-EF. Returns count gefeuerter workflows. SECURITY DEFINER für Trigger-Aufrufe.';

-- ════════════════════════════════════════════════════════════════
-- 2. handle_new_user-Trigger um Phase 8 erweitern
-- ════════════════════════════════════════════════════════════════
-- Phase 7 (Direct welcome-email-Hook) bleibt für Backwards-Compat aktiv.
-- Phase 8 ist ADDITIV — feuert Event 'user.created' an Workflow-System.
-- Wenn KEIN Workflow für user.created definiert ist: Phase 8 is no-op,
-- nur Phase 7 schickt Welcome-Email.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_account_status text;
  v_trial_plan_id uuid;
  v_trial_days integer;
  v_invites_exists boolean;
  v_account_name text;
  v_account_id uuid;
  v_team_id uuid;
  v_service_role_key text;
  v_first_name text;
  v_trial_ends_pretty text;
BEGIN
  -- Phasen 1-6 unverändert aus Mig 20260601220000
  SELECT id, COALESCE(trial_days, 14)
    INTO v_trial_plan_id, v_trial_days
  FROM public.plans
  WHERE is_default_trial = true AND is_active = true
  LIMIT 1;

  IF v_trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'No default-trial plan found';
  END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='invites')
    INTO v_invites_exists;

  IF v_invites_exists THEN
    v_account_status := CASE
      WHEN NEW.raw_app_meta_data->>'provider' = 'email'
           AND NOT EXISTS (SELECT 1 FROM public.invites WHERE email = NEW.email AND status = 'accepted')
      THEN 'pending'
      ELSE 'active'
    END;
  ELSE
    v_account_status := 'pending';
  END IF;

  v_account_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    split_part(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), ' ', 1),
    split_part(NULLIF(NEW.raw_user_meta_data->>'name', ''), ' ', 1),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_url, company, account_status, trial_ends_at, subscription_status, plan_id)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    v_account_status,
    now() + (v_trial_days || ' days')::interval,
    'trialing',
    v_trial_plan_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE owner_user_id = NEW.id) THEN
      v_account_id := gen_random_uuid();
      v_team_id := gen_random_uuid();
      INSERT INTO public.accounts (id, owner_user_id, name, billing_email, plan_id, status, trial_ends_at, plan_managed_by, seat_limit, granted_via)
      VALUES (v_account_id, NEW.id, v_account_name, NEW.email, v_trial_plan_id, 'trialing',
              now() + (v_trial_days || ' days')::interval, 'leadesk', 1, 'trial');
      INSERT INTO public.teams (id, account_id, name, slug, owner_id, plan_id, is_active)
      VALUES (v_team_id, v_account_id, 'Mein Team', 'team-' || REPLACE(v_team_id::text, '-', ''), NEW.id, v_trial_plan_id, true);
      INSERT INTO public.team_members (team_id, user_id, role, joined_at)
      VALUES (v_team_id, NEW.id, 'owner', now());
    ELSE
      -- account existiert schon → account_id für Phase 8 ermitteln
      SELECT id INTO v_account_id FROM public.accounts WHERE owner_user_id = NEW.id LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Multi-Tenant-Auto-Anlage für % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  BEGIN
    PERFORM public.sync_user_to_leadesk_crm(NEW.id, 'Trials aktiv');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CRM-Sync für % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. Welcome-Email-Hook (K.2 — bleibt für Backwards-Compat, fire-and-forget)
  -- ──────────────────────────────────────────────────────────────────────────
  v_trial_ends_pretty := to_char(now() + (v_trial_days || ' days')::interval, 'TMDD. TMMonth YYYY');

  BEGIN
    v_service_role_key := current_setting('app.service_role_key', true);
    IF v_service_role_key IS NOT NULL AND length(v_service_role_key) > 50
       AND EXISTS (SELECT 1 FROM public.email_templates WHERE template_key = 'welcome_trial_start' AND locale = 'de' AND status = 'published')
    THEN
      PERFORM net.http_post(
        url := 'http://kong:8000/functions/v1/send-templated-email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_role_key),
        body := jsonb_build_object(
          'template_key', 'welcome_trial_start',
          'recipient_email', NEW.email,
          'user_id', NEW.id::text,
          'variables', jsonb_build_object(
            'user', jsonb_build_object('first_name', v_first_name),
            'trial_days_remaining', v_trial_days,
            'trial_ends_at_pretty', v_trial_ends_pretty
          ),
          'tag', 'welcome-trial-start'
        )::jsonb
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Welcome-Email-Hook für % fehlgeschlagen (non-blocking): %', NEW.email, SQLERRM;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 8. Event-Dispatcher (L.4 V1) — fires 'user.created' event to workflows
  -- ──────────────────────────────────────────────────────────────────────────
  -- Additiv zu Phase 7: ruft Workflow-System auf. Wenn KEIN Workflow auf
  -- user.created reagiert, ist das ein no-op. Wenn EINER reagiert, feuert er
  -- ZUSÄTZLICH zur Phase-7-Direct-Mail (Drift — Cleanup in L.4 V2 entweder
  -- Phase 7 entfernen oder dort eine "skip-if-workflow-handles-it"-Logik).
  BEGIN
    PERFORM public.dispatch_email_event(
      'user.created',
      NEW.id,
      v_account_id,
      NEW.email,
      jsonb_build_object(
        'user', jsonb_build_object('first_name', v_first_name),
        'trial_days_remaining', v_trial_days,
        'trial_ends_at_pretty', v_trial_ends_pretty
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_email_event(user.created) für % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Sign-Up-Trigger (Sprint L.4 V1, 2026-06-02): 8 Phasen — Trial-Lookup → account_status → Name → profiles → Multi-Tenant → CRM → Welcome-Email-Direct (K.2) → Event-Dispatcher (L.4 V1: user.created → matching workflows).';

-- ════════════════════════════════════════════════════════════════
-- 3. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rpc_exists boolean;
  v_handler_def text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'dispatch_email_event')
    INTO v_rpc_exists;
  IF NOT v_rpc_exists THEN
    RAISE EXCEPTION 'dispatch_email_event RPC missing';
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_handler_def
  FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace;
  IF v_handler_def !~ 'Event-Dispatcher \(L\.4' THEN
    RAISE EXCEPTION 'handle_new_user does not contain L.4 Event-Dispatcher';
  END IF;

  RAISE NOTICE 'Sprint L.4 V1 Migration verification PASSED';
END $$;

COMMIT;
