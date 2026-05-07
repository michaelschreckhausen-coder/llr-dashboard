-- Block 5.5e Vor-Migration: admin_create_account RPC
--
-- Atomic Account-Anlage: erstellt accounts + teams + team_members in einer
-- Transaction. Optional auch den Owner-User (wenn create_owner_if_missing).
-- Ein einziger admin_audit_log-Eintrag mit allen IDs im after_value.
--
-- Decisions (Block 5.5e):
--   A — Multi-Account-Owner ist erlaubt. Wenn p_owner_email schon existiert
--       in auth.users → use existing User. Macht Demo-/Comp-Setup einfach.
--   B — Sub-Call zu admin_create_user (statt Inline-Duplizierung). Auth-Gate
--       wird zweimal evaluiert, dafuer single-source-of-truth fuer User-Create.
--   C — Owner-Identitaet ist beliebig. RPC validiert nichts dazu.
--   D — Trial-Logik gekoppelt: p_trial_days > 0 → status='trialing',
--       trial_ends_at = now() + days. Sonst → p_status (default 'active'),
--       trial_ends_at = NULL.
--
-- Refinements:
--   1. p_plan_slug statt p_plan_id (UI-freundlicher, intern resolved)
--   2. p_seat_limit default NULL (= unlimited bis explizit gesetzt)
--   3. Team-Slug Auto-Collision-Suffix: -{4-stellig-random} bei Konflikt
--   4. Single Audit-Eintrag mit allen 3 IDs (account_id, team_id, owner_user_id)
--      + Settings + ob Owner neu erstellt
--
-- Validation:
--   - is_leadesk_admin Auth-Gate (42501)
--   - Reason >= 10 chars (22023, matched admin_audit_log_reason_check)
--   - Pflichtfelder nicht leer (account_name, billing_email, plan_slug, owner_email)
--   - status / granted_via / plan_managed_by IN allowed (CHECK-Constraints
--     auf accounts greifen; explizite RPC-Validation fuer sprechende Errors)
--   - Plan-Existenz + nicht archived (P0002 / 22023)
--   - Owner-Resolution: existing OR create_if_missing+password OR P0002
--
-- search_path: extensions, public, auth, pg_temp (extensions wegen pgcrypto
-- transitiv ueber admin_create_user).
--
-- Reversibel via:
--   DROP FUNCTION IF EXISTS public.admin_create_account(...);

BEGIN;

-- DO-block: alle existierenden Overloads safe droppen (idempotent re-apply)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname='admin_create_account'
      AND pronamespace='public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_account(
  p_account_name             text,
  p_billing_email            text,
  p_plan_slug                text,
  p_owner_email              text,
  p_create_owner_if_missing  boolean DEFAULT true,
  p_owner_password           text    DEFAULT NULL,
  p_owner_full_name          text    DEFAULT '',
  p_team_name                text    DEFAULT NULL,
  p_team_slug                text    DEFAULT NULL,
  p_status                   text    DEFAULT 'active',
  p_granted_via              text    DEFAULT 'manual',
  p_plan_managed_by          text    DEFAULT 'leadesk',
  p_seat_limit               integer DEFAULT NULL,
  p_trial_days               integer DEFAULT NULL,
  p_reason                   text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_admin_user_id        uuid := auth.uid();
  v_is_admin             boolean;
  v_owner_id             uuid;
  v_owner_was_created    boolean := false;
  v_plan_id              uuid;
  v_plan_name            text;
  v_team_id              uuid;
  v_account_id           uuid;
  v_team_name            text;
  v_team_slug_base       text;
  v_team_slug            text;
  v_status               text;
  v_trial_ends_at        timestamptz;
  v_audit_id             uuid;
  v_admin_create_result  jsonb;
  v_collision_count      int := 0;
