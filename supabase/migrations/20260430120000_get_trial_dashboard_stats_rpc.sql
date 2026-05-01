-- Phase 1.5a-Backend: RPC für Trial-Dashboard-Aggregations.
-- Liefert 3 disjunkte Buckets:
--   - active: status='trialing' AND trial_ends_at > now() + 7 days (komfortable Range)
--   - expiring_soon: status='trialing' AND trial_ends_at BETWEEN now() AND now() + 7 days
--   - expired: status='trialing' AND trial_ends_at < now() (Status nicht updatet, Data-Hygiene)
--
-- NULL trial_ends_at wird als 'active' gezählt (Customer hat trialing-Status aber kein Endedatum gesetzt).
-- Buckets sind eine echte Partition: active + expiring_soon + expired == total_count.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_trial_dashboard_stats()
RETURNS TABLE (
  active_count bigint,
  expiring_soon_count bigint,
  expired_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (
      WHERE status = 'trialing'
        AND (trial_ends_at IS NULL OR trial_ends_at > now() + interval '7 days')
    )::bigint AS active_count,
    COUNT(*) FILTER (
      WHERE status = 'trialing'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at >= now()
        AND trial_ends_at <= now() + interval '7 days'
    )::bigint AS expiring_soon_count,
    COUNT(*) FILTER (
      WHERE status = 'trialing'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < now()
    )::bigint AS expired_count,
    COUNT(*) FILTER (WHERE status = 'trialing')::bigint AS total_count
  FROM accounts;
END;
$$;

COMMENT ON FUNCTION public.get_trial_dashboard_stats IS
  'Phase 1.5a: SECURITY-DEFINER-RPC für Trial-Dashboard-Aggregations.
   3 disjunkte Buckets: active (>7d), expiring_soon (≤7d), expired (Status noch trialing).
   NULL trial_ends_at wird als active gezählt.';

GRANT EXECUTE ON FUNCTION public.get_trial_dashboard_stats TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_trial_dashboard_stats FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_trial_dashboard_stats FROM anon;

COMMIT;
