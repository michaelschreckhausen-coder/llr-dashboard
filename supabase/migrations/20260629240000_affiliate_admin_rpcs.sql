-- 20260629240000_affiliate_admin_rpcs.sql
-- Affiliate-System Phase 7 — Admin-Surfaces-Backend (admin.leadesk.de).
-- 6 RPCs, alle is_leadesk_admin-gated (CLAUDE.md #9), SECURITY DEFINER.
-- Write-RPCs: Reason ≥10 (Pattern admin_revoke_account_addon) + admin_audit_log.
-- admin_set_affiliate_commission_rate existiert schon (Phase 1) → hier NICHT neu.
-- Idempotent (CREATE OR REPLACE). Read-RPCs exponieren Customer-Email (Admin darf,
-- im Gegensatz zum Affiliate-Dashboard das anonymisiert).

BEGIN;

-- Helper-Makro inline: is_leadesk_admin-Check als Bedingung wiederholt.

-- 1. admin_create_affiliate → status='pending'
CREATE OR REPLACE FUNCTION public.admin_create_affiliate(
  p_user_id uuid, p_code text, p_commission_rate_bps int, p_reason text
) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_id    uuid;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)';
  END IF;
  IF p_code IS NULL OR NOT (p_code ~ '^[a-z0-9-]{3,}$') THEN
    RAISE EXCEPTION 'Code ungültig (nur a-z, 0-9, -, min 3 Zeichen)';
  END IF;
  IF p_commission_rate_bps IS NULL OR p_commission_rate_bps < 0 OR p_commission_rate_bps > 10000 THEN
    RAISE EXCEPTION 'rate_bps must be 0..10000';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE code = p_code) THEN
    RAISE EXCEPTION 'code % already taken', p_code;
  END IF;

  INSERT INTO public.affiliates (user_id, code, status, commission_rate_bps)
  VALUES (p_user_id, p_code, 'pending', p_commission_rate_bps)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_created', 'affiliates', v_id, 'status',
          jsonb_build_object('status', null),
          jsonb_build_object('status', 'pending', 'code', p_code, 'commission_rate_bps', p_commission_rate_bps, 'user_id', p_user_id),
          p_reason);
  RETURN v_id;
END;
$function$;

-- 2/3/4. Status-Transitions (approve / suspend / reactivate) — gemeinsames Muster.
CREATE OR REPLACE FUNCTION public.admin_approve_affiliate(p_affiliate_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_admin uuid := auth.uid(); v_old text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;

  SELECT status INTO v_old FROM public.affiliates WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate % not found', p_affiliate_id; END IF;
  IF v_old NOT IN ('pending', 'suspended') THEN
    RAISE EXCEPTION 'approve nur aus pending/suspended (aktuell: %)', v_old; END IF;

  UPDATE public.affiliates SET status = 'active', approved_at = now(), approved_by = v_admin WHERE id = p_affiliate_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_approved', 'affiliates', p_affiliate_id, 'status',
          jsonb_build_object('status', v_old), jsonb_build_object('status', 'active'), p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_suspend_affiliate(p_affiliate_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_admin uuid := auth.uid(); v_old text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;

  SELECT status INTO v_old FROM public.affiliates WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate % not found', p_affiliate_id; END IF;
  IF v_old = 'closed' THEN RAISE EXCEPTION 'closed affiliate kann nicht suspended werden'; END IF;

  UPDATE public.affiliates SET status = 'suspended' WHERE id = p_affiliate_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_suspended', 'affiliates', p_affiliate_id, 'status',
          jsonb_build_object('status', v_old), jsonb_build_object('status', 'suspended'), p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_affiliate(p_affiliate_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_admin uuid := auth.uid(); v_old text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;

  SELECT status INTO v_old FROM public.affiliates WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate % not found', p_affiliate_id; END IF;
  IF v_old <> 'suspended' THEN RAISE EXCEPTION 'reactivate nur aus suspended (aktuell: %)', v_old; END IF;

  UPDATE public.affiliates SET status = 'active' WHERE id = p_affiliate_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_reactivated', 'affiliates', p_affiliate_id, 'status',
          jsonb_build_object('status', v_old), jsonb_build_object('status', 'active'), p_reason);
END;
$function$;

-- 5. admin_get_affiliates — Liste + Email + Live-Stats
CREATE OR REPLACE FUNCTION public.admin_get_affiliates(
  p_status text DEFAULT NULL, p_search text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  id uuid, code text, status text, owner_email text, owner_user_id uuid,
  commission_rate_bps int, stripe_connect_payouts_enabled boolean,
  total_clicks bigint, total_conversions bigint, total_earnings_cents bigint,
  created_at timestamptz, approved_at timestamptz
)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;

  RETURN QUERY
  SELECT a.id, a.code, a.status, u.email::text, a.user_id,
         a.commission_rate_bps, a.stripe_connect_payouts_enabled,
         (SELECT count(*) FROM public.affiliate_clicks c WHERE c.affiliate_id = a.id),
         (SELECT count(*) FROM public.affiliate_conversions cv WHERE cv.affiliate_id = a.id AND cv.status <> 'rejected_self_referral'),
         COALESCE((SELECT sum(e.commission_amount_cents) FROM public.affiliate_commission_events e
                   WHERE e.affiliate_id = a.id AND e.status IN ('pending','paid')), 0)::bigint,
         a.created_at, a.approved_at
  FROM public.affiliates a
  LEFT JOIN auth.users u ON u.id = a.user_id
  WHERE (p_status IS NULL OR a.status = p_status)
    AND (p_search IS NULL OR a.code ILIKE '%'||p_search||'%' OR u.email ILIKE '%'||p_search||'%')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

-- 6. admin_get_affiliate_conversions_list — Cross-Affiliate + Customer-Email (Admin darf)
CREATE OR REPLACE FUNCTION public.admin_get_affiliate_conversions_list(
  p_affiliate_id uuid DEFAULT NULL, p_status text DEFAULT NULL, p_limit int DEFAULT 100
) RETURNS TABLE(
  id uuid, affiliate_id uuid, affiliate_code text, customer_email text,
  signup_at timestamptz, first_paid_at timestamptz, status text,
  commission_rate_bps_snapshot int, commission_end_at timestamptz
)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;

  RETURN QUERY
  SELECT cv.id, cv.affiliate_id, a.code, u.email::text,
         cv.signup_at, cv.first_paid_at, cv.status,
         cv.commission_rate_bps_snapshot, cv.commission_end_at
  FROM public.affiliate_conversions cv
  JOIN public.affiliates a ON a.id = cv.affiliate_id
  LEFT JOIN auth.users u ON u.id = cv.user_id
  WHERE (p_affiliate_id IS NULL OR cv.affiliate_id = p_affiliate_id)
    AND (p_status IS NULL OR cv.status = p_status)
  ORDER BY cv.signup_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_affiliate(uuid, text, int, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_approve_affiliate(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_suspend_affiliate(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_reactivate_affiliate(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_get_affiliates(text, text, int, int) FROM public;
REVOKE ALL ON FUNCTION public.admin_get_affiliate_conversions_list(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_affiliate(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_affiliate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_affiliate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_affiliate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliates(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliate_conversions_list(uuid, text, int) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
