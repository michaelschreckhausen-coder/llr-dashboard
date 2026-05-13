-- =============================================================================
-- service_role-Grants für Demo-Seed-Script
-- =============================================================================
-- Phase-A hatte service_role-Grants nur für user_preferences + teams gesetzt
-- (siehe 20260513090000_user_activity_service_role_grants.sql). Das Demo-
-- Seed-Script in scripts/seed-demo-data.mjs queriet + insertet via service-
-- role-Client weitere Tabellen, die auf Hetzner ebenfalls keine default-
-- service_role-Grants haben (CLAUDE.md Top-Fallstrick #12).
--
-- Idempotent (GRANT ist re-ausführbar). Prod-No-Op wenn schon vorhanden.
--
-- ⚠ TODO (separater Sprint): GRANT ALL ON ALL TABLES IN SCHEMA public TO
-- service_role als Hetzner-Default-Hotfix (Mirror zu Cloud-Supabase-Defaults).
-- Bis dahin Per-Table-Grants nach Bedarf.
-- =============================================================================

GRANT ALL ON public.organizations  TO service_role;
GRANT ALL ON public.leads          TO service_role;
GRANT ALL ON public.deals          TO service_role;
GRANT ALL ON public.lead_tasks     TO service_role;
GRANT ALL ON public.content_posts  TO service_role;
GRANT ALL ON public.pm_columns     TO service_role;
GRANT ALL ON public.pm_tasks       TO service_role;
GRANT ALL ON public.pm_projects    TO service_role;
GRANT ALL ON public.brand_voices   TO service_role;
GRANT ALL ON public.target_audiences TO service_role;
GRANT ALL ON public.knowledge_base TO service_role;
