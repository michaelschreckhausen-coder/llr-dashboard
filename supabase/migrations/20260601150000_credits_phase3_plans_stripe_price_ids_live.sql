-- ════════════════════════════════════════════════════════════════════════════
-- Credits Phase 3 — UPDATE plans.stripe_price_id + stripe_price_id_yearly (LIVE)
-- Generated 2026-06-01 from stripe-ids-live.json (Live-Script-Run)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Rules:
--   - 7 paid Plans bekommen Stripe-Live-Price-IDs (monthly + yearly).
--   - customized hat KEIN yearly (kein price_yearly im Pricing-Doc).
--   - Migration ist idempotent (UPDATE auf gleiche Werte ist no-op).
--   - Reversible: cp Backup /tmp/stripe-backfill-pre-20260531-234358.sql restore.
--
-- Apply-Pfad (Prod):
--   ssh root@128.140.123.163 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
--     < supabase/migrations/20260601150000_credits_phase3_plans_stripe_price_ids_live.sql

BEGIN;

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0dQwPiYPh1r5LfNOIOB6',
       stripe_price_id_yearly = 'price_1TdQ0eQwPiYPh1r5FAbkIbmg'
 WHERE slug = 'sales';

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0eQwPiYPh1r5KKkcY2yS',
       stripe_price_id_yearly = 'price_1TdQ0fQwPiYPh1r5EgCRLFTN'
 WHERE slug = 'marketing';

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0fQwPiYPh1r5x0Ea0UDy',
       stripe_price_id_yearly = 'price_1TdQ0gQwPiYPh1r5vCHiG5gu'
 WHERE slug = 'all-in';

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0gQwPiYPh1r5WpSTCDgG',
       stripe_price_id_yearly = 'price_1TdQ0hQwPiYPh1r5eqq0i6ZJ'
 WHERE slug = 'sales-team';

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0hQwPiYPh1r5yH3mWsSs',
       stripe_price_id_yearly = 'price_1TdQ0iQwPiYPh1r5sO6yHSI4'
 WHERE slug = 'marketing-team';

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0iQwPiYPh1r5GNk2LZBW',
       stripe_price_id_yearly = 'price_1TdQ0jQwPiYPh1r5wRxKukiu'
 WHERE slug = 'kmu';

UPDATE public.plans
   SET stripe_price_id        = 'price_1TdQ0jQwPiYPh1r5V5kK55ma',
       stripe_price_id_yearly = NULL
 WHERE slug = 'customized';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.plans
  WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized')
    AND stripe_price_id IS NOT NULL;
  IF v_count != 7 THEN
    RAISE EXCEPTION 'Expected 7 plans wired to Live Stripe, got %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.plans
  WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu')
    AND stripe_price_id_yearly IS NOT NULL;
  IF v_count != 6 THEN
    RAISE EXCEPTION 'Expected 6 plans with yearly Live-Price (customized excluded), got %', v_count;
  END IF;

  RAISE NOTICE 'Migration OK: 7 plans wired to Live Stripe (6 mit yearly, customized monthly-only)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
