-- =============================================================================
-- User Activity Tracking — Admin RPCs (Phase A)
-- =============================================================================
-- Drei SECURITY-DEFINER-Functions hinter is_leadesk_admin():
--   1. admin_get_user_activity_overview(period_days)
--   2. admin_get_account_activity(account_id, period_days)
--   3. admin_get_token_usage_timeseries(account_id, period_days, bucket)
--
-- Account-Scope für CRM-Counts läuft über teams.account_id-JOIN (Schema-Realität:
-- leads/deals/organizations/lead_tasks haben kein direktes account_id, nur team_id).
-- Users-Liste für einen Account: über team_members (is_active=true) statt
-- profiles.account_id (existiert nicht).
-- =============================================================================

-- ─── RPC 1: Overview ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user_activity_overview(
  p_period_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since  timestamptz := now() - (p_period_days || ' days')::interval;
  v_result jsonb;
BEGIN
  IF NOT public.is_leadesk_admin() THEN
    RAISE EXCEPTION 'forbidden: not a leadesk admin';
  END IF;
  IF p_period_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'invalid period: % (must be 1..365)', p_period_days;
  END IF;

  SELECT jsonb_build_object(
    'period_days',  p_period_days,
    'since',        v_since,
    'generated_at', now(),

    'logins', (
      SELECT jsonb_build_object(
        'total',        count(*),
        'unique_users', count(DISTINCT user_id)
      )
      FROM public.user_login_log
      WHERE logged_in_at >= v_since
    ),

    'ai_usage', (
      SELECT jsonb_build_object(
        'total_requests',     count(*),
        'success_requests',   count(*) FILTER (WHERE status = 'success'),
        'error_requests',     count(*) FILTER (WHERE status = 'error'),
        'total_input_tokens', coalesce(sum(input_tokens),  0),
        'total_output_tokens',coalesce(sum(output_tokens), 0),
        'total_cost_eur',     coalesce(sum(estimated_cost_eur), 0),
        'unique_users',       count(DISTINCT user_id)
      )
      FROM public.ai_usage_log
      WHERE created_at >= v_since
    ),

    'top_accounts_by_tokens', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT a.id AS account_id, a.name AS account_name,
               sum(u.input_tokens + u.output_tokens)   AS total_tokens,
               coalesce(sum(u.estimated_cost_eur), 0)  AS total_cost_eur,
               count(*)                                AS request_count
        FROM public.ai_usage_log u
        JOIN public.accounts a ON a.id = u.account_id
        WHERE u.created_at >= v_since
        GROUP BY a.id, a.name
        ORDER BY total_tokens DESC NULLS LAST
        LIMIT 10
      ) t
    ),

    'top_accounts_by_logins', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT a.id AS account_id, a.name AS account_name,
               count(*) AS login_count,
               count(DISTINCT l.user_id) AS unique_users
        FROM public.user_login_log l
        JOIN public.accounts a ON a.id = l.account_id
        WHERE l.logged_in_at >= v_since
        GROUP BY a.id, a.name
        ORDER BY login_count DESC
        LIMIT 10
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_activity_overview(integer)
  TO authenticated;

