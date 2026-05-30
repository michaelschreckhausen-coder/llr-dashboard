-- Pre-Flight für Credits-Phase-1 PROD-Cutover (Hetzner-Prod 128.140.123.163)
-- ─────────────────────────────────────────────────────────────────
-- READ-ONLY Diagnose. Analog zum Staging-Pre-Flight mit zusätzlichen
-- Prod-spezifischen Checks:
--   - Drift zu Staging (insbesondere description-Col, plans-Schema)
--   - Stripe-Subscriptions-Belegung (alter Stripe-Account)
--   - Account-Verteilung pro Plan (Backfill-Impact)
--   - Power-User-Detection (wer würde durch 10k-Quota blockiert werden)
--
-- Apply:
--   ssh root@128.140.123.163 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < scripts/preflight-credits-phase1-prod.sql

\echo '====================================================='
\echo '1. plans-Tabelle: Cols (Drift-Check ggü. Staging)'
\echo '====================================================='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='plans'
ORDER BY ordinal_position;

\echo ''
\echo '====================================================='
\echo '2. Hat Prod schon description-Col?'
\echo '(Staging hatte sie NICHT — Quick-Fix-Migration 104500 nötig)'
\echo '====================================================='
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='plans' AND column_name='description'
) AS description_col_exists;

\echo ''
\echo '====================================================='
\echo '3. plans-Rows: bestehende Pläne'
\echo '====================================================='
SELECT id, name, slug, is_active, modules,
       price_monthly, price_yearly, stripe_price_id, plan_managed_by
FROM public.plans
ORDER BY COALESCE(price_monthly, 0);

\echo ''
\echo '====================================================='
\echo '4. Konflikt-Check: schon existierende neue Cols?'
\echo '(sollte 0 rows zurückgeben)'
\echo '====================================================='
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='plans'
  AND column_name IN (
    'credits_quota','storage_quota_gb','crm_quota_companies','crm_quota_contacts',
    'brand_voices_limit','audiences_limit','knowledge_resources_limit',
    'license_type','allowed_model_tiers','is_team_plan','seats_included'
  );

\echo ''
\echo '====================================================='
\echo '5. Konflikt-Check: schon existierende credit_*-Tabellen?'
\echo '(sollte 0 rows zurückgeben)'
\echo '====================================================='
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'credit_%';

\echo ''
\echo '====================================================='
\echo '6. accounts: Verteilung pro Plan (Backfill-Impact)'
\echo '====================================================='
SELECT p.name AS plan_name, p.slug,
       COUNT(a.id) AS account_count,
       COUNT(*) FILTER (WHERE a.status='active') AS active_count
FROM public.plans p
LEFT JOIN public.accounts a ON a.plan_id = p.id
GROUP BY p.id, p.name, p.slug
ORDER BY account_count DESC NULLS LAST;

SELECT
  COUNT(*) AS total_accounts,
  COUNT(*) FILTER (WHERE plan_id IS NULL) AS accounts_without_plan,
  COUNT(*) FILTER (WHERE status='active')  AS active_accounts
FROM public.accounts;

\echo ''
\echo '====================================================='
\echo '7. profiles.plan_id: Verteilung'
\echo '====================================================='
SELECT p.name AS plan_name, COUNT(pr.id) AS profile_count
FROM public.plans p
LEFT JOIN public.profiles pr ON pr.plan_id = p.id
GROUP BY p.id, p.name
ORDER BY profile_count DESC NULLS LAST;

\echo ''
\echo '====================================================='
\echo '8. accounts.plan_id Typ + FK + handle_new_user-Trigger'
\echo '====================================================='
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='accounts' AND column_name='plan_id';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.accounts'::regclass AND contype='f' AND conname LIKE '%plan%';

-- handle_new_user-Source (zeigt aktuellen Lookup-Mechanismus)
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%is_default_trial%' THEN 'NEW (is_default_trial-Lookup) — Mig 8/8 schon applied?'
    WHEN pg_get_functiondef(p.oid) LIKE '%LOWER(name)%''free''%' THEN 'OLD (name=free-Lookup) — Mig 8/8 noch nicht applied'
    ELSE 'UNKNOWN — manueller Check via pg_get_functiondef nötig'
  END AS handle_new_user_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='handle_new_user'
LIMIT 1;

\echo ''
\echo '====================================================='
\echo '9. Stripe-State (alter Account)'
\echo '====================================================='
SELECT slug, name, stripe_price_id, plan_managed_by FROM public.plans
WHERE stripe_price_id IS NOT NULL
ORDER BY price_monthly NULLS LAST;

DO $$
DECLARE v_count bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='stripe_subscriptions') THEN
    EXECUTE 'SELECT count(*) FROM public.stripe_subscriptions' INTO v_count;
    RAISE NOTICE 'stripe_subscriptions_rows: %', v_count;
  ELSE
    RAISE NOTICE 'stripe_subscriptions-Tabelle existiert nicht';
  END IF;
END $$;

\echo ''
\echo '====================================================='
\echo '10. Extensions'
\echo '====================================================='
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net','pgcrypto');

\echo ''
\echo '====================================================='
\echo '11. Power-User-Heuristik: Accounts mit hoher AI-Aktivität'
\echo '(falls ai_usage_log-Tabelle existiert — gibt Hinweis ob 10k/Monat-Quota für Marketing-Plan reichen würde)'
\echo '====================================================='
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ai_usage_log') THEN
    FOR r IN EXECUTE $q$
      SELECT account_id::text AS aid,
             COUNT(*) AS calls,
             COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
      FROM public.ai_usage_log
      WHERE created_at >= now() - interval '30 days'
      GROUP BY account_id
      ORDER BY tokens DESC NULLS LAST
      LIMIT 10
    $q$ LOOP
      RAISE NOTICE 'account=% calls=% tokens=%', r.aid, r.calls, r.tokens;
    END LOOP;
  ELSE
    RAISE NOTICE 'ai_usage_log-Tabelle existiert nicht';
  END IF;
END $$;

\echo ''
\echo '====================================================='
\echo 'Pre-Flight DONE. Output reviewen vor Migration-Apply.'
\echo '====================================================='
