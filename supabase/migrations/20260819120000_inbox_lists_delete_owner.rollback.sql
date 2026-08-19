-- ROLLBACK zu 20260819120000_inbox_lists_delete_owner.sql
-- Reihenfolge zwingend: erst die Policy, dann der Helfer — sonst blockiert die
-- Abhaengigkeit den DROP FUNCTION.
-- inbox_lists_own bleibt (wurde nie angefasst). Nach dem Rollback koennen Team-Owner
-- fremde Listen wieder nicht loeschen; das Frontend meldet das dann ehrlich, sofern der
-- useInboxLists-Commit steht.
\set ON_ERROR_STOP on
BEGIN;
DROP POLICY IF EXISTS inbox_lists_delete_creator_or_team_owner ON public.inbox_lists;
DROP FUNCTION IF EXISTS public.is_team_owner(uuid);
COMMIT;
\echo '--- Verify: Policy weg, Helfer weg ---'
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='inbox_lists' ORDER BY cmd, policyname;
SELECT count(*) AS helfer_uebrig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='is_team_owner';
NOTIFY pgrst, 'reload schema';