-- ─── RPC 2: Per-Account ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_account_activity(
  p_account_id  uuid,
  p_period_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since  timestamptz := now() - (p_period_days || ' days')::interval;
  v_result jsonb;
BEGIN
  IF NOT public.is_leadesk_admin() THEN
    RAISE EXCEPTION 'forbidden: not a leadesk admin';
  END IF;
  IF p_period_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'invalid period: % (must be 1..365)', p_period_days;
  END IF;

  -- CTEs für transitive scope: account → teams → CRM-Tabellen + team_members.
  -- Beide CTEs werden in der jsonb_build_object-Aggregation mehrfach referenziert
  -- → Postgres inlined sie als CTEs in einer Pass.
  WITH account_team_ids AS (
    SELECT id FROM public.teams WHERE account_id = p_account_id
  ),
  account_member_ids AS (
    SELECT DISTINCT tm.user_id
    FROM public.team_members tm
    WHERE tm.team_id IN (SELECT id FROM account_team_ids)
      AND tm.is_active = true
      AND tm.user_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'account_id',   p_account_id,
    'period_days',  p_period_days,
    'since',        v_since,
    'generated_at', now(),

    'crm_counts', jsonb_build_object(
      'leads',         (SELECT count(*) FROM public.leads
                          WHERE team_id IN (SELECT id FROM account_team_ids)),
      'deals',         (SELECT count(*) FROM public.deals
                          WHERE team_id IN (SELECT id FROM account_team_ids)),
      'organizations', (SELECT count(*) FROM public.organizations
                          WHERE team_id IN (SELECT id FROM account_team_ids)),
      'lead_tasks',    (SELECT count(*) FROM public.lead_tasks
                          WHERE team_id IN (SELECT id FROM account_team_ids))
    ),

    'users', (
      SELECT coalesce(jsonb_agg(u ORDER BY u.login_count DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT p.id AS user_id, p.email, p.full_name, au.last_sign_in_at,
               coalesce((SELECT count(*) FROM public.user_login_log l
                          WHERE l.user_id = p.id
                            AND l.logged_in_at >= v_since), 0) AS login_count,
               coalesce((SELECT sum(input_tokens + output_tokens)
                          FROM public.ai_usage_log a
                          WHERE a.user_id = p.id
                            AND a.created_at >= v_since), 0)   AS total_tokens,
               coalesce((SELECT sum(estimated_cost_eur)
                          FROM public.ai_usage_log a
                          WHERE a.user_id = p.id
                            AND a.created_at >= v_since), 0)   AS total_cost_eur,
               coalesce((SELECT count(*) FROM public.ai_usage_log a
                          WHERE a.user_id = p.id
                            AND a.created_at >= v_since
                            AND a.status = 'error'), 0)        AS ai_error_count
        FROM public.profiles p
        JOIN auth.users au ON au.id = p.id
        WHERE p.id IN (SELECT user_id FROM account_member_ids)
      ) u
    ),

    'ai_by_feature', (
      SELECT coalesce(jsonb_agg(f ORDER BY f.total_tokens DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT coalesce(feature, '(unbekannt)') AS feature,
               count(*) AS request_count,
               sum(input_tokens + output_tokens) AS total_tokens,
               coalesce(sum(estimated_cost_eur), 0) AS total_cost_eur
        FROM public.ai_usage_log
        WHERE account_id = p_account_id AND created_at >= v_since
        GROUP BY feature
      ) f
    ),

    'ai_by_provider', (
      SELECT coalesce(jsonb_agg(p ORDER BY p.total_tokens DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT provider,
               count(*) AS request_count,
               sum(input_tokens + output_tokens) AS total_tokens,
               coalesce(sum(estimated_cost_eur), 0) AS total_cost_eur
        FROM public.ai_usage_log
        WHERE account_id = p_account_id AND created_at >= v_since
        GROUP BY provider
      ) p
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_account_activity(uuid, integer)
  TO authenticated;

-- ─── RPC 3: Token-Usage-Timeseries ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_token_usage_timeseries(
  p_account_id  uuid    DEFAULT NULL,
  p_period_days integer DEFAULT 30,
  p_bucket      text    DEFAULT 'day'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since  timestamptz := now() - (p_period_days || ' days')::interval;
  v_result jsonb;
BEGIN
  IF NOT public.is_leadesk_admin() THEN
    RAISE EXCEPTION 'forbidden: not a leadesk admin';
  END IF;
  IF p_bucket NOT IN ('hour','day','week') THEN
    RAISE EXCEPTION 'invalid bucket: % (must be hour|day|week)', p_bucket;
  END IF;
  IF p_period_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'invalid period: % (must be 1..365)', p_period_days;
  END IF;

  SELECT coalesce(jsonb_agg(t ORDER BY t.bucket), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT date_trunc(p_bucket, created_at) AS bucket,
           provider,
           count(*) AS request_count,
           sum(input_tokens)  AS input_tokens,
           sum(output_tokens) AS output_tokens,
           coalesce(sum(estimated_cost_eur), 0) AS cost_eur
    FROM public.ai_usage_log
    WHERE created_at >= v_since
      AND (p_account_id IS NULL OR account_id = p_account_id)
    GROUP BY bucket, provider
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_token_usage_timeseries(uuid, integer, text)
  TO authenticated;
