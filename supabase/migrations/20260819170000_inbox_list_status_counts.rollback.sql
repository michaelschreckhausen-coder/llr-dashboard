-- ROLLBACK zu 20260819170000_inbox_list_status_counts.sql
-- Entfernt nur die Zaehl-Funktion. Der Chip faellt danach auf seine bisherige Zahl
-- zurueck (sichtbare Zeilen) und zeigt keinen Tooltip mehr — rein Anzeige.
\set ON_ERROR_STOP on
BEGIN;
DROP FUNCTION IF EXISTS public.inbox_list_status_counts(uuid[]);
COMMIT;
\echo '--- Verify: weg? (0 = ok) ---'
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='inbox_list_status_counts';
NOTIFY pgrst, 'reload schema';
