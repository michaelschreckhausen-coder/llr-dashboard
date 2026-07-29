-- LinkedIn-Postfach (P1): lokaler Spiegel der Unipile-Chats + Nachrichten.
-- Brand-scoped (gehoert dem verbundenen Profil der Marke) + team-scoped RLS wie linkedin_inbox.
BEGIN;

CREATE TABLE IF NOT EXISTS public.linkedin_chats (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid NOT NULL,
  brand_voice_id        uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  unipile_account_id    text NOT NULL,
  unipile_chat_id       text NOT NULL,
  attendee_provider_id  text,
  attendee_name         text,
  attendee_headline     text,
  attendee_avatar_url   text,
  attendee_profile_url  text,
  last_message_at       timestamptz,
  last_message_text     text,
  unread_count          int NOT NULL DEFAULT 0,
  archived              boolean NOT NULL DEFAULT false,
  lead_id               uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unipile_account_id, unipile_chat_id)
);
CREATE INDEX IF NOT EXISTS idx_li_chats_brand ON public.linkedin_chats (brand_voice_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_li_chats_team  ON public.linkedin_chats (team_id);

CREATE TABLE IF NOT EXISTS public.linkedin_chat_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid NOT NULL,
  chat_id               uuid NOT NULL REFERENCES public.linkedin_chats(id) ON DELETE CASCADE,
  unipile_message_id    text,
  direction             text NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_provider_id    text,
  text                  text,
  seen                  boolean NOT NULL DEFAULT false,
  sent_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unipile_message_id)
);
CREATE INDEX IF NOT EXISTS idx_li_chat_msgs_chat ON public.linkedin_chat_messages (chat_id, sent_at);

ALTER TABLE public.linkedin_chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_chats_brand ON public.linkedin_chats;
CREATE POLICY linkedin_chats_brand ON public.linkedin_chats FOR ALL USING (
  public.has_brand_access(brand_voice_id) OR (brand_voice_id IS NULL AND public.user_in_team(team_id))
) WITH CHECK (
  public.has_brand_access(brand_voice_id) OR (brand_voice_id IS NULL AND public.user_in_team(team_id))
);

DROP POLICY IF EXISTS linkedin_chat_messages_via_chat ON public.linkedin_chat_messages;
CREATE POLICY linkedin_chat_messages_via_chat ON public.linkedin_chat_messages FOR ALL USING (
  chat_id IN (SELECT c.id FROM public.linkedin_chats c
              WHERE public.has_brand_access(c.brand_voice_id) OR (c.brand_voice_id IS NULL AND public.user_in_team(c.team_id)))
) WITH CHECK (
  chat_id IN (SELECT c.id FROM public.linkedin_chats c
              WHERE public.has_brand_access(c.brand_voice_id) OR (c.brand_voice_id IS NULL AND public.user_in_team(c.team_id)))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_chats         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_chat_messages TO authenticated;

COMMIT;
