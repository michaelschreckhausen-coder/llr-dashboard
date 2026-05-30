-- Credits Phase 1 — Hotfix: plans.slug full UNIQUE constraint
-- ─────────────────────────────────────────────────────────────────
-- Schema-Drift Staging vs Prod (entdeckt 2026-05-30 beim Prod-Cutover-Apply):
--   - Staging: plans_slug_key UNIQUE constraint auf (slug) — full
--   - Prod:    plans_slug_unique partial index auf (slug) WHERE slug IS NOT NULL
--
-- Konsequenz: ON CONFLICT (slug) in Migration 20260601105000_seed_new_plans
-- funktioniert nicht mit Prod's partial-index — Postgres erfordert entweder
-- ein constraint ODER ein full unique-index für ON CONFLICT-Resolution.
--
-- Diese Migration konvertiert Prod's partial-index zu einem full constraint
-- (matched dann Staging-Form). Daten-sicher weil alle 9 existing slugs
-- auf Prod non-NULL sind (per Pre-Flight verifiziert).
--
-- Naming: TS 20260601104800 platziert Migration zwischen description-Hotfix
-- (104500) und seed_new_plans (105000), damit Re-Apply / Folge-Envs die
-- richtige Reihenfolge haben.
--
-- Idempotent: IF EXISTS / IF NOT EXISTS, no-op auf Staging.

BEGIN;

DO $$
BEGIN
  -- Prod-spezifisch: alten partial-Index droppen
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='plans' AND indexname='plans_slug_unique'
  ) THEN
    EXECUTE 'DROP INDEX public.plans_slug_unique';
    RAISE NOTICE 'partial-index plans_slug_unique dropped';
  ELSE
    RAISE NOTICE 'partial-index plans_slug_unique nicht vorhanden (Staging-Form) — skip drop';
  END IF;

  -- Full UNIQUE constraint addieren (matched Staging)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.plans'::regclass AND conname='plans_slug_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.plans ADD CONSTRAINT plans_slug_key UNIQUE (slug)';
    RAISE NOTICE 'plans_slug_key UNIQUE constraint added';
  ELSE
    RAISE NOTICE 'plans_slug_key UNIQUE constraint existiert bereits — skip add';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
