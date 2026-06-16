-- Team-Isolation-Härtung: brand_voices + target_audiences Read-Policy rein team-scoped.
-- Hintergrund: die alte Read-Policy erlaubte `user_id = auth.uid()` OHNE Team-Bindung,
-- wodurch ein Multi-Team-User selbst-erstellte Datensätze teamübergreifend sehen konnte.
-- Voraussetzung: jede BV/TA muss ein team_id haben (Backfill unten) + Team-Owner müssen
-- in team_members stehen (sonst verlieren sie nach Härtung den Zugriff auf eigene Daten).
-- Idempotent / guarded. Manuell angewandt auf prod + staging am 2026-06-16.

BEGIN;

-- 1) Daten-Fix: Team-Owner ohne team_members-Zeile als Mitglied des eigenen Teams eintragen
INSERT INTO team_members (team_id, user_id, role, is_active)
SELECT t.id, t.owner_id, 'owner', true
FROM teams t
WHERE t.owner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = t.owner_id);

-- 2) Backfill: team-lose BV/TA von Single-Team-Usern ihrem einzigen aktiven Team zuordnen.
--    (Multi-Team-Fälle wurden auf prod manuell explizit zugeordnet — hier guarded auf
--     exakt 1 aktives Team, damit kein arbiträres Team gewählt wird.)
UPDATE brand_voices bv SET team_id = tm.team_id
FROM team_members tm
WHERE bv.team_id IS NULL AND tm.user_id = bv.user_id AND tm.is_active
  AND (SELECT count(*) FROM team_members x WHERE x.user_id = bv.user_id AND x.is_active) = 1;

UPDATE target_audiences ta SET team_id = tm.team_id
FROM team_members tm
WHERE ta.team_id IS NULL AND tm.user_id = ta.user_id AND tm.is_active
  AND (SELECT count(*) FROM team_members x WHERE x.user_id = ta.user_id AND x.is_active) = 1;

-- 3) Härtung: Read-Policies rein team-scoped (+ eigene + geteilte + explizite Shares)
DROP POLICY IF EXISTS "Users can view own target audiences" ON target_audiences;
DROP POLICY IF EXISTS target_audiences_visibility ON target_audiences;
CREATE POLICY target_audiences_visibility ON target_audiences FOR SELECT USING (
  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
   AND (user_id = auth.uid() OR is_shared = true))
  OR id IN (SELECT target_audience_id FROM target_audience_shares WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS brand_voices_visibility ON brand_voices;
CREATE POLICY brand_voices_visibility ON brand_voices FOR SELECT USING (
  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
   AND (user_id = auth.uid() OR is_shared = true))
  OR id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id = auth.uid())
);

COMMIT;
