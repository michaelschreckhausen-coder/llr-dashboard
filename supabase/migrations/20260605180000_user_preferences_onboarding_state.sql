-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding-State pro User in user_preferences
--
-- Speichert den Fortschritt der In-App-Tour + dismissed Just-in-time-Tipps.
-- Shape:
--   {
--     "tour_done": true,                       -- First-Run-Coachmark-Tour abgeschlossen/übersprungen
--     "tour_started_at": "2026-06-05T...",     -- optional, erstes Antriggern
--     "tips_dismissed": ["/brand-voice", ...]  -- Routen, deren Area-Tip weggeklickt wurde
--   }
--
-- Bewusst EINE jsonb-Spalte statt N boolean-Spalten: das Onboarding wächst,
-- jede neue Tour/jeder neue Tip kommt ohne Migration aus.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Re-Run-safe.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- PostgREST-Schema-Cache neu laden, damit die neue Spalte sofort über die
-- Auto-API erreichbar ist (sonst PGRST204 bis zum nächsten Reload).
NOTIFY pgrst, 'reload schema';
