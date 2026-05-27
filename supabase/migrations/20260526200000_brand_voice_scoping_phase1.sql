-- ============================================================
-- Brand-Voice-Scoping Phase 1 (2026-05-26)
--
-- User-Auftrag: Jede BV ist die übergreifende Instanz für ein LinkedIn-Profil.
-- Posts, Vernetzungen, Messages, SSI, Memory-Lerntdaten sollen pro BV
-- getrennt sein. Aktuell: meist team-scoped, BV-Filter fehlt.
--
-- Diese Migration fügt brand_voice_id auf 6 Tabellen hinzu, backfüllt
-- mit der aktiven BV des Owners (oder fallback erste BV), und setzt
-- ON DELETE SET NULL damit BV-Löschung Daten nicht killt.
--
-- Frontend-Filter werden separat in JSX patches nachgezogen.
-- ============================================================

BEGIN;

-- ============================================================
-- Helper-Function: aktive BV eines Users finden
-- (für Backfill — keine permanente Function, wird im COMMIT rausgeworfen)
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.user_default_brand_voice(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    -- 1. user_preferences.active_brand_voice_id wenn Owner = user_id
    (SELECT up.active_brand_voice_id
       FROM public.user_preferences up
       JOIN public.brand_voices bv ON bv.id = up.active_brand_voice_id
      WHERE up.user_id = p_user_id
        AND bv.user_id = p_user_id  -- nur eigene BV
      LIMIT 1),
    -- 2. erste eigene aktive BV
    (SELECT id FROM public.brand_voices
      WHERE user_id = p_user_id AND is_active = true
      ORDER BY created_at ASC LIMIT 1),
    -- 3. älteste eigene BV
    (SELECT id FROM public.brand_voices
      WHERE user_id = p_user_id
      ORDER BY created_at ASC LIMIT 1)
  );
$fn$;

-- ============================================================
-- 1) vernetzungen
-- ============================================================
ALTER TABLE public.vernetzungen
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

UPDATE public.vernetzungen
SET brand_voice_id = pg_temp.user_default_brand_voice(user_id)
WHERE brand_voice_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_vernetzungen_brand_voice ON public.vernetzungen(brand_voice_id);

-- ============================================================
-- 2) linkedin_messages
-- ============================================================
ALTER TABLE public.linkedin_messages
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

UPDATE public.linkedin_messages
SET brand_voice_id = pg_temp.user_default_brand_voice(user_id)
WHERE brand_voice_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_messages_brand_voice ON public.linkedin_messages(brand_voice_id);

-- ============================================================
-- 3) connection_queue
-- ============================================================
ALTER TABLE public.connection_queue
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

UPDATE public.connection_queue
SET brand_voice_id = pg_temp.user_default_brand_voice(user_id)
WHERE brand_voice_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_connection_queue_brand_voice ON public.connection_queue(brand_voice_id);

-- ============================================================
-- 4) ssi_scores
-- ============================================================
ALTER TABLE public.ssi_scores
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

UPDATE public.ssi_scores
SET brand_voice_id = pg_temp.user_default_brand_voice(user_id)
WHERE brand_voice_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssi_scores_brand_voice ON public.ssi_scores(brand_voice_id);

-- ============================================================
-- 5) content_edits (Memory)
-- ============================================================
ALTER TABLE public.content_edits
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

UPDATE public.content_edits
SET brand_voice_id = COALESCE(
  -- via generation_id falls vorhanden
  (SELECT brand_voice_id FROM public.content_generations WHERE id = content_edits.generation_id),
  -- fallback: aktive BV des Users
  pg_temp.user_default_brand_voice(user_id)
)
WHERE brand_voice_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_edits_brand_voice ON public.content_edits(brand_voice_id);

-- ============================================================
-- 6) content_feedback (Memory)
-- ============================================================
ALTER TABLE public.content_feedback
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

UPDATE public.content_feedback
SET brand_voice_id = COALESCE(
  (SELECT brand_voice_id FROM public.content_generations WHERE id = content_feedback.generation_id),
  pg_temp.user_default_brand_voice(user_id)
)
WHERE brand_voice_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_feedback_brand_voice ON public.content_feedback(brand_voice_id);

-- ============================================================
-- Verifikation
-- ============================================================
SELECT
  'vernetzungen' AS tbl,
  count(*) FILTER (WHERE brand_voice_id IS NULL) AS null_count,
  count(*) FILTER (WHERE brand_voice_id IS NOT NULL) AS set_count,
  count(*) AS total
FROM public.vernetzungen
UNION ALL
SELECT 'linkedin_messages',
  count(*) FILTER (WHERE brand_voice_id IS NULL),
  count(*) FILTER (WHERE brand_voice_id IS NOT NULL),
  count(*)
FROM public.linkedin_messages
UNION ALL
SELECT 'connection_queue',
  count(*) FILTER (WHERE brand_voice_id IS NULL),
  count(*) FILTER (WHERE brand_voice_id IS NOT NULL),
  count(*)
FROM public.connection_queue
UNION ALL
SELECT 'ssi_scores',
  count(*) FILTER (WHERE brand_voice_id IS NULL),
  count(*) FILTER (WHERE brand_voice_id IS NOT NULL),
  count(*)
FROM public.ssi_scores
UNION ALL
SELECT 'content_edits',
  count(*) FILTER (WHERE brand_voice_id IS NULL),
  count(*) FILTER (WHERE brand_voice_id IS NOT NULL),
  count(*)
FROM public.content_edits
UNION ALL
SELECT 'content_feedback',
  count(*) FILTER (WHERE brand_voice_id IS NULL),
  count(*) FILTER (WHERE brand_voice_id IS NOT NULL),
  count(*)
FROM public.content_feedback;

COMMIT;
