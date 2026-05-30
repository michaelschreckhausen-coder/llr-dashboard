-- Credits Phase 1 — Budget-RPCs (get_my_active_account_id, get_my_credit_budget, check_credits)
-- ─────────────────────────────────────────────────────────────────
-- 3 SECURITY DEFINER RPCs für den Credits-Verbrauchspfad:
--
--   get_my_active_account_id() → uuid
--     Resolved auth.uid() über user_preferences.active_team_id → teams.account_id.
--     Fallback auf erstes team_membership wenn keine active_team_id gesetzt.
--
--   get_my_credit_budget() → jsonb
--     {plan_id, plan_credits, used_this_period, plan_remaining, topup_remaining,
--      total_remaining, period_start, period_end, used_today, daily_cap,
--      daily_remaining}
--     Period = Kalendermonat (date_trunc('month', now())).
--     Daily-Cap = 25% des Plan-Credits-Quotas.
--     Top-Ups (type='credits', status='active', nicht expired) summieren on-top.
--
--   check_credits(p_estimated_credits) → jsonb
--     {allowed, reason, remaining, daily_remaining, estimated, daily_cap}
--     reason ∈ 'monthly_budget_exceeded' | 'daily_cap_exceeded' | 'no_account'
--     Pre-Call-Gate für Edge-Functions (Sprint D). Edge-Function übergibt
--     Estimate basierend auf max_tokens × pricing-Lookup.
--
-- Read-Only / STABLE — keine Mutationen, sichere multiple-call-Semantik.

BEGIN;

-- ── 1. get_my_active_account_id ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_active_account_id()
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
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) Aktives Team aus user_preferences
  SELECT active_team_id INTO v_active_team_id
    FROM public.user_preferences
    WHERE user_id = auth.uid()
    LIMIT 1;

  -- 2) Active-Team → account_id
  IF v_active_team_id IS NOT NULL THEN
    SELECT account_id INTO v_account_id
      FROM public.teams
      WHERE id = v_active_team_id
      LIMIT 1;
    IF v_account_id IS NOT NULL THEN
      RETURN v_account_id;
    END IF;
  END IF;

  -- 3) Fallback: erstes Team-Membership des Users
  SELECT t.account_id INTO v_account_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
    LIMIT 1;

  RETURN v_account_id;  -- NULL wenn kein Team-Membership existiert
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_active_account_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_active_account_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_account_id() TO service_role;

-- ── 2. get_my_credit_budget ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_credit_budget()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_account_id uuid;
  v_plan_id uuid;
  v_plan_credits integer;
  v_plan_slug text;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := (date_trunc('month', now()) + interval '1 month') - interval '1 microsecond';
  v_used_this_period numeric;
  v_used_today numeric;
  v_topup_remaining numeric;
  v_daily_cap numeric;
  v_plan_remaining numeric;
BEGIN
  v_account_id := public.get_my_active_account_id();
  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_account');
  END IF;

  -- Plan-Quota
  SELECT a.plan_id, p.credits_quota, p.slug
    INTO v_plan_id, v_plan_credits, v_plan_slug
    FROM public.accounts a
    LEFT JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = v_account_id;

  -- Verbrauch in laufendem Kalendermonat
  SELECT COALESCE(SUM(credits), 0) INTO v_used_this_period
    FROM public.credit_usage
    WHERE account_id = v_account_id
      AND created_at >= v_period_start
      AND status = 'success';

  -- Verbrauch heute (für Daily-Cap)
  SELECT COALESCE(SUM(credits), 0) INTO v_used_today
    FROM public.credit_usage
    WHERE account_id = v_account_id
      AND created_at >= date_trunc('day', now())
      AND status = 'success';

  -- Top-Up-Credits (type='credits', active, nicht expired)
  SELECT COALESCE(SUM(amount_remaining), 0) INTO v_topup_remaining
    FROM public.credit_topups
    WHERE account_id = v_account_id
      AND type = 'credits'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now());

  v_plan_remaining := GREATEST(0, COALESCE(v_plan_credits, 0) - v_used_this_period);
  v_daily_cap := COALESCE(v_plan_credits, 0) * 0.25;

  RETURN jsonb_build_object(
    'account_id', v_account_id,
    'plan_id', v_plan_id,
    'plan_slug', v_plan_slug,
    'plan_credits', v_plan_credits,
    'used_this_period', v_used_this_period,
    'plan_remaining', v_plan_remaining,
    'topup_remaining', v_topup_remaining,
    'total_remaining', v_plan_remaining + v_topup_remaining,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'used_today', v_used_today,
    'daily_cap', v_daily_cap,
    'daily_remaining', GREATEST(0, v_daily_cap - v_used_today)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_credit_budget() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_credit_budget() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_credit_budget() TO service_role;

-- ── 3. check_credits ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_credits(p_estimated_credits numeric DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_budget jsonb;
  v_total_remaining numeric;
  v_daily_remaining numeric;
  v_daily_cap numeric;
BEGIN
  v_budget := public.get_my_credit_budget();

  IF (v_budget ? 'error') THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', v_budget->>'error'
    );
  END IF;

  v_total_remaining := (v_budget->>'total_remaining')::numeric;
  v_daily_remaining := (v_budget->>'daily_remaining')::numeric;
  v_daily_cap := (v_budget->>'daily_cap')::numeric;

  -- Monthly-Budget-Check
  IF p_estimated_credits > v_total_remaining THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_budget_exceeded',
      'remaining', v_total_remaining,
      'estimated', p_estimated_credits
    );
  END IF;

  -- Daily-Cap-Check (nur greifend wenn daily_cap > 0)
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

REVOKE ALL ON FUNCTION public.check_credits(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_credits(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_credits(numeric) TO service_role;

-- Verifikation
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname IN ('get_my_active_account_id','get_my_credit_budget','check_credits')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');

  IF v_count != 3 THEN
    RAISE EXCEPTION 'Migration FAILED: expected 3 RPCs, got %', v_count;
  END IF;

  RAISE NOTICE 'Migration OK: 3 Budget-RPCs installed';
END $$;

COMMIT;
