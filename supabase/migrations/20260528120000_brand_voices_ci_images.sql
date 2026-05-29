-- Migration: brand_voices.ci_image_paths
-- Splittet die bisherigen Hero-Images in:
--   * hero_image_paths  → bleibt, gilt jetzt nur für Personen-Bilder
--   * ci_image_paths    → NEU, für Logos / Favicons / CI-Materialien
--
-- Beide werden vom Edge-Function generate-image als Referenzen mitgesendet,
-- wenn der Client useBrandVoiceRefs:true setzt.

BEGIN;

ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS ci_image_paths text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.brand_voices.hero_image_paths IS
  'Personen-Bilder der Brand Voice (Headshots, Lifestyle-Aufnahmen). Werden bei Bild-Generierungen als Identity-Referenzen mitgesendet.';

COMMENT ON COLUMN public.brand_voices.ci_image_paths IS
  'CI-Bibliothek der Brand Voice (Logos, Favicons, sonstige Markenelemente). Werden bei Bild-Generierungen als Stil-Referenzen mitgesendet.';

-- PostgREST Schema-Cache reloaden (sonst PGRST204 beim ersten Insert)
NOTIFY pgrst, 'reload schema';

COMMIT;
