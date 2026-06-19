-- content_document_chats: n:m-Zuordnung Dokument ↔ Chat (Text-Werkstatt)
-- Ein Dokument kann mit mehreren Chats bearbeitet werden; last_opened_at gibt
-- den zuletzt bearbeitenden Chat. RLS prüft über das Eltern-Dokument (dessen team).
BEGIN;

CREATE TABLE IF NOT EXISTS public.content_document_chats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES public.content_documents(id) ON DELETE CASCADE,
  chat_id        uuid NOT NULL REFERENCES public.content_chats(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_cdc_document ON public.content_document_chats(document_id);
CREATE INDEX IF NOT EXISTS idx_cdc_chat     ON public.content_document_chats(chat_id);

ALTER TABLE public.content_document_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cdc_team ON public.content_document_chats;
CREATE POLICY cdc_team ON public.content_document_chats FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.content_documents d
    WHERE d.id = document_id
      AND d.team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_documents d
    WHERE d.id = document_id
      AND d.team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_document_chats TO authenticated;

-- Backfill: bestehende source_chat_id-Bindung als Junction-Zeile übernehmen.
INSERT INTO public.content_document_chats (document_id, chat_id, last_opened_at, created_at)
SELECT d.id, d.source_chat_id, COALESCE(d.updated_at, now()), COALESCE(d.created_at, now())
FROM public.content_documents d
WHERE d.source_chat_id IS NOT NULL
ON CONFLICT (document_id, chat_id) DO NOTHING;

COMMIT;
