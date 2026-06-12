-- ============================================================================
-- content_history.brand_voice_id: ON DELETE SET NULL (war NO ACTION)
-- Brand löschen schlug fehl, sobald Generierungs-Historie existierte
-- ("violates foreign key constraint content_history_brand_voice_id_fkey").
-- Alle vergleichbaren Log-/Content-Tabellen (content_generations, visuals,
-- ssi_scores, …) stehen bereits auf SET NULL — Historie bleibt erhalten,
-- Verweis wird genullt. Idempotent.
-- ============================================================================
BEGIN;

ALTER TABLE public.content_history DROP CONSTRAINT IF EXISTS content_history_brand_voice_id_fkey;
ALTER TABLE public.content_history
  ADD CONSTRAINT content_history_brand_voice_id_fkey
  FOREIGN KEY (brand_voice_id) REFERENCES public.brand_voices(id) ON DELETE SET NULL;

COMMIT;
