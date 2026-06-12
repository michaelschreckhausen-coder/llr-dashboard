-- ============================================================================
-- Brand-Split: Personal Brand vs Company Brand (Phase 1)
-- brand_voices.account_type ('personal'|'company_page') existiert bereits.
-- Neu: Company-CI-Felder (Logos, Fonts, CI-Booklet) + Ambassador-Verknüpfung
-- (company_voice_id) auf Content-Tabellen.
-- Idempotent, staging-first.
-- ============================================================================
BEGIN;

-- Company Brand: visuelle Identität
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS logo_paths text[] DEFAULT '{}';
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS brand_fonts jsonb;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS ci_booklet_paths text[] DEFAULT '{}';

-- Ambassador-Modell: Personal-Brand-Content optional einem Company Brand zuordnen
ALTER TABLE public.content_posts   ADD COLUMN IF NOT EXISTS company_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS company_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
ALTER TABLE public.content_chats   ADD COLUMN IF NOT EXISTS company_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_posts_company_voice   ON public.content_posts(company_voice_id)   WHERE company_voice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_history_company_voice ON public.content_history(company_voice_id) WHERE company_voice_id IS NOT NULL;

COMMIT;
