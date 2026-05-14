-- =============================================================================
-- handle_new_user() — Trial 7→14 Tage + LinkedIn-OIDC full_name-Fallback
-- =============================================================================
-- Zwei chirurgische Änderungen am bestehenden Body, Rest unverändert:
--
--   a) trial_ends_at: now() + interval '7 days' → '14 days'
--      (Trial-Spec-Update; alle bestehenden profiles.trial_ends_at-Werte
--       bleiben unverändert, nur neue Signups bekommen 14 Tage)
--
--   b) full_name COALESCE-Chain erweitert um raw_user_meta_data->>'name'
--      LinkedIn-OIDC sendet den Anzeigename im `name`-Claim, nicht `full_name`
--      → bislang fiel COALESCE auf '' zurück, Dashboard zeigte nur Email.
--      Neue Chain: full_name → name → '' (Email-Sign-Up + LinkedIn beide ok).
--
-- CREATE OR REPLACE: bestehender Trigger on_auth_user_created auf auth.users
-- zeigt automatisch auf die neue Definition. Kein Drop+Recreate des Triggers.
-- =============================================================================

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
  -- Free-Plan-UUID dynamisch holen
  SELECT id INTO v_free_plan_id
  FROM public.plans
  WHERE LOWER(name) = 'free'
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'No "Free" plan found in plans table';
  END IF;

  -- Account-Status berechnen (defensiv falls invites-Tabelle nicht existiert)
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

  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, company,
    account_status,
    trial_ends_at, subscription_status, plan_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    -- LinkedIn-OIDC sendet 'name' statt 'full_name' — Fallback-Chain:
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    v_account_status,
    now() + interval '14 days',   -- ← Trial 7→14 Tage (2026-05-11 Spec)
    'trialing',
    v_free_plan_id  -- ← FIX: UUID statt text 'free'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- CRM-Sync (defensiv: try-catch)
  BEGIN
    PERFORM public.sync_user_to_leadesk_crm(NEW.id, 'Trials aktiv');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CRM-Sync für neuen User % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
