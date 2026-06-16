-- team_id PFLICHT auf brand_voices, target_audiences, knowledge_base.
-- Ziel: Es ist technisch unmöglich, eine Brand Voice / Zielgruppe / Wissensressource
-- ohne Team (oder in einem fremden Team) zu erstellen. Pro Team = eigener Datensatz.
-- Manuell angewandt auf prod + staging am 2026-06-16. Idempotent / guarded.

BEGIN;

-- 1) Backfill verbleibende team-lose knowledge_base-Zeilen (single-team guarded;
--    Multi-Team-Fälle wurden auf prod explizit zugeordnet, konsistent mit ihrer Brand Voice)
UPDATE knowledge_base kb SET team_id = tm.team_id
FROM team_members tm
WHERE kb.team_id IS NULL AND tm.user_id = kb.user_id AND tm.is_active
  AND (SELECT count(*) FROM team_members x WHERE x.user_id = kb.user_id AND x.is_active) = 1;

-- 2) knowledge_base Read-Policy härten (Parität mit brand_voices/target_audiences)
DROP POLICY IF EXISTS knowledge_base_visibility ON knowledge_base;
CREATE POLICY knowledge_base_visibility ON knowledge_base FOR SELECT USING (
  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
   AND (user_id = auth.uid() OR is_shared = true))
  OR id IN (SELECT knowledge_base_id FROM knowledge_base_shares WHERE user_id = auth.uid())
);

-- 3) INSERT-Policys konsolidieren: nur eigene Zeile UND nur in eigene Teams
DROP POLICY IF EXISTS brand_voices_write_own ON brand_voices;
DROP POLICY IF EXISTS brand_voices_owner_write ON brand_voices;
CREATE POLICY brand_voices_insert ON brand_voices FOR INSERT WITH CHECK (
  user_id = auth.uid() AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own target audiences" ON target_audiences;
DROP POLICY IF EXISTS target_audiences_owner_write ON target_audiences;
CREATE POLICY target_audiences_insert ON target_audiences FOR INSERT WITH CHECK (
  user_id = auth.uid() AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS knowledge_base_owner_write ON knowledge_base;
DROP POLICY IF EXISTS "Users can insert own knowledge" ON knowledge_base;
CREATE POLICY knowledge_base_insert ON knowledge_base FOR INSERT WITH CHECK (
  user_id = auth.uid() AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- 4) team_id NOT NULL erzwingen (harte Garantie)
ALTER TABLE brand_voices     ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE target_audiences ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE knowledge_base   ALTER COLUMN team_id SET NOT NULL;

COMMIT;
