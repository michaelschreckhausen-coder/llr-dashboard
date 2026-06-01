-- ════════════════════════════════════════════════════════════════════════════
-- Text-Werkstatt Refactor: BV-scoped Chats wie ChatGPT
-- 2026-06-01 · Julian-Request
-- ════════════════════════════════════════════════════════════════════════════
--
-- Architektur: jede Brand Voice hat ihre eigene Text-Werkstatt mit eigenen
-- Chats. Sichtbarkeit eines Chats = Sichtbarkeit der zugehörigen BV.
--
-- content_chats — Container für eine Konversation
--   - brand_voice_id (NOT NULL FK) → BV ist Owner
--   - created_by (user_id für Audit/Display "von X erstellt")
--   - target_audience_id (welche Zielgruppe war beim letzten Generate gewählt)
--   - post_id (wenn der Chat aus einem Beitrag heraus gestartet wurde)
--   - title (autogeneriert vom LLM oder Default "Neuer Chat")
--
-- content_chat_messages — User/Assistant-Turns
--   - role: user | assistant | system
--   - content: Plain-Text
--   - metadata: jsonb für tool_calls, sources, beitragstext-Extract, attachments
--
-- content_posts.text_werkstatt_chat_id — Rückverlinkung Post→Chat damit
-- "Text verbessern" zum richtigen Chat führt.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── content_chats ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_chats (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_voice_id     uuid NOT NULL REFERENCES brand_voices(id) ON DELETE CASCADE,
  team_id            uuid REFERENCES teams(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_audience_id uuid REFERENCES target_audiences(id) ON DELETE SET NULL,
  post_id            uuid REFERENCES content_posts(id) ON DELETE SET NULL,
  title              text NOT NULL DEFAULT 'Neuer Chat',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_chats_brand_voice ON content_chats(brand_voice_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_chats_post        ON content_chats(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_chats_created_by  ON content_chats(created_by);

-- ─── content_chat_messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES content_chats(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user','assistant','system')),
  content     text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_chat_messages_chat ON content_chat_messages(chat_id, created_at ASC);

-- ─── content_posts.text_werkstatt_chat_id ──────────────────────────────────
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS text_werkstatt_chat_id uuid REFERENCES content_chats(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_content_posts_textwerkstatt_chat ON content_posts(text_werkstatt_chat_id) WHERE text_werkstatt_chat_id IS NOT NULL;

-- ─── SECURITY DEFINER Helper: kann ich diese BV lesen? ─────────────────────
-- Vermeidet Recursion: brand_voices_visibility ist nicht trivial (siehe
-- 20260529175000) — wir wrappen den Check in SECURITY DEFINER und bypassen RLS.
-- Die Function bekommt nur lesen-Recht, kein Schreiben.
CREATE OR REPLACE FUNCTION public.can_read_brand_voice(bv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM brand_voices bv
    WHERE bv.id = bv_id
      AND (
        bv.user_id = auth.uid()
        OR (bv.is_shared = true AND bv.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
        OR bv.id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id = auth.uid())
      )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_read_brand_voice(uuid) TO authenticated;

-- ─── RLS: content_chats ────────────────────────────────────────────────────
ALTER TABLE content_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_chats_select  ON content_chats;
DROP POLICY IF EXISTS content_chats_insert  ON content_chats;
DROP POLICY IF EXISTS content_chats_update  ON content_chats;
DROP POLICY IF EXISTS content_chats_delete  ON content_chats;

CREATE POLICY content_chats_select ON content_chats FOR SELECT
USING (public.can_read_brand_voice(brand_voice_id));

CREATE POLICY content_chats_insert ON content_chats FOR INSERT TO authenticated
WITH CHECK (
  public.can_read_brand_voice(brand_voice_id)
  AND created_by = auth.uid()
);

CREATE POLICY content_chats_update ON content_chats FOR UPDATE TO authenticated
USING (public.can_read_brand_voice(brand_voice_id))
WITH CHECK (public.can_read_brand_voice(brand_voice_id));

CREATE POLICY content_chats_delete ON content_chats FOR DELETE TO authenticated
USING (created_by = auth.uid());

-- ─── RLS: content_chat_messages ───────────────────────────────────────────
ALTER TABLE content_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_chat_messages_select ON content_chat_messages;
DROP POLICY IF EXISTS content_chat_messages_insert ON content_chat_messages;

-- Messages erbt Sichtbarkeit vom Chat (über content_chats-RLS-Read-Check)
CREATE POLICY content_chat_messages_select ON content_chat_messages FOR SELECT
USING (
  chat_id IN (
    SELECT id FROM content_chats WHERE public.can_read_brand_voice(brand_voice_id)
  )
);

CREATE POLICY content_chat_messages_insert ON content_chat_messages FOR INSERT TO authenticated
WITH CHECK (
  chat_id IN (
    SELECT id FROM content_chats WHERE public.can_read_brand_voice(brand_voice_id)
  )
);

-- ─── Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON content_chats          TO authenticated;
GRANT SELECT, INSERT                  ON content_chat_messages TO authenticated;
-- Service-Role darf alles (Edge Function nutzt das für Persistieren)
GRANT ALL ON content_chats          TO service_role;
GRANT ALL ON content_chat_messages  TO service_role;

-- ─── Realtime-Subscription für streaming UX ───────────────────────────────
ALTER TABLE content_chat_messages REPLICA IDENTITY FULL;

COMMIT;

-- Sanity
SELECT 'content_chats' AS table, count(*) FROM content_chats
UNION ALL SELECT 'content_chat_messages', count(*) FROM content_chat_messages;
