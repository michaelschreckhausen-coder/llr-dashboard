-- Strike2-Zielgruppe als Generierungs-Kontext: content_chats/content_posts können
-- alternativ zu target_audience_id eine Strike2-Persona referenzieren.
BEGIN;
ALTER TABLE public.content_chats ADD COLUMN IF NOT EXISTS strike2_persona_id uuid REFERENCES public.strike2_personas(id) ON DELETE SET NULL;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS strike2_persona_id uuid REFERENCES public.strike2_personas(id) ON DELETE SET NULL;
COMMIT;
