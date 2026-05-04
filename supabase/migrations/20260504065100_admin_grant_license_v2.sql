-- Phase 5: License-RPC v2 mit Audit-Trail
--
-- Architektur-Entscheidungen (PHASE_5_DECISIONS.md + Block-2-Discovery):
--   Q1=1A: neue Spalte accounts.plan_expires_at timestamptz (account-zentrisch,
--          additiv). profiles.plan_expires_at bleibt unberuehrt (Phase 5C drop).
--   Q2=2D: nur granted_via neu; plan_managed_by UNBERUEHRT
--          (existing Authority-Spalte fuer enforce_plan_change_authority Trigger).
--   Q3=eigener RPC: admin_account_set_plan UNBERUEHRT (PlanChangeModal-Caller heil).
--   Bonus: per-Field-Audit (3 INSERT-Rows max), wie existing Pattern in
--          update_account_with_audit. Spalten: target_table, target_id, field_name,
--          before_value, after_value (jsonb), reason, action, admin_user_id.
--
-- Trigger-Kompatibilitaet:
--   enforce_plan_change_authority laesst service_role + postgres + is_leadesk_admin
--   durch. SECURITY DEFINER-RPC laeuft als postgres (current_user) → durchgelassen.
--   Auth-Gate via JWT-Claim wird im RPC-Body vor UPDATE geprueft (defense-in-depth).
--
-- admin_audit_log_reason_check (length(reason) >= 10) ist bestehend; RPC validiert
--   denselben Wert vorher fuer bessere Fehlermeldung. Doppel-Check ist Belt-and-Suspenders.

BEGIN;

-- 1. Schema-Adds (additiv, idempotent)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS granted_via text NOT NULL DEFAULT 'stripe'
  CHECK (granted_via IN ('stripe', 'manual', 'trial'));

COMMENT ON COLUMN public.accounts.plan_expires_at IS
  'Account-level license expiry. NULL = no expiry. Phase 5 license-grant RPC writes this.';

COMMENT ON COLUMN public.accounts.granted_via IS
  'Provenance of last plan_id change: stripe (subscription webhook), manual (admin grant), trial (auto). Distinct from plan_managed_by (authority).';

-- 2. RPC admin_grant_license_v2
CREATE OR REPLACE FUNCTION public.admin_grant_license_v2(
  p_target_account_id uuid,
  p_plan_id           uuid,
  p_expires_at        timestamptz,
  p_reason            text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_user_id   uuid;
  v_before_plan     uuid;
  v_before_expires  timestamptz;
  v_before_via      text;
BEGIN
  -- Auth-Gate (JWT-Claim)
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean,
       false
     ) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;

  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Reason-Validation (matches existing CHECK on admin_audit_log.reason)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- Plan-Existenz
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan % does not exist', p_plan_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Account-Existenz + before-state laden (per-Field-Audit-Pattern)
  SELECT plan_id, plan_expires_at, granted_via
  INTO v_before_plan, v_before_expires, v_before_via
  FROM public.accounts
  WHERE id = p_target_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account % does not exist', p_target_account_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Update accounts (3 Felder atomic in einer Transaction)
  UPDATE public.accounts
  SET plan_id         = p_plan_id,
      plan_expires_at = p_expires_at,
      granted_via     = 'manual',
      updated_at      = now()
  WHERE id = p_target_account_id;

  -- Audit-Trail: per-Field-Pattern, IS DISTINCT FROM-Guard verhindert No-Op-Audits
  -- before_value/after_value sind jsonb → to_jsonb() Cast (analog update_account_with_audit)

  IF v_before_plan IS DISTINCT FROM p_plan_id THEN
    INSERT INTO public.admin_audit_log (
      admin_user_id, action, target_table, target_id,
      field_name, before_value, after_value, reason
    ) VALUES (
      v_admin_user_id, 'license_grant', 'accounts', p_target_account_id,
      'plan_id', to_jsonb(v_before_plan), to_jsonb(p_plan_id), p_reason
    );
  END IF;

  IF v_before_expires IS DISTINCT FROM p_expires_at THEN
    INSERT INTO public.admin_audit_log (
      admin_user_id, action, target_table, target_id,
      field_name, before_value, after_value, reason
    ) VALUES (
      v_admin_user_id, 'license_grant', 'accounts', p_target_account_id,
      'plan_expires_at', to_jsonb(v_before_expires), to_jsonb(p_expires_at), p_reason
    );
  END IF;

  IF v_before_via IS DISTINCT FROM 'manual' THEN
    INSERT INTO public.admin_audit_log (
      admin_user_id, action, target_table, target_id,
      field_name, before_value, after_value, reason
    ) VALUES (
      v_admin_user_id, 'license_grant', 'accounts', p_target_account_id,
      'granted_via', to_jsonb(v_before_via), to_jsonb('manual'::text), p_reason
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_grant_license_v2 IS
  'Phase 5 License-Grant: Sets account plan_id + plan_expires_at + granted_via=manual atomically, with per-field audit trail. Reason min 10 chars. Action=license_grant. Returns void (caller checks for exception).';

-- 3. Permissions
GRANT EXECUTE ON FUNCTION public.admin_grant_license_v2(uuid, uuid, timestamptz, text) TO authenticated;

-- 4. PostgREST schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;
