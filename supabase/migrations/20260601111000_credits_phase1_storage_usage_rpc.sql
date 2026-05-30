-- Credits Phase 1 — Storage-Usage-RPC (get_my_storage_usage)
-- ─────────────────────────────────────────────────────────────────
-- Aggregiert tatsächliche Storage-Nutzung des Accounts gegen Plan-Quota.
--
-- Datenquellen (Phase 1 Scope — pragmatisch, nicht vollständig):
--   - public.visuals.file_size_bytes (Bilder + Videos)
--   - Wird in Phase 2 erweitert um andere DB-getrackte Storage-Tabellen
--     (knowledge_resources, deal_attachments) wenn sie file_size_bytes haben.
--   - Supabase Storage API kein direct-query — DB-Spiegel ist Authority.
--
-- Return: jsonb mit {storage_quota_gb, topup_gb, total_quota_gb, used_bytes,
--                    used_gb, remaining_gb, account_id}
--
-- Top-Ups: type='storage_gb', status='active' summieren on-top.
--
-- Defensive: bei Tabelle/Spalte fehlt → fängt Exception, used_bytes=0
-- (Underestimate, vertretbar in Phase 1).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_storage_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_account_id uuid;
  v_storage_quota_gb numeric;
  v_topup_gb numeric := 0;
  v_team_ids uuid[];
  v_user_ids uuid[];
  v_visuals_bytes numeric := 0;
  v_used_gb numeric;
BEGIN
  v_account_id := public.get_my_active_account_id();
  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_account');
  END IF;

  -- Plan-Quota
  SELECT p.storage_quota_gb INTO v_storage_quota_gb
    FROM public.accounts a
    LEFT JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = v_account_id;

  -- Team-IDs + User-IDs des Accounts
  SELECT array_agg(DISTINCT id) INTO v_team_ids
    FROM public.teams WHERE account_id = v_account_id;

  IF v_team_ids IS NOT NULL THEN
    SELECT array_agg(DISTINCT user_id) INTO v_user_ids
      FROM public.team_members
      WHERE team_id = ANY(v_team_ids);
  END IF;

  -- visuals.file_size_bytes Summe (defensive bei fehlender Tabelle/Col)
  IF v_user_ids IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT COALESCE(SUM(file_size_bytes), 0) FROM public.visuals WHERE user_id = ANY($1)'
        INTO v_visuals_bytes
        USING v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_visuals_bytes := 0;
    END;
  END IF;

  -- Storage-Top-Up (sticky, active)
  SELECT COALESCE(SUM(amount), 0) INTO v_topup_gb
    FROM public.credit_topups
    WHERE account_id = v_account_id
      AND type = 'storage_gb'
      AND status = 'active';

  v_used_gb := round((v_visuals_bytes::numeric / 1073741824.0)::numeric, 4);

  RETURN jsonb_build_object(
    'account_id', v_account_id,
    'storage_quota_gb', v_storage_quota_gb,
    'topup_gb', v_topup_gb,
    'total_quota_gb', COALESCE(v_storage_quota_gb, 0) + v_topup_gb,
    'used_bytes', v_visuals_bytes,
    'used_gb', v_used_gb,
    'remaining_gb', GREATEST(0, COALESCE(v_storage_quota_gb, 0) + v_topup_gb - v_used_gb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_storage_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_storage_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_storage_usage() TO service_role;

COMMIT;
