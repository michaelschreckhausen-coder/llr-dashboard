-- Brand Voice und Wissensdatenbank: linkedin_template_url ergaenzen.
-- Wird vom neuen LinkedIn-Profil-Import-Tab (via Chrome-Extension) gesetzt.
-- target_audiences hat die Spalte schon, hier nur Catch-up fuer die zwei
-- anderen Tabellen.

ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS linkedin_template_url text;

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS linkedin_template_url text;

NOTIFY pgrst, 'reload schema';
