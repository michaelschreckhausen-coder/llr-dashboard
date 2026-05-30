-- Credits Phase 1 — handle_new_user-Trigger Refactor
-- ─────────────────────────────────────────────────────────────────
-- Wechselt das Plan-Lookup von Name-basiert (`LOWER(name)='free'`) auf
-- is_default_trial=true. Neue Sign-Ups landen auf dem Trial-Plan
-- (3 Tage, 1000 Credits, Sales-Features) statt auf dem restriktiven
-- Free-Plan.
--
-- Plus: trial_ends_at von 7 Tagen auf 3 Tage (Doc-Spec).
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
BEGIN
  -- 1) Trial-Plan-UUID via is_default_trial=true (eindeutig durch Unique-Index)
  SELECT id, COALESCE(trial_days, 3)
    INTO v_trial_plan_id, v_trial_days
    FROM public.plans
   WHERE is_default_trial = true
     AND is_active = true
   LIMIT 1;

  IF v_trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'No default-trial plan found (is_default_trial=true AND is_active=true) — handle_new_user cannot proceed';
  END IF;

  -- 2) Account-Status berechnen (defensiv falls invites-Tabelle nicht existiert)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='invites'
  ) INTO v_invites_exists;

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

  -- 3) Profile anlegen (oder bei Konflikt mergen)
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, company,
    account_status,
    trial_ends_at, subscription_status, plan_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    v_account_status,
    now() + (v_trial_days || ' days')::interval,  -- ← FIX: dynamisch aus Plan
    'trialing',
    v_trial_plan_id  -- ← FIX: Trial-Plan-UUID statt Free-Plan-UUID
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- 4) CRM-Sync: defensiv, darf den Sign-Up nicht blocken
  BEGIN
    PERFORM public.sync_user_to_leadesk_crm(NEW.id, 'Trials aktiv');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CRM-Sync für neuen User % fehlgeschlagen: %', NEW.email, SQLERRM;
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
  'Sign-Up-Trigger: legt Profile mit Default-Trial-Plan an (gepatcht 2026-06-01). '
  'Lookup via is_default_trial=true AND is_active=true. trial_ends_at = now() + plans.trial_days.';

COMMIT;
