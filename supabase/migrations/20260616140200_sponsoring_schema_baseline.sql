-- ============================================================================
-- Phase 0 / Migration 3: sponsoring-Schema-Baseline
-- ----------------------------------------------------------------------------
-- Legt das isolierte Postgres-Schema fuer alle Sponsoring-OS-Tabellen an.
-- Die Fachtabellen (rights, packages, contracts, ...) kommen in Phase 1.
-- Hier nur: Schema + USAGE-Grants + Default-Privileges, damit kuenftige
-- CREATE TABLE im Schema nicht am Self-Host-GRANT-Fallstrick (42501) scheitern.
--
-- RLS-Authority: es wird die BESTEHENDE Funktion public.user_in_team(uuid)
-- wiederverwendet (existiert auf Prod, Memory phase_g_live_on_prod). Vor Phase 1
-- per Read-only-Query verifizieren, dass sie vorhanden ist:
--   select proname from pg_proc where proname = 'user_in_team';
-- ============================================================================

begin;

create schema if not exists sponsoring;

-- Schema fuer die API-Rollen nutzbar machen.
grant usage on schema sponsoring to authenticated, anon, service_role;

-- Default-Privileges: jede kuenftig in diesem Schema angelegte Tabelle/Sequence
-- bekommt automatisch die noetigen Grants (verhindert vergessene GRANTs).
alter default privileges in schema sponsoring
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema sponsoring
  grant all on tables to service_role;
alter default privileges in schema sponsoring
  grant usage, select on sequences to authenticated, service_role;

-- Hinweis: PostgREST exposed standardmaessig nur 'public'. Damit das Frontend
-- via supabase.schema('sponsoring') auf die Tabellen zugreifen kann, muss in der
-- Kong/PostgREST-Config  PGRST_DB_SCHEMAS = "public,sponsoring"  gesetzt werden
-- (Hetzner docker-compose .env). Siehe README_INTEGRATION.md, Schritt 5.

commit;

notify pgrst, 'reload schema';
