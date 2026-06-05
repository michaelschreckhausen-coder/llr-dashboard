-- File: 20260605120000_pricing_v2_plans_and_topup_offers_update.sql
-- Sprint M.1 — Pricing v2 (Source: Leadesk_Pricing_v2.docx, 2026-06-05)
--
-- Updated alle 9 plans + 9 credit_topup_offers auf v2-Werte.
-- Stripe_price_id*-Spalten werden NICHT angefasst — die kommen separat
-- in Sprint M.3 nach Stripe-Setup-Script-Run.
--
-- ÄNDERUNGEN ÜBERBLICK (gegenüber Credits-Phase-1-Seed):
--
-- ┌──────────────┬─────────────┬─────────────┬─────────────────────────────┐
-- │ Plan         │ Preis mo/yr │ Credits     │ Sonstiges                   │
-- ├──────────────┼─────────────┼─────────────┼─────────────────────────────┤
-- │ sales        │ 29→39/23→31 │ 6000→5000   │ CRM 500/2500 → 250/1000     │
-- │ marketing    │ 79→79/63→63 │ 10k→15k     │ allowed_tiers +premium      │
-- │ all-in       │ 119→119     │ 20k→25k     │ —                           │
-- │ sales-team   │ 49→69/43→55 │ 12k→10k     │ CRM 1000/5000 → 500/2000    │
-- │ marketing-t  │134→139/107→111│20k→30k    │ allowed_tiers +premium      │
-- │ kmu          │159→149/149→119│32k→35k    │ —                           │
-- │ customized   │ 499→199     │ —           │ price_monthly Mindestpreis  │
-- │ trial        │ 0/0         │ 1000→500    │ All-In-Set + premium + 5GB  │
-- │ free         │ 0/0         │ 100→100     │ All-In-Module, 1 GB         │
-- └──────────────┴─────────────┴─────────────┴─────────────────────────────┘
--
-- Top-Ups (alle 9 sinken):
--   Credits: 1k 9→6 / 5k 39→25 / 20k 149→89 / 50k 329→199
--   Storage: 10g 5→3 / 50g 19→10 / 200g 59→29
--   CRM:     100c 5→3 / 500k 10→5
--
-- KEINE Schema-Änderung — alle Spalten existieren seit Credits-Phase-1.
-- Idempotent: UPDATE...WHERE slug=... ist re-runnable.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Plans-Updates (9 rows)
-- ════════════════════════════════════════════════════════════════════════════

-- Sales — €39/Mo, 5000 Credits, kleinere CRM-Limits
UPDATE public.plans
   SET price_monthly        = 39,
       price_yearly         = 31,
       credits_quota        = 5000,
       storage_quota_gb     = 5,
       crm_quota_companies  = 250,
       crm_quota_contacts   = 1000,
       brand_voices_limit   = 1,
       allowed_model_tiers  = ARRAY['basic']::text[],
       description          = 'CRM, LinkedIn-Vernetzung und Sales-AI für Einzelnutzer. Premium-Modelle als Add-On (+15 €/Mo) verfügbar.'
 WHERE slug = 'sales';

-- Marketing — Premium inkludiert, mehr Credits
UPDATE public.plans
   SET price_monthly        = 79,
       price_yearly         = 63,
       credits_quota        = 15000,
       storage_quota_gb     = 25,
       brand_voices_limit   = 3,
       allowed_model_tiers  = ARRAY['basic','premium']::text[],
       description          = 'Content + LinkedIn + Premium-AI-Modelle für Solo-Marketing'
 WHERE slug = 'marketing';

-- All-In — 25k Credits (war 20k)
UPDATE public.plans
   SET price_monthly        = 119,
       price_yearly         = 95,
       credits_quota        = 25000,
       storage_quota_gb     = 50,
       allowed_model_tiers  = ARRAY['basic','premium']::text[],
       description          = 'Komplette Suite für Solo-Founder inkl. Premium-Modelle'
 WHERE slug = 'all-in';

