-- R0: Snapshot-Fundament fürs Reporting. LinkedIn liefert nur Point-in-time →
-- wir schreiben tägliche Snapshots je Brand/Login (analytics-snapshot Cron).

-- Personal-Brand-Verlauf (Follower/Connections) — brand-scoped
CREATE TABLE IF NOT EXISTS public.linkedin_profile_metrics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL,
  brand_voice_id    uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE,
  follower_count    integer,
  connections_count integer,
  captured_on       date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  captured_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lpfm_brand_day  ON public.linkedin_profile_metrics(brand_voice_id, captured_on);
CREATE INDEX        IF NOT EXISTS idx_lpfm_brand_time ON public.linkedin_profile_metrics(brand_voice_id, captured_at DESC);

-- Netzwerk-/Akquise-Verlauf je Login — team-scoped
CREATE TABLE IF NOT EXISTS public.linkedin_network_metrics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid NOT NULL,
  unipile_account_id  text NOT NULL,
  brand_voice_id      uuid,
  connections_total   integer,
  followers_total     integer,
  invites_pending_out integer,
  invites_pending_in  integer,
  captured_on         date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  captured_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lnm_acct_day  ON public.linkedin_network_metrics(unipile_account_id, captured_on);
CREATE INDEX        IF NOT EXISTS idx_lnm_team_time ON public.linkedin_network_metrics(team_id, captured_at DESC);

-- RLS: team-read; Schreiben nur service_role (EF).
ALTER TABLE public.linkedin_profile_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_network_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lpfm_team_read ON public.linkedin_profile_metrics;
CREATE POLICY lpfm_team_read ON public.linkedin_profile_metrics FOR SELECT USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS lnm_team_read ON public.linkedin_network_metrics;
CREATE POLICY lnm_team_read ON public.linkedin_network_metrics FOR SELECT USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

-- Grants (Self-Host-Fallstrick: service_role UND authenticated explizit)
GRANT ALL    ON public.linkedin_profile_metrics TO service_role;
GRANT SELECT ON public.linkedin_profile_metrics TO authenticated;
GRANT ALL    ON public.linkedin_network_metrics TO service_role;
GRANT SELECT ON public.linkedin_network_metrics TO authenticated;
