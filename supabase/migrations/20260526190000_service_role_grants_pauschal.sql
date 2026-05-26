-- ============================================================
-- Pauschale service_role-Grants auf public-Schema
--
-- Bug-Findings 2026-05-26:
--   * service_role konnte post_publish_queue nicht updaten (Phase 1b)
--   * service_role konnte team_members nicht lesen (Phase 1c)
--   * service_role konnte visuals nicht insert'en (Phase 1c)
--
-- Ursache: Migrations bisher haben Grants nur für 'authenticated' gesetzt,
-- nicht für 'service_role'. Edge-Functions laufen aber als service_role.
-- RLS-Bypass durch service_role allein reicht nicht — Postgres-Rolle
-- braucht explizite Grants UND RLS-Bypass.
--
-- Fix: pauschal für ALLE existierenden + zukünftigen Tabellen.
-- ============================================================

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT                  ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE                        ON FUNCTIONS TO service_role;

COMMIT;
