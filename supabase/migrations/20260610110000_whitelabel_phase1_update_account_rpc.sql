-- 20260610110000_whitelabel_phase1_update_account_rpc.sql
--
-- Whitelabel Phase 1 — update_account_with_audit um logo_url/subdomain/primary_color
-- erweitern. Baut auf 20260429130000_update_rpc_per_column_cast.sql (1.3g) auf;
-- vollstaendige Neudefinition (CREATE OR REPLACE), bestehende Felder unveraendert.
--
-- Subdomain-Branch validiert serverseitig: lowercase + Format-Regex + Reserved-Liste
-- + Plan-Gate (feature_whitelabel) + globale Uniqueness. Verstoesse -> Exception
-- (Admin-UI zeigt die Message). Defense-in-Depth zusaetzlich zum DB-CHECK/Index aus
-- 20260610100000.
--
-- Idempotent. Staging-first, nach Freigabe Prod.

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
  v_sub text;
  v_allowed_fields text[] := ARRAY[
    'plan_id', 'seat_limit', 'plan_managed_by',
    'trial_ends_at', 'status', 'notes_internal',
    'logo_url', 'subdomain', 'primary_color'
  ];
  v_reserved text[] := ARRAY[
    'app','admin','staging','www','api','supabase','supabase-staging',
    'mail','smtp','ftp','dev','test','status','help','docs','blog'
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

    -- ── Whitelabel-Felder ──────────────────────────────────────────────────
    WHEN 'logo_url' THEN
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL OR trim(p_new_value #>> '{}') = '' THEN
        EXECUTE 'UPDATE accounts SET logo_url = NULL, updated_at = now() WHERE id = $1'
          USING p_account_id;
      ELSE
        EXECUTE 'UPDATE accounts SET logo_url = $1, updated_at = now() WHERE id = $2'
          USING p_new_value #>> '{}', p_account_id;
      END IF;
    WHEN 'primary_color' THEN
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL OR trim(p_new_value #>> '{}') = '' THEN
        EXECUTE 'UPDATE accounts SET primary_color = NULL, updated_at = now() WHERE id = $1'
          USING p_account_id;
      ELSE
        EXECUTE 'UPDATE accounts SET primary_color = $1, updated_at = now() WHERE id = $2'
          USING p_new_value #>> '{}', p_account_id;
      END IF;
    WHEN 'subdomain' THEN
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL OR trim(p_new_value #>> '{}') = '' THEN
        EXECUTE 'UPDATE accounts SET subdomain = NULL, updated_at = now() WHERE id = $1'
          USING p_account_id;
      ELSE
        v_sub := lower(trim(p_new_value #>> '{}'));
        IF v_sub !~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' THEN
          RAISE EXCEPTION 'Ungueltige Subdomain: nur a-z, 0-9, Bindestrich (3-32 Zeichen, nicht am Rand)' USING ERRCODE = '22023';
        END IF;
        IF v_sub = ANY(v_reserved) THEN
          RAISE EXCEPTION 'Subdomain reserviert: %', v_sub USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM accounts a JOIN plans p ON p.id = a.plan_id
          WHERE a.id = p_account_id AND COALESCE(p.feature_whitelabel, false) = true
        ) THEN
          RAISE EXCEPTION 'Plan dieses Accounts hat kein Whitelabel-Feature' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM accounts WHERE subdomain = v_sub AND id <> p_account_id) THEN
          RAISE EXCEPTION 'Subdomain bereits vergeben: %', v_sub USING ERRCODE = '23505';
        END IF;
        EXECUTE 'UPDATE accounts SET subdomain = $1, updated_at = now() WHERE id = $2'
          USING v_sub, p_account_id;
      END IF;

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

NOTIFY pgrst, 'reload schema';
