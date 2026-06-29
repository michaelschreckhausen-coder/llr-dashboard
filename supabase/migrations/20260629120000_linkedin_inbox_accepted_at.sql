-- Vernetzungen-Redesign: Annahme-Tracking für die Connections-Scrape-Erkennung.
-- Idempotent (ADD COLUMN IF NOT EXISTS), kein Drop. Staging-first, dann Prod.
-- li_accepted_at           = Zeitpunkt, zu dem die Vernetzung als angenommen erkannt wurde
-- li_connection_checked_at = letzter Abgleich gegen die LinkedIn-Connections-Seite

ALTER TABLE public.linkedin_inbox
  ADD COLUMN IF NOT EXISTS li_accepted_at           timestamptz,
  ADD COLUMN IF NOT EXISTS li_connection_checked_at timestamptz;

-- Parität dual-track (Leads), da Outreach-Status auch auf leads getrackt wird.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS li_accepted_at           timestamptz,
  ADD COLUMN IF NOT EXISTS li_connection_checked_at timestamptz;

-- PostgREST-Schema-Cache neu laden, damit die Spalten sofort über die API verfügbar sind.
NOTIFY pgrst, 'reload schema';
