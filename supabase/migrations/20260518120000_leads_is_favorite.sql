-- 20260518120000_leads_is_favorite.sql
--
-- Adds `is_favorite` boolean to leads, for the Star-toggle on LeadDetail.
-- Per-Lead (Team-Scoped) — d.h. ein Stern ist sichtbar für alle Members
-- des Teams, nicht Per-User. Falls Per-User-Favoriten später gewünscht
-- sind, separater Pfad via user_preferences.
--
-- Workflow:
--   1. Auf Hetzner-Staging applien:
--        ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' < supabase/migrations/20260518120000_leads_is_favorite.sql
--   2. Smoke: SELECT count(*) FROM leads WHERE is_favorite = true;  -- erwartet 0
--   3. Erst nach Freigabe: gleiche Migration auf Cloud-Prod (SQL Editor).
--
-- Idempotent: re-run safe.

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- Partial Index: nur True-Werte indexiert. Spart Platz und macht Queries
-- der Form `WHERE is_favorite = true` schnell, ohne den Default-Case zu
-- bloaten.
CREATE INDEX IF NOT EXISTS idx_leads_favorite
  ON public.leads (team_id, is_favorite)
  WHERE is_favorite = true;

COMMIT;
