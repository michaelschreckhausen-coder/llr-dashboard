-- Cross-Team-Sharing: Brand Voices / Zielgruppen / Wissen (+ angehängte Inhalte)
-- mit anderen Teams teilen (read+write). Default-Isolation bleibt; Sharing ist Opt-in.
-- Angewandt auf STAGING 2026-06-16. Prod-Rollout separat (NACH E2E-Test).
-- HINWEIS: can_read_brand_voice() gehört supabase_admin → dieser eine CREATE OR REPLACE
--          muss als `psql -U supabase_admin` laufen, der Rest als postgres. Idempotent.

BEGIN;

-- ===== Team-Share-Junctions =====
CREATE TABLE IF NOT EXISTS public.brand_voice_team_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_voice_id uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  shared_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_voice_id, team_id));
CREATE TABLE IF NOT EXISTS public.target_audience_team_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_audience_id uuid NOT NULL REFERENCES public.target_audiences(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  shared_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_audience_id, team_id));
CREATE TABLE IF NOT EXISTS public.knowledge_base_team_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  shared_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (knowledge_base_id, team_id));

-- ===== Helpers (SECURITY DEFINER, recursion-safe) =====
CREATE OR REPLACE FUNCTION public.bv_team_shared(bv_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM brand_voice_team_shares ts WHERE ts.brand_voice_id=bv_id AND ts.team_id = ANY(get_my_team_ids())) $$;
CREATE OR REPLACE FUNCTION public.ta_team_shared(ta_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM target_audience_team_shares ts WHERE ts.target_audience_id=ta_id AND ts.team_id = ANY(get_my_team_ids())) $$;
CREATE OR REPLACE FUNCTION public.kb_team_shared(kb_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM knowledge_base_team_shares ts WHERE ts.knowledge_base_id=kb_id AND ts.team_id = ANY(get_my_team_ids())) $$;
CREATE OR REPLACE FUNCTION public.can_manage_brand_voice(bv_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM brand_voices bv WHERE bv.id=bv_id AND (bv.user_id=auth.uid() OR bv.team_id = ANY(get_my_team_ids()))) $$;
CREATE OR REPLACE FUNCTION public.can_manage_target_audience(ta_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM target_audiences ta WHERE ta.id=ta_id AND (ta.user_id=auth.uid() OR ta.team_id = ANY(get_my_team_ids()))) $$;
CREATE OR REPLACE FUNCTION public.can_manage_knowledge_base(kb_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM knowledge_base kb WHERE kb.id=kb_id AND (kb.user_id=auth.uid() OR kb.team_id = ANY(get_my_team_ids()))) $$;

-- ===== RLS + grants on junctions =====
ALTER TABLE public.brand_voice_team_shares     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_audience_team_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_team_shares  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bvts_select ON public.brand_voice_team_shares;
DROP POLICY IF EXISTS bvts_insert ON public.brand_voice_team_shares;
DROP POLICY IF EXISTS bvts_delete ON public.brand_voice_team_shares;
CREATE POLICY bvts_select ON public.brand_voice_team_shares FOR SELECT USING (team_id = ANY(get_my_team_ids()) OR can_manage_brand_voice(brand_voice_id));
CREATE POLICY bvts_insert ON public.brand_voice_team_shares FOR INSERT WITH CHECK (can_manage_brand_voice(brand_voice_id));
CREATE POLICY bvts_delete ON public.brand_voice_team_shares FOR DELETE USING (can_manage_brand_voice(brand_voice_id));
DROP POLICY IF EXISTS tats_select ON public.target_audience_team_shares;
DROP POLICY IF EXISTS tats_insert ON public.target_audience_team_shares;
DROP POLICY IF EXISTS tats_delete ON public.target_audience_team_shares;
CREATE POLICY tats_select ON public.target_audience_team_shares FOR SELECT USING (team_id = ANY(get_my_team_ids()) OR can_manage_target_audience(target_audience_id));
CREATE POLICY tats_insert ON public.target_audience_team_shares FOR INSERT WITH CHECK (can_manage_target_audience(target_audience_id));
CREATE POLICY tats_delete ON public.target_audience_team_shares FOR DELETE USING (can_manage_target_audience(target_audience_id));
DROP POLICY IF EXISTS kbts_select ON public.knowledge_base_team_shares;
DROP POLICY IF EXISTS kbts_insert ON public.knowledge_base_team_shares;
DROP POLICY IF EXISTS kbts_delete ON public.knowledge_base_team_shares;
CREATE POLICY kbts_select ON public.knowledge_base_team_shares FOR SELECT USING (team_id = ANY(get_my_team_ids()) OR can_manage_knowledge_base(knowledge_base_id));
CREATE POLICY kbts_insert ON public.knowledge_base_team_shares FOR INSERT WITH CHECK (can_manage_knowledge_base(knowledge_base_id));
CREATE POLICY kbts_delete ON public.knowledge_base_team_shares FOR DELETE USING (can_manage_knowledge_base(knowledge_base_id));
GRANT SELECT, INSERT, DELETE ON public.brand_voice_team_shares     TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.target_audience_team_shares TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.knowledge_base_team_shares  TO authenticated;

