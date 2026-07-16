-- ════════════════════════════════════════════════════════════════════════════
-- 20260715100100_instagram_unipile_p1_inbox.sql
-- Instagram-Modul Rebuild — P1: DM-Inbox (read).
-- ----------------------------------------------------------------------------
-- Zwei Tabellen als lokaler Spiegel der Unipile-Instagram-Chats:
--   instagram_chats    — ein Chat je Gesprächspartner (1:1-DMs)
--   instagram_messages — Nachrichten im Chat, in/out
--
-- Bewusst instagram-eigene Tabellen (kein generischer unipile_inbox-Layer) —
-- Entscheidung 2026-07-15. Falls WhatsApp/Telegram folgen, ist die
-- Verallgemeinerung ein eigener Sprint (siehe Konzept §8.4).
--
-- ABGRENZUNG zu linkedin_inbox: das ist eine Triage-Schicht für IMPORTIERTE
-- Kontakte (Sales-Nav) mit promote-to-lead. instagram_chats/-messages sind
-- dagegen der Nachrichten-Spiegel. Die IG-Triage (eingehende DM von Unbekannt
-- → Lead) kommt in P3, dann als eigene instagram_inbox-Tabelle nach dem
-- linkedin_inbox-Muster.
--
-- Dedup: unipile_message_id / unipile_chat_id sind global eindeutig (Unipile) →
-- Sync ist re-run-safe via UNIQUE + upsert onConflict.
--
-- Self-Host (Hetzner): explizite GRANTs (Top-Fallstrick #3 + #12).
-- RLS via public.user_in_team(uuid). Writes über service_role (Sync-EF/Webhook);
-- authenticated darf lesen. Senden (P2) läuft über eine EF, nicht per Client-Insert.
--
-- Vor Apply:
--   * 20260715100000_instagram_unipile_p0_accounts.sql MUSS vorher laufen (FK).
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, ZUERST Staging.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------------
-- Chats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_chats (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  ig_account_id        uuid NOT NULL REFERENCES public.instagram_unipile_accounts(id) ON DELETE CASCADE,

  unipile_chat_id      text NOT NULL,        -- Unipile-Chat-ID (global eindeutig)
  provider_chat_id     text,                 -- IG-interne Thread-ID

  -- Gesprächspartner (1:1-DM → genau ein Attendee; Gruppen-DMs: erster Attendee)
  attendee_provider_id text,
  attendee_username    text,
  attendee_name        text,
  attendee_avatar_url  text,

  -- Denormalisiert für die Listen-Ansicht (spart N+1 auf messages)
  last_message_at      timestamptz,
  last_message_text    text,
  last_message_is_outbound boolean,
  unread_count         integer NOT NULL DEFAULT 0,

  is_archived          boolean NOT NULL DEFAULT false,

  -- Verknüpfung ins CRM (gesetzt via P3-Triage/promote; hier schon vorgesehen)
  lead_id              uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  raw                  jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instagram_chats_unipile_chat_id_key UNIQUE (unipile_chat_id)
);

-- Listen-Query: Chats eines Teams, neueste zuerst.
CREATE INDEX IF NOT EXISTS idx_ig_chats_team_last_msg
  ON public.instagram_chats(team_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ig_chats_account ON public.instagram_chats(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_chats_lead
  ON public.instagram_chats(lead_id) WHERE lead_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  chat_id              uuid NOT NULL REFERENCES public.instagram_chats(id) ON DELETE CASCADE,

  unipile_message_id   text NOT NULL,        -- Unipile-Message-ID (global eindeutig)
  provider_message_id  text,

  sender_provider_id   text,
  is_outbound          boolean NOT NULL DEFAULT false,   -- true = vom verbundenen Konto gesendet

  text                 text,
  attachments          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,type,url,filename,mime}]
  reactions            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{value,sender_provider_id}]
  is_read              boolean NOT NULL DEFAULT false,

  sent_at              timestamptz,
  raw                  jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instagram_messages_unipile_message_id_key UNIQUE (unipile_message_id)
);

-- Verlauf-Query: Nachrichten eines Chats chronologisch.
CREATE INDEX IF NOT EXISTS idx_ig_messages_chat_sent
  ON public.instagram_messages(chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_messages_team ON public.instagram_messages(team_id);

-- ---------------------------------------------------------------------------
-- updated_at-Trigger (chats)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_instagram_chats_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS instagram_chats_touch ON public.instagram_chats;
CREATE TRIGGER instagram_chats_touch
  BEFORE UPDATE ON public.instagram_chats
  FOR EACH ROW EXECUTE FUNCTION public.touch_instagram_chats_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — Team-Mandant, read-only für authenticated (Writes via service_role).
-- ---------------------------------------------------------------------------
ALTER TABLE public.instagram_chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ig_chats_team_select ON public.instagram_chats;
CREATE POLICY ig_chats_team_select ON public.instagram_chats
  FOR SELECT TO authenticated USING (public.user_in_team(team_id));

DROP POLICY IF EXISTS ig_messages_team_select ON public.instagram_messages;
CREATE POLICY ig_messages_team_select ON public.instagram_messages
  FOR SELECT TO authenticated USING (public.user_in_team(team_id));

-- Self-Host: explizite Grants.
GRANT SELECT ON public.instagram_chats    TO authenticated;
GRANT SELECT ON public.instagram_messages TO authenticated;
GRANT ALL    ON public.instagram_chats    TO service_role;
GRANT ALL    ON public.instagram_messages TO service_role;

-- Top-Fallstrick #3-Safety-Net: Cross-Table-Subquery in user_in_team braucht Grants.
GRANT SELECT ON public.team_members TO authenticated;
GRANT SELECT ON public.teams        TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: Inbox-UI abonniert neue Nachrichten (Webhook schreibt → WAL → Client).
-- Defensive: Publication-ADD ist nicht idempotent → DO-Block mit Existenz-Check.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'instagram_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'instagram_chats'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_chats;
    END IF;
  END IF;
END $$;

ALTER TABLE public.instagram_messages REPLICA IDENTITY FULL;
ALTER TABLE public.instagram_chats    REPLICA IDENTITY FULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
