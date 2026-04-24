-- Self-hosted Staging: authenticated-Role Grants auf public-Schema
--
-- Hetzner-Staging lief bisher faktisch über authenticator→postgres-Bypass, was
-- seit den pm_-Grant-Migrations (d014471f bzw. 20260423150000) nicht mehr
-- zuverlässig greift. 63 der 74 Tabellen hatten keine Grants für authenticated
-- → 403 "permission denied" auf leads, lead_lists, lead_tasks usw.
--
-- Pauschal-Fix: GRANT ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA public
-- TO authenticated + ALTER DEFAULT PRIVILEGES für künftige Tabellen/Sequences/Functions.
--
-- Bereits auf staging-db-01 angewendet (2026-04-24): 74/74 Tabellen haben jetzt
-- alle vier Privilegien (SELECT, INSERT, UPDATE, DELETE) für authenticated.
--
-- Pflicht-Schritt beim Prod-Cutover Hetzner — ohne das läuft die App nicht.
-- Idempotent: kann mehrfach ausgeführt werden.

BEGIN;

-- Alle aktuellen Tabellen im public-Schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Sequences (für SERIAL/BIGSERIAL primary keys)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Functions + RPCs
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Default Privileges — neue Tabellen/Sequences/Functions kommen automatisch mit
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- Schema-Usage sicherstellen
GRANT USAGE ON SCHEMA public TO authenticated;

COMMIT;
