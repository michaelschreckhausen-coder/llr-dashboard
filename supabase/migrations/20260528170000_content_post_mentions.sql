-- Migration: content_post_mentions (@-Erwähnungen von Team-Membern in Posts)
--
-- Junction-Tabelle: ein Post kann mehrere Team-Member erwähnen.
-- Michael nutzt diese Tabelle später im CRM/Aufgaben-Bereich, um
-- erwähnte User auf ihre eigenen Aufgaben hinzuweisen.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_post_mentions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  CONSTRAINT content_post_mentions_unique UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cpm_post_id ON public.content_post_mentions(post_id);
CREATE INDEX IF NOT EXISTS idx_cpm_user_id ON public.content_post_mentions(user_id);
CREATE INDEX IF NOT EXISTS idx_cpm_team_id ON public.content_post_mentions(team_id);

-- RLS
ALTER TABLE public.content_post_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpm_team_read"   ON public.content_post_mentions;
DROP POLICY IF EXISTS "cpm_team_write"  ON public.content_post_mentions;

CREATE POLICY "cpm_team_read" ON public.content_post_mentions
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "cpm_team_write" ON public.content_post_mentions
  FOR ALL USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- Grants (Self-Host: explizit für authenticated + service_role)
GRANT ALL ON public.content_post_mentions TO authenticated;
GRANT ALL ON public.content_post_mentions TO service_role;

-- PostgREST Schema-Cache reloaden
NOTIFY pgrst, 'reload schema';

COMMIT;
