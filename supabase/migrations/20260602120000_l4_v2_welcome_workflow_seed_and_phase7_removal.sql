-- File: 20260602120000_l4_v2_welcome_workflow_seed_and_phase7_removal.sql
-- Sprint L.4 V2 — Welcome wird single-source-of-truth via Workflow-System
--
-- ATOMIC in einer Transaktion:
--   1. Default-Welcome-Workflow seeden (Workflow + Step + Trigger)
--   2. handle_new_user-Trigger: Phase 7 (Direct-Welcome aus K.2) entfernen,
--      Phase 8 (Event-Dispatcher aus L.4 V1) bleibt
--
-- Resultat: jeder neue Sign-Up → genau 1 Welcome-Mail via Workflow-System.
-- Vorher (L.4 V1 + Phase 7 aktiv): 2 Welcome-Mails (Direct + Workflow).
-- Vorher (L.4 V1 ohne Workflow-Seed = Prod Variante A): 1 Welcome-Mail (Direct).
--
-- Idempotent:
--   - Workflow-Seed mit ON CONFLICT (id) DO UPDATE
--   - Trigger via CREATE OR REPLACE FUNCTION
--
-- Voraussetzung:
--   - L.4 V1 + V1.1 applied (dispatch_email_event-RPC vorhanden, Auth-Fix aktiv)
--   - Template welcome_trial_start published auf der Env
--   - Runner-EF auf Volume (für pg_net.http_post-Call)

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. Default-Welcome-Workflow seeden
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.email_workflows (
  id, name, description, status, is_active, account_id
) VALUES (
  '00000000-0000-0000-0000-000000000010'::uuid,
  'Default Welcome (System)',
  'L.4 V2: Automatischer Welcome bei Sign-Up via Workflow-System (single-source-of-truth). Triggert auf event=user.created, sendet welcome_trial_start. Ersetzt K.2-Direct-Hook (Phase 7).',
  'published',
  true,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.email_workflow_steps (
  id, workflow_id, step_index, step_type, template_key
) VALUES (
  '00000000-0000-0000-0000-000000000011'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  1,
  'email',
  'welcome_trial_start'
)
ON CONFLICT (workflow_id, step_index) DO UPDATE SET
  step_type = EXCLUDED.step_type,
  template_key = EXCLUDED.template_key;

INSERT INTO public.email_workflow_triggers (
  id, workflow_id, trigger_type, event_name, is_active
) VALUES (
  '00000000-0000-0000-0000-000000000012'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  'event',
  'user.created',
  true
)
ON CONFLICT (id) DO UPDATE SET
  trigger_type = EXCLUDED.trigger_type,
  event_name = EXCLUDED.event_name,
  is_active = EXCLUDED.is_active;

-- ════════════════════════════════════════════════════════════════
-- 2. handle_new_user-Trigger: Phase 7 entfernen, Phase 8 bleibt
-- ════════════════════════════════════════════════════════════════
-- Reduzierte 7-Phasen-Form (vorher 8 in L.4 V1):
--   1. Trial-Plan-Lookup
--   2. account_status für profiles
--   3. Name-Resolution (account_name + first_name)
--   4. profiles INSERT
--   5. Multi-Tenant-Auto-Anlage (accounts + teams + team_members)
--   6. CRM-Sync
--   7. Event-Dispatcher (vorher Phase 8) — ruft dispatch_email_event('user.created')

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
  v_first_name text;
  v_trial_ends_pretty text;
BEGIN
  -- 1. Trial-Plan + trial_days
  SELECT id, COALESCE(trial_days, 14)
    INTO v_trial_plan_id, v_trial_days
  FROM public.plans
  WHERE is_default_trial = true AND is_active = true
  LIMIT 1;

  IF v_trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'No default-trial plan found';
  END IF;

  -- 2. account_status
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

  -- 3. Name-Resolution
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

  -- 4. profiles INSERT
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

  -- 5. Multi-Tenant-Auto-Anlage
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
      SELECT id INTO v_account_id FROM public.accounts WHERE owner_user_id = NEW.id LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Multi-Tenant-Auto-Anlage für % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  -- 6. CRM-Sync
  BEGIN
    PERFORM public.sync_user_to_leadesk_crm(NEW.id, 'Trials aktiv');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CRM-Sync für % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  -- 7. Event-Dispatcher (single-source-of-truth für Welcome via Workflow-System)
  -- Vorher Phase 7+8: Direct K.2 + Workflow. Jetzt Phase 7 only: Workflow.
  v_trial_ends_pretty := to_char(now() + (v_trial_days || ' days')::interval, 'TMDD. TMMonth YYYY');

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
  'Sign-Up-Trigger (Sprint L.4 V2, 2026-06-02): 7 Phasen — Trial-Lookup → account_status → Name → profiles → Multi-Tenant → CRM → Event-Dispatcher (user.created → Workflow-System single-source). K.2-Direct-Welcome (alte Phase 7) entfernt.';

-- ════════════════════════════════════════════════════════════════
-- 3. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_wf_count integer;
  v_step_count integer;
  v_trigger_count integer;
  v_handler_def text;
BEGIN
  -- Workflow + Step + Trigger
  SELECT count(*) INTO v_wf_count FROM public.email_workflows
   WHERE id = '00000000-0000-0000-0000-000000000010'::uuid AND status = 'published' AND is_active = true;
  SELECT count(*) INTO v_step_count FROM public.email_workflow_steps
   WHERE workflow_id = '00000000-0000-0000-0000-000000000010'::uuid;
  SELECT count(*) INTO v_trigger_count FROM public.email_workflow_triggers
   WHERE workflow_id = '00000000-0000-0000-0000-000000000010'::uuid AND is_active = true;

  IF v_wf_count != 1 OR v_step_count != 1 OR v_trigger_count != 1 THEN
    RAISE EXCEPTION 'L.4 V2 Workflow-Seed verification failed: wf=%, steps=%, triggers=%', v_wf_count, v_step_count, v_trigger_count;
  END IF;

  -- handle_new_user darf KEINEN send-templated-email-Aufruf mehr direkt enthalten
  SELECT pg_get_functiondef(oid) INTO v_handler_def
  FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace;

  IF v_handler_def ~ 'send-templated-email' THEN
    RAISE EXCEPTION 'handle_new_user enthält noch Direct send-templated-email-Aufruf (Phase 7 nicht entfernt)';
  END IF;

  IF v_handler_def !~ 'dispatch_email_event' THEN
    RAISE EXCEPTION 'handle_new_user enthält keinen dispatch_email_event-Aufruf';
  END IF;

  RAISE NOTICE 'Sprint L.4 V2 Migration verification PASSED — Workflow seeded + Phase 7 removed';
END $$;

COMMIT;
