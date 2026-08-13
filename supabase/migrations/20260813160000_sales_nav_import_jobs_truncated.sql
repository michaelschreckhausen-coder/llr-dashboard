-- Sales-Nav-Import-Guard (Overfetch-Fix): truncated-Flag am Job-Row.
-- Gesetzt, wenn der Import ans Seiten-Ceiling stieß (mehr Treffer verfügbar als
-- geschrieben → Suche zu breit). Macht die frühere „still 1000"-Wahrheit sichtbar
-- (Job-Monitor + EF-Response). Idempotent.
ALTER TABLE public.sales_nav_import_jobs
  ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false;
