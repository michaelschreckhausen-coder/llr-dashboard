-- =============================================================================
-- admin_lookup_user_by_email — Auth-Gate erweitert um service_role
-- =============================================================================
-- Bug-Context: admin-invite-staff Edge-Function ruft die RPC via
-- adminClient (service-role-Client) für Cross-Env-Lookup (Prod + Staging).
-- Original-Body (EmailFix-3 Phase) hatte strict Auth-Gate `is_leadesk_admin()`
-- der nur User-JWTs mit app_metadata.is_leadesk_admin=true akzeptiert —
-- service-role-JWTs haben das nicht → 42501.
--
-- Fix: zusätzlich auth.role() = 'service_role' akzeptieren.
-- Backward-compat: admin-create-account-invite + frontend callerClient
-- weiterhin OK (User-JWT-Path passt is_leadesk_admin()).
--
-- Plus: Beide Functions auf Staging deployed (existieren dort bisher nicht).
-- Auf Prod: CREATE OR REPLACE = idempotent overwrite (gleicher Body für
-- is_leadesk_admin, erweiterter Body für admin_lookup_user_by_email).
-- =============================================================================

BEGIN;

-- ── 1. is_leadesk_admin() — JWT-claim-Check (no-args reusable helper) ────────
-- Existiert auf Prod schon (EmailFix-3 Phase). Auf Staging neu.
CREATE OR REPLACE FUNCTION public.is_leadesk_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean,
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_leadesk_admin() TO authenticated, service_role;

-- ── 2. admin_lookup_user_by_email — User-ID-Lookup ────────────────────────────
-- Erweiterung gegenüber EmailFix-3: auch service_role-Caller akzeptieren.
CREATE OR REPLACE FUNCTION public.admin_lookup_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT (public.is_leadesk_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: requires is_leadesk_admin claim or service_role'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  RETURN v_user_id;  -- NULL if not found
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_lookup_user_by_email(text) TO authenticated, service_role;

COMMIT;
