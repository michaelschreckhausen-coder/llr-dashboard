-- ================================================================
-- Leadesk: Auth-Pattern-Lockdown für Admin-RPCs
-- ================================================================
--
-- Ersetzt den Legacy-Check `profiles.role = 'admin'` durch den
-- is_leadesk_admin-JWT-Claim-Check (Pattern aus Phase 1.3b
-- update_account_with_audit). Defense-in-depth: ein Customer-User
-- mit profiles.role='admin' (etwa Team-Owner) kann diese Leadesk-
-- internen RPCs nicht mehr aufrufen, auch nicht via direkter
-- supabase-js-Call.
--
-- 6 RPCs werden CREATE OR REPLACE'd:
--   admin_list_users
--   admin_list_pending_users
--   admin_create_user
--   admin_set_role
--   admin_grant_license
--   admin_delete_user
--
-- BEWUSST NICHT ANGEFASST:
--   upsert_subscription — wird aus Wix/Stripe-Webhooks aufgerufen,
--                         hat eigene Signatur-Verifikation
--
-- Idempotent durch CREATE OR REPLACE. Body bleibt unverändert,
-- nur der Auth-Check oben wird ersetzt.
-- ================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. admin_list_users
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, full_name text, role text, plan_id text, created_at timestamp with time zone, account_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.full_name::text,
    COALESCE(p.role::text, 'user'),
    COALESCE(s.plan_id, 'free')::text,
    u.created_at,
    COALESCE(p.account_status, 'active')::text
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.subscriptions s ON s.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. admin_list_pending_users
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_pending_users()
RETURNS TABLE(id uuid, email text, full_name text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.created_at
  FROM public.profiles p
  WHERE p.account_status = 'pending'
  ORDER BY p.created_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. admin_create_user
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email     text,
  p_password  text,
  p_full_name text DEFAULT '',
  p_role      text DEFAULT 'user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_id  uuid := gen_random_uuid();
  v_enc text;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email already exists: %', p_email;
  END IF;

  v_enc := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated',
    p_email, v_enc,
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name),
    false,
    '', '', '', '',
    now(), now()
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_id, v_id,
    p_email, 'email',
    jsonb_build_object(
      'sub',            v_id::text,
      'email',          p_email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(), now(), now()
  );

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (v_id, p_email, p_full_name, p_role)
  ON CONFLICT (id) DO UPDATE
    SET email = p_email, full_name = p_full_name, role = p_role;

  RETURN jsonb_build_object('id', v_id, 'email', p_email, 'role', p_role);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. admin_set_role
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_role(
  target_user_id uuid,
  new_role       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. admin_grant_license
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_grant_license(
  p_user_id    uuid,
  p_plan_id    text DEFAULT 'starter',
  p_valid_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  UPDATE public.profiles
  SET account_status = 'active', plan_id = p_plan_id,
      plan_expires_at = now() + (p_valid_days || ' days')::interval
  WHERE id = p_user_id;

  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end, updated_at)
  VALUES (p_user_id, p_plan_id, 'active', now() + (p_valid_days || ' days')::interval, now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = p_plan_id, status = 'active',
        current_period_end = now() + (p_valid_days || ' days')::interval,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'plan_id', p_plan_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. admin_delete_user
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

COMMIT;
