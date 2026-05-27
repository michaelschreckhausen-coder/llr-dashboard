-- ============================================================
-- Brand-Voice Hero-Images (Phase 2b)
--
-- Jede BV bekommt bis zu 5 Hero-Images (Headshot, Brand-Sample, Logo).
-- Diese werden bei jeder Bild-Generierung dieser BV automatisch als
-- Reference-Image an Nano Banana mitgeschickt — für Character/Brand
-- Consistency über alle Posts hinweg.
--
-- Storage-Path-Format: 'bv-hero/<brand_voice_id>/<uuid>.png'
-- Bucket: visuals (existing)
-- ============================================================

BEGIN;

ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS hero_image_paths text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.brand_voices.hero_image_paths IS
  'Liste der Storage-Pfade (im "visuals"-Bucket) von Hero-Images dieser BV. Max 5. Werden bei jeder Bild-Generierung als Nano-Banana-Reference automatisch mitgeschickt.';

COMMIT;
