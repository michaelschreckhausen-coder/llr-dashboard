-- Phase 1.4c-Backend: RPC um Pagination (offset + total_count) erweitern.
-- Total-Count via window function COUNT(*) OVER () -- eine Query, kein Round-Trip.
-- Signatur-Wechsel 5 -> 6 Parameter erfordert DROP FUNCTION vor CREATE
-- (CREATE OR REPLACE ist Signatur-spezifisch in Postgres).

BEGIN;

-- Alte 1.4a-Signatur (5 Parameter) droppen, sonst koexistiert sie als
-- separater Overload neben der neuen 6-Parameter-Version.
DROP FUNCTION IF EXISTS public.get_accounts_admin_list(text[], text, text, text, integer);

CREATE OR REPLACE FUNCTION public.get_accounts_admin_list(
  p_status_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
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
  updated_at timestamptz,
  total_count bigint
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
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized -- is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

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

  -- u.email::text-Cast aus Phase 1.4a beibehalten: auth.users.email ist varchar,
  -- RETURNS TABLE deklariert text -> ohne Cast Type-Mismatch bei RETURN QUERY.
  -- COUNT(*) OVER () liefert den ungefilterten-nach-Limit Total-Count pro Row
  -- (= Total-Treffer der WHERE-Klausel, vor LIMIT/OFFSET).
  v_query := format($f$
    SELECT
      a.id, a.name, a.billing_email, a.status, a.plan_id, p.name AS plan_name,
      a.seat_limit, a.plan_managed_by, a.trial_ends_at, a.owner_user_id,
      u.email::text AS owner_email,
      a.stripe_customer_id, a.stripe_subscription_id, a.notes_internal,
      a.created_at, a.updated_at,
      COUNT(*) OVER () AS total_count
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
    OFFSET $4
  $f$, v_sort_sql, v_dir_sql);

  RETURN QUERY EXECUTE v_query
    USING p_status_filter, p_search, p_limit, p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_accounts_admin_list IS
  'Phase 1.4c: SECURITY-DEFINER-RPC fuer Admin-Account-Liste mit Pagination. Total-Count via window function COUNT(*) OVER () in jeder Row.';

-- Grants neu setzen (DROP hat sie weggeworfen).
GRANT EXECUTE ON FUNCTION public.get_accounts_admin_list TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_accounts_admin_list FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_accounts_admin_list FROM anon;

COMMIT;
