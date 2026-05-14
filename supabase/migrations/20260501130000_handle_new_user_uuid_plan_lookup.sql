-- ============================================================================
-- handle_new_user: UUID-Lookup für Free-Plan statt hardcoded 'free'
-- ============================================================================
--
-- Hintergrund
-- -----------
-- Auf Hetzner-Prod (und vermutlich Hetzner-Staging) ist plans.id ein uuid.
-- Der ursprüngliche handle_new_user-Trigger versuchte beim Register
--     INSERT INTO profiles (..., plan_id) VALUES (..., 'free')
-- was beim ersten Sign-Up einen "invalid input syntax for type uuid"-Fehler
-- wirft und den Account-Anlage-Pfad stillschweigend kaputtgemacht hat
-- (Symptom: profiles bleibt leer, Frontend hat 0 Module sichtbar).
--
-- Der Fix:
-- - Free-Plan-UUID dynamisch über LOWER(name) = 'free' nachschlagen
-- - defensiver Fallback wenn invites-Tabelle fehlt
-- - CRM-Sync bleibt try-catch wie zuvor
-- - Trigger sicher (re-)anlegen — verhindert schweigend-fehlenden Trigger
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_account_status text;
  v_free_plan_id uuid;
  v_invites_exists boolean;
BEGIN
  -- 1) Free-Plan-UUID dynamisch holen (statt hardcoded 'free' text-cast)
  SELECT id INTO v_free_plan_id
  FROM public.plans
  WHERE LOWER(name) = 'free'
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'No "Free" plan found in plans table — handle_new_user cannot proceed';
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
    now() + interval '7 days',
    'trialing',
    v_free_plan_id  -- ← FIX: UUID statt text 'free'
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
  'Sign-Up-Trigger: legt Profile mit Free-Plan-UUID an (gepatcht 2026-05-01). '
  'Liest plan_id dynamisch aus plans WHERE LOWER(name)=''free'' statt hardcoded text-cast.';