-- Sales Team — €69/Mo, Credits sinken auf 10k
UPDATE public.plans
   SET price_monthly        = 69,
       price_yearly         = 55,
       credits_quota        = 10000,
       storage_quota_gb     = 10,
       crm_quota_companies  = 500,
       crm_quota_contacts   = 2000,
       brand_voices_limit   = 2,
       allowed_model_tiers  = ARRAY['basic']::text[],
       description          = '2 Sales-Seats mit gemeinsamem Credit-Pool. Premium-Add-On pro Seat verfügbar.'
 WHERE slug = 'sales-team';

-- Marketing Team — €139/Mo, 30k Credits, Premium inkludiert
UPDATE public.plans
   SET price_monthly        = 139,
       price_yearly         = 111,
       credits_quota        = 30000,
       storage_quota_gb     = 50,
       brand_voices_limit   = 6,
       allowed_model_tiers  = ARRAY['basic','premium']::text[],
       description          = '2 Marketing-Seats mit gemeinsamem Credit-Pool und Brand-Voice-Diversität'
 WHERE slug = 'marketing-team';

-- KMU — €149/Mo (war 159), 35k Credits, brand_voices unbegrenzt
UPDATE public.plans
   SET price_monthly        = 149,
       price_yearly         = 119,
       credits_quota        = 35000,
       storage_quota_gb     = 60,
       brand_voices_limit   = NULL,        -- unbegrenzt (via All-In-Seat)
       allowed_model_tiers  = ARRAY['basic','premium']::text[],
       description          = '2 Sales + 1 All-In Seat. Geteilte Credits, Premium für All-In-Seat inkl., Sales-Seats Add-On.'
 WHERE slug = 'kmu';

-- Customized — Mindestpreis von 499 auf 199
UPDATE public.plans
   SET price_monthly        = 199,
       price_yearly         = NULL,
       allowed_model_tiers  = ARRAY['basic','premium']::text[],
       description          = 'Individuelles Team-Setup ab 4 Seats. Bedarfsanalyse + maßgeschneiderter Lizenz-Mix.'
 WHERE slug = 'customized';

-- Trial — Logik gedreht: 3 Tage All-In + Premium, 500 Credits, 5 GB
-- (Modules + premium-tier sind die echten v2-Werte; trial_days=3 stand schon)
UPDATE public.plans
   SET credits_quota        = 500,
       storage_quota_gb     = 5,
       crm_quota_companies  = NULL,
       crm_quota_contacts   = NULL,
       brand_voices_limit   = NULL,
       audiences_limit      = NULL,
       knowledge_resources_limit = NULL,
       modules              = ARRAY['branding','crm','linkedin','content','delivery','reports']::text[],
       allowed_model_tiers  = ARRAY['basic','premium']::text[],
       trial_days           = 3,
       description          = '3 Tage kostenloser Vollzugriff auf All-In inkl. Premium-Modelle. 500 Credits, 5 GB.'
 WHERE slug = 'trial';

-- Free — komplettes Featureset (war nur branding/crm), 1 GB statt 50 MB
UPDATE public.plans
   SET credits_quota        = 100,
       storage_quota_gb     = 1,
       crm_quota_companies  = NULL,
       crm_quota_contacts   = NULL,
       brand_voices_limit   = 1,
       audiences_limit      = NULL,
       knowledge_resources_limit = NULL,
       modules              = ARRAY['branding','crm','linkedin','content','delivery','reports']::text[],
       allowed_model_tiers  = ARRAY['basic']::text[],
       description          = 'Dauerhaft kostenlos. 100 Credits einmalig, alle Funktionen verfügbar, LinkedIn-Posting max. 1/Monat, keine Premium-Modelle.'
 WHERE slug = 'free';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Top-Ups (9 rows) — Credits + Storage + CRM
-- ════════════════════════════════════════════════════════════════════════════

-- Credit-Top-Ups (one-shot, mode='payment')
UPDATE public.credit_topup_offers
   SET price_eur         = 6,
       short_description = 'Einstiegspaket — etwa 30 LinkedIn-Posts oder 90 KI-Bilder'
 WHERE slug = 'credits-1k';

