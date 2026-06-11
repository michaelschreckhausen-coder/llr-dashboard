-- 20260611120000_content_documents.sql
--
-- Dokumenten-Editor (Text-Werkstatt → neuroflash-Style). Phase 1.1.
-- Speichert bearbeitbare Dokumente: TipTap-JSON als Source-of-Truth + Plain-Text
-- fuer Copy/Suche. Team-scoped (RLS), Owner = user_id.
--
-- RLS nutzt get_my_team_ids() (wie leads_team_select/_update auf Prod). Falls die
-- Funktion wider Erwarten fehlt: Pre-Flight zeigt das, dann auf das
-- team_members-Subquery-Pattern + GRANT SELECT umstellen.
--
-- Idempotent. Staging-first, nach Freigabe Prod.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title          text NOT NULL DEFAULT 'Unbenanntes Dokument',
  content_json   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- TipTap-Doc (Source of Truth)
  content_text   text NOT NULL DEFAULT '',             -- Plain-Text-Extraktion
  source_chat_id uuid,                                 -- optional: Chat, aus dem der Text kam
  brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_documents_team_id    ON public.content_documents(team_id);
CREATE INDEX IF NOT EXISTS idx_content_documents_user_id    ON public.content_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_content_documents_updated_at ON public.content_documents(updated_at DESC);

ALTER TABLE public.content_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_documents_team_select ON public.content_documents;
DROP POLICY IF EXISTS content_documents_team_insert ON public.content_documents;
DROP POLICY IF EXISTS content_documents_team_update ON public.content_documents;
DROP POLICY IF EXISTS content_documents_team_delete ON public.content_documents;

CREATE POLICY content_documents_team_select ON public.content_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR team_id = ANY(public.get_my_team_ids()));

CREATE POLICY content_documents_team_insert ON public.content_documents FOR INSERT TO authenticated
  WITH CHECK (team_id = ANY(public.get_my_team_ids()));

CREATE POLICY content_documents_team_update ON public.content_documents FOR UPDATE TO authenticated
  USING      (user_id = auth.uid() OR team_id = ANY(public.get_my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR team_id = ANY(public.get_my_team_ids()));

CREATE POLICY content_documents_team_delete ON public.content_documents FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR team_id = ANY(public.get_my_team_ids()));

COMMIT;

NOTIFY pgrst, 'reload schema';