BEGIN
  -- ============================================================
  -- 1. Auth-Gate (matched admin_create_user-Pattern)
  -- ============================================================
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean,
    false
  );
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;

  -- ============================================================
  -- 2. Reason-Validation (matched admin_audit_log_reason_check)
  -- ============================================================
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 3. Pflichtfelder
  -- ============================================================
  IF p_account_name IS NULL OR length(trim(p_account_name)) = 0 THEN
    RAISE EXCEPTION 'Account name required' USING ERRCODE = '22023';
  END IF;
  IF p_billing_email IS NULL OR length(trim(p_billing_email)) = 0 THEN
    RAISE EXCEPTION 'Billing email required' USING ERRCODE = '22023';
  END IF;
  IF p_plan_slug IS NULL OR length(trim(p_plan_slug)) = 0 THEN
    RAISE EXCEPTION 'Plan slug required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_email IS NULL OR length(trim(p_owner_email)) = 0 THEN
    RAISE EXCEPTION 'Owner email required' USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 4. Enum-Werte (sprechende Errors statt CHECK-Constraint-Kollision)
  -- ============================================================
  IF p_status NOT IN ('trialing','active','past_due','suspended','canceled') THEN
    RAISE EXCEPTION 'Invalid status "%" — must be trialing/active/past_due/suspended/canceled', p_status
      USING ERRCODE = '22023';
  END IF;
  IF p_granted_via NOT IN ('stripe','manual','trial') THEN
    RAISE EXCEPTION 'Invalid granted_via "%" — must be stripe/manual/trial', p_granted_via
      USING ERRCODE = '22023';
  END IF;
  IF p_plan_managed_by NOT IN ('stripe','leadesk') THEN
    RAISE EXCEPTION 'Invalid plan_managed_by "%" — must be stripe/leadesk', p_plan_managed_by
      USING ERRCODE = '22023';
  END IF;
  IF p_trial_days IS NOT NULL AND p_trial_days < 0 THEN
    RAISE EXCEPTION 'Trial days must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_seat_limit IS NOT NULL AND p_seat_limit < 1 THEN
    RAISE EXCEPTION 'Seat limit must be >= 1' USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 5. Plan-Resolution (slug → id, must be active + not archived)
  -- ============================================================
  SELECT id, name INTO v_plan_id, v_plan_name
  FROM public.plans
  WHERE slug = lower(trim(p_plan_slug)) AND archived = false AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan slug "%" not found or archived/inactive', p_plan_slug
      USING ERRCODE = 'P0002';
  END IF;

  -- ============================================================
  -- 6. Trial-Logik gekoppelt (Decision D)
  -- ============================================================
  IF p_trial_days IS NOT NULL AND p_trial_days > 0 THEN
    v_status        := 'trialing';
    v_trial_ends_at := now() + (p_trial_days || ' days')::interval;
  ELSE
    v_status        := p_status;
    v_trial_ends_at := NULL;
  END IF;

  -- ============================================================
  -- 7. Owner-Resolution (existing OR create OR raise)
  -- ============================================================
  SELECT id INTO v_owner_id FROM auth.users WHERE email = p_owner_email;

  IF v_owner_id IS NULL THEN
    IF NOT p_create_owner_if_missing THEN
      RAISE EXCEPTION 'Owner email "%" not found and create_owner_if_missing=false', p_owner_email
        USING ERRCODE = 'P0002';
    END IF;
    IF p_owner_password IS NULL OR length(p_owner_password) < 8 THEN
      RAISE EXCEPTION 'Owner password required (min 8 chars) when creating new owner'
        USING ERRCODE = '22023';
    END IF;
    -- Sub-Call (Decision B): single-source-of-truth fuer User-Create.
    -- admin_create_user ist SECURITY DEFINER, prueft eigenen Auth-Gate.
    -- Da unser is_admin-Check oben gepasst hat, passt der inner-Check auch.
    v_admin_create_result := public.admin_create_user(
      p_owner_email,
      p_owner_password,
      p_owner_full_name,
      'user'
    );
    v_owner_id := (v_admin_create_result ->> 'id')::uuid;
    v_owner_was_created := true;
  END IF;

  -- ============================================================
  -- 8. Team-Name + Slug (collision-resilient)
  -- ============================================================
  v_team_name := COALESCE(NULLIF(trim(p_team_name), ''), p_account_name);

  -- Slug-Base: explicit oder auto-generated aus account_name
  v_team_slug_base := lower(trim(COALESCE(NULLIF(trim(p_team_slug), ''), p_account_name)));
  -- Replace non-[a-z0-9_-] mit '-', strip leading/trailing dashes, collapse runs
  v_team_slug_base := regexp_replace(v_team_slug_base, '[^a-z0-9_-]+', '-', 'g');
  v_team_slug_base := regexp_replace(v_team_slug_base, '-+', '-', 'g');
  v_team_slug_base := trim(both '-' from v_team_slug_base);
  IF length(v_team_slug_base) = 0 THEN
    v_team_slug_base := 'team';    -- defensive fallback
  END IF;

  -- Collision-Resolution: append -{4-stellig-random} solange Konflikt
  v_team_slug := v_team_slug_base;
  WHILE EXISTS (SELECT 1 FROM public.teams WHERE slug = v_team_slug) LOOP
    v_collision_count := v_collision_count + 1;
    IF v_collision_count > 100 THEN
      RAISE EXCEPTION 'Team slug collision-resolution exceeded 100 attempts'
        USING ERRCODE = 'P0001';
    END IF;
    v_team_slug := v_team_slug_base || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  END LOOP;

  -- ============================================================
  -- 9. INSERT accounts
  -- ============================================================
  INSERT INTO public.accounts (
    name, billing_email, owner_user_id, plan_id,
    seat_limit, plan_managed_by, status,
    trial_ends_at, granted_via
  ) VALUES (
    trim(p_account_name),
    lower(trim(p_billing_email)),
    v_owner_id,
    v_plan_id,
    COALESCE(p_seat_limit, 1),    -- accounts.seat_limit ist NOT NULL DEFAULT 1
    p_plan_managed_by,
    v_status,
    v_trial_ends_at,
    p_granted_via
  )
  RETURNING id INTO v_account_id;

  -- ============================================================
  -- 10. INSERT teams (mit account_id-FK, owner_id=owner_user_id)
  -- ============================================================
  INSERT INTO public.teams (
    name, slug, owner_id, account_id, plan_id, is_active
  ) VALUES (
    v_team_name, v_team_slug, v_owner_id, v_account_id, v_plan_id, true
  )
  RETURNING id INTO v_team_id;

  -- ============================================================
  -- 11. INSERT team_members (role='owner'::user_role)
  -- ============================================================
  INSERT INTO public.team_members (
    user_id, team_id, role, invited_by
  ) VALUES (
    v_owner_id, v_team_id, 'owner'::user_role, v_admin_user_id
  );

  -- ============================================================
  -- 12. Audit-Eintrag (Single, mit allen IDs im after_value)
  -- ============================================================
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    before_value, after_value, reason
  ) VALUES (
    v_admin_user_id,
    'account_create',
    'accounts',
    v_account_id,
    NULL,
    jsonb_build_object(
      'account_id',        v_account_id,
      'account_name',      trim(p_account_name),
      'billing_email',     lower(trim(p_billing_email)),
      'team_id',           v_team_id,
      'team_name',         v_team_name,
      'team_slug',         v_team_slug,
      'owner_user_id',     v_owner_id,
      'owner_email',       p_owner_email,
      'owner_was_created', v_owner_was_created,
      'plan_id',           v_plan_id,
      'plan_slug',         lower(trim(p_plan_slug)),
      'plan_name',         v_plan_name,
      'status',            v_status,
      'granted_via',       p_granted_via,
      'plan_managed_by',   p_plan_managed_by,
      'seat_limit',        COALESCE(p_seat_limit, 1),
      'trial_days',        p_trial_days,
      'trial_ends_at',     v_trial_ends_at
    ),
    p_reason
  )
  RETURNING id INTO v_audit_id;

  -- ============================================================
  -- 13. Return
  -- ============================================================
  RETURN jsonb_build_object(
    'success',           true,
    'account_id',        v_account_id,
    'team_id',           v_team_id,
    'team_slug',         v_team_slug,
    'owner_user_id',     v_owner_id,
    'owner_was_created', v_owner_was_created,
    'plan_id',           v_plan_id,
    'plan_name',         v_plan_name,
    'status',            v_status,
    'trial_ends_at',     v_trial_ends_at,
    'audit_id',          v_audit_id
  );
END;
$$;

-- ============================================================
-- GRANT (analog existing admin-RPCs)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.admin_create_account(
  text, text, text, text,
  boolean, text, text, text, text,
  text, text, text,
  integer, integer, text
) TO authenticated;

COMMIT;

-- PostgREST Schema-Cache reload
NOTIFY pgrst, 'reload schema';
