-- =====================================================================
-- Hetzner-Staging-Schema-Drift schließen (Cloud-Era-Generation)
-- =====================================================================
-- `location`, `lead_score`, `owner_id` wurden im Cloud-Zeitalter direkt
-- auf Prod via SQL-Editor hinzugefügt, nie als Migration-File gecheckt.
-- Dadurch hat Hetzner-Staging diese Spalten nicht, während Prod sie
-- längst hat — was die LEADS_SELECT-Queries (src/hooks/useLeads.js)
-- auf staging crashen lässt nach PR 5 ("column does not exist").
--
-- Diese Migration ist auf Prod ein No-Op via IF NOT EXISTS, lässt sich
-- also gefahrlos beim nächsten Prod-Migration-Replay mitlaufen.
--
-- ⚠ Größerer bidirektionaler Drift bleibt offen für den separaten
-- Phase-4-Schema-Cleanup-Sprint (siehe CLAUDE.md):
--   - Staging hat: name, avatar_url, profile_url, last_contacted_at —
--     Prod-leads nicht.
--   - Prod hat: ~48 weitere Spalten (ai_*, deal_*, li_*, gdpr_*, etc.)
--     die Staging nicht hat.
-- Diese Migration deckt NUR die für /leads-Page nötigen Spalten ab.
-- =====================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS location   text,
  ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_id   uuid;

-- FK separat via DO-Block, weil ADD CONSTRAINT IF NOT EXISTS für FKs
-- in Postgres nicht direkt existiert. pg_constraint-Lookup gibt uns
-- die Idempotenz.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_owner_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