-- ===== Entity read+update policies: + team-share (DELETE bleibt owner-only) =====
DROP POLICY IF EXISTS brand_voices_visibility ON brand_voices;
CREATE POLICY brand_voices_visibility ON brand_voices FOR SELECT USING (
  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) AND (user_id = auth.uid() OR is_shared = true))
  OR id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id = auth.uid()) OR bv_team_shared(id));
DROP POLICY IF EXISTS brand_voices_team_update ON brand_voices;
DROP POLICY IF EXISTS brand_voices_update_own ON brand_voices;
CREATE POLICY brand_voices_update ON brand_voices FOR UPDATE
USING (user_id = auth.uid() OR (is_shared=true AND team_id = ANY(get_my_team_ids())) OR id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id=auth.uid()) OR bv_team_shared(id))
WITH CHECK (user_id = auth.uid() OR (is_shared=true AND team_id = ANY(get_my_team_ids())) OR id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id=auth.uid()) OR bv_team_shared(id));
DROP POLICY IF EXISTS brand_voices_delete_own ON brand_voices;
DROP POLICY IF EXISTS brand_voices_owner_delete ON brand_voices;
CREATE POLICY brand_voices_delete ON brand_voices FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS target_audiences_visibility ON target_audiences;
CREATE POLICY target_audiences_visibility ON target_audiences FOR SELECT USING (
  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) AND (user_id = auth.uid() OR is_shared = true))
  OR id IN (SELECT target_audience_id FROM target_audience_shares WHERE user_id = auth.uid()) OR ta_team_shared(id));
DROP POLICY IF EXISTS target_audiences_team_update ON target_audiences;
DROP POLICY IF EXISTS "Users can update own target audiences" ON target_audiences;
CREATE POLICY target_audiences_update ON target_audiences FOR UPDATE
USING (user_id = auth.uid() OR (is_shared=true AND team_id = ANY(get_my_team_ids())) OR id IN (SELECT target_audience_id FROM target_audience_shares WHERE user_id=auth.uid()) OR ta_team_shared(id))
WITH CHECK (user_id = auth.uid() OR (is_shared=true AND team_id = ANY(get_my_team_ids())) OR id IN (SELECT target_audience_id FROM target_audience_shares WHERE user_id=auth.uid()) OR ta_team_shared(id));
DROP POLICY IF EXISTS target_audiences_owner_delete ON target_audiences;
DROP POLICY IF EXISTS "Users can delete own target audiences" ON target_audiences;
CREATE POLICY target_audiences_delete ON target_audiences FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS knowledge_base_visibility ON knowledge_base;
CREATE POLICY knowledge_base_visibility ON knowledge_base FOR SELECT USING (
  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) AND (user_id = auth.uid() OR is_shared = true))
  OR id IN (SELECT knowledge_base_id FROM knowledge_base_shares WHERE user_id = auth.uid()) OR kb_team_shared(id));
