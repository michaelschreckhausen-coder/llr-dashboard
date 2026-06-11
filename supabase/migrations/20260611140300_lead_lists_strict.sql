-- lead_lists_team_select hatte (user_id=auth.uid()) OR (is_shared AND team_id IN my_teams)
-- → Cross-Team-Leak fuer Owner (gleicher Bug wie bei deals/leads).
BEGIN;
DROP POLICY IF EXISTS lead_lists_team_select ON public.lead_lists;
CREATE POLICY lead_lists_team_select ON public.lead_lists FOR SELECT USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);
COMMIT;
