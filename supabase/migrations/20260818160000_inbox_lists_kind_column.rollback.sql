-- ============================================================================
-- Rollback zu 20260818160000_inbox_lists_kind_column.sql
-- ----------------------------------------------------------------------------
-- Nimmt NUR den CHECK zurueck. Die Spalte `kind` bleibt bewusst stehen: das
-- Frontend liest sie (Chip-Trennung Prospects/Verbindungen), ein DROP COLUMN
-- waere ein Datenverlust und braucht ohnehin Ruecksprache (CLAUDE.md Hard Rule).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE public.inbox_lists DROP CONSTRAINT IF EXISTS inbox_lists_kind_check;

COMMIT;

\echo '--- Verify: CHECK weg? (0 Zeilen = ok) ---'
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.inbox_lists'::regclass AND conname = 'inbox_lists_kind_check';

NOTIFY pgrst, 'reload schema';
