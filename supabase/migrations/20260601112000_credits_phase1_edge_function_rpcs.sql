-- Credits Phase 1 — Edge-Function-RPCs (service_role-callable Varianten)
-- ─────────────────────────────────────────────────────────────────
-- Edge-Functions laufen als service_role (auth.uid() = NULL). Die
-- existierenden Sprint-C-RPCs (get_my_credit_budget, check_credits)
-- sind aber auth.uid()-scoped. Hier liefern wir die service_role-Pendants:
--
--   get_active_account_id_for_user(p_user_id) → uuid
--   check_credits_for_account(p_account_id, p_estimated) → jsonb
--
-- Authority: GRANT nur service_role + postgres. KEIN authenticated-GRANT
-- (sonst kann User foreign account_id einreichen → Auth-Hole).

BEGIN;

-- ── get_active_account_id_for_user ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_account_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_active_team_id uuid;
  v_account_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT active_team_id INTO v_active_team_id
    FROM public.user_preferences
    WHERE user_id = p_user_id
    LIMIT 1;

  IF v_active_team_id IS NOT NULL THEN
    SELECT account_id INTO v_account_id
      FROM public.teams
      WHERE id = v_active_team_id
      LIMIT 1;
    IF v_account_id IS NOT NULL THEN
      RETURN v_account_id;
    END IF;
  END IF;

  SELECT t.account_id INTO v_account_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = p_user_id
    LIMIT 1;

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_account_id_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_account_id_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_account_id_for_user(uuid) TO postgres;

-- ── check_credits_for_account ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_credits_for_account(
  p_account_id uuid,
  p_estimated_credits numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_credits integer;
  v_period_start timestamptz := date_trunc('month', now());
  v_used_this_period numeric;
  v_used_today numeric;
  v_topup_remaining numeric;
  v_plan_remaining numeric;
  v_total_remaining numeric;
  v_daily_cap numeric;
  v_daily_remaining numeric;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_account');
  END IF;

  SELECT a.plan_id, p.credits_quota
    INTO v_plan_id, v_plan_credits
    FROM public.accounts a
    LEFT JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = p_account_id;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_plan');
  END IF;

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

  SELECT COALESCE(SUM(amount_remaining), 0) INTO v_topup_remaining
    FROM public.credit_topups
    WHERE account_id = p_account_id
      AND type = 'credits'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now());

  v_plan_remaining := GREATEST(0, COALESCE(v_plan_credits, 0) - v_used_this_period);
  v_total_remaining := v_plan_remaining + v_topup_remaining;
  v_daily_cap := COALESCE(v_plan_credits, 0) * 0.25;
  v_daily_remaining := GREATEST(0, v_daily_cap - v_used_today);

  IF p_estimated_credits > v_total_remaining THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_budget_exceeded',
      'remaining', v_total_remaining,
      'estimated', p_estimated_credits
    );
  END IF;

  IF v_daily_cap > 0 AND p_estimated_credits > v_daily_remaining THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_cap_exceeded',
      'remaining', v_total_remaining,
      'daily_remaining', v_daily_remaining,
      'estimated', p_estimated_credits,
      'daily_cap', v_daily_cap
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_total_remaining,
    'daily_remaining', v_daily_remaining,
    'daily_cap', v_daily_cap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_credits_for_account(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_credits_for_account(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_credits_for_account(uuid, numeric) TO postgres;

-- Verifikation
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname IN ('get_active_account_id_for_user','check_credits_for_account')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Migration FAILED: expected 2 RPCs, got %', v_count;
  END IF;
  RAISE NOTICE 'Migration OK: 2 service-role-RPCs installed';
END $$;

COMMIT;
