-- ════════════════════════════════════════════════════════════════
-- Phase EmailFix-3 D2b — Helper-RPCs für Edge-Function
--
-- 1. is_leadesk_admin() — extrahiert das inline-Pattern aus v1-Funktionen
--    in eine reusable function. Wird vom Edge-Function-Code via
--    callerClient.rpc('is_leadesk_admin') gerufen für Admin-Check.
--
-- 2. admin_lookup_user_by_email(p_email) — User-ID-Lookup für die
--    Existing-User-Path im admin-create-account-invite Flow.
--
-- ════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. is_leadesk_admin() — Admin-Claim-Check als reusable RPC
-- ============================================================
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

GRANT EXECUTE ON FUNCTION public.is_leadesk_admin() TO authenticated;

COMMENT ON FUNCTION public.is_leadesk_admin() IS
  'Phase EmailFix-3 D2b: Reusable Admin-Claim-Check. Liest '
  'auth.jwt()->>app_metadata->>is_leadesk_admin und coalesces zu false. '
  'Für Edge-Function (callerClient.rpc) und Inline-RPC-Use.';

-- ============================================================
-- 2. admin_lookup_user_by_email — User-ID-Lookup (admin-only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_lookup_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_leadesk_admin() THEN
    RAISE EXCEPTION 'Unauthorized: requires is_leadesk_admin claim'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  RETURN v_user_id;  -- NULL if not found
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_lookup_user_by_email(text) TO authenticated;

COMMENT ON FUNCTION public.admin_lookup_user_by_email(text) IS
  'Phase EmailFix-3 D2b helper: Lookup user_id by email for '
  'admin-create-account-invite Edge-Function. Admin-only via '
  'SECURITY DEFINER + is_leadesk_admin gate.';
