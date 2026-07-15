-- @-Mentions externer LinkedIn-Profile/Firmen im Beitragstext
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS linkedin_mentions jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Grants ziehen über Default-Privileges; zur Sicherheit explizit:
GRANT SELECT, INSERT, UPDATE ON public.content_posts TO authenticated;
