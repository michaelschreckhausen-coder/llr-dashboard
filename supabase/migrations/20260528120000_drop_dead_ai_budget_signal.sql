-- 2026-05-28 — Drop dead-column leads.ai_budget_signal
--
-- Hintergrund:
-- Diese Spalte wurde nur vom alten /api/crm-enrich-Vercel-Endpoint gesetzt
-- (immer auf null, da das Modell sie nie befüllte). Kein anderer Writer.
-- Frontend hat zero Reader (verifiziert via grep src/).
-- Nach Option-(b)-Refactor (commit 232056c) ruft niemand mehr /api/crm-enrich.
--
-- Pre-Flight (separate SQL-Datei): zählt non-NULL-Werte. Wenn 0, ist DROP
-- absolut safe. Bei >0 muss User vor dem Apply bestätigen ob Datenverlust ok.
--
-- ⚠ DROP COLUMN ist IRREVERSIBEL — Daten gehen verloren.

BEGIN;

ALTER TABLE public.leads DROP COLUMN IF EXISTS ai_budget_signal;

-- Verifikation
DO $$
DECLARE col_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='leads'
                    AND column_name='ai_budget_signal') INTO col_exists;
  IF col_exists THEN RAISE EXCEPTION 'ai_budget_signal still exists'; END IF;
  RAISE NOTICE 'ai_budget_signal column dropped successfully';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
