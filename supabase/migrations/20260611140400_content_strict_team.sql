-- Content-Bereich: gleiche Doppel-Policy-Loophole wie bei CRM.
-- content_posts hat "Users manage own posts" (user_id-only) + neue team-Policy.
-- content_documents hat user_id ODER team_id-OR-Policy.
BEGIN;

DROP POLICY IF EXISTS "Users manage own posts" ON public.content_posts;
-- behalten: content_posts_team

DROP POLICY IF EXISTS content_documents_team_select ON public.content_documents;
DROP POLICY IF EXISTS content_documents_team_update ON public.content_documents;
DROP POLICY IF EXISTS content_documents_team_delete ON public.content_documents;

CREATE POLICY content_documents_team_select ON public.content_documents FOR SELECT USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);
CREATE POLICY content_documents_team_update ON public.content_documents FOR UPDATE USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);
CREATE POLICY content_documents_team_delete ON public.content_documents FOR DELETE USING (
  (team_id IS NULL AND user_id = auth.uid())
  OR (team_id IS NOT NULL AND team_id = ANY(get_my_team_ids()))
);
COMMIT;

SELECT tablename, policyname, cmd, regexp_replace(qual::text,'\s+',' ','g') AS using_clause
FROM pg_policies WHERE schemaname='public' AND tablename IN ('content_posts','content_documents')
ORDER BY tablename, policyname;
