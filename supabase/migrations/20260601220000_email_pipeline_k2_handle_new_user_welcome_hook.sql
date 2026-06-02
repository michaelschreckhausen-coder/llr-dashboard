-- File: 20260601220000_email_pipeline_k2_handle_new_user_welcome_hook.sql
-- Sprint K.2 A — handle_new_user-Trigger Email-Hook
--
-- Erweitert die existing handle_new_user-Trigger-Function um eine 7. Phase:
-- fire-and-forget pg_net.http_post-Call zur send-templated-email-EF mit
-- template_key='welcome_trial_start'. Email-Send ist non-blocking — schlägt
-- pg_net oder die EF fehl, läuft Sign-Up trotzdem durch.
--
-- Voraussetzungen:
--   1. pg_net extension installiert (Standard auf Supabase-Self-Host)
--   2. Custom GUC app.service_role_key gesetzt (per env-Var via ALTER DATABASE):
--      ssh root@<host> 'docker exec supabase-db psql -U supabase_admin -d postgres -c \"
--        ALTER DATABASE postgres SET app.service_role_key = '<service_role_key_value>';
--      \"'
--      Plus reload via SELECT pg_reload_conf();
--      Plus Container-Reconnect (psql sessions cachen GUC — reicht Connection-Refresh).
--
-- Email-Endpoint: http://kong:8000/functions/v1/send-templated-email
--   - Interner Docker-Compose-Hostname (kein TLS, kein DNS-Resolution out-of-Network)
--   - Funktioniert für beide Envs (Staging + Prod) ohne env-spezifische Config
--
-- Variables-Map:
--   user.first_name        ← raw_user_meta_data.full_name / .first_name / email-prefix
--   trial_days_remaining   ← v_trial_days (aus plans.trial_days-Lookup)
--   trial_ends_at_pretty   ← formatierter accounts.trial_ends_at ('DD. TMMonth YYYY')
--
-- Idempotenz: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. Pre-Flight Checks
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net extension required. Run: CREATE EXTENSION IF NOT EXISTS pg_net; as supabase_admin.';
  END IF;
  RAISE NOTICE 'pg_net extension ✓';
END $$;

DO $$
DECLARE
  v_key text;
BEGIN
  v_key := current_setting('app.service_role_key', true);
  IF v_key IS NULL OR length(v_key) < 50 THEN
    RAISE WARNING 'GUC app.service_role_key NOT set or too short. Welcome-Email-Trigger wird silent skippen bis GUC gesetzt ist via: ALTER DATABASE postgres SET app.service_role_key = ''<key>''; Plus pg_reload_conf();';
  ELSE
    RAISE NOTICE 'GUC app.service_role_key ✓ (length: %)', length(v_key);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- 2. handle_new_user-Trigger erweitern um Phase 7 (Welcome-Email-Hook)
