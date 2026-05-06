-- Block 5.5 Vor-Migration: stripe_price_id + plan_managed_by zu plans
--
-- Schema-Drift Repo vs Hetzner (CLAUDE.md Top-Fallstrick #8):
--   - Staging: KEIN stripe_price_id, KEIN plan_managed_by
--   - Prod:    HAT stripe_price_id (text nullable), KEIN plan_managed_by
--
-- Diese Migration fuegt die fehlenden Cols additiv + idempotent hinzu:
--   - ADD COLUMN IF NOT EXISTS skipped wenn Col schon da (Prod: stripe_price_id)
--   - DEFAULT 'leadesk' fuer plan_managed_by → existing Rows bekommen Default
--   - CHECK-Constraint via DROP+ADD-Pattern (Lehre Block-5.1-Hotfix)
--
-- Verwendung:
--   - Block 5.5a Plans.jsx (admin) zeigt Spalten "Stripe-ID" + "Verwaltet"
--   - Block 5.5b PlanEditModal hat Tab "Stripe" mit stripe_price_id-Input
--   - Block 5.5d Billing.jsx (app) liest plans.stripe_price_id DB-driven
--
-- Reversibel via:
--   ALTER TABLE plans DROP COLUMN plan_managed_by, DROP COLUMN stripe_price_id;
--   (auf Prod nur DROP plan_managed_by, weil stripe_price_id schon vorher da war)

BEGIN;

-- ============================================================
-- A. Schema-Adds (idempotent via IF NOT EXISTS)
-- ============================================================
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_managed_by text NOT NULL DEFAULT 'leadesk';

-- ============================================================
-- B. CHECK-Constraint plan_managed_by IN ('leadesk', 'stripe')
--    DROP+ADD-Pattern fuer Idempotenz (Lehre Block-5.1)
-- ============================================================
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_managed_by_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_managed_by_check
  CHECK (plan_managed_by IN ('leadesk', 'stripe'));

-- ============================================================
-- C. Verifikation
-- ============================================================
DO $$
DECLARE
  v_null_count int;
  v_invalid_count int;
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM public.plans;

  SELECT count(*) INTO v_null_count FROM public.plans
  WHERE plan_managed_by IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Migration FAILED: % plans without plan_managed_by', v_null_count;
  END IF;

  SELECT count(*) INTO v_invalid_count FROM public.plans
  WHERE plan_managed_by NOT IN ('leadesk', 'stripe');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Migration FAILED: % plans with invalid plan_managed_by', v_invalid_count;
  END IF;

  RAISE NOTICE 'Migration OK: % plans, alle mit plan_managed_by IN (leadesk, stripe)', v_total;
END $$;

COMMIT;

-- PostgREST Schema-Cache reload
NOTIFY pgrst, 'reload schema';
