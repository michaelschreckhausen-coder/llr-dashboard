-- Credits Phase 1 — Admin-RPCs für credit_pricing-Editor
-- ─────────────────────────────────────────────────────────────────
-- Drei SECURITY-DEFINER RPCs für admin.leadesk.de/credit-pricing:
--
--   admin_update_credit_pricing(p_id, p_field, p_value, p_reason) → jsonb
--     Per-Field-Update mit Audit. Whitelist:
--     credits_per_unit, tier, is_active, description
--
--   admin_create_credit_pricing(p_provider, p_model, p_operation,
--                               p_unit, p_credits_per_unit, p_tier,
--                               p_description, p_reason) → uuid
--     Insert neuer Pricing-Row.
--
--   admin_delete_credit_pricing(p_id, p_reason) → jsonb
--     Soft-Delete via is_active=false (NICHT hard-delete — Audit-Trail
--     für historische credit_usage-Rows bleibt resolvbar).
--
-- Auth: is_leadesk_admin claim Pflicht. Reason ≥ 10 chars.
-- Idempotent: DROP+CREATE.

BEGIN;

-- ── admin_update_credit_pricing ──────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_update_credit_pricing(uuid, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.admin_update_credit_pricing(
  p_id         uuid,
  p_field_name text,
  p_new_value  jsonb,
  p_reason     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_before jsonb;
  v_audit_id uuid;
  v_allowed_fields text[] := ARRAY['credits_per_unit', 'tier', 'is_active', 'description'];
  v_new_text text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_field_name = ANY(v_allowed_fields)) THEN
    RAISE EXCEPTION 'Field not editable: %', p_field_name USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_pricing WHERE id = p_id) THEN
    RAISE EXCEPTION 'credit_pricing not found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  v_new_text := p_new_value #>> '{}';

  CASE p_field_name
    WHEN 'credits_per_unit' THEN
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        RAISE EXCEPTION 'credits_per_unit cannot be NULL' USING ERRCODE = '22023';
      END IF;
      IF (v_new_text)::numeric < 0 THEN
        RAISE EXCEPTION 'credits_per_unit must be >= 0' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(credits_per_unit) INTO v_before FROM public.credit_pricing WHERE id = p_id;
      UPDATE public.credit_pricing SET credits_per_unit = (v_new_text)::numeric, updated_at = now() WHERE id = p_id;

    WHEN 'tier' THEN
      IF v_new_text NOT IN ('basic', 'premium') THEN
        RAISE EXCEPTION 'tier must be "basic" or "premium", got "%"', v_new_text USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(tier) INTO v_before FROM public.credit_pricing WHERE id = p_id;
      UPDATE public.credit_pricing SET tier = v_new_text, updated_at = now() WHERE id = p_id;

    WHEN 'is_active' THEN
      IF jsonb_typeof(p_new_value) != 'boolean' THEN
        RAISE EXCEPTION 'is_active must be jsonb-boolean' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(is_active) INTO v_before FROM public.credit_pricing WHERE id = p_id;
      UPDATE public.credit_pricing SET is_active = (p_new_value)::boolean, updated_at = now() WHERE id = p_id;

    WHEN 'description' THEN
      SELECT to_jsonb(description) INTO v_before FROM public.credit_pricing WHERE id = p_id;
      UPDATE public.credit_pricing SET description = v_new_text, updated_at = now() WHERE id = p_id;

    ELSE
      RAISE EXCEPTION 'Field not editable (case mismatch): %', p_field_name USING ERRCODE = '22023';
  END CASE;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'credit_pricing.update', 'credit_pricing', p_id,
    p_field_name, v_before, p_new_value, p_reason
  ) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('success', true, 'audit_id', v_audit_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_credit_pricing(uuid, text, jsonb, text) TO authenticated;

-- ── admin_create_credit_pricing ──────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_create_credit_pricing(text, text, text, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_create_credit_pricing(
  p_provider          text,
  p_model             text,
  p_operation         text,
  p_unit              text,
  p_credits_per_unit  numeric,
  p_tier              text,
  p_description       text,
  p_reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_new_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;
  IF p_provider IS NULL OR p_model IS NULL OR p_operation IS NULL OR p_unit IS NULL THEN
    RAISE EXCEPTION 'provider/model/operation/unit are required' USING ERRCODE = '22023';
  END IF;
  IF p_credits_per_unit < 0 THEN
    RAISE EXCEPTION 'credits_per_unit must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_tier NOT IN ('basic', 'premium') THEN
    RAISE EXCEPTION 'tier must be "basic" or "premium"' USING ERRCODE = '22023';
  END IF;
  IF p_unit NOT IN ('call','1k_input_tokens','1k_output_tokens','image','minute','second') THEN
    RAISE EXCEPTION 'unit invalid (allowed: call/1k_input_tokens/1k_output_tokens/image/minute/second)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_pricing (
    provider, model, operation, unit, credits_per_unit, tier, description, is_active
  ) VALUES (
    p_provider, p_model, p_operation, p_unit, p_credits_per_unit, p_tier, p_description, true
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'credit_pricing.create', 'credit_pricing', v_new_id,
    'INSERT', NULL,
    jsonb_build_object('provider', p_provider, 'model', p_model, 'operation', p_operation,
                       'unit', p_unit, 'credits_per_unit', p_credits_per_unit, 'tier', p_tier),
    p_reason
  );

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_credit_pricing(text, text, text, text, numeric, text, text, text) TO authenticated;

-- Verifikation
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname IN ('admin_update_credit_pricing','admin_create_credit_pricing')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Migration FAILED: expected 2 RPCs, got %', v_count;
  END IF;
  RAISE NOTICE 'Migration OK: 2 credit_pricing admin-RPCs installed';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
