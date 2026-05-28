-- ════════════════════════════════════════════════════════════════════════════
-- Leadly Assistant: assistant_messages + assistant_briefings
-- 2026-05-30
-- ════════════════════════════════════════════════════════════════════════════
--
-- Foundation für den globalen Chatbot "Leadly":
--   - assistant_messages: kompletter Chat-Verlauf pro User, multi-device-sync.
--   - assistant_briefings: 1x pro Tag generiertes Morgens-Briefing.
--
-- RLS pro user_id (kein Cross-User-Read, kein Cross-User-Write).
-- Hetzner-GRANT-Boilerplate (siehe CLAUDE.md "Grant-Hygiene nach neuen Tabellen").
--
-- Apply-Pfad:
--   ssh root@<hetzner> 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260530090000_leadly_assistant_tables.sql

BEGIN;

-- ─── assistant_messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id      uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  role         text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content      text,
  tool_calls   jsonb,   -- Array von { id, name, input } wenn role='assistant' Tool-Use
  tool_use_id  text,    -- Verweis auf tool_calls[].id wenn role='tool' (Result)
  tool_result  jsonb,   -- Result-Payload wenn role='tool'
  metadata     jsonb,   -- z.B. { model, tokens_in, tokens_out, latency_ms }
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_created
  ON public.assistant_messages (user_id, created_at);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "am_own_select" ON public.assistant_messages;
CREATE POLICY "am_own_select" ON public.assistant_messages
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "am_own_insert" ON public.assistant_messages;
CREATE POLICY "am_own_insert" ON public.assistant_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "am_own_delete" ON public.assistant_messages;
CREATE POLICY "am_own_delete" ON public.assistant_messages
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.assistant_messages IS
  '2026-05-30 · Chat-Verlauf des Leadly-Assistenten pro User. role=user|assistant|system|tool. Tool-Calls (Anthropic-Format) in tool_calls jsonb.';

-- ─── assistant_briefings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_briefings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  briefing_date date NOT NULL DEFAULT (now()::date),
  briefing_text text NOT NULL,
  context_json  jsonb,  -- z.B. { overdue_count, today_count, hot_count }
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_briefings_user_date_unique UNIQUE (user_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_assistant_briefings_user_date
  ON public.assistant_briefings (user_id, briefing_date DESC);

ALTER TABLE public.assistant_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ab_own_select" ON public.assistant_briefings;
CREATE POLICY "ab_own_select" ON public.assistant_briefings
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ab_own_update" ON public.assistant_briefings;
CREATE POLICY "ab_own_update" ON public.assistant_briefings
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- INSERT macht die Edge-Function via service_role — kein authenticated-Insert-Policy nötig.

COMMENT ON TABLE public.assistant_briefings IS
  '2026-05-30 · Tägliches Leadly-Morgens-Briefing pro User. Insert via service_role (Edge-Function), Read pro User. UNIQUE(user_id, briefing_date).';

-- ─── Grants (Hetzner-Hotfix, CLAUDE.md Grant-Hygiene) ───────────────────
GRANT SELECT, INSERT, DELETE ON public.assistant_messages TO authenticated;
GRANT SELECT, UPDATE ON public.assistant_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_briefings TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation:
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_name IN ('assistant_messages','assistant_briefings') ORDER BY 1,2;
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid::regclass::text
--   IN ('public.assistant_messages','public.assistant_briefings');
-- ════════════════════════════════════════════════════════════════════════════
