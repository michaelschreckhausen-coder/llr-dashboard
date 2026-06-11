-- Drift-Fix: staging und prod hatten leicht unterschiedliche Policy-Sets
-- auf deals + lead_lists. Beide werden auf identischen sauberen Stand gebracht.
--
-- deals: nur deals_team_strict behalten (alte team_deals_* sind redundant,
--   weil deals_team_strict bereits team-membership prüft + Solo-Fallback)
-- lead_lists: gleiches Pattern wie deals — eine einzige strict-policy

BEGIN;

-- ── DEALS: alte team_deals_* droppen, nur deals_team_strict bleibt ──
DROP POLICY IF EXISTS team_deals_select ON public.deals;
DROP POLICY IF EXISTS team_deals_insert ON public.deals;
DROP POLICY IF EXISTS team_deals_update ON public.deals;
DROP POLICY IF EXISTS team_deals_delete ON public.deals;

-- ── LEAD_LISTS: alles droppen, dann genau eine strict policy ──
DROP POLICY IF EXISTS lead_lists_own         ON public.lead_lists;
DROP POLICY IF EXISTS lead_lists_team_select ON public.lead_lists;
DROP POLICY IF EXISTS lead_lists_team_insert ON public.lead_lists;
DROP POLICY IF EXISTS lead_lists_team_update ON public.lead_lists;
DROP POLICY IF EXISTS lead_lists_team_delete ON public.lead_lists;

CREATE POLICY lead_lists_team_strict ON public.lead_lists FOR ALL USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
) WITH CHECK (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);

COMMIT;
