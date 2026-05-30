-- Credits Phase 1 — Hotfix: plans.description-Col
-- ─────────────────────────────────────────────────────────────────
-- Ergänzt fehlende description-Col in plans. In Sprint A übersehen, weil
-- CLAUDE.md Top-Fallstrick #8 description als "konstant in beiden Schemas"
-- listet — auf Hetzner-Staging aber faktisch nicht vorhanden (Drift unklar,
-- evtl. via Phase F/Z gedroppt).
--
-- TS 20260601104500 platziert die Migration zwischen record_usage_rpc (104000)
-- und seed_new_plans (105000), damit bei Re-Apply (Prod-Cutover) die
-- Reihenfolge stimmt.
--
-- Idempotent.

BEGIN;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='plans' AND column_name='description'
  ) THEN
    RAISE EXCEPTION 'Migration FAILED: plans.description col still missing after ADD';
  END IF;
  RAISE NOTICE 'Migration OK: plans.description col vorhanden';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
