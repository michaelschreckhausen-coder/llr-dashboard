-- Phase 1.3b: SECURITY-DEFINER-RPC für Account-Updates mit Audit-Trail.
-- Einziger zulässiger Schreibpfad auf accounts (nach Phase 1.3c-Härtung).
-- Update + Audit-Eintrag in einer Transaction — niemand kann eines ohne
-- das andere durch.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_account_with_audit(
  p_account_id uuid,
  p_field_name text,
  p_new_value jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_before jsonb;
  v_action text;
  v_allowed_fields text[] := ARRAY[
    'plan_id',
    'seat_limit',
    'plan_managed_by',
    'trial_ends_at',
    'status',
    'notes_internal'
  ];
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean,
    false
  );
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_field_name = ANY(v_allowed_fields)) THEN
    RAISE EXCEPTION 'Field not editable: %', p_field_name USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id USING ERRCODE = '02000';
  END IF;

  EXECUTE format('SELECT to_jsonb(a.%I) FROM accounts a WHERE id = $1', p_field_name)
    INTO v_before
    USING p_account_id;

  EXECUTE format('UPDATE accounts SET %I = $1, updated_at = now() WHERE id = $2', p_field_name)
    USING (p_new_value #>> '{}'),
          p_account_id;

  v_action := 'accounts.' || p_field_name || '.update';
  INSERT INTO admin_audit_log (
    admin_user_id, action, target_table, target_id, field_name,
    before_value, after_value, reason
  )
  VALUES (
    v_admin_id, v_action, 'accounts', p_account_id, p_field_name,
    v_before, p_new_value, p_reason
  );
END;
$$;

COMMENT ON FUNCTION public.update_account_with_audit IS
  'Phase 1.3b: SECURITY-DEFINER-RPC. Updated accounts.{field} und schreibt
   Audit-Eintrag in admin_audit_log. Einziger zulässiger Schreibpfad auf
   accounts ab Phase 1.3c.';

GRANT EXECUTE ON FUNCTION public.update_account_with_audit TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_account_with_audit FROM anon;

COMMIT;
