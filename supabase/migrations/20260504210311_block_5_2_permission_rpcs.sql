-- Block 5.2: Permission-System RPC-Layer
--
-- Decisions (Block-5.2-Discovery, finalized by Michael):
--   Q1=A: Hardcoded Allowlist in Function-Body (sync mit Frontend
--         PERMISSIONS_REGISTRY per Convention)
--   Q2=B: Plan-ID-Konstante fuer Enterprise-Detection
--         (c4c11445-9f97-409a-bfd3-9c9f873c049b)
--   Q3=A: admin_unarchive_plan jetzt mitbauen
--   Q4=A: text[] fuer p_permissions, <@ Subset-Operator fuer Allowlist
--   Q5=DEFINER + Self-Check: is_permitted ist SECURITY DEFINER mit
--         zusaetzlichem Membership-Check (Sec-Defense gegen Cross-Account-
--         Probing)
--   Q6=B: get_my_entitlements ALTER (additiv permissions + is_enterprise),
--         KEIN separates get_my_permissions
--
-- Lehren aus Block 5.1 angewendet:
--   - Schema-Drift Staging vs Prod gepruft (5 Tabellen)
--   - Idempotenz via DROP CONSTRAINT IF EXISTS / IF NOT EXISTS
--   - plans.updated_at NICHT verwendet (Prod hat sie nicht)
--
-- Pattern matched admin_grant_license_v2 + admin_reset_member_password:
--   - SECURITY DEFINER, search_path mit extensions
--   - JWT-Claim is_leadesk_admin Auth-Gate fuer admin-RPCs
--   - Reason-Min 10 chars (matches admin_audit_log_reason_check)
--   - Audit-Pattern: jsonb-Werte in before_value/after_value

BEGIN;

