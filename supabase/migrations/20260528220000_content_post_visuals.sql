-- Migration: content_post_visuals (Junction)
-- Bisher: ein Post hatte genau ein Visual via content_posts.visual_id.
-- Neu: ein Post kann beliebig viele Visuals haben (für Carousel-Posts).
--
-- Strategie:
--   - Neue Junction-Tabelle content_post_visuals(post_id, visual_id, position)
--   - content_posts.visual_id BLEIBT als Cover-Visual-Pointer (position=0)
--     -> Rückwärtskompatibilität für Edge Functions (linkedin-publish-post)
--     -> Backfill: existierende visual_id-Einträge wandern auch in die Junction
--   - Beim Save synct das Frontend die Junction-Liste UND setzt visual_id
--     auf das Cover-Visual (position 0)

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_post_visuals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  visual_id   uuid NOT NULL REFERENCES public.visuals(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  position    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  CONSTRAINT content_post_visuals_unique UNIQUE (post_id, visual_id)
);

CREATE INDEX IF NOT EXISTS idx_cpv_post_id  ON public.content_post_visuals(post_id);
CREATE INDEX IF NOT EXISTS idx_cpv_team_id  ON public.content_post_visuals(team_id);

-- RLS
ALTER TABLE public.content_post_visuals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cpv_team_read"  ON public.content_post_visuals;
DROP POLICY IF EXISTS "cpv_team_write" ON public.content_post_visuals;

CREATE POLICY "cpv_team_read" ON public.content_post_visuals
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );
CREATE POLICY "cpv_team_write" ON public.content_post_visuals
  FOR ALL USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- Grants (Self-Host)
GRANT ALL ON public.content_post_visuals TO authenticated;
GRANT ALL ON public.content_post_visuals TO service_role;

-- Backfill: bestehende content_posts.visual_id-Einträge auch als Junction-Row
-- mit position=0 anlegen (idempotent dank ON CONFLICT)
INSERT INTO public.content_post_visuals (post_id, visual_id, team_id, position, created_at)
SELECT p.id, p.visual_id, p.team_id, 0, p.created_at
FROM public.content_posts p
WHERE p.visual_id IS NOT NULL
  AND p.team_id IS NOT NULL
ON CONFLICT (post_id, visual_id) DO NOTHING;

COMMENT ON TABLE public.content_post_visuals IS
  'M:N-Verknüpfung zwischen content_posts und visuals (Carousel-Support). position = Sortierreihenfolge. content_posts.visual_id bleibt als Cover-Pointer (= position 0).';

NOTIFY pgrst, 'reload schema';

COMMIT;
