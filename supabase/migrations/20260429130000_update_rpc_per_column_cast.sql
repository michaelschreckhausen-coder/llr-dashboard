-- Phase 1.3g: RPC-Härtung — per-Spalte-Cast statt #>> '{}' implicit-cast.
-- Behebt: "column seat_limit is of type integer but expression is of type text"
-- (gefunden im Browser-Test der Phase 1.3f).
--
-- Latente Bugs gleicher Art bei plan_id (uuid) und trial_ends_at (timestamptz)
-- werden mit-gefixt durch CASE per Field-Name.

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
    'plan_id', 'seat_limit', 'plan_managed_by',
    'trial_ends_at', 'status', 'notes_internal'
  ];
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false);
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
    INTO v_before USING p_account_id;

  -- Per-Spalte-Cast: extrahiert den jsonb-Wert mit dem korrekten Postgres-Typ.
  -- Nullable-Felder (trial_ends_at, notes_internal) prüfen explizit auf jsonb-null.
  CASE p_field_name
    WHEN 'seat_limit' THEN
      EXECUTE 'UPDATE accounts SET seat_limit = $1, updated_at = now() WHERE id = $2'
        USING (p_new_value #>> '{}')::integer, p_account_id;
    WHEN 'plan_id' THEN
      EXECUTE 'UPDATE accounts SET plan_id = $1, updated_at = now() WHERE id = $2'
        USING (p_new_value #>> '{}')::uuid, p_account_id;
    WHEN 'trial_ends_at' THEN
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        EXECUTE 'UPDATE accounts SET trial_ends_at = NULL, updated_at = now() WHERE id = $1'
          USING p_account_id;
      ELSE
        EXECUTE 'UPDATE accounts SET trial_ends_at = $1, updated_at = now() WHERE id = $2'
          USING (p_new_value #>> '{}')::timestamptz, p_account_id;
      END IF;
    WHEN 'notes_internal' THEN
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        EXECUTE 'UPDATE accounts SET notes_internal = NULL, updated_at = now() WHERE id = $1'
          USING p_account_id;
      ELSE
        EXECUTE 'UPDATE accounts SET notes_internal = $1, updated_at = now() WHERE id = $2'
          USING p_new_value #>> '{}', p_account_id;
      END IF;
    WHEN 'plan_managed_by' THEN
      EXECUTE 'UPDATE accounts SET plan_managed_by = $1, updated_at = now() WHERE id = $2'
        USING p_new_value #>> '{}', p_account_id;
    WHEN 'status' THEN
      EXECUTE 'UPDATE accounts SET status = $1, updated_at = now() WHERE id = $2'
        USING p_new_value #>> '{}', p_account_id;
    ELSE
      RAISE EXCEPTION 'Field not editable (case mismatch): %', p_field_name;
  END CASE;

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

COMMIT;
