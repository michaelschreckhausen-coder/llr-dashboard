-- ════════════════════════════════════════════════════════════════
-- 20260703100000_linkedin_inbox.sql
-- LinkedIn-Import-Inbox — Staging-Schicht VOR dem CRM.
-- ----------------------------------------------------------------------------
-- Problem: LinkedIn-Importe (heute: Sales-Nav-Sync via sales_nav_upsert_lead)
-- landen direkt in public.leads als status='Lead' und vermischen sich sofort
-- mit qualifizierten CRM-Kontakten (Liste, Kanban, Reports, Score, Outreach).
--
-- Lösung: importierte Kontakte landen zuerst in public.linkedin_inbox (schlanke
-- Triage-Schicht, KEIN CRM-Ballast). Erst per "Übernehmen" (promote-RPC,
-- Migration 20260703100100) werden sie zu echten leads-Rows überführt.
--
-- Dedup-Schlüssel mirroren leads:
--   * sales_nav_id  → Re-Sync desselben Sales-Nav-Leads aktualisiert die
--                     Inbox-Row statt eine Dublette anzulegen.
--   * linkedin_url  → Dedup für (künftige) Einzel-Scrapes ohne sales_nav_id.
--
-- Self-Host (Hetzner): RLS allein reicht nicht → explizite GRANTs
-- (Top-Fallstrick #3 / feedback_new_table_needs_grant_selfhost).
-- RLS via bestehende public.user_in_team(uuid) (Phase G, wie instagram_connections).
--
-- Vor Apply:
--   * Timestamp-Reihenfolge gegen ~/dev/llr-dashboard prüfen (Julian pusht parallel).
--   * Pre-Flight: select proname from pg_proc where proname='user_in_team';
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, zuerst Staging.
-- Idempotent (create table if not exists / drop policy if exists).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------------
-- Inbox-Tabelle: schlanke Triage-Schicht
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.linkedin_inbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL,
  user_id          uuid,

  -- Herkunft des Imports
  source           text NOT NULL DEFAULT 'sales_nav'
                     CHECK (source IN ('sales_nav','linkedin_scrape','manual')),
  sales_nav_id     text,          -- Dedup-Schlüssel für Sales-Nav-Re-Sync
  linkedin_url     text,          -- Dedup-Schlüssel für Einzel-Scrapes

  -- Gescrapte Rohdaten (mirror der leads-Importspalten)
  name             text,
  first_name       text,
  last_name        text,
  headline         text,
  job_title        text,
  company          text,
  location         text,
  avatar_url       text,
  li_about_summary text,

  -- Triage-State
  review_status    text NOT NULL DEFAULT 'new'
                     CHECK (review_status IN ('new','promoted','dismissed','snoozed')),
  promoted_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  snoozed_until    timestamptz,
  dismissed_reason text,

  raw              jsonb,         -- vollständiger Scrape-Payload, verlustfrei
  imported_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Dedup-Indizes (partiell, pro Team)
-- ---------------------------------------------------------------------------
-- Sales-Nav-Re-Sync: gleicher Lead nicht 2× in derselben Team-Inbox.
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_inbox_team_snid_uniq
  ON public.linkedin_inbox (team_id, sales_nav_id)
  WHERE sales_nav_id IS NOT NULL;

-- Einzel-Scrape-Dedup über linkedin_url — nur für Nicht-Sales-Nav-Rows, damit
-- eine Sales-Nav-Row (sales_nav_id gesetzt) und ein späterer /in/-Scrape nicht
-- am url-Index kollidieren (Dedup-Präzedenz liegt bei sales_nav_id).
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_inbox_team_url_uniq
  ON public.linkedin_inbox (team_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL AND sales_nav_id IS NULL;

-- Queue-Listing + Nav-Counter: offene Einträge pro Team.
CREATE INDEX IF NOT EXISTS linkedin_inbox_team_status_idx
  ON public.linkedin_inbox (team_id, review_status, imported_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at-Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_linkedin_inbox_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS linkedin_inbox_touch ON public.linkedin_inbox;
CREATE TRIGGER linkedin_inbox_touch
  BEFORE UPDATE ON public.linkedin_inbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_linkedin_inbox_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — Team-Mandant (bestehende public.user_in_team)
-- ---------------------------------------------------------------------------
ALTER TABLE public.linkedin_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_inbox_select ON public.linkedin_inbox;
CREATE POLICY linkedin_inbox_select ON public.linkedin_inbox
  FOR SELECT USING (public.user_in_team(team_id));

DROP POLICY IF EXISTS linkedin_inbox_modify ON public.linkedin_inbox;
CREATE POLICY linkedin_inbox_modify ON public.linkedin_inbox
  FOR ALL USING (public.user_in_team(team_id))
          WITH CHECK (public.user_in_team(team_id));

-- Self-Host: explizite Grants (RLS gewährt keine Tabellen-Privilegien).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_inbox TO authenticated;
GRANT ALL ON public.linkedin_inbox TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
