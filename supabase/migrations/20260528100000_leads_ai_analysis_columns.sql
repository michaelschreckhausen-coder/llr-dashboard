-- 2026-05-28 — Backlog #4: Sparkles KI-Analyse pro Lead
--
-- Additive Spalten für die persistierte Lead-Analyse:
--   - ai_last_analysis       jsonb — strukturiertes Result mit 4 Sections
--   - ai_last_analysis_at    timestamptz — Zeitpunkt der letzten Analyse
--   - ai_last_analysis_model text — welches Modell hat es erzeugt
--
-- jsonb-Struktur:
-- {
--   "score":            { "value": 75, "reasoning": ["..."], "delta": "+5" },
--   "next_best_action": { "title": "...", "detail": "..." },
--   "pain_points":      ["...", "..."],
--   "persona":          "...",
--   "outreach_draft":   { "channel": "linkedin", "subject": "...", "body": "..." }
-- }
--
-- Reads/Writes laufen über die bestehenden leads_owner + leads_team_*-RLS-Policies
-- (Phase G aligned). Edge-Function `analyze-lead` schreibt via service_role.
--
-- Idempotent — IF NOT EXISTS auf allen ADD COLUMN.

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_last_analysis       jsonb,
  ADD COLUMN IF NOT EXISTS ai_last_analysis_at    timestamptz,
  ADD COLUMN IF NOT EXISTS ai_last_analysis_model text;

COMMENT ON COLUMN public.leads.ai_last_analysis IS
  'Strukturiertes Result der Sparkles-AI-Analyse (Backlog #4). Siehe Migration-Header für Schema.';
COMMENT ON COLUMN public.leads.ai_last_analysis_at IS
  'Zeitpunkt der letzten Sparkles-AI-Analyse. Frontend nutzt 24h-Cache.';
COMMENT ON COLUMN public.leads.ai_last_analysis_model IS
  'Modell-ID die für die letzte Analyse genutzt wurde (z.B. claude-opus-4-7).';

-- Partial-Index für "Leads die kürzlich analysiert wurden" (Admin/Reports).
CREATE INDEX IF NOT EXISTS idx_leads_ai_last_analysis_at
  ON public.leads (ai_last_analysis_at DESC NULLS LAST)
  WHERE ai_last_analysis_at IS NOT NULL;

-- Verifikation
DO $$
DECLARE has_jsonb boolean; has_at boolean; has_model boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='leads'
                    AND column_name='ai_last_analysis') INTO has_jsonb;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='leads'
                    AND column_name='ai_last_analysis_at') INTO has_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='leads'
                    AND column_name='ai_last_analysis_model') INTO has_model;
  IF NOT has_jsonb  THEN RAISE EXCEPTION 'ai_last_analysis missing'; END IF;
  IF NOT has_at     THEN RAISE EXCEPTION 'ai_last_analysis_at missing'; END IF;
  IF NOT has_model  THEN RAISE EXCEPTION 'ai_last_analysis_model missing'; END IF;
  RAISE NOTICE 'Backlog #4 migration verification PASSED — 3 cols added on leads';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
