-- Unipile-Kontakte-Import-Sprint · Build-Step 1 (additiv, Staging zuerst)
-- linkedin_inbox.provider_id (ACoAA…) für Fix B (Runner nutzt provider_id direkt) + neuer Dedup-Arbiter
-- für Unipile-Quellen. source-CHECK um 'unipile_relations'/'unipile_salesnav' erweitert.

BEGIN;

ALTER TABLE public.linkedin_inbox ADD COLUMN IF NOT EXISTS provider_id text;

-- Dedup-Arbiter für Unipile (Relations liefert member_id=ACoAA…; Sales-Nav liefert sales_nav_id=ACwAA…).
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_inbox_team_provider_uniq
  ON public.linkedin_inbox (team_id, provider_id) WHERE provider_id IS NOT NULL;

-- source-CHECK erweitern (bestehende 4 Werte + 2 Unipile-Quellen)
ALTER TABLE public.linkedin_inbox DROP CONSTRAINT IF EXISTS linkedin_inbox_source_check;
ALTER TABLE public.linkedin_inbox ADD CONSTRAINT linkedin_inbox_source_check
  CHECK (source = ANY (ARRAY['sales_nav','linkedin_scrape','extension_import','manual','unipile_relations','unipile_salesnav']));

COMMIT;
