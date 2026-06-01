-- ════════════════════════════════════════════════════════════════════════════
-- Credits Phase 3 — UPDATE credit_topup_offers Stripe-IDs (LIVE)
-- Generated 2026-06-01 from stripe-ids-live.json (Live-Script-Run)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Rules:
--   - 9 Topup-Offers (4 credits one-time + 3 storage recurring + 2 crm recurring)
--     bekommen Stripe-Live-Product-ID + Price-ID.
--   - stripe_product_id wurde aus dem Live-Script-Terminal-Output extrahiert
--     (nicht im stripe-ids-live.json — JSON enthält nur price_ids).
--   - Migration ist idempotent (UPDATE auf gleiche Werte ist no-op).
--
-- Apply-Pfad (Prod):
--   ssh root@128.140.123.163 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
--     < supabase/migrations/20260601150100_credits_phase3_topups_stripe_price_ids_live.sql

BEGIN;

-- ─── Credits (4× one-time) ───────────────────────────────────────────
UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLlw0VgyKJ23',
       stripe_price_id   = 'price_1TdQ0kQwPiYPh1r59oMpounb'
 WHERE slug = 'credits-1k';

UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLSRHyy44XEK',
       stripe_price_id   = 'price_1TdQ0lQwPiYPh1r5rQZI0XIK'
 WHERE slug = 'credits-5k';

UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLiCzM816jCL',
       stripe_price_id   = 'price_1TdQ0lQwPiYPh1r5omChw0SL'
 WHERE slug = 'credits-20k';

UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLHb3a6ipfxb',
       stripe_price_id   = 'price_1TdQ0mQwPiYPh1r5wclIcbdm'
 WHERE slug = 'credits-50k';

-- ─── Storage (3× recurring monthly) ──────────────────────────────────
UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfL8wPYZHe0Az',
       stripe_price_id   = 'price_1TdQ0nQwPiYPh1r578JpSUnm'
 WHERE slug = 'storage-10gb';

UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLAgkN8ipCbC',
       stripe_price_id   = 'price_1TdQ0nQwPiYPh1r5280pgkhD'
 WHERE slug = 'storage-50gb';

UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLYZJEWPKjIh',
       stripe_price_id   = 'price_1TdQ0oQwPiYPh1r5HZuBHmn7'
 WHERE slug = 'storage-200gb';

-- ─── CRM (2× recurring monthly) ──────────────────────────────────────
UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLGjl1vlcbCW',
       stripe_price_id   = 'price_1TdQ0pQwPiYPh1r5XEGQK7K6'
 WHERE slug = 'crm-companies-100';

UPDATE public.credit_topup_offers
   SET stripe_product_id = 'prod_UcfLz6uE0wuXLF',
       stripe_price_id   = 'price_1TdQ0pQwPiYPh1r59wFXF5Bx'
 WHERE slug = 'crm-contacts-500';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.credit_topup_offers
  WHERE stripe_price_id IS NOT NULL AND stripe_product_id IS NOT NULL;
  IF v_count != 9 THEN
    RAISE EXCEPTION 'Expected 9 topup_offers wired to Live Stripe, got %', v_count;
  END IF;
  RAISE NOTICE 'Migration OK: 9 credit_topup_offers wired to Live Stripe (4 credits + 3 storage + 2 crm)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
