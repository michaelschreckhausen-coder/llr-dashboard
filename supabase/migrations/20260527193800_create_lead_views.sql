-- ════════════════════════════════════════════════════════════════════════════
-- Sprint B · Saved Views ("Ansichten") für die Leads-Page
-- 2026-05-27
-- ════════════════════════════════════════════════════════════════════════════
--
-- Greenfield CREATE auf Staging (lead_views existiert nicht — Pre-Flight B1.1).
-- Vorbild aus lead_lists (Pre-Flight B1.2), aber mit zwei wichtigen Korrekturen:
--   • Echtes Team-Sharing (lead_lists hat zwar is_shared-Spalte, aber nur eine
--     User-eigene Policy → is_shared ist dort toter Daten-Flag).
--   • Indexes auf user_id + team_id (lead_lists hat nur PK-Index).
--
-- RLS-Pattern: bewusst Inline-Subquery auf team_members, NICHT
-- get_my_team_ids()/user_in_team() — die existieren auf Staging unklar
-- (CLAUDE.md Phase G Notiz vs. Pre-Flight-Befund). Subquery + expliziter
-- GRANT auf team_members ist CLAUDE.md Standard-Migration-Workflow-Doku.
--
-- Idempotent durch CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
-- CREATE INDEX IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
--
-- Apply-Pfad: SSH auf db-01 Staging (178.104.210.216):
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260527193800_create_lead_views.sql
--
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Tabelle ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id      uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name         text NOT NULL,
  filter_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared    boolean NOT NULL DEFAULT false,
  sort_order   smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Sharing ohne Team ist sinnlos — verhindert orphan shared views
  CONSTRAINT lead_views_share_requires_team
    CHECK (NOT (is_shared = true AND team_id IS NULL))
);

COMMENT ON TABLE  public.lead_views IS
  'Sprint B · Saved Views (Ansichten) für die /leads-Page. Filter-Combos die ein User speichert und optional fürs Team freigibt.';
COMMENT ON COLUMN public.lead_views.filter_json IS
  'JSON-Snapshot des Filter-States: { quickFilter, stageTab, listFilter, tagsFilter, ownerFilter, sortBy, search }. Schema bewusst flexibel (jsonb) für zukünftige Filter-Erweiterungen ohne Migration.';
COMMENT ON COLUMN public.lead_views.is_shared IS
  'true → für alle Team-Mitglieder via team_id sichtbar. Falsch wenn team_id NULL (Constraint).';

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.lead_views ENABLE ROW LEVEL SECURITY;

-- 2a. Eigene Views: vollständiger Lese-/Schreibzugriff
DROP POLICY IF EXISTS lead_views_own ON public.lead_views;
CREATE POLICY lead_views_own ON public.lead_views
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2b. Team-shared Views: nur lesen (Edit bleibt beim Owner)
DROP POLICY IF EXISTS lead_views_team_shared_read ON public.lead_views;
CREATE POLICY lead_views_team_shared_read ON public.lead_views
  FOR SELECT
  USING (
    is_shared = true
    AND team_id IS NOT NULL
    AND team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- ─── 3. Grants (Hetzner-Self-Host-Pattern) ────────────────────────────────────
-- Pre-Flight B1.5 zeigt: lead_lists hat SELECT/INSERT/UPDATE/DELETE für
-- authenticated + service_role. Wir spiegeln das.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_views TO service_role;

-- CLAUDE.md Top-Fallstrick #3 — Cross-Table-RLS-Subquery braucht GRANT.
-- Idempotent: wenn schon vorhanden, no-op. Schadet keiner anderen Komponente.
GRANT SELECT ON public.team_members TO authenticated;

-- ─── 4. Indexes ──────────────────────────────────────────────────────────────
-- Für lookup-by-owner ("Meine Ansichten")
CREATE INDEX IF NOT EXISTS idx_lead_views_user_id
  ON public.lead_views (user_id);

-- Für lookup-by-team (shared-views fürs Team)
CREATE INDEX IF NOT EXISTS idx_lead_views_team_id
  ON public.lead_views (team_id)
  WHERE team_id IS NOT NULL;

-- Composite für die zweite Policy (team-shared-read-Pfad)
CREATE INDEX IF NOT EXISTS idx_lead_views_team_shared
  ON public.lead_views (team_id, is_shared)
  WHERE is_shared = true;

-- ─── 5. user_preferences-Erweiterung ────────────────────────────────────────
-- Pre-Flight B1.7 zeigt: user_preferences hat das active_X_id-Pattern
-- (active_team_id, active_brand_voice_id). Wir reihen uns ein.
-- ON DELETE SET NULL → wenn die View gelöscht wird, fällt der User auf
-- "keine Auswahl" zurück (= alle Leads), kein orphan-fk-error.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS active_lead_view_id uuid
    REFERENCES public.lead_views(id) ON DELETE SET NULL;

COMMIT;

-- ─── 6. PostgREST-Schema-Reload ──────────────────────────────────────────────
-- Damit der OpenAPI-Cache neue Tabelle + Column sieht ohne Container-Restart.
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation (nach Apply manuell ausführen):
-- ════════════════════════════════════════════════════════════════════════════
--
-- -- a) Tabelle + Constraint da?
-- \d public.lead_views
--
-- -- b) Policies da? (Erwartung: 2 Policies)
-- SELECT polname, polcmd
-- FROM pg_policy
-- WHERE polrelid = 'public.lead_views'::regclass;
--
-- -- c) Grants da? (Erwartung: 4 Privileges für authenticated + service_role)
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='lead_views';
--
-- -- d) Indexes da? (Erwartung: 4 Indexes inkl. PK)
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname='public' AND tablename='lead_views';
--
-- -- e) user_preferences-Spalte da?
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='user_preferences'
--   AND column_name='active_lead_view_id';
--
-- -- f) Constraint-Check funktioniert? (sollte mit FEHLER abbrechen)
-- INSERT INTO public.lead_views (user_id, name, is_shared, team_id)
-- VALUES (auth.uid(), 'invalid-shared-without-team', true, NULL);
-- -- expected: ERROR: new row for relation "lead_views" violates check constraint
-- --          "lead_views_share_requires_team"
-- ════════════════════════════════════════════════════════════════════════════