UPDATE public.credit_topup_offers
   SET price_eur         = 25,
       short_description = 'Etwa 150 LinkedIn-Posts oder 450 KI-Bilder — 5,00 € / 1.000 Credits'
 WHERE slug = 'credits-5k';

UPDATE public.credit_topup_offers
   SET price_eur         = 89,
       short_description = 'Großes Kampagnen-Paket — 4,45 € / 1.000 Credits'
 WHERE slug = 'credits-20k';

UPDATE public.credit_topup_offers
   SET price_eur         = 199,
       short_description = 'Bester Volumen-Preis — 3,98 € / 1.000 Credits'
 WHERE slug = 'credits-50k';

-- Storage-Top-Ups (recurring monthly)
UPDATE public.credit_topup_offers
   SET price_eur         = 3,
       short_description = 'Monatlich · ca. 2.000 KI-Bilder zusätzlich'
 WHERE slug = 'storage-10gb';

UPDATE public.credit_topup_offers
   SET price_eur         = 10,
       short_description = 'Monatlich · für intensive Content-Produktion'
 WHERE slug = 'storage-50gb';

UPDATE public.credit_topup_offers
   SET price_eur         = 29,
       short_description = 'Monatlich · für Power-User mit Video-Material'
 WHERE slug = 'storage-200gb';

-- CRM-Top-Ups (recurring monthly)
UPDATE public.credit_topup_offers
   SET price_eur         = 3
 WHERE slug = 'crm-companies-100';

UPDATE public.credit_topup_offers
   SET price_eur         = 5
 WHERE slug = 'crm-contacts-500';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Verifikation — Strict Equality Checks
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_row jsonb;
  v_expected_plans jsonb := jsonb_build_object(
    'sales',          jsonb_build_object('price_monthly', 39,  'price_yearly', 31,  'credits_quota', 5000,  'storage_quota_gb', 5),
    'marketing',      jsonb_build_object('price_monthly', 79,  'price_yearly', 63,  'credits_quota', 15000, 'storage_quota_gb', 25),
    'all-in',         jsonb_build_object('price_monthly', 119, 'price_yearly', 95,  'credits_quota', 25000, 'storage_quota_gb', 50),
    'sales-team',     jsonb_build_object('price_monthly', 69,  'price_yearly', 55,  'credits_quota', 10000, 'storage_quota_gb', 10),
    'marketing-team', jsonb_build_object('price_monthly', 139, 'price_yearly', 111, 'credits_quota', 30000, 'storage_quota_gb', 50),
    'kmu',            jsonb_build_object('price_monthly', 149, 'price_yearly', 119, 'credits_quota', 35000, 'storage_quota_gb', 60),
    'customized',     jsonb_build_object('price_monthly', 199, 'price_yearly', null),
    'trial',          jsonb_build_object('price_monthly', 0,   'price_yearly', 0,   'credits_quota', 500,   'storage_quota_gb', 5,  'trial_days', 3),
    'free',           jsonb_build_object('price_monthly', 0,   'price_yearly', 0,   'credits_quota', 100,   'storage_quota_gb', 1)
  );
  v_expected_topups jsonb := jsonb_build_object(
    'credits-1k', 6, 'credits-5k', 25, 'credits-20k', 89, 'credits-50k', 199,
    'storage-10gb', 3, 'storage-50gb', 10, 'storage-200gb', 29,
    'crm-companies-100', 3, 'crm-contacts-500', 5
  );
  v_key text;
  v_actual_count int;
