-- Phase 1.4a: RPC fuer Admin-Account-Liste mit JOINs + Filter + Search + Sort.
-- Ersetzt das simple .from('accounts').select('*') aus Phase 1.1 durch eine
-- RPC die Plan-Name (JOIN plans), Owner-Email (JOIN auth.users) plus
-- server-side Filter/Search/Sort liefert.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_accounts_admin_list(
  p_status_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  name text,
  billing_email text,
  status text,
  plan_id uuid,
  plan_name text,
  seat_limit integer,
  plan_managed_by text,
  trial_ends_at timestamptz,
  owner_user_id uuid,
  owner_email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  notes_internal text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_sort_sql text;
  v_dir_sql text;
  v_query text;
BEGIN
  -- Auth-Check (Pattern aus Phase 1.3g update_account_with_audit)
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized -- is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

  -- Sort-Whitelist (Injection-Schutz: nur diese Tokens kommen in das dynamic SQL)
  v_sort_sql := CASE lower(p_sort_by)
    WHEN 'name' THEN 'a.name'
    WHEN 'status' THEN 'a.status'
    WHEN 'plan_name' THEN 'p.name'
    WHEN 'seat_limit' THEN 'a.seat_limit'
    WHEN 'trial_ends_at' THEN 'a.trial_ends_at'
    WHEN 'created_at' THEN 'a.created_at'
    WHEN 'billing_email' THEN 'a.billing_email'
    WHEN 'owner_email' THEN 'u.email'
    ELSE 'a.created_at'
  END;

  v_dir_sql := CASE lower(p_sort_dir) WHEN 'asc' THEN 'ASC' ELSE 'DESC' END;

  -- Dynamic SQL: Status-Filter (Array) + Multi-Field-Search + Sort + Limit.
  -- LEFT JOIN auf plans + auth.users weil plan_id und owner_user_id nullable sind.
  -- u.email::text Cast weil auth.users.email varchar ist, RETURNS TABLE deklariert text.
  v_query := format($f$
    SELECT
      a.id, a.name, a.billing_email, a.status, a.plan_id, p.name AS plan_name,
      a.seat_limit, a.plan_managed_by, a.trial_ends_at, a.owner_user_id,
      u.email::text AS owner_email,
      a.stripe_customer_id, a.stripe_subscription_id, a.notes_internal,
      a.created_at, a.updated_at
    FROM accounts a
    LEFT JOIN plans p ON p.id = a.plan_id
    LEFT JOIN auth.users u ON u.id = a.owner_user_id
    WHERE ($1::text[] IS NULL OR a.status = ANY($1))
      AND ($2::text IS NULL OR (
        a.name ILIKE '%%' || $2 || '%%'
        OR a.billing_email ILIKE '%%' || $2 || '%%'
        OR COALESCE(a.notes_internal, '') ILIKE '%%' || $2 || '%%'
        OR COALESCE(u.email::text, '') ILIKE '%%' || $2 || '%%'
      ))
    ORDER BY %s %s NULLS LAST
    LIMIT $3
  $f$, v_sort_sql, v_dir_sql);

  RETURN QUERY EXECUTE v_query
    USING p_status_filter, p_search, p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_accounts_admin_list IS
  'Phase 1.4a: SECURITY-DEFINER-RPC fuer Admin-Account-Liste. JOINs auf plans + auth.users. Server-side Filter/Search/Sort. Auth: is_leadesk_admin.';

GRANT EXECUTE ON FUNCTION public.get_accounts_admin_list TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_accounts_admin_list FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_accounts_admin_list FROM anon;

COMMIT;
