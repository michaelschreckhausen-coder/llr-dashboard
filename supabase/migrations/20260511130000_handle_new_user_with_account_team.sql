-- =============================================================================
-- Sprint 2: handle_new_user erweitert um Multi-Tenant-Auto-Anlage
-- =============================================================================
-- Voraussetzung: Sprint 1 deployed (Trial-Plan mit is_default_trial=true).
--
-- Erweiterungen ggü. vorigem Patch (20260511110000):
--   a) Plan-Lookup: is_default_trial=true (statt LOWER(name)='free').
--      Konsequenz: profiles.plan_id + accounts.plan_id beide auf Trial-Plan.
--   b) Account-Name-Fallback-Chain matched profile-Pattern:
--      full_name → name → split_part(email, '@', 1).
--   c) Nach profiles-INSERT zusätzlich:
--        - accounts (granted_via='trial', plan_managed_by='leadesk',
--                    status='trialing', trial_ends_at=NOW()+14d, seat_limit=1)
--        - teams (slug = 'team-' + UUID-without-hyphens → Kollisions-frei)
--        - team_members (role='owner')
--      Pre-generated UUIDs (gen_random_uuid()) für FK-Konsistenz.
--   d) Multi-Tenant-Block wrapped in BEGIN/EXCEPTION (analog CRM-Sync):
--      Wenn das fail't, bleibt auth.users + profiles trotzdem grün, User
--      landet als Orphan → kann via OrphanUsersTab (Sprint 3) nachgepflegt werden.
--   e) Idempotenz-Guard: NUR INSERT wenn noch keine accounts-Row für User
--      (verhindert dup-INSERTs falls Trigger doppelt fired).
--
-- Auth-/RLS-Side: SECURITY DEFINER, läuft als postgres → bypasst RLS für die
-- 3 INSERTs. Function-Owner braucht INSERT-Privileges (postgres = superuser).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_account_status text;
  v_trial_plan_id uuid;
  v_invites_exists boolean;
  v_account_name text;
  v_account_id uuid;
  v_team_id uuid;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Trial-Plan resolven (statt Free)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_trial_plan_id
  FROM public.plans
  WHERE is_default_trial = true
  LIMIT 1;

  IF v_trial_plan_id IS NULL THEN
    RAISE EXCEPTION 'No default-trial plan found (is_default_trial=true). Sprint 1 deploy needed?';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. account_status für profiles (unverändert vom letzten Patch)
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
  -- 4. profiles INSERT (jetzt mit Trial-Plan-ID + 14d trial_ends_at)
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
    now() + interval '14 days',
    'trialing',
    v_trial_plan_id
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. Multi-Tenant-Auto-Anlage (accounts + teams + team_members)
  --    Wrapped in EXCEPTION: wenn das fail't, bleibt auth.users + profiles
  --    grün, User wird Orphan und via Sprint-3-UI nachpflegbar.
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
        v_trial_plan_id, 'trialing', now() + interval '14 days',
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
