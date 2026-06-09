-- 20260608240000_knowledge_base_team_update_rls.sql
--
-- Bugfix: Team-Mitglieder konnten team-geteiltes Wissen (z.B. Produkte) sehen,
-- aber nicht aendern. Die Policy knowledge_base_owner_update (aus
-- 20260529170000_selective_sharing) erlaubte UPDATE nur dem Owner
-- (user_id = auth.uid()) -> fremder Team-Member-Update traf 0 Zeilen, ohne
-- Fehler -> "beim Speichern passiert nichts".
--
-- Fix: UPDATE-Policy auf dasselbe Modell wie die SELECT-Sichtbarkeit
-- (knowledge_base_visibility) erweitern: Owner ODER team-geteilt im eigenen
-- Team ODER explizit geteilt. WITH CHECK identisch, damit der bearbeitete Stand
-- weiterhin sichtbar bleibt.
--
-- Idempotent. Setzt voraus dass 20260529170000_selective_sharing angewandt ist
-- (knowledge_base_shares + knowledge_base_owner_update existieren) — per
-- Pre-Flight bestaetigen.

BEGIN;

DROP POLICY IF EXISTS knowledge_base_owner_update ON public.knowledge_base;
DROP POLICY IF EXISTS knowledge_base_team_update  ON public.knowledge_base;

CREATE POLICY knowledge_base_team_update ON public.knowledge_base FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (is_shared = true AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
    OR id IN (SELECT knowledge_base_id FROM public.knowledge_base_shares WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (is_shared = true AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
    OR id IN (SELECT knowledge_base_id FROM public.knowledge_base_shares WHERE user_id = auth.uid())
  );

-- Self-Host: Cross-Table-Subquery braucht GRANT (Top-Fallstrick #3).
GRANT SELECT ON public.team_members TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
