-- 20260628150000_leads_last_synced_at.sql
-- Phase-4 (Sales-Nav-Bulk) Schema-Erweiterung.
-- Zeitstempel des letzten Sales-Nav-Sync pro Lead — Basis für den späteren
-- "seit X Tagen nicht refresht"-Filter + Re-Sync-Priorisierung. Wird beim
-- Single-Import (Phase 2) + Bulk-Ingest (Phase 4) gesetzt.
-- Greenfield auf Staging + Prod (Pre-Flight 2026-06-18: Spalte existiert nirgends).
-- Idempotent.

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

COMMENT ON COLUMN public.leads.last_synced_at IS
  'Letzter Sales-Nav-Sync-Zeitstempel (NULL = nie via Sales-Nav-Sync aktualisiert).';

-- Staleness-Queries ("welche Leads dieses Teams sind am ältesten gesynct")
CREATE INDEX IF NOT EXISTS idx_leads_team_last_synced
  ON public.leads (team_id, last_synced_at);

COMMIT;

-- PostgREST-Schema-Cache neu laden, damit die Spalte sofort über die API sichtbar ist
NOTIFY pgrst, 'reload schema';