-- ============================================================
-- 1. is_permitted (RLS-Helper, DEFINER + Self-Check)
-- ============================================================
-- Q5: SECURITY DEFINER ist noetig, sonst blockt accounts-RLS
-- (accounts_owner_select) den Lookup fuer non-owner-team-members.
-- Self-Check: caller muss Member von p_account_id sein ODER is_leadesk_admin.
-- Verhindert Cross-Account-Probing (Sec-Defense).
--
-- Q2: Enterprise-Override per Plan-ID-Konstante (c4c11445-...) — stable
-- gegen Plan-Umbenennungen via admin_create_plan.
--
-- Performance: GIN-Index plans_permissions_gin_idx greift auf @> Operator.
CREATE OR REPLACE FUNCTION public.is_permitted(
  p_permission_key text,
  p_account_id     uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = p_account_id
      AND NOT p.archived
      AND (
        p.permissions @> jsonb_build_array(p_permission_key)
        OR p.id = 'c4c11445-9f97-409a-bfd3-9c9f873c049b'::uuid  -- Enterprise-Override
      )
      -- Self-Check (Q5): caller muss Member oder is_leadesk_admin sein
      AND (
        COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false)
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          JOIN public.teams t ON t.id = tm.team_id
          WHERE tm.user_id = auth.uid()
            AND t.account_id = a.id
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_permitted(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_permitted IS
  'Phase 5 Block 5.2: RLS-Helper. Returns true wenn (a) Plan des Accounts hat Permission ODER Plan ist Enterprise-Override, UND (b) caller ist Member des Accounts ODER is_leadesk_admin. Self-Check verhindert Cross-Account-Probing.';

-- ============================================================
-- 2. get_my_entitlements ALTER (additiv: permissions + is_enterprise)
-- ============================================================
-- Q6=B: existing 12 Keys bleiben unveraendert (Backwards-Compat fuer
-- Block-3.6-EntitlementsProvider + 6 Caller-Files), additiv um:
--   - permissions: jsonb-Array (raw plans.permissions)
--   - is_enterprise: boolean (Plan-ID-Konstante-Check)
-- Beide Branches (plan-not-found/inactive vs active) erweitert.
CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_account_id uuid;
  v_plan       record;
  v_account    record;
  v_is_active  boolean;
  v_days_left  integer;
  v_is_ent     boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Account des Users über aktives Team finden.
  SELECT t.account_id INTO v_account_id
  FROM teams t
  JOIN team_members tm ON tm.team_id = t.id
  LEFT JOIN user_preferences up ON up.user_id = v_user_id
  WHERE tm.user_id = v_user_id
    AND t.account_id IS NOT NULL
    AND (up.active_team_id IS NULL OR up.active_team_id = t.id)
  ORDER BY (up.active_team_id = t.id) DESC NULLS LAST,
           t.created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.id, a.plan_id, a.status, a.trial_ends_at, a.seat_limit,
         a.plan_expires_at, a.granted_via, a.plan_managed_by
    INTO v_account
  FROM accounts a
  WHERE a.id = v_account_id;

  IF v_account IS NULL THEN
    RETURN NULL;
  END IF;

  -- Plan-Lookup erweitert um permissions (Block 5.2 Q6=B)
  SELECT p.id, p.name, p.modules, p.is_trial, p.trial_days, p.is_active, p.permissions
    INTO v_plan
  FROM plans p
  WHERE p.id = v_account.plan_id;

  -- Enterprise-Check via Plan-ID-Konstante (Q2)
  v_is_ent := (v_account.plan_id = 'c4c11445-9f97-409a-bfd3-9c9f873c049b'::uuid);

  -- Falls Plan unauffindbar oder deaktiviert: leeres Permission-Set,
  -- aber neue Felder trotzdem mitgeben
  IF v_plan IS NULL OR v_plan.is_active = false THEN
    RETURN jsonb_build_object(
      'account_id',      v_account.id,
      'plan_id',         v_account.plan_id,
      'plan_name',       NULL,
      'modules',         '[]'::jsonb,
      'is_trial',        (v_account.status = 'trialing'),
      'trial_ends_at',   v_account.trial_ends_at,
      'trial_days_left', NULL,
      'account_status',  v_account.status,
      'is_active',       false,
      'plan_expires_at', v_account.plan_expires_at,
      'granted_via',     v_account.granted_via,
      'plan_managed_by', v_account.plan_managed_by,
      -- Block 5.2 neu (Q6=B):
      'permissions',     '[]'::jsonb,
      'is_enterprise',   v_is_ent
    );
  END IF;

  v_is_active := v_account.status IN ('trialing','active')
    AND (
      v_account.status <> 'trialing'
      OR v_account.trial_ends_at IS NULL
      OR v_account.trial_ends_at > now()
    );

  v_days_left := CASE
    WHEN v_account.trial_ends_at IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(DAY FROM v_account.trial_ends_at - now())::integer)
  END;

  RETURN jsonb_build_object(
    'account_id',      v_account.id,
    'plan_id',         v_plan.id,
    'plan_name',       v_plan.name,
    'modules',         to_jsonb(v_plan.modules),
    'is_trial',        v_plan.is_trial OR v_account.status = 'trialing',
    'trial_ends_at',   v_account.trial_ends_at,
    'trial_days_left', v_days_left,
    'account_status',  v_account.status,
    'is_active',       v_is_active,
    'plan_expires_at', v_account.plan_expires_at,
    'granted_via',     v_account.granted_via,
    'plan_managed_by', v_account.plan_managed_by,
    -- Block 5.2 neu (Q6=B):
    'permissions',     COALESCE(v_plan.permissions, '[]'::jsonb),
    'is_enterprise',   v_is_ent
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_entitlements IS
  'Phase 5 Block 5.2 (additiv): erweitert um permissions (jsonb-Array) + is_enterprise (boolean). Existing 12 Keys (account_id, plan_id, plan_name, modules, is_trial, trial_ends_at, trial_days_left, account_status, is_active, plan_expires_at, granted_via, plan_managed_by) unveraendert fuer Backwards-Compat (Block-3.6-EntitlementsProvider).';

-- ============================================================
-- 3. admin_update_plan_permissions (Editor-Save)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_plan_permissions(
  p_plan_id     uuid,
  p_permissions text[],
  p_reason      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_user_id    uuid;
  v_old_permissions  jsonb;
  v_plan_name        text;
  v_invalid_keys     text[];
  v_stripe_managed   boolean;
  v_audit_id         uuid;
  -- Allowlist (Q1=A, sync mit src/lib/permissions.js PERMISSIONS_REGISTRY).
  -- Bei Permission-Adds: Migration + Frontend-Edit gemeinsam.
  v_allowlist text[] := ARRAY[
    'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
    'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
    'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
    'content.studio','content.calendar',
    'delivery.projects','delivery.time_tracking',
    'reports.sales','reports.ssi',
    'core.integrations','core.team_management','core.whitelabel','core.multi_account',
    'assistant.basic'
  ];
BEGIN
  -- Auth-Gate
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;
  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Reason-Validation (matches admin_audit_log_reason_check)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- Plan-Existenz
  SELECT permissions, name INTO v_old_permissions, v_plan_name
  FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % not found', p_plan_id USING ERRCODE = 'P0002';
  END IF;

  -- Permission-Allowlist-Check (Q4=A: <@ Subset-Operator)
  IF NOT (p_permissions <@ v_allowlist) THEN
    SELECT array_agg(k) INTO v_invalid_keys
    FROM unnest(p_permissions) k
    WHERE NOT (k = ANY(v_allowlist));
    RAISE EXCEPTION 'Invalid permission keys: %', v_invalid_keys
      USING ERRCODE = '22023';
  END IF;

  -- Stripe-Managed-Plan-Detection (gilt wenn IRGENDEIN Account auf diesem Plan stripe-managed ist)
  SELECT EXISTS (
    SELECT 1 FROM public.accounts WHERE plan_id = p_plan_id AND plan_managed_by = 'stripe'
  ) INTO v_stripe_managed;

  -- Update + Audit
  UPDATE public.plans
  SET permissions = array_to_json(p_permissions)::jsonb
  WHERE id = p_plan_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id, field_name,
    before_value, after_value, reason
  ) VALUES (
    v_admin_user_id, 'plan_permissions_update', 'plans', p_plan_id, 'permissions',
    v_old_permissions,
    jsonb_build_object(
      'permissions', array_to_json(p_permissions)::jsonb,
      'plan_name', v_plan_name,
      'stripe_managed_plan_edited', v_stripe_managed
    ),
    p_reason
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'plan_name', v_plan_name,
    'permission_count', array_length(p_permissions, 1),
    'stripe_managed_plan_edited', v_stripe_managed,
    'audit_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_plan_permissions(uuid, text[], text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_plan_permissions(uuid, text[], text) FROM anon;

COMMENT ON FUNCTION public.admin_update_plan_permissions IS
  'Phase 5 Block 5.2: Plan-Editor-Save. Auth-Gate is_leadesk_admin. Allowlist hardcoded (sync mit Frontend PERMISSIONS_REGISTRY). Audit mit before/after-jsonb + stripe_managed_plan_edited-Flag.';

-- ============================================================
-- 4. admin_create_plan (NEW Plan)
-- ============================================================
-- NOTE: p_stripe_price_id absichtlich NICHT als Param — Schema-Drift Staging
-- vs Prod (Staging hat keine stripe_price_id-Spalte). Stripe-Pricing-Pflege
-- ist Block-5.5-Scope (Plan-Editor) plus Phase-4-Schema-Harmonisierung.
--
-- Idempotenz: Drop alte 7-arg-Signatur falls Migration schon mal mit
-- stripe_price_id-Param applied (z.B. erster Apply-Versuch auf Staging).
DROP FUNCTION IF EXISTS public.admin_create_plan(text, text, integer, integer, text[], text, text);

CREATE OR REPLACE FUNCTION public.admin_create_plan(
  p_name             text,
  p_slug             text,
  p_price_monthly    integer,
  p_price_yearly     integer,
  p_permissions      text[],
  p_reason           text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_user_id uuid;
  v_new_plan_id   uuid;
  v_audit_id      uuid;
  v_allowlist text[] := ARRAY[
    'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
    'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
    'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
    'content.studio','content.calendar',
    'delivery.projects','delivery.time_tracking',
    'reports.sales','reports.ssi',
    'core.integrations','core.team_management','core.whitelabel','core.multi_account',
    'assistant.basic'
  ];
BEGIN
  -- Auth-Gate
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;
  v_admin_user_id := auth.uid();

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name required' USING ERRCODE = '22023';
  END IF;

  -- Enterprise-Name-Block (Sales-Garantie: nur 1 Enterprise-Plan via fixer ID)
  IF lower(trim(p_name)) = 'enterprise' THEN
    RAISE EXCEPTION 'Plan name "Enterprise" is reserved' USING ERRCODE = '22023';
  END IF;

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Slug required' USING ERRCODE = '22023';
  END IF;

  -- Slug-Unique-Check
  IF EXISTS (SELECT 1 FROM public.plans WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'Plan with slug "%" already exists', p_slug USING ERRCODE = '23505';
  END IF;

  -- Permission-Allowlist
  IF p_permissions IS NULL OR NOT (p_permissions <@ v_allowlist) THEN
    RAISE EXCEPTION 'Invalid or missing permissions' USING ERRCODE = '22023';
  END IF;

  -- INSERT mit Common-Pflicht-cols (Schema-Drift-aware: Staging vs Prod
  -- haben unterschiedliche Spalten-Sets, gemeinsame NOT-NULL-Pflicht-cols
  -- werden gesetzt, optional-cols bleiben NULL)
  v_new_plan_id := gen_random_uuid();

  INSERT INTO public.plans (
    id, name, slug, modules,
    is_active, is_trial, is_default_trial,
    permissions, archived,
    price_monthly, price_yearly
  ) VALUES (
    v_new_plan_id, trim(p_name), trim(p_slug),
    ARRAY['branding','crm','linkedin','content','delivery','reports']::text[],
    true, false, false,
    array_to_json(p_permissions)::jsonb, false,
    p_price_monthly, p_price_yearly
  );

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    before_value, after_value, reason
  ) VALUES (
    v_admin_user_id, 'plan_create', 'plans', v_new_plan_id,
    NULL,
    jsonb_build_object(
      'plan_id', v_new_plan_id,
      'name', trim(p_name),
      'slug', trim(p_slug),
      'price_monthly', p_price_monthly,
      'price_yearly', p_price_yearly,
      'permissions', array_to_json(p_permissions)::jsonb
    ),
    p_reason
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_new_plan_id,
    'audit_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_plan(text, text, integer, integer, text[], text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_plan(text, text, integer, integer, text[], text) FROM anon;

COMMENT ON FUNCTION public.admin_create_plan IS
  'Phase 5 Block 5.2: Neuer Plan via Admin. Auth-Gate is_leadesk_admin, slug-unique, name-Enterprise-blocked, permissions-allowlist.';

-- ============================================================
-- 5. admin_archive_plan (Soft-Delete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_archive_plan(
  p_plan_id uuid,
  p_reason  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_user_id uuid;
  v_plan_name     text;
  v_was_archived  boolean;
  v_audit_id      uuid;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;
  v_admin_user_id := auth.uid();

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  -- Plan-Existenz + Enterprise-Block
  SELECT name, archived INTO v_plan_name, v_was_archived
  FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % not found', p_plan_id USING ERRCODE = 'P0002';
  END IF;

  IF p_plan_id = 'c4c11445-9f97-409a-bfd3-9c9f873c049b'::uuid THEN
    RAISE EXCEPTION 'Enterprise plan is reserved and cannot be archived'
      USING ERRCODE = '22023';
  END IF;

  -- Soft-Delete
  UPDATE public.plans SET archived = true WHERE id = p_plan_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id, field_name,
    before_value, after_value, reason
  ) VALUES (
    v_admin_user_id, 'plan_archive', 'plans', p_plan_id, 'archived',
    jsonb_build_object('archived', v_was_archived),
    jsonb_build_object('archived', true, 'plan_name', v_plan_name),
    p_reason
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'plan_name', v_plan_name,
    'was_archived', v_was_archived,
    'audit_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_archive_plan(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_archive_plan(uuid, text) FROM anon;

COMMENT ON FUNCTION public.admin_archive_plan IS
  'Phase 5 Block 5.2: Soft-Delete eines Plans. Existing Account-Zuweisungen bleiben, neue Sales sind unmoeglich (Frontend filtert archived=true raus). Enterprise-Plan ist reserviert.';

-- ============================================================
-- 6. admin_unarchive_plan (Restore)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_unarchive_plan(
  p_plan_id uuid,
  p_reason  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_user_id uuid;
  v_plan_name     text;
  v_was_archived  boolean;
  v_audit_id      uuid;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;
  v_admin_user_id := auth.uid();

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT name, archived INTO v_plan_name, v_was_archived
  FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % not found', p_plan_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.plans SET archived = false WHERE id = p_plan_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id, field_name,
    before_value, after_value, reason
  ) VALUES (
    v_admin_user_id, 'plan_unarchive', 'plans', p_plan_id, 'archived',
    jsonb_build_object('archived', v_was_archived),
    jsonb_build_object('archived', false, 'plan_name', v_plan_name),
    p_reason
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'plan_name', v_plan_name,
    'was_archived', v_was_archived,
    'audit_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unarchive_plan(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unarchive_plan(uuid, text) FROM anon;

COMMENT ON FUNCTION public.admin_unarchive_plan IS
  'Phase 5 Block 5.2: Restore eines archivierten Plans. Pendant zu admin_archive_plan.';

COMMIT;

-- PostgREST Schema-Cache reload
NOTIFY pgrst, 'reload schema';
