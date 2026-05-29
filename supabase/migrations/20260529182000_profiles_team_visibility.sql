-- ════════════════════════════════════════════════════════════════════════════
-- profiles: User soll Profile aller Team-Member sehen (Avatar, Name)
-- 2026-05-29 · aufgedeckt bei SharingPicker — Team-Mate erschien als UID-Prefix
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vorher: Users can view own profile / profiles_own — beide nur eigene Row.
-- Frontend-Konsequenz: Avatare und Namen anderer Team-Member nicht angezeigt
-- (z.B. SharingPicker, Mention-Picker, Member-Liste).
--
-- Jetzt: Cross-Team-Sichtbarkeit über team_members-Join.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS profiles_read_team ON profiles;
CREATE POLICY profiles_read_team ON profiles FOR SELECT USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
  )
);

COMMIT;
