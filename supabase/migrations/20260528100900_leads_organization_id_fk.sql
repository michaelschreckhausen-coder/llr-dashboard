-- ════════════════════════════════════════════════════════════════════════════
-- leads.organization_id — FK + Backfill + Auto-Org-Create für Orphans
-- 2026-05-28
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hintergrund: leads.company war bislang freitext. Mit dem OrganizationPicker
-- (Sprint 2026-05-29) hat der Picker zwar organization_id im React-State
-- getrackt, aber NICHT in die DB geschrieben — die FK-Spalte fehlte.
--
-- Folge: company-Strings hängen orphan im Lead, wenn die zugehörige Org
-- gelöscht wird oder umbenannt. Plus: keine echte Verknüpfung zwischen
-- /leads-Liste und /organizations-Liste auf DB-Ebene.
--
-- Diese Migration macht 3 Dinge atomar:
--   Phase 1 — Schema:      ADD COLUMN organization_id uuid REFERENCES
--                          organizations(id) ON DELETE SET NULL + Index
--   Phase 2 — Backfill:    Für bestehende leads.company-Strings die mit
--                          existing organization.name matchen (case-
--                          insensitive, trimmed, team-scoped) → setze
--                          leads.organization_id = org.id
--   Phase 3 — Auto-Create: Für übrige leads.company-Orphans → erstelle
--                          eine neue Organisation und verlinke. Per
--                          (team_id, lower-trim-name) deduped.
--
-- Apply-Pfad (Staging):
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260528100900_leads_organization_id_fk.sql
--
-- Verifikation-Queries siehe Footer.
--
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Schema: FK-Spalte + Constraint + Index ─────────────────────────
-- ACHTUNG: ADD COLUMN IF NOT EXISTS X REFERENCES Y(id) ist no-op WENN die
-- Column schon existiert — der FK-Constraint wird dann NICHT separat
-- hinzugefügt. Hetzner-Staging hat die Column schon (Pre-Flight 2026-05-28),
-- aber FK-Constraint-Status unklar. Daher: separater idempotenter FK-Add
-- via DO-Block.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND contype = 'f'
      AND conname = 'leads_organization_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.leads.organization_id IS
  '2026-05-28 · FK auf organizations(id). Wird vom OrganizationPicker im NewLeadModal gesetzt. Bei DELETE der Org wird die Verknüpfung gelöst (SET NULL), der company-Text-String bleibt erhalten als Read-only-Historie.';

CREATE INDEX IF NOT EXISTS idx_leads_organization_id
  ON public.leads (organization_id)
  WHERE organization_id IS NOT NULL;

-- ─── 2. Backfill: bestehende leads.company → existing organizations.name ─
-- Case-insensitive, trimmed, team-scoped Matching.
-- IS NOT DISTINCT FROM schützt vor NULL-Mismatches (leads OHNE team_id
-- gegen organizations OHNE team_id matchen).
UPDATE public.leads l
SET organization_id = o.id, updated_at = now()
FROM public.organizations o
WHERE l.organization_id IS NULL
  AND l.company IS NOT NULL
  AND TRIM(l.company) <> ''
  AND LOWER(TRIM(l.company)) = LOWER(TRIM(o.name))
  AND l.team_id IS NOT DISTINCT FROM o.team_id;

-- ─── 3. Auto-Create: Orphan-company-Strings ohne Match → neue Org ────────
-- Phase 3a: Insert. Per DISTINCT (team_id, lower-trim-name) deduped, plus
-- WHERE NOT EXISTS-Check gegen frisch-inserted Rows aus Phase 2 (sollte
-- nicht greifen wegen ON-CONFLICT-Pattern, aber Safety-Net).
WITH orphan_company_groups AS (
  SELECT
    l.team_id,
    TRIM(l.company) AS name_trimmed,
    MIN(l.user_id) AS first_user_id        -- für created_by / user_id-fallback
  FROM public.leads l
  WHERE l.organization_id IS NULL
    AND l.company IS NOT NULL
    AND TRIM(l.company) <> ''
  GROUP BY l.team_id, TRIM(l.company)
)
INSERT INTO public.organizations (team_id, user_id, name, created_by, created_at, updated_at)
SELECT
  ocg.team_id,
  CASE WHEN ocg.team_id IS NULL THEN ocg.first_user_id ELSE NULL END,
  ocg.name_trimmed,
  ocg.first_user_id,
  now(),
  now()
FROM orphan_company_groups ocg
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o
  WHERE LOWER(TRIM(o.name)) = LOWER(ocg.name_trimmed)
    AND o.team_id IS NOT DISTINCT FROM ocg.team_id
);

-- Phase 3b: Verlinke die jetzt-existing Orgs (nach Phase 3a haben alle
-- Orphans eine matching Org).
UPDATE public.leads l
SET organization_id = o.id, updated_at = now()
FROM public.organizations o
WHERE l.organization_id IS NULL
  AND l.company IS NOT NULL
  AND TRIM(l.company) <> ''
  AND LOWER(TRIM(l.company)) = LOWER(TRIM(o.name))
  AND l.team_id IS NOT DISTINCT FROM o.team_id;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation (nach Apply manuell ausführen):
-- ════════════════════════════════════════════════════════════════════════════
--
-- -- a) Spalte da?
-- \d public.leads
--
-- -- b) Index da?
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname='public' AND tablename='leads'
--   AND indexname='idx_leads_organization_id';
--
-- -- c) Verknüpfungs-Statistik
-- SELECT
--   COUNT(*) AS total_leads,
--   COUNT(*) FILTER (WHERE company IS NOT NULL AND TRIM(company) <> '') AS leads_with_company,
--   COUNT(*) FILTER (WHERE organization_id IS NOT NULL) AS leads_linked_to_org,
--   COUNT(*) FILTER (WHERE company IS NOT NULL AND TRIM(company) <> '' AND organization_id IS NULL) AS orphan_company_strings
-- FROM public.leads;
-- -- Erwartung: leads_with_company == leads_linked_to_org (alle gemappt), orphan_company_strings == 0
--
-- -- d) Neue auto-created Orgs (heute)
-- SELECT COUNT(*) AS auto_created_today
-- FROM public.organizations
-- WHERE created_at >= now() - interval '1 hour';
--
-- -- e) Sanity: keine doppelten Orgs pro (team_id, lower-name)
-- SELECT team_id, LOWER(TRIM(name)) AS name_key, COUNT(*) AS dup_count
-- FROM public.organizations
-- GROUP BY team_id, LOWER(TRIM(name))
-- HAVING COUNT(*) > 1
-- ORDER BY dup_count DESC
-- LIMIT 10;
-- -- Erwartung: keine Rows (= keine Duplikate)
-- ════════════════════════════════════════════════════════════════════════════
