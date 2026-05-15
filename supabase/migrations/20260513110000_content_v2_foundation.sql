-- ============================================================
-- Content v2 Foundation — Schema-Refactoring fuer den neuen
-- Content-Bereich (Redaktionsplan-Hub + Text-Werkstatt +
-- Visuals + Memory-Engine + Publishing-Loop).
--
-- Idempotent: alle CREATE/ALTER mit IF NOT EXISTS / IF EXISTS.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) content_posts: team-scopen + neue Felder
-- ============================================================

-- Team-Scope nachruesten (war bisher nur user_id)
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'personal'
  CHECK (workspace IN ('personal','company','team_support'));
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id);
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id);
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS visual_id uuid;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS parent_idea_id uuid REFERENCES public.content_posts(id) ON DELETE SET NULL;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS hook text;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS target_audience_id uuid REFERENCES public.target_audiences(id) ON DELETE SET NULL;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS linkedin_post_url text;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS publishing_error text;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS last_publish_attempt_at timestamptz;

-- Status-Erweiterung: neue States 'in_review','approved','analyzed'
-- (idee, draft, scheduled, published existieren schon)
-- Wir lassen status als text (nicht enum) fuer Migration-Flexibilitaet,
-- aber dokumentieren die erlaubten Werte als CHECK CONSTRAINT.
DO $$ BEGIN
  ALTER TABLE public.content_posts ADD CONSTRAINT content_posts_status_check
    CHECK (status IN ('idee','draft','in_review','approved','scheduled','published','analyzed','failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill team_id fuer existierende rows (nimm aktives Team des Owners)
UPDATE public.content_posts cp
SET team_id = (
  SELECT tm.team_id FROM public.team_members tm
  WHERE tm.user_id = cp.user_id
  ORDER BY tm.created_at ASC LIMIT 1
)
WHERE team_id IS NULL;

-- ============================================================
-- 2) content_post_comments — Team-Kollab auf Posts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.content_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  body text NOT NULL,
  mentions uuid[] DEFAULT '{}'::uuid[],
  is_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_post_comments_post ON public.content_post_comments(post_id);

-- ============================================================
-- 3) visuals — Bilder (Nano Banana Output)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.visuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  resolved_prompt text,
  aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('1:1','4:5','1.91:1','4:1')),
  model text NOT NULL DEFAULT 'gemini-2.5-flash-image',
  storage_path text NOT NULL,
  thumbnail_path text,
  parent_visual_id uuid REFERENCES public.visuals(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.content_posts(id) ON DELETE SET NULL,
  credits_used integer NOT NULL DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visuals_team ON public.visuals(team_id);
CREATE INDEX IF NOT EXISTS idx_visuals_post ON public.visuals(post_id);

-- FK von content_posts.visual_id (nun dass visuals existiert)
DO $$ BEGIN
  ALTER TABLE public.content_posts
    ADD CONSTRAINT content_posts_visual_id_fkey
    FOREIGN KEY (visual_id) REFERENCES public.visuals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 4) Brand Voice: Visual-DNA-Felder
-- ============================================================
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS visual_style_description text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS visual_color_palette text[] DEFAULT '{}'::text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS visual_keywords text[] DEFAULT '{}'::text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS visual_negative_prompt text;

-- ============================================================
-- 5) Memory-Engine — Generations, Edits, Feedback
-- ============================================================

-- Jede AI-Generation wird hier protokolliert
CREATE TABLE IF NOT EXISTS public.content_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  post_id uuid REFERENCES public.content_posts(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('full_post','hook','improve','brainstorm','visual_prompt')),
  model text NOT NULL,
  prompt_input jsonb NOT NULL,           -- user inputs (topic, audience, etc.)
  resolved_prompt text,                  -- finaler Prompt incl. Memory-Few-Shot
  brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  target_audience_id uuid REFERENCES public.target_audiences(id) ON DELETE SET NULL,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,  -- alle erzeugten Varianten
  picked_variant_index integer,                  -- welche der Varianten gepickt wurde
  picked_at timestamptz,
  credits_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_generations_user ON public.content_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_content_generations_team_created ON public.content_generations(team_id, created_at DESC);

