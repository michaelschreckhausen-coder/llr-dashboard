-- Pre-Flight für Credits-Phase-1 Schema-Migrationen
-- ─────────────────────────────────────────────────────────────────
-- READ-ONLY Diagnose vor Apply auf Hetzner-Staging.
--
-- Apply:
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin -d postgres' < scripts/preflight-credits-phase1.sql
--
-- Erwartete Outputs:
--   1. plans-Spalten (existing) → für Diff-Analyse
--   2. Plan-Rows (4 erwartet: free/starter/pro/enterprise)
--   3. accounts-Verteilung pro Plan → für Backfill-Mapping (Sprint B)
--   4. neue Cols sollten NICHT existieren (sonst Re-Run-Indikator)
--   5. credit_*-Tabellen sollten NICHT existieren
--   6. accounts.plan_id Typ + FK (uuid expected)
--   7. teams.account_id FK + team_members-Row-Count
--   8. Stripe-State: stripe_price_id-Belegung (für Stripe-Account-Wechsel-Awareness)
--   9. Extensions

\echo '====================================================='
\echo '1. plans-Tabelle: existing Cols'
\echo '====================================================='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='plans'
ORDER BY ordinal_position;

\echo ''
\echo '====================================================='
\echo '2. plans-Rows: bestehende Pläne'
\echo '====================================================='
SELECT id, name, slug, is_active, modules,
       price_monthly, price_yearly, stripe_price_id, plan_managed_by
FROM public.plans
ORDER BY COALESCE(price_monthly, 0);

\echo ''
\echo '====================================================='
\echo '3. accounts.plan_id: Verteilung bestehende Accounts'
\echo '====================================================='
SELECT p.name AS plan_name, p.slug, COUNT(a.id) AS account_count
FROM public.plans p
LEFT JOIN public.accounts a ON a.plan_id = p.id
GROUP BY p.id, p.name, p.slug
ORDER BY account_count DESC NULLS LAST;

SELECT
  COUNT(*) AS total_accounts,
  COUNT(*) FILTER (WHERE plan_id IS NULL) AS accounts_without_plan
FROM public.accounts;

\echo ''
\echo '====================================================='
\echo '4. Konflikt-Check: schon existierende neue Cols?'
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
\echo '====================================================='
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'credit_%';

\echo ''
\echo '====================================================='
\echo '6. accounts.plan_id Typ + FK?'
\echo '====================================================='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='accounts'
  AND column_name = 'plan_id';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.accounts'::regclass
  AND contype = 'f'
  AND conname LIKE '%plan%';

\echo ''
\echo '====================================================='
\echo '7. teams.account_id FK + team_members'
\echo '====================================================='
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.teams'::regclass
  AND contype = 'f'
  AND conname LIKE '%account%';

SELECT count(*) AS team_members_rows FROM public.team_members;

\echo ''
\echo '====================================================='
\echo '8. Stripe-State (alter Account-Hinweis)'
\echo '====================================================='
-- Hintergrund: Leadesk wechselt auf NEUEN Stripe-Account. Alte stripe_price_id
-- werden in Sprint B auf NULL gesetzt für neue Pläne. Bestehende stripe_*
-- Felder zur Awareness anzeigen — KEINE Auto-Reset.
SELECT slug, name, stripe_price_id, plan_managed_by FROM public.plans
WHERE stripe_price_id IS NOT NULL;

SELECT table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE '%stripe%';

\echo ''
\echo '====================================================='
\echo '9. Extensions'
\echo '====================================================='
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net','pgcrypto');

\echo ''
\echo '====================================================='
\echo 'Pre-Flight DONE. Output reviewen vor Migration-Apply.'
\echo '====================================================='
