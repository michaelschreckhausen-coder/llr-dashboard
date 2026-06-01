-- ════════════════════════════════════════════════════════════════════════════
-- content_posts.brand_voice_id nullable machen
-- 2026-06-01 · BV-Delete-Bug
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bug: content_posts.brand_voice_id ist NOT NULL, FK ist ON DELETE SET NULL.
-- Beim Loeschen einer BV versucht PG brand_voice_id=NULL zu setzen → blockt am
-- NOT NULL Constraint. Folge: BV mit Posts kann nicht geloescht werden.
--
-- Fix: NOT NULL aufheben. Posts mit brand_voice_id=NULL ('verwaiste Posts')
-- bleiben sichtbar im Redaktionsplan-Empty-State, koennen vom Owner einer
-- anderen BV zugeordnet oder geloescht werden.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE content_posts ALTER COLUMN brand_voice_id DROP NOT NULL;

COMMIT;

-- Verify
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name='content_posts' AND column_name='brand_voice_id';
