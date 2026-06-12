-- ============================================================================
-- content_history: Staging an Prod-Schema angleichen (Drift-Fix)
-- Kontext: Profiltexte.jsx schreibt/liest template_label, input_fields,
-- generated_text, brand_voice_snapshot, ignored_brand_voice — diese Spalten
-- existierten nur auf Prod. Auf Staging schlug saveHistory dadurch fehl
-- (silent, da Fehler nicht geprüft wird) und die Historie blieb leer.
-- Idempotent; auf Prod sind alle Statements No-Ops.
-- ============================================================================
BEGIN;

ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS template_label text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS input_fields jsonb;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS generated_text text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS brand_voice_snapshot text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS ignored_brand_voice boolean DEFAULT false;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'linkedin_post';

-- Grants-Absicherung (Self-Host-Pflicht)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_history TO authenticated;

COMMIT;
