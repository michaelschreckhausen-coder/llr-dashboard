-- ════════════════════════════════════════════════════════════════
-- Phase EmailFix-3 D2a — admin_create_account_with_owner_id
--
-- ADDITIVE: existing admin_create_account v1 bleibt unverändert.
-- Dieser parallele RPC akzeptiert eine vorab-erzeugte owner_user_id
-- (von Edge-Function admin-create-account-invite, die GoTrue's
-- /auth/v1/invite synchron via fetch ruft).
--
-- Ersetzt v1's admin_create_user-Sub-Call durch reinen ID-Lookup.
-- Audit-Log trackt 'was_invited' (true wenn von Edge-Function via
-- invite-Flow aufgerufen, false wenn pre-existierender User direkt
-- als Owner gesetzt wurde).
--
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_account_with_owner_id(
  p_account_name      text,
  p_billing_email     text,
  p_plan_slug         text,
  p_owner_user_id     uuid,                         -- NEU: ersetzt _email/_password/_create
  p_owner_full_name   text    DEFAULT NULL,         -- forward-compat (v1: für admin_create_user, hier metadata-only)
  p_owner_role        text    DEFAULT 'owner',      -- forward-compat (Body hardcodet 'owner'::user_role, siehe team_members-INSERT)
  p_was_invited       boolean DEFAULT false,        -- NEU: für audit-log
  p_reason            text    DEFAULT NULL,
  p_status            text    DEFAULT 'active',
  p_granted_via       text    DEFAULT 'manual',
  p_plan_managed_by   text    DEFAULT 'leadesk',
  p_seat_limit        integer DEFAULT NULL,
  p_trial_days        integer DEFAULT NULL,
  p_team_name         text    DEFAULT NULL,
  p_team_slug         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  -- DECLARE-Block 1:1 aus v1, plus minor adjustments:
  --   v_owner_id init aus p_owner_user_id (v1 init via SELECT FROM auth.users)
  --   v_owner_email NEW (für audit-log statt p_owner_email-param)
  --   v_owner_was_created bleibt für audit-key-compat
  v_admin_user_id     uuid := auth.uid();
  v_is_admin          boolean;
  v_owner_id          uuid := p_owner_user_id;
  v_owner_email       text;
  v_owner_was_created boolean := p_was_invited;   -- semantically: invited == was_created (in this codepath)
  v_plan_id           uuid;
  v_plan_name         text;
  v_team_id           uuid;
  v_account_id        uuid;
  v_team_name         text;
  v_team_slug_base    text;
  v_team_slug         text;
  v_status            text;
  v_trial_ends_at     timestamptz;
  v_audit_id          uuid;
  v_collision_count   int := 0;
BEGIN
  -- ============================================================
  -- 1. Auth-Gate (1:1 aus v1)
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
  -- 2. Reason-Validation (1:1 aus v1)
  -- ============================================================
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 3. Pflichtfelder (adapted: p_owner_user_id statt p_owner_email)
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
  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Owner user_id required' USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 4. Enum-Werte (1:1 aus v1)
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
  -- 5. Plan-Resolution (1:1 aus v1)
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
  -- 6. Trial-Logik (1:1 aus v1)
  -- ============================================================
  IF p_trial_days IS NOT NULL AND p_trial_days > 0 THEN
    v_status        := 'trialing';
    v_trial_ends_at := now() + (p_trial_days || ' days')::interval;
  ELSE
    v_status        := p_status;
    v_trial_ends_at := NULL;
  END IF;

  -- ============================================================
  -- 7. Owner-Resolution (NEU — ID-Lookup statt Email-Match + create-call)
  -- ============================================================
  --
  -- v1 macht: SELECT id FROM auth.users WHERE email=p_owner_email,
  --          IF NULL THEN admin_create_user(...).
  -- Hier:    Lookup email by p_owner_user_id (param IS the user_id).
  --          User MUSS existieren (Edge-Function hat ihn invited).
  -- ============================================================
  SELECT email INTO v_owner_email
  FROM auth.users
  WHERE id = p_owner_user_id;

  IF v_owner_email IS NULL THEN
    RAISE EXCEPTION 'Owner user_id % does not exist in auth.users', p_owner_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ============================================================
  -- 8. Team-Name + Slug (1:1 aus v1)
  -- ============================================================
  v_team_name := COALESCE(NULLIF(trim(p_team_name), ''), p_account_name);

  v_team_slug_base := lower(trim(COALESCE(NULLIF(trim(p_team_slug), ''), p_account_name)));
  v_team_slug_base := regexp_replace(v_team_slug_base, '[^a-z0-9_-]+', '-', 'g');
  v_team_slug_base := regexp_replace(v_team_slug_base, '-+', '-', 'g');
  v_team_slug_base := trim(both '-' from v_team_slug_base);
  IF length(v_team_slug_base) = 0 THEN
    v_team_slug_base := 'team';
  END IF;

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
  -- 9. INSERT accounts (1:1 aus v1)
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
    COALESCE(p_seat_limit, 1),
    p_plan_managed_by,
    v_status,
    v_trial_ends_at,
    p_granted_via
  )
  RETURNING id INTO v_account_id;

  -- ============================================================
  -- 10. INSERT teams (1:1 aus v1)
  -- ============================================================
  INSERT INTO public.teams (
    name, slug, owner_id, account_id, plan_id, is_active
  ) VALUES (
    v_team_name, v_team_slug, v_owner_id, v_account_id, v_plan_id, true
  )
  RETURNING id INTO v_team_id;

  -- ============================================================
  -- 11. INSERT team_members (1:1 aus v1, role hardcoded 'owner')
  -- ============================================================
  INSERT INTO public.team_members (
    user_id, team_id, role, invited_by
  ) VALUES (
    v_owner_id, v_team_id, 'owner'::user_role, v_admin_user_id
  );

  -- ============================================================
  -- 12. Audit-Eintrag (adapted: was_invited statt owner_was_created,
  --     v_owner_email statt p_owner_email)
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
      'owner_email',       v_owner_email,
      'was_invited',       p_was_invited,
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
    'success',       true,
    'account_id',    v_account_id,
    'team_id',       v_team_id,
    'team_slug',     v_team_slug,
    'owner_user_id', v_owner_id,
    'owner_email',   v_owner_email,
    'was_invited',   p_was_invited,
    'plan_id',       v_plan_id,
    'plan_name',     v_plan_name,
    'status',        v_status,
    'trial_ends_at', v_trial_ends_at,
    'audit_id',      v_audit_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_create_account_with_owner_id(
  text, text, text, uuid, text, text, boolean, text,
  text, text, text, integer, integer, text, text
) TO authenticated;

COMMENT ON FUNCTION public.admin_create_account_with_owner_id(
  text, text, text, uuid, text, text, boolean, text,
  text, text, text, integer, integer, text, text
) IS 'Phase EmailFix-3 D2a: Akzeptiert pre-existing owner_user_id (von '
     'Edge-Function admin-create-account-invite via GoTrue/auth/v1/invite). '
     'Ersetzt das v1 admin_create_user-Sub-Call-Pattern. ADDITIVE: '
     'admin_create_account v1 bleibt parallel für backward-compat.';
