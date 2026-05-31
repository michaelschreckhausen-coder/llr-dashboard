-- Credits Phase 1 — admin_update_plan: 13 neue Phase-1-Fields editierbar
-- ─────────────────────────────────────────────────────────────────
-- Erweitert die existing admin_update_plan-RPC um die Phase-1-Cols:
--   - credits_quota integer (NULL = unlimited)
--   - storage_quota_gb numeric
--   - crm_quota_companies integer (NULL = unlimited)
--   - crm_quota_contacts integer (NULL = unlimited)
--   - brand_voices_limit integer (NULL = unlimited)
--   - audiences_limit integer (NULL = unlimited)
--   - knowledge_resources_limit integer (NULL = unlimited)
--   - license_type text (Whitelist: sales/marketing/all-in/team/trial/free/custom)
--   - allowed_model_tiers text[] (Subset: basic, premium)
--   - is_team_plan boolean
--   - seats_included integer
--   - modules text[] (Subset: branding/crm/linkedin/content/delivery/reports)
--   - permissions jsonb (Array of 'module.sub' Keys)
--   - is_active boolean
--   - description text
--
-- Pattern matched 20260506132234 (Phase 1.3-Style per-Field-Update + Audit).
-- Type-Coercion + Validation pro Case.
--
-- Idempotent: DROP+CREATE.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_update_plan(uuid, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.admin_update_plan(
  p_plan_id    uuid,
  p_field_name text,
  p_new_value  jsonb,
  p_reason     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_id       uuid := auth.uid();
  v_is_admin       boolean;
  v_before         jsonb;
  v_audit_id       uuid;
  v_allowed_fields text[] := ARRAY[
    -- Original (5.5b)
    'name', 'slug', 'price_monthly', 'price_yearly',
    'stripe_price_id', 'plan_managed_by',
    -- Phase 1 Erweiterung (2026-05-31)
    'credits_quota', 'storage_quota_gb',
    'crm_quota_companies', 'crm_quota_contacts',
    'brand_voices_limit', 'audiences_limit', 'knowledge_resources_limit',
    'license_type', 'allowed_model_tiers',
    'is_team_plan', 'seats_included',
    'modules', 'permissions',
    'is_active', 'description'
  ];
  v_new_text       text;
  v_existing_slug  text;
BEGIN
  -- Auth-Gate
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  v_is_admin := COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;

  -- Reason-Validation
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  -- Field-Whitelist
  IF NOT (p_field_name = ANY(v_allowed_fields)) THEN
    RAISE EXCEPTION 'Field not editable: %', p_field_name USING ERRCODE = '22023';
  END IF;

  -- Plan-Existenz
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id USING ERRCODE = 'P0002';
  END IF;

  v_new_text := p_new_value #>> '{}';

  CASE p_field_name
    -- ========== Original-Fields (unverändert) ==========
    WHEN 'name' THEN
      IF v_new_text = 'Enterprise' THEN
        RAISE EXCEPTION 'Plan name "Enterprise" is reserved (Sales-Garantie)' USING ERRCODE = '22023';
      END IF;
      IF v_new_text IS NULL OR length(trim(v_new_text)) = 0 THEN
        RAISE EXCEPTION 'Plan name cannot be empty' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(name) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET name = v_new_text, updated_at = now() WHERE id = p_plan_id;

    WHEN 'slug' THEN
      IF v_new_text IS NULL OR length(trim(v_new_text)) = 0 THEN
        RAISE EXCEPTION 'Plan slug cannot be empty' USING ERRCODE = '22023';
      END IF;
      SELECT slug INTO v_existing_slug FROM public.plans WHERE slug = v_new_text AND id <> p_plan_id;
      IF FOUND THEN
        RAISE EXCEPTION 'Slug "%" is already used by another plan', v_new_text USING ERRCODE = '23505';
      END IF;
      SELECT to_jsonb(slug) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET slug = v_new_text, updated_at = now() WHERE id = p_plan_id;

    WHEN 'price_monthly' THEN
      SELECT to_jsonb(price_monthly) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET price_monthly = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET price_monthly = (v_new_text)::numeric, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'price_yearly' THEN
      SELECT to_jsonb(price_yearly) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET price_yearly = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET price_yearly = (v_new_text)::numeric, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'stripe_price_id' THEN
      SELECT to_jsonb(stripe_price_id) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL OR v_new_text = '' THEN
        UPDATE public.plans SET stripe_price_id = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET stripe_price_id = v_new_text, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'plan_managed_by' THEN
      IF v_new_text NOT IN ('leadesk', 'stripe') THEN
        RAISE EXCEPTION 'plan_managed_by must be "leadesk" or "stripe", got "%"', v_new_text USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(plan_managed_by) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET plan_managed_by = v_new_text, updated_at = now() WHERE id = p_plan_id;

    -- ========== Phase 1 Erweiterung (2026-05-31) ==========
    WHEN 'credits_quota' THEN
      SELECT to_jsonb(credits_quota) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET credits_quota = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET credits_quota = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'storage_quota_gb' THEN
      SELECT to_jsonb(storage_quota_gb) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET storage_quota_gb = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET storage_quota_gb = (v_new_text)::numeric, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'crm_quota_companies' THEN
      SELECT to_jsonb(crm_quota_companies) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET crm_quota_companies = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET crm_quota_companies = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'crm_quota_contacts' THEN
      SELECT to_jsonb(crm_quota_contacts) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET crm_quota_contacts = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET crm_quota_contacts = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'brand_voices_limit' THEN
      SELECT to_jsonb(brand_voices_limit) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET brand_voices_limit = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET brand_voices_limit = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'audiences_limit' THEN
      SELECT to_jsonb(audiences_limit) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET audiences_limit = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET audiences_limit = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'knowledge_resources_limit' THEN
      SELECT to_jsonb(knowledge_resources_limit) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET knowledge_resources_limit = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET knowledge_resources_limit = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'license_type' THEN
      IF v_new_text IS NOT NULL AND v_new_text NOT IN ('sales','marketing','all-in','team','trial','free','custom') THEN
        RAISE EXCEPTION 'license_type invalid: % (allowed: sales/marketing/all-in/team/trial/free/custom)', v_new_text USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(license_type) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET license_type = v_new_text, updated_at = now() WHERE id = p_plan_id;

    WHEN 'allowed_model_tiers' THEN
      -- p_new_value ist jsonb-Array, z.B. '["basic","premium"]'
      IF jsonb_typeof(p_new_value) != 'array' THEN
        RAISE EXCEPTION 'allowed_model_tiers must be jsonb-array' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(allowed_model_tiers) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans
        SET allowed_model_tiers = ARRAY(SELECT jsonb_array_elements_text(p_new_value))::text[],
            updated_at = now()
        WHERE id = p_plan_id;

    WHEN 'is_team_plan' THEN
      IF jsonb_typeof(p_new_value) != 'boolean' THEN
        RAISE EXCEPTION 'is_team_plan must be jsonb-boolean' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(is_team_plan) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET is_team_plan = (p_new_value)::boolean, updated_at = now() WHERE id = p_plan_id;

    WHEN 'seats_included' THEN
      SELECT to_jsonb(seats_included) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET seats_included = NULL, updated_at = now() WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET seats_included = (v_new_text)::integer, updated_at = now() WHERE id = p_plan_id;
      END IF;

    WHEN 'modules' THEN
      IF jsonb_typeof(p_new_value) != 'array' THEN
        RAISE EXCEPTION 'modules must be jsonb-array' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(modules) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans
        SET modules = ARRAY(SELECT jsonb_array_elements_text(p_new_value))::text[],
            updated_at = now()
        WHERE id = p_plan_id;

    WHEN 'permissions' THEN
      IF jsonb_typeof(p_new_value) != 'array' THEN
        RAISE EXCEPTION 'permissions must be jsonb-array' USING ERRCODE = '22023';
      END IF;
      SELECT permissions INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET permissions = p_new_value, updated_at = now() WHERE id = p_plan_id;

    WHEN 'is_active' THEN
      IF jsonb_typeof(p_new_value) != 'boolean' THEN
        RAISE EXCEPTION 'is_active must be jsonb-boolean' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(is_active) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET is_active = (p_new_value)::boolean, updated_at = now() WHERE id = p_plan_id;

    WHEN 'description' THEN
      SELECT to_jsonb(description) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET description = v_new_text, updated_at = now() WHERE id = p_plan_id;

    ELSE
      RAISE EXCEPTION 'Field not editable (case mismatch): %', p_field_name USING ERRCODE = '22023';
  END CASE;

  -- Audit-Trail
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'plan_field_update', 'plans', p_plan_id,
    p_field_name, v_before, p_new_value, p_reason
  ) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success',  true,
    'plan_id',  p_plan_id,
    'field',    p_field_name,
    'audit_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_plan(uuid, text, jsonb, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
