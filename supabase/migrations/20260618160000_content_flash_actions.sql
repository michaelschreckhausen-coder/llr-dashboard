-- Eigene KI-Actions (Flash Actions) für die Text-Werkstatt, team-scoped.
BEGIN;

CREATE TABLE IF NOT EXISTS public.content_flash_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL,
  user_id     uuid,
  label       text NOT NULL,
  prompt      text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_flash_actions_team ON public.content_flash_actions(team_id);

ALTER TABLE public.content_flash_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cfa_team ON public.content_flash_actions;
CREATE POLICY cfa_team ON public.content_flash_actions FOR ALL
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_flash_actions TO authenticated;
GRANT SELECT ON public.team_members TO authenticated;

COMMIT;
