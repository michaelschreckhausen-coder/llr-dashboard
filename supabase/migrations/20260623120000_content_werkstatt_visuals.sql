-- Content-Werkstatt: Bilder im Chat + Designer.
-- 1) visuals bekommt design_json (editierbarer Layer-Zustand des Designers) + title.
-- 2) visual_chats: n:m Bild<->Chat (Spiegel von content_document_chats).

BEGIN;

ALTER TABLE public.visuals ADD COLUMN IF NOT EXISTS design_json jsonb;
ALTER TABLE public.visuals ADD COLUMN IF NOT EXISTS title text;

CREATE TABLE IF NOT EXISTS public.visual_chats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visual_id      uuid NOT NULL REFERENCES public.visuals(id) ON DELETE CASCADE,
  chat_id        uuid NOT NULL REFERENCES public.content_chats(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visual_id, chat_id)
);
CREATE INDEX IF NOT EXISTS visual_chats_chat_idx   ON public.visual_chats(chat_id);
CREATE INDEX IF NOT EXISTS visual_chats_visual_idx ON public.visual_chats(visual_id);

ALTER TABLE public.visual_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vc_team ON public.visual_chats;
CREATE POLICY vc_team ON public.visual_chats FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.visuals v
     WHERE v.id = visual_chats.visual_id
       AND v.team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  )
);

GRANT ALL ON public.visual_chats TO authenticated;

COMMIT;
