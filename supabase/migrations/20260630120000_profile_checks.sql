-- Profil-Checker: Verlauf der Profil-Analysen (user-eigen + team-lesbar).
-- Idempotent. Staging-first, dann Prod.
BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid(),
  team_id      uuid,
  profile_name text,
  score        integer,
  passed       integer,
  total        integer,
  results      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_checks_user_created ON public.profile_checks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_checks_team_created ON public.profile_checks (team_id, created_at DESC) WHERE team_id IS NOT NULL;

ALTER TABLE public.profile_checks ENABLE ROW LEVEL SECURITY;

-- Eigene Checks: voller Zugriff
DROP POLICY IF EXISTS pc_own ON public.profile_checks;
CREATE POLICY pc_own ON public.profile_checks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Team-Mitglieder dürfen Team-Checks lesen
DROP POLICY IF EXISTS pc_team_read ON public.profile_checks;
CREATE POLICY pc_team_read ON public.profile_checks FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

-- Hetzner self-host: keine Default-Grants + Cross-Table-Policy braucht GRANT (Fallstrick #1/#3)
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL    ON public.profile_checks TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