BEGIN
  -- Plans-Check
  FOR v_key IN SELECT jsonb_object_keys(v_expected_plans) LOOP
    SELECT jsonb_build_object(
             'price_monthly', price_monthly,
             'price_yearly', price_yearly,
             'credits_quota', credits_quota,
             'storage_quota_gb', storage_quota_gb,
             'trial_days', trial_days
           ) INTO v_row
      FROM public.plans WHERE slug = v_key;
    IF v_row IS NULL THEN
      RAISE EXCEPTION 'Pricing v2 verify: plan slug=% nicht gefunden', v_key;
    END IF;
    -- price_monthly
    IF (v_expected_plans -> v_key ->> 'price_monthly')::numeric IS DISTINCT FROM (v_row ->> 'price_monthly')::numeric THEN
      RAISE EXCEPTION 'Pricing v2 verify: plan % price_monthly mismatch (expected %, got %)',
        v_key, v_expected_plans -> v_key ->> 'price_monthly', v_row ->> 'price_monthly';
    END IF;
    -- price_yearly (NULL erlaubt für customized)
    IF (v_expected_plans -> v_key -> 'price_yearly') IS NOT NULL AND
       (v_expected_plans -> v_key ->> 'price_yearly')::numeric IS DISTINCT FROM (v_row ->> 'price_yearly')::numeric THEN
      RAISE EXCEPTION 'Pricing v2 verify: plan % price_yearly mismatch (expected %, got %)',
        v_key, v_expected_plans -> v_key ->> 'price_yearly', v_row ->> 'price_yearly';
    END IF;
    IF (v_expected_plans -> v_key -> 'price_yearly') IS NULL AND
       (v_row -> 'price_yearly') IS NOT NULL AND
       (v_row -> 'price_yearly') != 'null'::jsonb THEN
      RAISE EXCEPTION 'Pricing v2 verify: plan % expected price_yearly NULL, got %', v_key, v_row ->> 'price_yearly';
    END IF;
    -- credits_quota (wo erwartet)
    IF v_expected_plans -> v_key -> 'credits_quota' IS NOT NULL AND
       (v_expected_plans -> v_key ->> 'credits_quota')::int IS DISTINCT FROM (v_row ->> 'credits_quota')::int THEN
      RAISE EXCEPTION 'Pricing v2 verify: plan % credits_quota mismatch (expected %, got %)',
        v_key, v_expected_plans -> v_key ->> 'credits_quota', v_row ->> 'credits_quota';
    END IF;
    -- storage_quota_gb (wo erwartet)
    IF v_expected_plans -> v_key -> 'storage_quota_gb' IS NOT NULL AND
       (v_expected_plans -> v_key ->> 'storage_quota_gb')::numeric IS DISTINCT FROM (v_row ->> 'storage_quota_gb')::numeric THEN
      RAISE EXCEPTION 'Pricing v2 verify: plan % storage_quota_gb mismatch (expected %, got %)',
        v_key, v_expected_plans -> v_key ->> 'storage_quota_gb', v_row ->> 'storage_quota_gb';
    END IF;
  END LOOP;

  -- Trial-Plan: trial_days = 3 (eigene Check weil oben nur als optional dabei)
  SELECT trial_days INTO v_actual_count FROM public.plans WHERE slug = 'trial';
  IF v_actual_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Pricing v2 verify: trial.trial_days expected 3, got %', v_actual_count;
  END IF;

  -- Trial-Plan: modules = All-In-Set (6 modules)
  SELECT cardinality(modules) INTO v_actual_count FROM public.plans WHERE slug = 'trial';
  IF v_actual_count != 6 THEN
    RAISE EXCEPTION 'Pricing v2 verify: trial expected 6 modules (All-In), got %', v_actual_count;
  END IF;

  -- Free-Plan: 6 modules (war 2)
  SELECT cardinality(modules) INTO v_actual_count FROM public.plans WHERE slug = 'free';
  IF v_actual_count != 6 THEN
    RAISE EXCEPTION 'Pricing v2 verify: free expected 6 modules (All-In), got %', v_actual_count;
  END IF;

  -- Top-Ups-Check
  FOR v_key IN SELECT jsonb_object_keys(v_expected_topups) LOOP
    SELECT price_eur::int INTO v_actual_count FROM public.credit_topup_offers WHERE slug = v_key;
    IF v_actual_count IS NULL THEN
      RAISE EXCEPTION 'Pricing v2 verify: topup slug=% nicht gefunden', v_key;
    END IF;
    IF v_actual_count != (v_expected_topups ->> v_key)::int THEN
      RAISE EXCEPTION 'Pricing v2 verify: topup % price_eur mismatch (expected %, got %)',
        v_key, v_expected_topups ->> v_key, v_actual_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Sprint M.1 (Pricing v2) verification PASSED: 9 plans + 9 topups updated and verified strict-equal';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
