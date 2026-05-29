-- ════════════════════════════════════════════════════════════════════════════
-- Leadly Memory + RAG: pgvector + leadly_memory + leadly_preferences
-- 2026-05-31
-- ════════════════════════════════════════════════════════════════════════════
--
-- Foundation für Memory + RAG (Retrieval-Augmented Generation):
--
--   leadly_memory       — Vektorisierte Konversations-Summary-Items pro User.
--                         Nach jedem User+Assistant-Turn legt die Edge-Function
--                         eine kompakte Summary (~150-300 chars) ab + erzeugt
--                         ein Embedding via OpenAI text-embedding-3-small
--                         (1536 dims). Bei neuem User-Turn: nearest-neighbour-
--                         Lookup über cosine-distance liefert die 3-5 relevant-
--                         esten vergangenen Erinnerungen, die als Few-Shots in
--                         den System-Prompt injiziert werden.
--
--   leadly_preferences  — Explizite Lessons des Users ("wenn ich 'Termin' sage
--                         ist eigentlich 'Aufgabe' gemeint"). Key/Value-Pairs
--                         per User, durch ein eigenes Tool `remember_preference`
--                         vom Agent angelegt.
--
-- pgvector wird via CREATE EXTENSION IF NOT EXISTS vector aktiviert — Hetzner
-- nutzt das supabase/postgres-Image, das pgvector bündelt. Wenn das auf einer
-- Env fehlt: pgvector manuell installieren oder Memory deaktivieren.
--
-- RLS: pro user_id, kein Cross-User-Read.
-- Apply-Pfad:
--   ssh root@<hetzner> 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260531080000_leadly_memory_rag.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── leadly_memory ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leadly_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  -- summary: kompakter natural-language Snapshot der Interaktion, max ~300 chars
  summary       text NOT NULL,
  -- role: 'turn' (User+Assistant zusammen) oder 'fact' (explizite Lesson)
  kind          text NOT NULL DEFAULT 'turn' CHECK (kind IN ('turn', 'fact')),
  -- Embedding via OpenAI text-embedding-3-small (1536 dim)
  embedding     vector(1536),
  -- Verweis auf das auslösende assistant_messages-Pair (optional)
  source_message_id uuid REFERENCES public.assistant_messages(id) ON DELETE SET NULL,
  -- Importance-Score 0-100 (Edge-Function vergibt; höher = Bedeutung höher)
  importance    smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  -- Hits-Counter: wie oft wurde diese Memory bisher als Few-Shot retrieved
  recall_count  integer NOT NULL DEFAULT 0,
  last_recalled_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ANN-Index für cosine similarity. ivfflat ist schneller zu bauen als hnsw,
-- aber needs ANALYZE nach grösserem Datenstand. Bei <10k Rows pro User
-- vermutlich beide identisch performant — wir wählen ivfflat (default).
CREATE INDEX IF NOT EXISTS idx_leadly_memory_embedding_cos
  ON public.leadly_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_leadly_memory_user_created
  ON public.leadly_memory (user_id, created_at DESC);

ALTER TABLE public.leadly_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lm_own_select" ON public.leadly_memory;
CREATE POLICY "lm_own_select" ON public.leadly_memory
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "lm_own_delete" ON public.leadly_memory;
CREATE POLICY "lm_own_delete" ON public.leadly_memory
  FOR DELETE USING (user_id = auth.uid());

-- INSERT + UPDATE laufen via service-role aus der Edge-Function — kein
-- authenticated-Policy nötig (User soll Memory nicht direkt schreiben).

COMMENT ON TABLE public.leadly_memory IS
  '2026-05-31 · Vektorisierte Konversations-Memory für Leadly RAG. Insert/Update via service_role, Read via RLS, Delete vom User möglich. Cosine-Index auf embedding.';

-- ─── leadly_preferences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leadly_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  -- pref_key: kurzes Slug, z.B. 'task_naming', 'default_followup_days'
  pref_key    text NOT NULL,
  -- pref_value: free-text, wird im System-Prompt referenziert
  pref_value  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leadly_preferences_user_key_unique UNIQUE (user_id, pref_key)
);

CREATE INDEX IF NOT EXISTS idx_leadly_preferences_user
  ON public.leadly_preferences (user_id);

ALTER TABLE public.leadly_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lp_own_select" ON public.leadly_preferences;
CREATE POLICY "lp_own_select" ON public.leadly_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "lp_own_delete" ON public.leadly_preferences;
CREATE POLICY "lp_own_delete" ON public.leadly_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.leadly_preferences IS
  '2026-05-31 · Explizite User-Lessons für Leadly. Insert/Update via service_role (Tool remember_preference), Read+Delete vom User.';

-- ─── RPC: increment_memory_recall ───────────────────────────────────────
-- Helper für die Edge-Function um recall_count + last_recalled_at atomar
-- zu bumpen ohne Race-Condition. Wird aus dem service-role-Client gerufen.
CREATE OR REPLACE FUNCTION public.increment_memory_recall(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.leadly_memory
     SET recall_count = recall_count + 1,
         last_recalled_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_memory_recall(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_memory_recall(uuid) TO service_role;

-- ─── Grants (Hetzner-Hotfix, CLAUDE.md Grant-Hygiene) ───────────────────
GRANT SELECT, DELETE ON public.leadly_memory      TO authenticated;
GRANT SELECT, DELETE ON public.leadly_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadly_memory      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadly_preferences TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation:
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT extname FROM pg_extension WHERE extname='vector';
-- \d leadly_memory
-- \d leadly_preferences
-- SELECT polname, polcmd FROM pg_policy
--   WHERE polrelid::regclass::text IN
--     ('public.leadly_memory','public.leadly_preferences');
-- ════════════════════════════════════════════════════════════════════════════
