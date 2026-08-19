-- ROLLBACK zu 20260819090000_leads_bulk_to_inbox.sql
-- Entfernt NUR die neue Funktion. add_lead_to_inbox bleibt unberuehrt (sie wurde nie
-- geloescht, nur nicht mehr aufgerufen) — das Frontend faellt nach einem Rollback also
-- nicht ins Leere, sofern der zugehoerige Frontend-Commit ebenfalls zurueckgenommen wird.
-- Bereits geschriebene linkedin_inbox-Zeilen bleiben bestehen: sie sind gueltige Daten,
-- kein Artefakt. Kein DELETE.
\set ON_ERROR_STOP on
BEGIN;
DROP FUNCTION IF EXISTS public.add_leads_to_inbox(uuid, uuid[], boolean);
COMMIT;
\echo '--- Verify: weg? (0 = ok) ---'
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_leads_to_inbox';
NOTIFY pgrst, 'reload schema';
