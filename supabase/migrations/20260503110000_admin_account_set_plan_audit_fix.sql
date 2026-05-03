-- ================================================================
-- Leadesk: admin_account_set_plan Audit-Format-Fix (Inkrement 5)
-- ================================================================
--
-- Discovery 2026-05-03 zeigte: aktueller RPC-Body schreibt
--   action='update', field_name='plan_id'
--   before_value=to_jsonb(uuid::text), after_value=to_jsonb(uuid::text)
-- Das routet im AuditTab durch den Stammdaten-Renderer und zeigt
-- nackte UUIDs („ea98eafd-… → c4c11445-…") — funktional aber unleserlich
-- ohne Plan-Name-Auflösung.
--
-- Fix (analog zu 20260503100000_admin_invite_member_audit_fix.sql):
--   action='plan_change'
--   field_name=NULL
--   before_value/after_value = jsonb_build_object('plan_id', uuid,
--                                                  'plan_name', text)
-- Plan-Names werden im RPC-Body via JOIN auf public.plans aufgelöst,
-- damit Audit-Einträge auch nach Plan-Renamings stabil bleiben (Snap-
-- shot zur Audit-Zeit).
--
-- Frontend-Renderer in AuditTab.jsx (ACTION_RENDERERS['plan_change'])
-- liest .plan_name mit Fallback auf .plan_id.
--
-- Auth + Reason-Pflicht (≥10 Zeichen) + Account-/Plan-Existence-Checks
-- bleiben byte-identisch zur Lockdown-Version.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_account_set_plan(
  p_account_id uuid,
  p_plan_id    uuid,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_id       uuid := auth.uid();
  v_old_plan_id    uuid;
  v_old_plan_name  text;
  v_new_plan_name  text;
  v_account        public.accounts%ROWTYPE;
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

  -- Plan muss existieren + Name für Audit holen
  SELECT name INTO v_new_plan_name FROM public.plans WHERE id = p_plan_id;
  IF v_new_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  v_old_plan_id := v_account.plan_id;
  -- Old-Plan-Name (kann NULL sein wenn v_old_plan_id selbst NULL oder
  -- inzwischen aus plans gelöscht — beides graceful via NULL im jsonb)
  IF v_old_plan_id IS NOT NULL THEN
    SELECT name INTO v_old_plan_name FROM public.plans WHERE id = v_old_plan_id;
  END IF;

  -- Update + Audit in einer impliziten Transaction
  UPDATE public.accounts
  SET plan_id = p_plan_id, updated_at = now()
  WHERE id = p_account_id;

  -- Audit-Format: action='plan_change' + jsonb-Payload mit plan_id+plan_name
  -- (Snapshot — bleibt nach Plan-Renamings stabil)
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id,
    'plan_change',
    'accounts',
    p_account_id,
    NULL,
    jsonb_build_object(
      'plan_id',   v_old_plan_id,
      'plan_name', v_old_plan_name
    ),
    jsonb_build_object(
      'plan_id',   p_plan_id,
      'plan_name', v_new_plan_name
    ),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'account_id',     p_account_id,
    'old_plan_id',    v_old_plan_id,
    'old_plan_name',  v_old_plan_name,
    'new_plan_id',    p_plan_id,
    'new_plan_name',  v_new_plan_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_account_set_plan(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_account_set_plan(uuid, uuid, text) TO authenticated;
