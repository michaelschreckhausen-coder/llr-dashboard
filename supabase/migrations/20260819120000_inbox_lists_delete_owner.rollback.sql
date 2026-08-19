-- ROLLBACK zu 20260819120000_inbox_lists_delete_owner.sql
-- Entfernt NUR die ergaenzende DELETE-Policy. inbox_lists_own bleibt (sie wurde nie
-- angefasst), Team-Owner koennen danach wieder keine fremden Listen loeschen — das
-- Frontend meldet das dann ehrlich statt Scheinerfolg, sofern der zugehoerige
-- useInboxLists-Commit steht. Die GRANTs auf teams/team_members bleiben: sie sind
-- Bestand und werden von anderen Policies gebraucht.
\set ON_ERROR_STOP on
BEGIN;
DROP POLICY IF EXISTS inbox_lists_delete_creator_or_team_owner ON public.inbox_lists;
COMMIT;
\echo '--- Verify: nur noch inbox_lists_own + brand_read ---'
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='inbox_lists' ORDER BY cmd, policyname;