-- ════════════════════════════════════════════════════════════════
-- Basis: existing 6-Phasen-Form aus Mig 20260601108000_credits_phase1_handle_new_user_dynamic_trial_days.sql.
-- Erweiterung: Phase 7 als letzter Step VOR RETURN NEW.

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
  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Trial-Plan + trial_days resolven
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT id, COALESCE(trial_days, 14)
    INTO v_trial_plan_id, v_trial_days
  FROM public.plans
  WHERE is_default_trial = true
    AND is_active = true
  LIMIT 1;

  IF v_trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'No default-trial plan found (is_default_trial=true AND is_active=true).';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. account_status für profiles
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='invites')
    INTO v_invites_exists;

  IF v_invites_exists THEN
    v_account_status := CASE
      WHEN NEW.raw_app_meta_data->>'provider' = 'email'
           AND NOT EXISTS (
             SELECT 1 FROM public.invites
             WHERE email = NEW.email AND status = 'accepted'
           )
      THEN 'pending'
      ELSE 'active'
    END;
  ELSE
    v_account_status := 'pending';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. Account-Name + first_name resolven
  -- ──────────────────────────────────────────────────────────────────────────
  v_account_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- first_name für Email-Personalisierung
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    split_part(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), ' ', 1),
    split_part(NULLIF(NEW.raw_user_meta_data->>'name', ''), ' ', 1),
    split_part(NEW.email, '@', 1)
  );

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. profiles INSERT
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, company,
    account_status,
    trial_ends_at, subscription_status, plan_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    v_account_status,
    now() + (v_trial_days || ' days')::interval,
    'trialing',
    v_trial_plan_id
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. Multi-Tenant-Auto-Anlage (accounts + teams + team_members)
  -- ──────────────────────────────────────────────────────────────────────────
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE owner_user_id = NEW.id) THEN
      v_account_id := gen_random_uuid();
      v_team_id    := gen_random_uuid();

      INSERT INTO public.accounts (
        id, owner_user_id, name, billing_email,
        plan_id, status, trial_ends_at,
        plan_managed_by, seat_limit, granted_via
      ) VALUES (
        v_account_id, NEW.id, v_account_name, NEW.email,
        v_trial_plan_id, 'trialing',
        now() + (v_trial_days || ' days')::interval,
        'leadesk', 1, 'trial'
      );

      INSERT INTO public.teams (
        id, account_id, name, slug, owner_id, plan_id, is_active
      ) VALUES (
        v_team_id, v_account_id, 'Mein Team',
        'team-' || REPLACE(v_team_id::text, '-', ''),
        NEW.id, v_trial_plan_id, true
      );

      INSERT INTO public.team_members (
        team_id, user_id, role, joined_at
      ) VALUES (
        v_team_id, NEW.id, 'owner', now()
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Multi-Tenant-Auto-Anlage für % fehlgeschlagen: %',
      NEW.email, SQLERRM;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 6. CRM-Sync (defensiv)
  -- ──────────────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.sync_user_to_leadesk_crm(NEW.id, 'Trials aktiv');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CRM-Sync für neuen User % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. Welcome-Email-Hook (NEW — Sprint K.2 A) — fire-and-forget pg_net
  -- ──────────────────────────────────────────────────────────────────────────
  -- Nur senden wenn:
  --   - GUC app.service_role_key gesetzt
  --   - template welcome_trial_start mit status='published' existiert (DE-locale)
  -- Failures sind WARNUNG-only, blocken Sign-Up nicht.
  BEGIN
    v_service_role_key := current_setting('app.service_role_key', true);

    IF v_service_role_key IS NOT NULL AND length(v_service_role_key) > 50
       AND EXISTS (
         SELECT 1 FROM public.email_templates
         WHERE template_key = 'welcome_trial_start'
           AND locale = 'de'
           AND status = 'published'
       ) THEN

      -- 'DD. TMMonth YYYY' = z.B. '05. Juni 2026'
      v_trial_ends_pretty := to_char(
        now() + (v_trial_days || ' days')::interval,
        'TMDD. TMMonth YYYY'
      );

      PERFORM net.http_post(
        url := 'http://kong:8000/functions/v1/send-templated-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
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
    RAISE WARNING 'Welcome-Email-Hook für % fehlgeschlagen (non-blocking): %',
      NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Trigger sicher (re-)binden
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Sign-Up-Trigger (Sprint K.2 A, 2026-06-01): 7 Phasen (Trial-Plan-Lookup +
   account_status + Name-Fallback + profiles-INSERT + Multi-Tenant-Auto-Anlage
   + CRM-Sync + Welcome-Email-Hook fire-and-forget). Email-Hook nur aktiv wenn
   GUC app.service_role_key gesetzt + Template welcome_trial_start published.';

-- ════════════════════════════════════════════════════════════════
-- 3. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_trigger_exists boolean;
  v_function_definition text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal
  ) INTO v_trigger_exists;

  SELECT pg_get_functiondef(oid) INTO v_function_definition
  FROM pg_proc
  WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace;

  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'on_auth_user_created trigger missing';
  END IF;

  IF v_function_definition !~ 'Welcome-Email-Hook' THEN
    RAISE EXCEPTION 'handle_new_user does not contain Welcome-Email-Hook';
  END IF;

  RAISE NOTICE 'Sprint K.2 A Migration verification PASSED';
END $$;

COMMIT;
