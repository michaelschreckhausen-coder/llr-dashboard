-- Content Werkstatt „Plus" — additive Datenmodell-Erweiterung + Plan-Freischaltung (Spec §5/§2).
-- Idempotent, keine neue Tabelle, keine RLS-Änderung, kein CHECK auf format_key (Katalog wächst,
-- Validierung in der EF). content_type='linkedin_post' deckt alle Bestandszeilen (Default).
\set ON_ERROR_STOP on
BEGIN;

-- ── content_chats: Format am Chat festgeschrieben (ein Chat = ein Format) ──
ALTER TABLE public.content_chats
  ADD COLUMN IF NOT EXISTS content_type  text  NOT NULL DEFAULT 'linkedin_post',
  ADD COLUMN IF NOT EXISTS format_key    text,
  ADD COLUMN IF NOT EXISTS format_input  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── content_documents: strukturierter Zusatz-Output (Meta/Sektionen/Betreffzeilen) ──
ALTER TABLE public.content_documents
  ADD COLUMN IF NOT EXISTS content_type   text  NOT NULL DEFAULT 'linkedin_post',
  ADD COLUMN IF NOT EXISTS format_key     text,
  ADD COLUMN IF NOT EXISTS format_output  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Filter/Badges laufen gegen genau ein Feld (team + content_type).
CREATE INDEX IF NOT EXISTS content_chats_team_type_idx
  ON public.content_chats (team_id, content_type);

-- ── content.plus in plans.permissions (jsonb-Array) — ADDITIV, nur wo noch nicht vorhanden ──
-- Slugs (Entscheidung 2026-08-16): marketing, marketing-team, all-in, kmu, customized.
-- NICHT: sales, sales-team, free/free-legacy, trial (kein content.studio → wirkungslos).
UPDATE public.plans
SET permissions = permissions || '["content.plus"]'::jsonb
WHERE slug IN ('marketing','marketing-team','all-in','kmu','customized')
  AND NOT (permissions @> '["content.plus"]'::jsonb);

COMMIT;

\echo '--- Verify: neue Spalten (content_chats) ---'
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='content_chats' AND column_name IN ('content_type','format_key','format_input') ORDER BY column_name;
\echo '--- Verify: Bestand alles linkedin_post? ---'
SELECT content_type, count(*) FROM public.content_chats GROUP BY 1;
SELECT content_type, count(*) FROM public.content_documents GROUP BY 1;
\echo '--- Verify: content.plus additiv gesetzt (Ziel-Slugs vs Kontrast) ---'
SELECT slug, (permissions @> '["content.plus"]'::jsonb) AS has_plus
FROM public.plans WHERE slug IN ('marketing','marketing-team','all-in','kmu','customized','sales','sales-team','trial','free')
ORDER BY has_plus DESC, slug;
