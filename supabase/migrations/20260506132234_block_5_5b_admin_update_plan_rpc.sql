-- Block 5.5b Vor-Migration: admin_update_plan RPC
--
-- Phase-1.3-Style per-Field-Update mit Audit-Trail. Wird von
-- PlanEditModal in admin.leadesk.de fuer Basics + Stripe-Edits genutzt
-- (Permissions-Edit hat eigene RPC admin_update_plan_permissions).
--
-- Field-Whitelist: name, slug, price_monthly, price_yearly,
--                  stripe_price_id, plan_managed_by
--
-- Validation:
--   - is_leadesk_admin Auth-Gate (42501)
--   - Reason >= 10 chars (22023, matched admin_audit_log_reason_check)
--   - field_name in Whitelist (22023)
--   - name darf nicht 'Enterprise' (Sales-Garantie, 22023)
--   - plan_managed_by IN ('leadesk','stripe') (22023)
--   - slug UNIQUE-Check (23505 conflict)
--   - Plan-Existenz (P0002)
--
-- Type-Coercion in CASE-Block:
--   - price_monthly / price_yearly → integer
--   - alle anderen → text
--   - jsonb-null fuer NULL-Setting (analog update_account_with_audit)
--
-- search_path: public, auth, extensions, pg_temp (extensions wegen
-- gen_random_uuid()-Reference falls noetig; defensiv).
--
-- Reversibel via:
--   DROP FUNCTION IF EXISTS public.admin_update_plan(uuid, text, jsonb, text);

BEGIN;

-- ============================================================
-- DROP+CREATE-Pattern (idempotent re-apply)
-- ============================================================
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
    'name', 'slug', 'price_monthly', 'price_yearly',
    'stripe_price_id', 'plan_managed_by'
  ];
  v_new_text       text;
  v_existing_slug  text;
BEGIN
  -- Auth-Gate
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean,
    false
  );
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin required'
      USING ERRCODE = '42501';
  END IF;

  -- Reason-Validation (matched admin_audit_log_reason_check)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- Field-Whitelist
  IF NOT (p_field_name = ANY(v_allowed_fields)) THEN
    RAISE EXCEPTION 'Field not editable: %', p_field_name
      USING ERRCODE = '22023';
  END IF;

  -- Plan-Existenz
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Field-spezifische Validation + Type-Coercion in CASE
  -- v_new_text = jsonb #>> '{}' (jsonb-string → plain text, oder NULL)
  v_new_text := p_new_value #>> '{}';

  CASE p_field_name
    WHEN 'name' THEN
      -- Sales-Garantie: kein Plan darf den Namen 'Enterprise' bekommen
      -- (genau eine Reihe darf so heissen, schuetzt is_enterprise-Logik
      -- in Frontend/get_my_entitlements).
      IF v_new_text = 'Enterprise' THEN
        RAISE EXCEPTION 'Plan name "Enterprise" is reserved (Sales-Garantie)'
          USING ERRCODE = '22023';
      END IF;
      IF v_new_text IS NULL OR length(trim(v_new_text)) = 0 THEN
        RAISE EXCEPTION 'Plan name cannot be empty'
          USING ERRCODE = '22023';
      END IF;

      SELECT to_jsonb(name) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET name = v_new_text, updated_at = now()
      WHERE id = p_plan_id;

    WHEN 'slug' THEN
      IF v_new_text IS NULL OR length(trim(v_new_text)) = 0 THEN
        RAISE EXCEPTION 'Plan slug cannot be empty'
          USING ERRCODE = '22023';
      END IF;
      -- UNIQUE-Check: nicht selbst-conflict (gleicher Plan), sonst 23505
      SELECT slug INTO v_existing_slug
      FROM public.plans
      WHERE slug = v_new_text AND id <> p_plan_id;
      IF FOUND THEN
        RAISE EXCEPTION 'Slug "%" is already used by another plan', v_new_text
          USING ERRCODE = '23505';
      END IF;

      SELECT to_jsonb(slug) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET slug = v_new_text, updated_at = now()
      WHERE id = p_plan_id;

    WHEN 'price_monthly' THEN
      SELECT to_jsonb(price_monthly) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET price_monthly = NULL, updated_at = now()
        WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans
        SET price_monthly = (v_new_text)::numeric, updated_at = now()
        WHERE id = p_plan_id;
      END IF;

    WHEN 'price_yearly' THEN
      SELECT to_jsonb(price_yearly) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL THEN
        UPDATE public.plans SET price_yearly = NULL, updated_at = now()
        WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans
        SET price_yearly = (v_new_text)::numeric, updated_at = now()
        WHERE id = p_plan_id;
      END IF;

    WHEN 'stripe_price_id' THEN
      SELECT to_jsonb(stripe_price_id) INTO v_before FROM public.plans WHERE id = p_plan_id;
      IF p_new_value = 'null'::jsonb OR p_new_value IS NULL OR v_new_text = '' THEN
        UPDATE public.plans SET stripe_price_id = NULL, updated_at = now()
        WHERE id = p_plan_id;
      ELSE
        UPDATE public.plans SET stripe_price_id = v_new_text, updated_at = now()
        WHERE id = p_plan_id;
      END IF;

    WHEN 'plan_managed_by' THEN
      IF v_new_text NOT IN ('leadesk', 'stripe') THEN
        RAISE EXCEPTION 'plan_managed_by must be "leadesk" or "stripe", got "%"', v_new_text
          USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(plan_managed_by) INTO v_before FROM public.plans WHERE id = p_plan_id;
      UPDATE public.plans SET plan_managed_by = v_new_text, updated_at = now()
      WHERE id = p_plan_id;

    ELSE
      RAISE EXCEPTION 'Field not editable (case mismatch): %', p_field_name
        USING ERRCODE = '22023';
  END CASE;

  -- Audit-Trail (Phase-1.3-Pattern, IS DISTINCT FROM-Guard nicht noetig
  -- weil ein No-Op-Update einfach mit before=after audited wird —
  -- Frontend ruft RPC nur bei dirty-Field, also schon vorgefiltert).
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

-- ============================================================
-- GRANTs (analog existing admin-RPCs)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.admin_update_plan(uuid, text, jsonb, text)
  TO authenticated;

COMMIT;

-- PostgREST Schema-Cache reload
NOTIFY pgrst, 'reload schema';
