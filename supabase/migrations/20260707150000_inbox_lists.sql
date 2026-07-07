-- ════════════════════════════════════════════════════════════════════════════
-- 20260707150000_inbox_lists.sql
-- Inbox-Listen — reusable Auswahl-Sammlungen von linkedin_inbox-Kontakten.
-- ----------------------------------------------------------------------------
-- Bewusst GETRENNT von automation_campaigns/automation_campaign_leads:
--   * Kampagnen  = Outreach-Gruppierung (Job-Runner, inbox_id-dual-track,
--                  Top-Fallstrick #13 — NICHT anfassen).
--   * Listen     = reine Auswahl-Sammlungen. In /linkedin-inbox befüllbar,
--                  in Automatisierung (Lead-Step) + Vernetzungen (Filter)
--                  auswählbar.
--
-- RLS-Pattern analog lead_views (Sprint B, 20260527193800):
--   inbox_lists         → own (FOR ALL) + team_shared_read (FOR SELECT).
--   inbox_list_members  → sichtbar/änderbar wenn die zugehörige Liste sichtbar
--                         ist (Subquery auf inbox_lists).
--
-- Self-Host (Hetzner): RLS allein reicht nicht → explizite GRANTs
-- (CLAUDE.md Top-Fallstrick #3). Cross-Table-RLS-Subquery braucht zusätzlich
-- GRANT SELECT auf team_members/teams + inbox_lists (für die Member-Subquery).
--
-- Apply (zuerst Staging, Prod nur auf explizites "los prod-apply"):
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin \
--     -d postgres -v ON_ERROR_STOP=1' < supabase/migrations/20260707150000_inbox_lists.sql
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Tabellen ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  color       text,
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  team_id     uuid,
  is_shared   boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.inbox_lists IS
  'Reusable Auswahl-Listen von linkedin_inbox-Kontakten. Getrennt von automation_campaigns (Kampagnen = Outreach). Befüllt in /linkedin-inbox, auswählbar in Automatisierung + Vernetzungen.';

CREATE TABLE IF NOT EXISTS public.inbox_list_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     uuid NOT NULL REFERENCES public.inbox_lists(id)   ON DELETE CASCADE,
  inbox_id    uuid NOT NULL REFERENCES public.linkedin_inbox(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (list_id, inbox_id)
);

-- ─── 2. Indizes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inbox_lists_team
  ON public.inbox_lists (team_id);
CREATE INDEX IF NOT EXISTS idx_inbox_list_members_list
  ON public.inbox_list_members (list_id);
CREATE INDEX IF NOT EXISTS idx_inbox_list_members_inbox
  ON public.inbox_list_members (inbox_id);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.inbox_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_list_members ENABLE ROW LEVEL SECURITY;

-- 3a. inbox_lists: eigene Listen — voller Lese-/Schreibzugriff
DROP POLICY IF EXISTS inbox_lists_own ON public.inbox_lists;
CREATE POLICY inbox_lists_own ON public.inbox_lists
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3b. inbox_lists: team-shared — nur lesen (Edit bleibt beim Owner)
DROP POLICY IF EXISTS inbox_lists_team_shared_read ON public.inbox_lists;
CREATE POLICY inbox_lists_team_shared_read ON public.inbox_lists
  FOR SELECT
  USING (
    is_shared = true
    AND team_id IS NOT NULL
    AND team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- 3c. inbox_list_members: sichtbar/änderbar wenn die zugehörige Liste sichtbar ist
DROP POLICY IF EXISTS inbox_list_members_via_list ON public.inbox_list_members;
CREATE POLICY inbox_list_members_via_list ON public.inbox_list_members
  FOR ALL
  USING (
    list_id IN (
      SELECT id FROM public.inbox_lists
      WHERE user_id = auth.uid()
         OR (is_shared = true AND team_id IN (
              SELECT tm.team_id FROM public.team_members tm
              WHERE tm.user_id = auth.uid()
            ))
    )
  )
  WITH CHECK (
    list_id IN (
      SELECT id FROM public.inbox_lists
      WHERE user_id = auth.uid()
         OR (is_shared = true AND team_id IN (
              SELECT tm.team_id FROM public.team_members tm
              WHERE tm.user_id = auth.uid()
            ))
    )
  );

-- ─── 4. Grants (Hetzner-Self-Host-Pattern, Top-Fallstrick #3) ────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_lists        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_lists        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_list_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_list_members TO service_role;

-- Cross-Table-RLS-Subqueries brauchen explizite Lese-Grants (idempotent, no-op
-- wenn schon vorhanden). inbox_lists-Grant deckt zugleich die Member-Subquery.
GRANT SELECT ON public.team_members TO authenticated;
GRANT SELECT ON public.teams        TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation (nach Apply manuell):
--   \d public.inbox_lists
--   \d public.inbox_list_members
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid IN ('public.inbox_lists'::regclass,
--                        'public.inbox_list_members'::regclass);
--   SELECT indexname FROM pg_indexes
--     WHERE schemaname='public' AND tablename LIKE 'inbox_list%';
-- ════════════════════════════════════════════════════════════════════════════
