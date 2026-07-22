-- R5: Messaging/Inbox-Snapshots je Login (team-scoped). Unipile /chats liefert
-- pro Konversation unread_count + timestamp; wir scannen gedeckelt und leiten
-- ungelesene Threads + aktive Gespräche ab (analytics-snapshot Cron).
CREATE TABLE IF NOT EXISTS public.linkedin_messaging_metrics (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL,
  unipile_account_id text NOT NULL,
  brand_voice_id     uuid,
  chats_scanned      integer,
  unread_threads     integer,
  unread_messages    integer,
  active_7d          integer,
  captured_on        date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  captured_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lmm_acct_day  ON public.linkedin_messaging_metrics(unipile_account_id, captured_on);
CREATE INDEX        IF NOT EXISTS idx_lmm_team_time ON public.linkedin_messaging_metrics(team_id, captured_at DESC);

ALTER TABLE public.linkedin_messaging_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lmm_team_read ON public.linkedin_messaging_metrics;
CREATE POLICY lmm_team_read ON public.linkedin_messaging_metrics FOR SELECT USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));
GRANT ALL    ON public.linkedin_messaging_metrics TO service_role;
GRANT SELECT ON public.linkedin_messaging_metrics TO authenticated;
