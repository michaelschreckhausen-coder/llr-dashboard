-- Credits Phase 1 — handle_new_user: dynamic trial_days (Folge-Sprint)
-- ─────────────────────────────────────────────────────────────────
-- Ziel: trial_ends_at wird beim Sign-Up nicht mehr hardcoded auf
-- `now() + 14 days` gesetzt, sondern dynamisch aus plans.trial_days
-- des default-trial-Plans (mit COALESCE-Fallback 14 für Backward-Compat,
-- falls plans.trial_days NULL ist).
--
-- Hintergrund (siehe SKIP-Note in 20260601107000):
-- ─────────────────────────────────────────────────────────────────
-- Die naive Mig 107000 würde den Prod-Trigger downgraden (entfernt
-- Multi-Tenant-Auto-Anlage + CRM-Sync). Diese Migration ist die SAUBERE
-- Lösung — sie nimmt die reife Prod-Trigger-Form (analog zu
-- 20260511130000_handle_new_user_with_account_team.sql) als Basis und
-- patcht NUR die hardcoded `interval '14 days'`-Stellen.
--
-- Konkrete Änderungen ggü. 20260511130000:
--   1. Phase 1: zusätzlich plans.trial_days laden (INTEGER, nullable)
--   2. Phase 4 (profiles INSERT): trial_ends_at = now() + (v_trial_days || ' days')::interval
--   3. Phase 5 (accounts INSERT): trial_ends_at = now() + (v_trial_days || ' days')::interval
--
-- Apply-Strategie:
--   - Staging: applied (Trigger upgrade von einfacher Mig-8/8-Form auf reife
--     6-Phasen-Form mit dynamic trial_days) — Multi-Tenant-Auto-Anlage wird
--     dort additiv ergänzt. Cross-Env-Parität wiederhergestellt.
--   - Prod: applied (no-op für Multi-Tenant-Logic, additive trial_days-Dynamic).
--
-- Konsequenz nach Apply auf beiden Envs:
--   - Neuer 'trial'-Plan hat trial_days=3 (laut Mig 105000) → neue Sign-Ups
--     bekommen 3 Tage Trial-Dauer
--   - Wenn jemand später einen anderen Plan mit anderem trial_days zum
--     default-trial macht, wird der Trigger automatisch dessen trial_days nutzen
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

BEGIN;

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
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Trial-Plan + trial_days resolven (statt Free)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT id, COALESCE(trial_days, 14)
    INTO v_trial_plan_id, v_trial_days
  FROM public.plans
  WHERE is_default_trial = true
    AND is_active = true
  LIMIT 1;

  IF v_trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'No default-trial plan found (is_default_trial=true AND is_active=true). Sprint 1 deploy needed?';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. account_status für profiles (unverändert)
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
  -- 3. Account-Name-Fallback (full_name → name → email-prefix)
  -- ──────────────────────────────────────────────────────────────────────────
  v_account_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. profiles INSERT (trial_ends_at jetzt dynamisch aus plans.trial_days)
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
    now() + (v_trial_days || ' days')::interval,  -- ← FIX: dynamic
    'trialing',
    v_trial_plan_id
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. Multi-Tenant-Auto-Anlage (accounts + teams + team_members)
  --    EXCEPTION-wrapped: fail't das, bleibt User Orphan (via OrphanUsersTab nachpflegbar).
  -- ──────────────────────────────────────────────────────────────────────────
  BEGIN
    -- Idempotenz: nur INSERT wenn noch keine accounts-Row für diesen User
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
        now() + (v_trial_days || ' days')::interval,  -- ← FIX: dynamic
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
  -- 6. CRM-Sync (defensiv, unverändert)
  -- ──────────────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.sync_user_to_leadesk_crm(NEW.id, 'Trials aktiv');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CRM-Sync für neuen User % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Trigger sicher (re-)binden — falls vorher disabled
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Sign-Up-Trigger (Phase 1 Credits Folge-Sprint, 2026-05-30): 6 Phasen
   (Trial-Plan-Lookup + account_status + Name-Fallback + profiles-INSERT +
   Multi-Tenant-Auto-Anlage + CRM-Sync). trial_ends_at dynamisch aus
   plans.trial_days mit COALESCE-Fallback 14.';

-- Verifikation
DO $$
DECLARE
  v_trial_days integer;
BEGIN
  SELECT COALESCE(trial_days, 14) INTO v_trial_days
  FROM public.plans WHERE is_default_trial = true AND is_active = true LIMIT 1;

  IF v_trial_days IS NULL THEN
    RAISE EXCEPTION 'No default-trial-Plan after migration — Sign-Ups will crash';
  END IF;

  RAISE NOTICE 'Migration OK: handle_new_user dynamic trial_days = % days', v_trial_days;
END $$;

COMMIT;
