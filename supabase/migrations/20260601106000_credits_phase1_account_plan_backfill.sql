-- Credits Phase 1 — Account + Profile Plan-Backfill
-- ─────────────────────────────────────────────────────────────────
-- Mapping bestehender Accounts/Profiles auf neue Pläne:
--   free-legacy → free        (Post-Trial-Restricted)
--   starter     → sales       (€29 → €29, gleicher Preis)
--   pro         → marketing   (€79 → €79, gleicher Preis)
--   business    → all-in      (€199 → €119, Feature-Upgrade — Staging hat 0 Accounts)
--   enterprise  → all-in      (€199 → €119, Feature-Upgrade)
--
-- Backfill auf BEIDEN Tabellen (accounts.plan_id + profiles.plan_id),
-- weil Phase-3-Refactor noch nicht beide vollständig synchronisiert hat.
--
-- Reihenfolge:
--   1. accounts updaten (FK auf plans)
--   2. profiles updaten (FK auf plans)
--   3. Verify: kein Account/Profile auf altem Plan
--   4. Alte 5 Pläne is_active=false setzen
--
-- Idempotent: UPDATEs sind no-op wenn schon gemapped. Rollback via
-- inverse-mapping möglich solange alte Pläne nicht gedroppt sind.

BEGIN;

-- ── 1. accounts.plan_id mappen ───────────────────────────────────
DO $$
DECLARE
  v_sales_id      uuid := (SELECT id FROM public.plans WHERE slug = 'sales'      LIMIT 1);
  v_marketing_id  uuid := (SELECT id FROM public.plans WHERE slug = 'marketing'  LIMIT 1);
  v_all_in_id     uuid := (SELECT id FROM public.plans WHERE slug = 'all-in'     LIMIT 1);
  v_free_id       uuid := (SELECT id FROM public.plans WHERE slug = 'free' AND license_type='free' LIMIT 1);

  v_starter_id    uuid := (SELECT id FROM public.plans WHERE slug = 'starter'     LIMIT 1);
  v_pro_id        uuid := (SELECT id FROM public.plans WHERE slug = 'pro'         LIMIT 1);
  v_business_id   uuid := (SELECT id FROM public.plans WHERE slug = 'business'    LIMIT 1);
  v_enterprise_id uuid := (SELECT id FROM public.plans WHERE slug = 'enterprise'  LIMIT 1);
  v_free_legacy_id uuid := (SELECT id FROM public.plans WHERE slug = 'free-legacy' LIMIT 1);

  v_count_total int;
  v_count_acc   int;
BEGIN
  -- Sanity-Check: alle Target-Pläne müssen existieren
  IF v_sales_id IS NULL OR v_marketing_id IS NULL OR v_all_in_id IS NULL OR v_free_id IS NULL THEN
    RAISE EXCEPTION 'Migration FAILED: ein oder mehrere Target-Pläne (sales/marketing/all-in/free) fehlen';
  END IF;

  -- accounts.plan_id Mapping
  IF v_starter_id IS NOT NULL THEN
    UPDATE public.accounts SET plan_id = v_sales_id WHERE plan_id = v_starter_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'accounts: % Rows starter → sales', v_count_acc;
  END IF;

  IF v_pro_id IS NOT NULL THEN
    UPDATE public.accounts SET plan_id = v_marketing_id WHERE plan_id = v_pro_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'accounts: % Rows pro → marketing', v_count_acc;
  END IF;

  IF v_business_id IS NOT NULL THEN
    UPDATE public.accounts SET plan_id = v_all_in_id WHERE plan_id = v_business_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'accounts: % Rows business → all-in', v_count_acc;
  END IF;

  IF v_enterprise_id IS NOT NULL THEN
    UPDATE public.accounts SET plan_id = v_all_in_id WHERE plan_id = v_enterprise_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'accounts: % Rows enterprise → all-in', v_count_acc;
  END IF;

  IF v_free_legacy_id IS NOT NULL THEN
    UPDATE public.accounts SET plan_id = v_free_id WHERE plan_id = v_free_legacy_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'accounts: % Rows free-legacy → free', v_count_acc;
  END IF;

  -- ── 2. profiles.plan_id mappen (gleiche Logik) ────────────────
  IF v_starter_id IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_sales_id WHERE plan_id = v_starter_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'profiles: % Rows starter → sales', v_count_acc;
  END IF;

  IF v_pro_id IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_marketing_id WHERE plan_id = v_pro_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'profiles: % Rows pro → marketing', v_count_acc;
  END IF;

  IF v_business_id IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_all_in_id WHERE plan_id = v_business_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'profiles: % Rows business → all-in', v_count_acc;
  END IF;

  IF v_enterprise_id IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_all_in_id WHERE plan_id = v_enterprise_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'profiles: % Rows enterprise → all-in', v_count_acc;
  END IF;

  IF v_free_legacy_id IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_free_id WHERE plan_id = v_free_legacy_id;
    GET DIAGNOSTICS v_count_acc = ROW_COUNT;
    RAISE NOTICE 'profiles: % Rows free-legacy → free', v_count_acc;
  END IF;

  -- ── 3. Verifikation: kein Account/Profile mehr auf altem Plan ─
  SELECT count(*) INTO v_count_total
  FROM public.accounts
  WHERE plan_id IN (v_starter_id, v_pro_id, v_business_id, v_enterprise_id, v_free_legacy_id);
  IF v_count_total > 0 THEN
    RAISE EXCEPTION 'Backfill FAILED: % accounts noch auf altem Plan', v_count_total;
  END IF;

  SELECT count(*) INTO v_count_total
  FROM public.profiles
  WHERE plan_id IN (v_starter_id, v_pro_id, v_business_id, v_enterprise_id, v_free_legacy_id);
  IF v_count_total > 0 THEN
    RAISE EXCEPTION 'Backfill FAILED: % profiles noch auf altem Plan', v_count_total;
  END IF;

  RAISE NOTICE 'Backfill OK: alle accounts + profiles auf neue Pläne migriert';
END $$;

-- ── 4. Alte 5 Pläne deaktivieren ─────────────────────────────────
-- is_active=false → UI-Filter blendet aus; FKs bleiben gültig (kein DELETE).
UPDATE public.plans
   SET is_active = false
 WHERE slug IN ('starter','pro','business','enterprise','free-legacy');

COMMIT;

NOTIFY pgrst, 'reload schema';
