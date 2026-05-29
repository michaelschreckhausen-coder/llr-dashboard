-- ════════════════════════════════════════════════════════════════════════════
-- Selektives Sharing für Brand Voices, Zielgruppen, Wissensbasis
-- 2026-05-29 · Julian-Request
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bisher: is_shared (boolean) → entweder mit ganzem Team teilen oder gar nicht.
-- Neu:    Owner kann zusätzlich einzelne Team-Member als Empfänger auswählen.
--
-- Drei neue Junction-Tabellen (analoge Struktur):
--   brand_voice_shares      (brand_voice_id, user_id)
--   target_audience_shares  (target_audience_id, user_id)
--   knowledge_base_shares   (knowledge_base_id, user_id)
--
-- Sichtbarkeits-Regel (für alle drei):
--   Owner sieht immer.
--   Andere User sehen wenn:
--     (a) is_shared = true UND beide im selben Team (team-weit geteilt)  ODER
--     (b) Eintrag in <entity>_shares (selektiv geteilt)
--
-- WICHTIG: Bestehende RLS für target_audiences + knowledge_base war zu offen
-- (alle Team-Member sahen alles, unabhängig von is_shared). Wird mitgehärtet.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. brand_voice_shares ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_voice_shares (
  brand_voice_id uuid NOT NULL REFERENCES brand_voices(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (brand_voice_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_brand_voice_shares_user_id ON brand_voice_shares(user_id);
ALTER TABLE brand_voice_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bvs_read  ON brand_voice_shares;
DROP POLICY IF EXISTS bvs_write ON brand_voice_shares;
-- Read: User sieht den Eintrag wenn er der getarget-te User ist ODER Owner der BV
CREATE POLICY bvs_read ON brand_voice_shares FOR SELECT USING (
  user_id = auth.uid()
  OR brand_voice_id IN (SELECT id FROM brand_voices WHERE user_id = auth.uid())
);
-- Write: nur Owner der BV darf Shares erstellen / löschen
CREATE POLICY bvs_write ON brand_voice_shares FOR ALL USING (
  brand_voice_id IN (SELECT id FROM brand_voices WHERE user_id = auth.uid())
) WITH CHECK (
  brand_voice_id IN (SELECT id FROM brand_voices WHERE user_id = auth.uid())
);
GRANT SELECT, INSERT, DELETE ON brand_voice_shares TO authenticated;

-- ─── 2. target_audience_shares ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS target_audience_shares (
  target_audience_id uuid NOT NULL REFERENCES target_audiences(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (target_audience_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_target_audience_shares_user_id ON target_audience_shares(user_id);
ALTER TABLE target_audience_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tas_read  ON target_audience_shares;
DROP POLICY IF EXISTS tas_write ON target_audience_shares;
CREATE POLICY tas_read ON target_audience_shares FOR SELECT USING (
  user_id = auth.uid()
  OR target_audience_id IN (SELECT id FROM target_audiences WHERE user_id = auth.uid())
);
CREATE POLICY tas_write ON target_audience_shares FOR ALL USING (
  target_audience_id IN (SELECT id FROM target_audiences WHERE user_id = auth.uid())
) WITH CHECK (
  target_audience_id IN (SELECT id FROM target_audiences WHERE user_id = auth.uid())
);
GRANT SELECT, INSERT, DELETE ON target_audience_shares TO authenticated;

-- ─── 3. knowledge_base_shares ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_base_shares (
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (knowledge_base_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_shares_user_id ON knowledge_base_shares(user_id);
ALTER TABLE knowledge_base_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kbs_read  ON knowledge_base_shares;
DROP POLICY IF EXISTS kbs_write ON knowledge_base_shares;
CREATE POLICY kbs_read ON knowledge_base_shares FOR SELECT USING (
  user_id = auth.uid()
  OR knowledge_base_id IN (SELECT id FROM knowledge_base WHERE user_id = auth.uid())
);
CREATE POLICY kbs_write ON knowledge_base_shares FOR ALL USING (
  knowledge_base_id IN (SELECT id FROM knowledge_base WHERE user_id = auth.uid())
) WITH CHECK (
  knowledge_base_id IN (SELECT id FROM knowledge_base WHERE user_id = auth.uid())
);
GRANT SELECT, INSERT, DELETE ON knowledge_base_shares TO authenticated;

-- ─── 4. RLS auf brand_voices härten ────────────────────────────────────────
-- Alte Policies droppen und durch klare Read/Write-Trennung ersetzen.
-- Bisher hatte ALL-Policy KEINEN is_shared-Check → Team-Member konnten private
-- BVs sehen. Privacy-Bug Nr. 2 (zusätzlich zum Mention-Bug von heute morgen).
DROP POLICY IF EXISTS brand_voices_select    ON brand_voices;
DROP POLICY IF EXISTS brand_voices_user_team ON brand_voices;

CREATE POLICY brand_voices_visibility ON brand_voices FOR SELECT USING (
  user_id = auth.uid()
  OR (is_shared = true AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  OR id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id = auth.uid())
);
CREATE POLICY brand_voices_owner_write ON brand_voices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY brand_voices_owner_update ON brand_voices FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY brand_voices_owner_delete ON brand_voices FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── 5. RLS auf target_audiences härten ────────────────────────────────────
-- Bisher hatte target_audiences GAR keine is_shared-Logic in der Policy → alle
-- Team-Member sahen alle Audiences. Privacy-Bug Nr. 3.
DROP POLICY IF EXISTS target_audiences_user_team ON target_audiences;
DROP POLICY IF EXISTS target_audiences_select    ON target_audiences;

CREATE POLICY target_audiences_visibility ON target_audiences FOR SELECT USING (
  user_id = auth.uid()
  OR (is_shared = true AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  OR id IN (SELECT target_audience_id FROM target_audience_shares WHERE user_id = auth.uid())
);
CREATE POLICY target_audiences_owner_write ON target_audiences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY target_audiences_owner_update ON target_audiences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY target_audiences_owner_delete ON target_audiences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── 6. RLS auf knowledge_base härten ──────────────────────────────────────
-- Bestehende Policy "Users can view own knowledge" war SELECT-only. Schreibrechte
-- liefen vermutlich über service_role oder waren komplett offen. Explizit machen.
DROP POLICY IF EXISTS "Users can view own knowledge" ON knowledge_base;
DROP POLICY IF EXISTS knowledge_base_user_team      ON knowledge_base;
DROP POLICY IF EXISTS knowledge_base_select         ON knowledge_base;

CREATE POLICY knowledge_base_visibility ON knowledge_base FOR SELECT USING (
  user_id = auth.uid()
  OR (is_shared = true AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  OR id IN (SELECT knowledge_base_id FROM knowledge_base_shares WHERE user_id = auth.uid())
);
CREATE POLICY knowledge_base_owner_write ON knowledge_base FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY knowledge_base_owner_update ON knowledge_base FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY knowledge_base_owner_delete ON knowledge_base FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── 7. Default-Privileges für authenticated (Self-Host-Pflicht) ───────────
GRANT SELECT ON brand_voice_shares      TO anon, authenticated;
GRANT SELECT ON target_audience_shares  TO anon, authenticated;
GRANT SELECT ON knowledge_base_shares   TO anon, authenticated;

COMMIT;

-- Debug-Output
SELECT 'brand_voice_shares'      AS table, COUNT(*) FROM brand_voice_shares
UNION ALL SELECT 'target_audience_shares', COUNT(*) FROM target_audience_shares
UNION ALL SELECT 'knowledge_base_shares',  COUNT(*) FROM knowledge_base_shares;
