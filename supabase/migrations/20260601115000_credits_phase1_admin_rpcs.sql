-- Credits Phase 1 — Admin-RPCs für leadesk-admin
-- ─────────────────────────────────────────────────────────────────
-- Zwei SECURITY-DEFINER RPCs für Admin-Override (Sprint F):
--
--   admin_get_credit_budget(p_account_id) → jsonb
--     Vollständiges Budget eines Account-IDs (für Admin-Display).
--     Identisch zu get_my_credit_budget aber mit explizitem account_id + JWT-admin-check.
--
--   admin_grant_credit_topup(p_account_id, p_amount, p_reason, p_type, p_expires_at) → uuid
--     Inseriert credit_topup-Row als admin-Override (z.B. Kulanz-Credits).
--     Schreibt Audit-Entry in admin_audit_log (gleiches Pattern wie update_account_with_audit).
--     Type-Whitelist matched credit_topups CHECK-Constraint.
--
-- Authority: auth.uid() != NULL + is_leadesk_admin-Claim (siehe CLAUDE.md
-- Top-Fallstrick #9). GRANT EXECUTE für authenticated (Body checked Admin).
-- REVOKE für anon.

BEGIN;

-- ── admin_get_credit_budget ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_credit_budget(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_credits integer;
  v_plan_slug text;
  v_plan_name text;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := (date_trunc('month', now()) + interval '1 month') - interval '1 microsecond';
  v_used_this_period numeric;
  v_used_today numeric;
  v_topup_remaining numeric;
  v_topup_count int;
  v_daily_cap numeric;
  v_plan_remaining numeric;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

  IF p_account_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_account_id');
  END IF;

  SELECT a.plan_id, p.credits_quota, p.slug, p.name
    INTO v_plan_id, v_plan_credits, v_plan_slug, v_plan_name
    FROM public.accounts a
    LEFT JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = p_account_id;

  SELECT COALESCE(SUM(credits), 0) INTO v_used_this_period
    FROM public.credit_usage
    WHERE account_id = p_account_id
      AND created_at >= v_period_start
      AND status = 'success';

  SELECT COALESCE(SUM(credits), 0) INTO v_used_today
    FROM public.credit_usage
    WHERE account_id = p_account_id
      AND created_at >= date_trunc('day', now())
      AND status = 'success';

  SELECT COALESCE(SUM(amount_remaining), 0), COUNT(*)
    INTO v_topup_remaining, v_topup_count
    FROM public.credit_topups
    WHERE account_id = p_account_id
      AND type = 'credits'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now());

  v_plan_remaining := GREATEST(0, COALESCE(v_plan_credits, 0) - v_used_this_period);
  v_daily_cap := COALESCE(v_plan_credits, 0) * 0.25;

  RETURN jsonb_build_object(
    'account_id', p_account_id,
    'plan_id', v_plan_id,
    'plan_slug', v_plan_slug,
    'plan_name', v_plan_name,
    'plan_credits', v_plan_credits,
    'used_this_period', v_used_this_period,
    'plan_remaining', v_plan_remaining,
    'topup_remaining', v_topup_remaining,
    'active_topups_count', v_topup_count,
    'total_remaining', v_plan_remaining + v_topup_remaining,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'used_today', v_used_today,
    'daily_cap', v_daily_cap,
    'daily_remaining', GREATEST(0, v_daily_cap - v_used_today)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_get_credit_budget(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_credit_budget(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_credit_budget(uuid) FROM anon;

-- ── admin_grant_credit_topup ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_grant_credit_topup(
  p_account_id uuid,
  p_amount numeric,
  p_reason text,
  p_type text DEFAULT 'credits',
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_topup_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF p_type NOT IN ('credits','storage_gb','crm_companies','crm_contacts') THEN
    RAISE EXCEPTION 'Invalid type: %', p_type USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.credit_topups (
    account_id, purchased_by_user_id,
    type, amount, amount_remaining,
    price_eur, status, is_recurring,
    expires_at
  ) VALUES (
    p_account_id, v_admin_id,
    p_type, p_amount, p_amount,
    0, 'active', false,
    p_expires_at
  ) RETURNING id INTO v_topup_id;

  -- Audit-Eintrag (gleiches Pattern wie update_account_with_audit)
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id, field_name,
    before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'credit_topups.grant', 'credit_topups', v_topup_id, 'amount',
    NULL,
    jsonb_build_object(
      'account_id', p_account_id,
      'type', p_type,
      'amount', p_amount,
      'expires_at', p_expires_at
    ),
    p_reason
  );

  RETURN v_topup_id;
END;
$$;

COMMENT ON FUNCTION public.admin_grant_credit_topup IS
  'Sprint F: Admin-Override für Credit-/Storage-/CRM-Top-Ups (z.B. Kulanz-Credits).
   Schreibt credit_topups-Row + Audit-Entry. Type-Whitelist matched CHECK-Constraint.
   purchased_by_user_id wird auf den Admin gesetzt (für Audit-Trail).';

REVOKE ALL    ON FUNCTION public.admin_grant_credit_topup(uuid, numeric, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_credit_topup(uuid, numeric, text, text, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_grant_credit_topup(uuid, numeric, text, text, timestamptz) FROM anon;

-- Verifikation
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname IN ('admin_get_credit_budget','admin_grant_credit_topup')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Migration FAILED: expected 2 RPCs, got %', v_count;
  END IF;
  RAISE NOTICE 'Migration OK: 2 admin-RPCs installed';
END $$;

COMMIT;
