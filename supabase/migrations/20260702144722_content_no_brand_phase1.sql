-- Markenloser Content-Bereich — Phase 1: brand_voice_id nullable + no_brand-Flag +
-- nutzer-private RLS NUR für markenlose Zeilen (no_brand=true). Branded/Alt-Zeilen
-- bleiben unverändert (RESTRICTIVE-Policy greift nur bei no_brand=true).

ALTER TABLE content_chats ALTER COLUMN brand_voice_id DROP NOT NULL;
ALTER TABLE brand_memory  ALTER COLUMN brand_voice_id DROP NOT NULL;

ALTER TABLE content_chats     ADD COLUMN IF NOT EXISTS no_brand boolean NOT NULL DEFAULT false;
ALTER TABLE brand_memory      ADD COLUMN IF NOT EXISTS no_brand boolean NOT NULL DEFAULT false;
ALTER TABLE content_posts     ADD COLUMN IF NOT EXISTS no_brand boolean NOT NULL DEFAULT false;
ALTER TABLE content_documents ADD COLUMN IF NOT EXISTS no_brand boolean NOT NULL DEFAULT false;
ALTER TABLE visuals           ADD COLUMN IF NOT EXISTS no_brand boolean NOT NULL DEFAULT false;

-- content_chats: markenlose Chats nur für Ersteller (additive permissive Policy)
DROP POLICY IF EXISTS content_chats_nobrand ON content_chats;
CREATE POLICY content_chats_nobrand ON content_chats FOR ALL
  USING (no_brand AND created_by = auth.uid())
  WITH CHECK (no_brand AND created_by = auth.uid());

-- brand_memory: markenlose Memory nur für Nutzer (additive permissive Policy)
DROP POLICY IF EXISTS brand_memory_nobrand ON brand_memory;
CREATE POLICY brand_memory_nobrand ON brand_memory FOR ALL
  USING (no_brand AND user_id = auth.uid())
  WITH CHECK (no_brand AND user_id = auth.uid());

-- content_posts / visuals / content_documents: markenlose Zeilen nutzer-privat
-- (RESTRICTIVE: greift NUR bei no_brand=true; branded & Alt-Zeilen unverändert)
DROP POLICY IF EXISTS nobrand_owner_only ON content_posts;
CREATE POLICY nobrand_owner_only ON content_posts AS RESTRICTIVE FOR ALL
  USING (NOT no_brand OR user_id = auth.uid())
  WITH CHECK (NOT no_brand OR user_id = auth.uid());

DROP POLICY IF EXISTS nobrand_owner_only ON visuals;
CREATE POLICY nobrand_owner_only ON visuals AS RESTRICTIVE FOR ALL
  USING (NOT no_brand OR user_id = auth.uid())
  WITH CHECK (NOT no_brand OR user_id = auth.uid());

DROP POLICY IF EXISTS nobrand_owner_only ON content_documents;
CREATE POLICY nobrand_owner_only ON content_documents AS RESTRICTIVE FOR ALL
  USING (NOT no_brand OR user_id = auth.uid())
  WITH CHECK (NOT no_brand OR user_id = auth.uid());
