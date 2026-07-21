-- Company-Page-KPIs: eigene Follower-/Mitarbeiter-Snapshots (Unipile liefert nur Point-in-time,
-- keine Impressions-Timeseries). Wachstum bauen wir durch tägliche Snapshots selbst auf.
CREATE TABLE IF NOT EXISTS public.linkedin_page_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL,
  brand_voice_id  uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE,
  linkedin_org_id text NOT NULL,
  followers_count integer,
  employee_count  integer,
  captured_on     date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  captured_at     timestamptz NOT NULL DEFAULT now()
);
-- max. 1 Snapshot je Brand+Tag (idempotent bei mehrfachem Abruf am selben Tag)
CREATE UNIQUE INDEX IF NOT EXISTS ux_lpm_brand_day ON public.linkedin_page_metrics(brand_voice_id, captured_on);
CREATE INDEX IF NOT EXISTS idx_lpm_brand_time ON public.linkedin_page_metrics(brand_voice_id, captured_at DESC);

ALTER TABLE public.linkedin_page_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lpm_team_read ON public.linkedin_page_metrics;
CREATE POLICY lpm_team_read ON public.linkedin_page_metrics FOR SELECT USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);
GRANT SELECT ON public.linkedin_page_metrics TO authenticated;
