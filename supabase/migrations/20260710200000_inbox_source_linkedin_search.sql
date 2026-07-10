-- Prozess-Vereinheitlichung · Suche → Import-Inbox
-- linkedin_inbox.source-CHECK um 'linkedin_search' erweitern: die LinkedIn-Suche
-- (unipile-search-EF) schreibt Treffer künftig NICHT mehr als leads/CRM, sondern
-- als Inbox-Rows mit ehrlicher Provenienz source='linkedin_search'.
-- Gleiches Pattern wie 20260703100400 (extension_import) + 20260707180000 (unipile_*).
-- Idempotent (DROP IF EXISTS + ADD). Zuerst Staging, dann nach Freigabe Prod.

BEGIN;

ALTER TABLE public.linkedin_inbox DROP CONSTRAINT IF EXISTS linkedin_inbox_source_check;
ALTER TABLE public.linkedin_inbox ADD CONSTRAINT linkedin_inbox_source_check
  CHECK (source = ANY (ARRAY[
    'sales_nav','linkedin_scrape','extension_import','manual',
    'unipile_relations','unipile_salesnav','linkedin_search'
  ]));

COMMIT;
