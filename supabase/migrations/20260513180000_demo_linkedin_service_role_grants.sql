-- =============================================================================
-- service_role-Grants für LinkedIn-Demo-Seed + Lookup-Pfad
-- =============================================================================
-- Erweitert die Grants aus 20260513130000_demo_seed_service_role_grants.sql:
--
-- - profiles + accounts: nötig für lookup() im seed-demo-data.mjs (DEMO_USER_
--   EMAIL → user_id/account_id resolution). Ohne Grant: "permission denied
--   for table profiles" beim Pre-Flight.
-- - activities: neu für LinkedIn-Demo-Block (genLinkedinActivities → INSERT).
--
-- Hetzner-Self-Host hat keine default service_role-Grants (Top-Fallstrick #12).
-- Idempotent — Prod-No-Op falls schon vergeben.
-- =============================================================================

GRANT ALL ON public.profiles   TO service_role;
GRANT ALL ON public.accounts   TO service_role;
GRANT ALL ON public.activities TO service_role;
