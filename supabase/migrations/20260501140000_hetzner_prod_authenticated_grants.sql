-- ============================================================================
-- Hetzner-Prod: pauschale GRANTs für authenticated/anon Rollen
-- ============================================================================
--
-- Analog zur Hetzner-Staging-Migration `20260424000000_staging_authenticated_grants.sql`,
-- aber mit Phase-1.3-Defense-in-Depth für admin_audit_log.
--
-- Hintergrund
-- -----------
-- Beim Cutover Cloud → Hetzner-Prod sind die Default-Privileges für
-- authenticated/anon NICHT komplett mitgekommen. 68 Tabellen hatten nur
-- postgres-Grants → Browser-Requests bekamen 403 (silent für RLS-Tabellen
-- mit USING(true), unsichtbar für RLS-Tabellen mit Cross-Table-Subqueries).
--
-- Symptom: changelog leer in App, weil 158 Rows in DB aber `authenticated`
-- konnte sie nicht lesen.
--
-- Idempotent: doppelte Ausführung ist no-op.
-- ============================================================================

BEGIN;

-- 1) Pauschale Grants für alle EXISTIERENDEN Tabellen, Sequenzen, Funktionen
GRANT ALL    ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES    IN SCHEMA public TO anon;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 2) Default-Privileges für KÜNFTIGE Tabellen (verhindert dass dieser Bug
--    zurückkommt wenn neue Tabellen ohne explizite Grants angelegt werden)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL    ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES    TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL    ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- 3) Phase-1.3-Defense-in-Depth: admin_audit_log nur SELECT für authenticated
--    (nur falls Tabelle existiert — Hetzner-Prod hat sie aktuell evtl. nicht)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='admin_audit_log'
  ) THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_audit_log FROM authenticated;
    RAISE NOTICE 'admin_audit_log: locked down to SELECT-only for authenticated';
  ELSE
    RAISE NOTICE 'admin_audit_log: table does not exist, skipping lockdown';
  END IF;
END $$;

-- 4) Phase-1.3c: update_account_with_audit RPC nicht via PUBLIC erreichbar
--    (nur falls Function existiert)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname='update_account_with_audit'
      AND pronamespace='public'::regnamespace
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.update_account_with_audit FROM PUBLIC;
    GRANT  EXECUTE ON FUNCTION public.update_account_with_audit TO authenticated;
    RAISE NOTICE 'update_account_with_audit: REVOKE PUBLIC + GRANT authenticated';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verifikation: muss 0 sein nach Migration
-- ============================================================================

SELECT
  'public-Tabellen OHNE authenticated-Grant' AS check_name,
  count(*) AS issue_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.table_name = t.table_name
      AND g.grantee = 'authenticated'
  );

-- Smoke-Test: kann authenticated jetzt changelog lesen?
SET ROLE authenticated;
SELECT count(*) AS changelog_visible_to_authenticated FROM public.changelog;
RESET ROLE;

-- Falls admin_audit_log existiert: muss authenticated SELECT haben aber keine
-- INSERT/UPDATE/DELETE — Phase-1.3-Defense-in-Depth
SELECT
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='admin_audit_log'
GROUP BY grantee
ORDER BY grantee;
