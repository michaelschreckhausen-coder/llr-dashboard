-- =============================================================================
-- Phase 2.1: SECURITY-DEFINER-RPCs für leadesk_staff Lifecycle
-- =============================================================================
-- Wird auf BEIDE Stacks angewendet (Prod + Staging).
--
-- Operations:
--   - admin_create_staff()  → INSERT row + audit
--   - admin_disable_staff() → UPDATE is_active=false + audit
--   - admin_enable_staff()  → UPDATE is_active=true + audit
--   - admin_list_staff()    → JOIN mit auth.users für last_sign_in_at
--
-- Auth-Pattern:
--   Functions sind SECURITY DEFINER. Auth-Check via is_leadesk_admin_admin().
--   p_admin_user_id ist explizit weil Edge-Function via service_role kein
--   auth.uid() hat. Default = auth.uid() für direkte Frontend-Calls.
--
-- Audit:
--   target_table='leadesk_staff', target_id=staff.id (uuid).
--   action ∈ {'staff_create','staff_disable','staff_enable'} (snake_case
--   konsistent mit account_create / remove_member / set_global_role).
--
-- Lockout-Protection:
--   admin_disable_staff verhindert Disable des letzten aktiven _admin-Admins.
--   Plus Self-disable verboten.
--
-- Idempotent: CREATE OR REPLACE.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. admin_create_staff
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_create_staff(
  p_user_id          uuid,
  p_email            text,
  p_full_name        text,
  p_reason           text,
  p_admin_user_id    uuid    DEFAULT auth.uid(),
  p_is_admin_admin   boolean DEFAULT true,
  p_is_admin_app     boolean DEFAULT true,
  p_is_admin_staging boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: admin_user_id missing'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_leadesk_admin_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: requires is_leadesk_admin_admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason muss mindestens 10 Zeichen haben'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.leadesk_staff (
    id, email, full_name,
    is_admin_admin, is_admin_app, is_admin_staging,
    is_active, invited_by, invited_at, activated_at
  )
  VALUES (
    p_user_id, lower(p_email), p_full_name,
    p_is_admin_admin, p_is_admin_app, p_is_admin_staging,
    true, p_admin_user_id, now(), now()
  )
  RETURNING id INTO v_staff_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id, after_value, reason
  )
  VALUES (
    p_admin_user_id,
    'staff_create',
    'leadesk_staff',
    v_staff_id,
    jsonb_build_object(
      'email',            lower(p_email),
      'full_name',        p_full_name,
      'is_admin_admin',   p_is_admin_admin,
      'is_admin_app',     p_is_admin_app,
      'is_admin_staging', p_is_admin_staging
    ),
    p_reason
  );

  RETURN jsonb_build_object(
    'success',  true,
    'staff_id', v_staff_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_staff(uuid, text, text, text, uuid, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_staff(uuid, text, text, text, uuid, boolean, boolean, boolean) TO service_role;


-- =============================================================================
-- 2. admin_disable_staff
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_disable_staff(
  p_user_id       uuid,
  p_reason        text,
  p_admin_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before              jsonb;
  v_active_admin_count  int;
  v_target_is_admin     boolean;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: admin_user_id missing'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_leadesk_admin_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: requires is_leadesk_admin_admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = p_admin_user_id THEN
    RAISE EXCEPTION 'Cannot disable your own staff record'
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason muss mindestens 10 Zeichen haben'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    jsonb_build_object('is_active', is_active, 'deactivated_at', deactivated_at),
    (is_active = true AND is_admin_admin = true)
  INTO v_before, v_target_is_admin
  FROM public.leadesk_staff
  WHERE id = p_user_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Staff record not found for user %', p_user_id
      USING ERRCODE = '02000';
  END IF;

  -- Lockout-Protection: nie den letzten aktiven _admin disablen
  IF v_target_is_admin THEN
    SELECT count(*) INTO v_active_admin_count
    FROM public.leadesk_staff
    WHERE is_active = true AND is_admin_admin = true;

    IF v_active_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot disable last active admin-admin (lockout protection)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.leadesk_staff
  SET is_active      = false,
      deactivated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    before_value, after_value, reason
  )
  VALUES (
    p_admin_user_id,
    'staff_disable',
    'leadesk_staff',
    p_user_id,
    v_before,
    jsonb_build_object('is_active', false, 'deactivated_at', now()),
    p_reason
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_disable_staff(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_disable_staff(uuid, text, uuid) TO service_role;


-- =============================================================================
-- 3. admin_enable_staff
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_enable_staff(
  p_user_id       uuid,
  p_reason        text,
  p_admin_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: admin_user_id missing'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_leadesk_admin_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: requires is_leadesk_admin_admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason muss mindestens 10 Zeichen haben'
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object('is_active', is_active, 'deactivated_at', deactivated_at)
  INTO v_before
  FROM public.leadesk_staff
  WHERE id = p_user_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Staff record not found' USING ERRCODE = '02000';
  END IF;

  UPDATE public.leadesk_staff
  SET is_active      = true,
      deactivated_at = NULL
  WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    before_value, after_value, reason
  )
  VALUES (
    p_admin_user_id,
    'staff_enable',
    'leadesk_staff',
    p_user_id,
    v_before,
    jsonb_build_object('is_active', true, 'deactivated_at', NULL),
    p_reason
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_enable_staff(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enable_staff(uuid, text, uuid) TO service_role;


-- =============================================================================
-- 4. admin_list_staff
-- =============================================================================
-- JOIN mit auth.users für last_sign_in_at + email_confirmed_at + invited_by-Email.
-- Auth-Gate via is_leadesk_admin_admin(auth.uid()) — nicht-Admins sehen nur
-- ihre eigene Row über die existierende RLS-Policy auf leadesk_staff.
CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE (
  id                  uuid,
  email               text,
  full_name           text,
  is_admin_admin      boolean,
  is_admin_app        boolean,
  is_admin_staging    boolean,
  is_active           boolean,
  invited_by          uuid,
  invited_by_email    text,
  invited_at          timestamptz,
  activated_at        timestamptz,
  deactivated_at      timestamptz,
  last_sign_in_at     timestamptz,
  email_confirmed_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT
    s.id,
    s.email,
    s.full_name,
    s.is_admin_admin,
    s.is_admin_app,
    s.is_admin_staging,
    s.is_active,
    s.invited_by,
    invu.email AS invited_by_email,
    s.invited_at,
    s.activated_at,
    s.deactivated_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  FROM public.leadesk_staff s
  LEFT JOIN auth.users u    ON u.id    = s.id
  LEFT JOIN auth.users invu ON invu.id = s.invited_by
  WHERE public.is_leadesk_admin_admin(auth.uid())
  ORDER BY s.is_active DESC, s.invited_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated;

COMMIT;

-- =============================================================================
-- Sanity-Check (außerhalb TX, manuell ausführen):
--
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('admin_create_staff','admin_disable_staff',
--                   'admin_enable_staff','admin_list_staff')
-- ORDER BY proname;
--
-- → Erwartung: 4 rows, alle mit erwarteten Argument-Listen.
-- =============================================================================
