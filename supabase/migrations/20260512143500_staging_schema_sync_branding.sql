-- Migration: Staging-DB Schema-Sync zu Prod (Branding-Tables)
-- Bringt staging-db-01 auf den Stand von prod-db-01 fuer brand_voices,
-- target_audiences, knowledge_base.
--
-- Hintergrund: nach dem Hetzner-Cutover wurde staging mit einem alten
-- pre-Multi-Provider-AI-Schema initialisiert. 25 + 8 + 1 Spalten fehlen,
-- die der React-Code (BrandVoice.jsx, Zielgruppen.jsx) referenziert.
-- Folge: "Could not find the 'brand_background' column..." beim Save.
--
-- Alle Statements idempotent (ADD COLUMN IF NOT EXISTS).

BEGIN;

-- ============================================================
-- brand_voices: 25 fehlende Spalten
-- ============================================================
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS brand_background      text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS brand_name            text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS donts                 text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS dos                   text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS example_texts         text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS formality             text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS glossary              jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS grammar_style         text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS is_active             boolean NOT NULL DEFAULT true;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS jargon_level          text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_style        jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_template_url text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS mission               text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS personality           text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS perspective           text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS sentence_style        text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS target_audience       text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS tonality              jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS tone_attributes       text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS "values"              text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS version               integer DEFAULT 1;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS vision                text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS vocabulary            text[] DEFAULT '{}'::text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS voice_style           text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS word_choice           text;

-- ============================================================
-- target_audiences: 8 fehlende Spalten
-- ============================================================
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS company_size     text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS decision_level   text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS is_active        boolean NOT NULL DEFAULT true;
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS needs_goals      text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS outreach_tips    text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS region           text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS topics_interests text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS trigger_events   text DEFAULT '';

-- ============================================================
-- knowledge_base: 1 fehlende Spalte
-- ============================================================
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS linkedin_template_url text;

-- ============================================================
-- Grants (Self-Host: authenticated braucht volle Grants)
-- ============================================================
GRANT ALL ON public.brand_voices     TO authenticated;
GRANT ALL ON public.target_audiences TO authenticated;
GRANT ALL ON public.knowledge_base   TO authenticated;

COMMIT;

-- Verify
SELECT 'brand_voices' AS t, COUNT(*) AS cols FROM information_schema.columns WHERE table_name='brand_voices'
UNION ALL
SELECT 'target_audiences', COUNT(*) FROM information_schema.columns WHERE table_name='target_audiences'
UNION ALL
SELECT 'knowledge_base', COUNT(*) FROM information_schema.columns WHERE table_name='knowledge_base';
