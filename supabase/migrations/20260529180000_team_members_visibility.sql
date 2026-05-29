-- ════════════════════════════════════════════════════════════════════════════
-- team_members: User soll alle Member seines Teams sehen, nicht nur sich
-- 2026-05-29 · aufgedeckt beim SharingPicker-Live-Test
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vorher: team_members_select USING (user_id = auth.uid())
--   → User sah nur eigene Mitgliedschaft. Frontend-Komponenten wie
--     SharingPicker/Mention-Picker/Team-Mitglieder-Liste konnten andere
--     Mitglieder nicht anzeigen.
--
-- Jetzt: User sieht eigene Membership ODER alle Members eines Teams in
--   dem er selbst Mitglied ist. SECURITY DEFINER Helper is_team_member()
--   verhindert Recursion.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.is_team_member(t_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = t_id AND user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated;

DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_team_member(team_id)
);

COMMIT;
