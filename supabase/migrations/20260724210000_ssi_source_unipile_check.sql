-- SSI-Fix (Merge-Drift): prod ssi_scores_source_check erlaubte 'unipile' nicht,
-- deshalb schrieb die ssi-refresh-EF nichts (written:0). 'unipile' zulassen.
-- (Staging hatte den Check bereits entfernt -> lief dort.)
ALTER TABLE public.ssi_scores DROP CONSTRAINT IF EXISTS ssi_scores_source_check;
ALTER TABLE public.ssi_scores ADD CONSTRAINT ssi_scores_source_check
  CHECK (source = ANY (ARRAY['manual','extension','api','import','unipile']::text[]));

-- HINWEIS (nicht per SQL migrierbar): Die pg_cron-Jobs analytics-snapshot-daily,
-- ssi-refresh-daily, profile-viewers-daily, unipile-account-reap-daily MUESSEN als
-- Rolle 'supabase_admin' angelegt werden (cron.schedule als supabase_admin ausfuehren).
-- Jobs mit username='postgres' (eingeschraenkte Rolle) werden vom Launcher NIE
-- ausgefuehrt (0 Laeufe, kein Fehler). Waren so auf Prod angelegt -> nie gelaufen.