-- Edit-Diff: zwischen AI-Output und finalem Text (vor Publish)
CREATE TABLE IF NOT EXISTS public.content_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES public.content_generations(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  ai_text text NOT NULL,
  final_text text NOT NULL,
  diff_chars integer,                    -- Zeichen-Aenderungen (Heuristik fuer Edit-Tiefe)
  diff_ratio numeric(4,3),               -- 0.0 = identisch, 1.0 = komplett umgeschrieben
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_edits_team ON public.content_edits(team_id);

-- Lightweight-Feedback an Generations
CREATE TABLE IF NOT EXISTS public.content_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.content_generations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  variant_index integer,
  reaction text NOT NULL CHECK (reaction IN ('like','dislike','more_like_this','less_like_this','rejected')),
  note text,
  created_at timestamptz DEFAULT now()
);

-- Performance-Metrics fuer published Posts (kommt mit Reporting, schon-mal vorbereiten)
CREATE TABLE IF NOT EXISTS public.content_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  measured_at timestamptz NOT NULL,
  days_since_publish integer NOT NULL,
  impressions integer,
  likes integer,
  comments_count integer,
  reshares integer,
  clicks integer,
  engagement_rate numeric(5,4),
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_post_metrics_post ON public.content_post_metrics(post_id);

-- ============================================================
-- 6) Memory-Settings: Opt-in pro Account
-- ============================================================
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS memory_enabled boolean DEFAULT NULL;
-- NULL = noch nicht entschieden (User wird beim Onboarding gefragt).
-- TRUE = opt-in. FALSE = opt-out (keine Generation logged).
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS memory_consented_at timestamptz;

-- ============================================================
-- 7) Post-Schedule-Queue (fuer Auto-Publishing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_publish_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','published','failed','cancelled')),
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  error_message text,
  published_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_publish_queue_due ON public.post_publish_queue(scheduled_for) WHERE status = 'pending';

-- ============================================================
-- 8) RLS-Policies
-- ============================================================

-- content_posts: alte Policies entfernen, team-scoped neu
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_posts_own ON public.content_posts;
DROP POLICY IF EXISTS content_posts_team ON public.content_posts;
CREATE POLICY content_posts_team ON public.content_posts FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.content_post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_post_comments_team ON public.content_post_comments;
CREATE POLICY content_post_comments_team ON public.content_post_comments FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.visuals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visuals_team ON public.visuals;
CREATE POLICY visuals_team ON public.visuals FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.content_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_generations_team ON public.content_generations;
CREATE POLICY content_generations_team ON public.content_generations FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.content_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_edits_team ON public.content_edits;
CREATE POLICY content_edits_team ON public.content_edits FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_feedback_team ON public.content_feedback;
CREATE POLICY content_feedback_team ON public.content_feedback FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.content_post_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_post_metrics_team ON public.content_post_metrics;
CREATE POLICY content_post_metrics_team ON public.content_post_metrics FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.post_publish_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_publish_queue_team ON public.post_publish_queue;
CREATE POLICY post_publish_queue_team ON public.post_publish_queue FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

-- ============================================================
-- 9) Grants (Self-Host braucht expliziten Grant fuer authenticated)
-- ============================================================
GRANT ALL ON public.content_posts          TO authenticated;
GRANT ALL ON public.content_post_comments  TO authenticated;
GRANT ALL ON public.visuals                TO authenticated;
GRANT ALL ON public.content_generations    TO authenticated;
GRANT ALL ON public.content_edits          TO authenticated;
GRANT ALL ON public.content_feedback       TO authenticated;
GRANT ALL ON public.content_post_metrics   TO authenticated;
GRANT ALL ON public.post_publish_queue     TO authenticated;
GRANT ALL ON public.brand_voices           TO authenticated;
GRANT ALL ON public.user_preferences       TO authenticated;

-- ============================================================
-- 10) Updated-At-Triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_content_post_comments_updated_at
    BEFORE UPDATE ON public.content_post_comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_post_publish_queue_updated_at
    BEFORE UPDATE ON public.post_publish_queue
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- ============================================================
-- Verifikation
-- ============================================================
SELECT 'tables' AS section, table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('content_posts','content_post_comments','visuals','content_generations',
                     'content_edits','content_feedback','content_post_metrics','post_publish_queue')
ORDER BY table_name;
