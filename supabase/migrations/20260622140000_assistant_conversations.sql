-- assistant_conversations: separate Chats für den Leadly-Assistenten (wie content_chats
-- in der Text-Werkstatt). assistant_messages.conversation_id ordnet Nachrichten zu.
-- User-scoped RLS (Leadly ist persönlich). Backfill bündelt bestehende Historie je User.
BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  team_id    uuid,
  title      text NOT NULL DEFAULT 'Neuer Chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user ON public.assistant_conversations(user_id, updated_at DESC);

ALTER TABLE public.assistant_messages ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.assistant_conversations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON public.assistant_messages(conversation_id, created_at);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_conversations_own ON public.assistant_conversations;
CREATE POLICY assistant_conversations_own ON public.assistant_conversations FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations TO authenticated;

-- Backfill: bestehende Nachrichten je User in eine "Bisheriger Chat"-Konversation buendeln
DO $$
DECLARE u record; conv uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.assistant_messages WHERE conversation_id IS NULL AND user_id IS NOT NULL LOOP
    INSERT INTO public.assistant_conversations (user_id, team_id, title, created_at, updated_at)
    VALUES (
      u.user_id,
      (SELECT team_id FROM public.assistant_messages WHERE user_id=u.user_id AND team_id IS NOT NULL ORDER BY created_at DESC LIMIT 1),
      'Bisheriger Chat',
      (SELECT MIN(created_at) FROM public.assistant_messages WHERE user_id=u.user_id),
      (SELECT MAX(created_at) FROM public.assistant_messages WHERE user_id=u.user_id)
    ) RETURNING id INTO conv;
    UPDATE public.assistant_messages SET conversation_id = conv WHERE user_id = u.user_id AND conversation_id IS NULL;
  END LOOP;
END $$;

COMMIT;
