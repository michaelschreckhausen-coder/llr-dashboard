-- =============================================================================
-- User Activity Tracking — service_role-Grants Follow-up (Phase A)
-- =============================================================================
-- Entdeckt 2026-05-13 beim Phase-A-Smoke: Edge-Function `generate` konnte
-- via supabaseAdmin (service_role) NICHT auf `user_preferences` + `teams`
-- zugreifen — beide Tabellen haben auf Hetzner KEINE explizite GRANT für
-- service_role. PostgREST checked GRANTs vor RLS, returned silent NULL.
--
-- Hetzner-Konvention: GRANT ALL ON ALL TABLES TO authenticated als Hotfix
-- existiert seit Cutover-Phase-1+2, deckt aber service_role NICHT ab.
-- Folge: jede Edge-Function die ältere Tabellen via service-role-Client
-- liest, läuft in Silent-Null-Failures.
--
-- Diese Migration ergänzt SELECT-Grants für service_role auf den beiden
-- für den User-Context-Lookup nötigen Tabellen.
-- Idempotent — GRANT ist re-ausführbar ohne IF-Guards.
-- =============================================================================

GRANT SELECT ON public.user_preferences TO service_role;
GRANT SELECT ON public.teams            TO service_role;
