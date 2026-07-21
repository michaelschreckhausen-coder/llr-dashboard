-- A2: profile_checks brand-scopen (Meine Präsenz = pro Marke). Additiv.
BEGIN;
ALTER TABLE public.profile_checks
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profile_checks_brand_voice
  ON public.profile_checks(brand_voice_id) WHERE brand_voice_id IS NOT NULL;
COMMIT;
