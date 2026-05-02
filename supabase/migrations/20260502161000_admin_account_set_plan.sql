-- ================================================================
-- Leadesk: admin_account_set_plan-RPC
-- ================================================================
--
-- Account-zentrische Plan-Wechsel-RPC mit Audit-Trail. Im Admin-
-- Frontend (admin.leadesk.de) ersetzt das den User-zentrischen
-- upsert_subscription-Aufruf (das p_email-basiert ist und nur für
-- Webhooks bleibt).
--
-- Schreibt Audit-Eintrag in admin_audit_log via Pattern aus
-- update_account_with_audit (Phase 1.3b): Reason-Pflicht ≥ 10 Zeichen.
--
-- Auth: is_leadesk_admin-JWT-Claim (Phase 1.3-Pattern).
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_account_set_plan(
  p_account_id uuid,
  p_plan_id    uuid,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id    uuid := auth.uid();
  v_old_plan_id uuid;
  v_account     accounts%ROWTYPE;
BEGIN
  -- Auth
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  -- Reason-Pflicht (Pattern aus update_account_with_audit)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)';
  END IF;

  -- Account muss existieren
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  -- Plan muss existieren
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  v_old_plan_id := v_account.plan_id;

  -- Update + Audit in einer impliziten Transaction (FUNCTION-Body)
  UPDATE public.accounts
  SET plan_id = p_plan_id, updated_at = now()
  WHERE id = p_account_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'update', 'accounts', p_account_id,
    'plan_id',
    to_jsonb(v_old_plan_id::text),
    to_jsonb(p_plan_id::text),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'account_id',   p_account_id,
    'old_plan_id',  v_old_plan_id,
    'new_plan_id',  p_plan_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_account_set_plan(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_account_set_plan(uuid, uuid, text) TO authenticated;
