-- Sponsoring OS — K3: LinkedIn-Automatisierung einer Sponsoring-Kampagne zuordnen.
-- Lose Referenz (uuid, kein cross-schema FK) auf sponsoring.campaigns — Outreach
-- kann so einer Kampagne zugeordnet werden. Additiv + idempotent. Spalte erbt die
-- bestehenden Grants/RLS der automation_campaigns-Tabelle.

ALTER TABLE public.automation_campaigns
  ADD COLUMN IF NOT EXISTS sponsoring_campaign_id uuid;

CREATE INDEX IF NOT EXISTS idx_automation_campaigns_sponsoring
  ON public.automation_campaigns (sponsoring_campaign_id)
  WHERE sponsoring_campaign_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
