-- 20260608190000_lead_tag_registry.sql
--
-- Tag-Registry: zentrale Tag-Liste pro Team (bzw. Solo-User) mit zuweisbarer
-- Farbe. leads.tags bleibt text[] (Tag-Namen) — die Registry ist eine additive
-- Metadaten-Schicht (name -> color), keine Migration der Lead-Tags.
--
-- color = Paletten-Schluessel (text), Frontend mappt auf {bg,fg,border}.
-- Ownership-Pattern analog organizations / lead_views (Team + Solo).
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_tag_registry (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    uuid,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT 'indigo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ein Tag-Name pro Team (case-insensitiv) bzw. pro Solo-User.
CREATE UNIQUE INDEX IF NOT EXISTS lead_tag_registry_team_name_uq
  ON public.lead_tag_registry (team_id, lower(name)) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lead_tag_registry_user_name_uq
  ON public.lead_tag_registry (user_id, lower(name)) WHERE team_id IS NULL;
CREATE INDEX IF NOT EXISTS lead_tag_registry_team_idx
  ON public.lead_tag_registry (team_id);

ALTER TABLE public.lead_tag_registry ENABLE ROW LEVEL SECURITY;

-- Team-scoped: jeder Team-Member sieht/aendert die Team-Tags.
DROP POLICY IF EXISTS ltr_team ON public.lead_tag_registry;
CREATE POLICY ltr_team ON public.lead_tag_registry FOR ALL
  USING      (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

-- Solo: team_id IS NULL + eigener User.
DROP POLICY IF EXISTS ltr_own ON public.lead_tag_registry;
CREATE POLICY ltr_own ON public.lead_tag_registry FOR ALL
  USING      (team_id IS NULL AND user_id = auth.uid())
  WITH CHECK (team_id IS NULL AND user_id = auth.uid());

-- Self-Host-Grant-Luecke (Top-Fallstrick #3): Cross-Table-Subquery braucht GRANT.
GRANT SELECT ON public.team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tag_registry TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
