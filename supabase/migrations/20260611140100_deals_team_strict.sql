-- Follow-up: deals_user_team hatte noch OR(created_by=auth.uid(), team_id IN my_teams)
-- → Cross-Team-Leak fuer Owner. STRICT: nur team_id-Check, oder Solo (team_id NULL).
BEGIN;

DROP POLICY IF EXISTS deals_user_team ON public.deals;

CREATE POLICY deals_team_strict ON public.deals FOR ALL USING (
  -- Solo-Deals (team_id NULL) nur fuer Ersteller
  (team_id IS NULL AND created_by = auth.uid())
  -- Sonst: muss Member im Team sein
  OR (team_id IS NOT NULL AND team_id IN (
    SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
  ))
) WITH CHECK (
  (team_id IS NULL AND created_by = auth.uid())
  OR (team_id IS NOT NULL AND team_id IN (
    SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
  ))
);

COMMIT;

SELECT policyname, regexp_replace(qual::text, '\s+', ' ', 'g') AS using_clause
FROM pg_policies WHERE tablename='deals';
