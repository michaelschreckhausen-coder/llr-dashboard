-- brand_memory: kuratierte Notizen/Fakten pro Brand (vom Assistenten Leadly oder
-- manuell ergänzbar). Fließen über buildBrandCorpus in jede Content-Generierung ein.
-- Team-scoped RLS über brand_voices.team_id; user_id-Fallback für Solo-Brands.
BEGIN;

CREATE TABLE IF NOT EXISTS public.brand_memory (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_voice_id uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE,
  team_id        uuid,
  user_id        uuid,
  content        text NOT NULL,
  source         text NOT NULL DEFAULT 'manual',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_memory_brand ON public.brand_memory(brand_voice_id);

ALTER TABLE public.brand_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_memory_access ON public.brand_memory;
CREATE POLICY brand_memory_access ON public.brand_memory FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.brand_voices b
    WHERE b.id = brand_voice_id
      AND ( b.user_id = auth.uid()
            OR b.team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.brand_voices b
    WHERE b.id = brand_voice_id
      AND ( b.user_id = auth.uid()
            OR b.team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) )
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_memory TO authenticated;

COMMIT;