DROP POLICY IF EXISTS knowledge_base_team_update ON knowledge_base;
DROP POLICY IF EXISTS "Users can update own knowledge" ON knowledge_base;
CREATE POLICY knowledge_base_update ON knowledge_base FOR UPDATE
USING (user_id = auth.uid() OR (is_shared=true AND team_id = ANY(get_my_team_ids())) OR id IN (SELECT knowledge_base_id FROM knowledge_base_shares WHERE user_id=auth.uid()) OR kb_team_shared(id))
WITH CHECK (user_id = auth.uid() OR (is_shared=true AND team_id = ANY(get_my_team_ids())) OR id IN (SELECT knowledge_base_id FROM knowledge_base_shares WHERE user_id=auth.uid()) OR kb_team_shared(id));
DROP POLICY IF EXISTS "Users can delete own knowledge" ON knowledge_base;
DROP POLICY IF EXISTS knowledge_base_owner_delete ON knowledge_base;
CREATE POLICY knowledge_base_delete ON knowledge_base FOR DELETE USING (user_id = auth.uid());

-- ===== Angehängte Content/LinkedIn-Tabellen: + bv_team_shared(brand_voice_id) =====
DROP POLICY IF EXISTS content_posts_team ON content_posts;
CREATE POLICY content_posts_team ON content_posts FOR ALL
USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) OR bv_team_shared(brand_voice_id))
WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) OR bv_team_shared(brand_voice_id));
DROP POLICY IF EXISTS visuals_team ON visuals;
CREATE POLICY visuals_team ON visuals FOR ALL
USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) OR bv_team_shared(brand_voice_id))
WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) OR bv_team_shared(brand_voice_id));
DROP POLICY IF EXISTS linkedin_messages_team_scoped ON linkedin_messages;
CREATE POLICY linkedin_messages_team_scoped ON linkedin_messages FOR ALL
USING ((team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())) OR (team_id IS NULL AND user_id = auth.uid()) OR bv_team_shared(brand_voice_id))
WITH CHECK ((team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())) OR (team_id IS NULL AND user_id = auth.uid()) OR bv_team_shared(brand_voice_id));
DROP POLICY IF EXISTS content_documents_team_select ON content_documents;
CREATE POLICY content_documents_team_select ON content_documents FOR SELECT
USING (((team_id IS NULL) AND (user_id = auth.uid())) OR ((team_id IS NOT NULL) AND (team_id = ANY(get_my_team_ids()))) OR bv_team_shared(brand_voice_id));
DROP POLICY IF EXISTS content_documents_team_update ON content_documents;
CREATE POLICY content_documents_team_update ON content_documents FOR UPDATE
USING (((team_id IS NULL) AND (user_id = auth.uid())) OR ((team_id IS NOT NULL) AND (team_id = ANY(get_my_team_ids()))) OR bv_team_shared(brand_voice_id));
DROP POLICY IF EXISTS content_documents_team_delete ON content_documents;
CREATE POLICY content_documents_team_delete ON content_documents FOR DELETE
USING (((team_id IS NULL) AND (user_id = auth.uid())) OR ((team_id IS NOT NULL) AND (team_id = ANY(get_my_team_ids()))) OR bv_team_shared(brand_voice_id));
DROP POLICY IF EXISTS content_documents_team_insert ON content_documents;
CREATE POLICY content_documents_team_insert ON content_documents FOR INSERT
WITH CHECK ((team_id = ANY(get_my_team_ids())) OR bv_team_shared(brand_voice_id));

COMMIT;

-- ===== SEPARAT als supabase_admin ausführen (Owner-Restriction): =====
-- CREATE OR REPLACE FUNCTION public.can_read_brand_voice(bv_id uuid) RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
--   SELECT EXISTS (SELECT 1 FROM brand_voices bv WHERE bv.id = bv_id AND (
--     bv.user_id = auth.uid()
--     OR (bv.is_shared = true AND bv.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
--     OR bv.id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id = auth.uid())
--   )) OR public.bv_team_shared(bv_id) $fn$;
