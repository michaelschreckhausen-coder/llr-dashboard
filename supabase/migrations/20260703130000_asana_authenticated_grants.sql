-- =====================================================================
-- Asana-Integration — fehlende SELECT-Grants für authenticated
-- Repo-Ziel: llr-dashboard/supabase/migrations/
-- Stand: 2026-07-03
--
-- Bug (auf Staging beim Consent-Lesepfad gefunden): Das Frontend liest
-- asana_connections als Rolle `authenticated` (User-JWT). Die Migration
-- 20260702120000 legte zwar RLS-Policies `FOR SELECT TO authenticated`
-- an, aber KEIN Base-`GRANT SELECT ... TO authenticated`.
--
-- Auf Hetzner Self-Host gibt es keine Default-Grants (Top-Fallstrick #3/#12);
-- der pauschale `GRANT ALL ON ALL TABLES TO authenticated`-Hotfix deckt nur
-- Tabellen ab, die es beim Ausführen bereits gab — NICHT die heute neu
-- angelegten asana_*-Tabellen. Ohne Base-GRANT filtert RLS nicht einmal:
-- die Rolle hat schlicht kein SELECT-Recht → PostgREST liefert 0 Zeilen,
-- Panel zeigt „Nicht verbunden" obwohl die Connection existiert.
--
-- Fix: SELECT für authenticated auf die 6 lese-exponierten Tabellen (die
-- mit einer asana_*_select-Policy). Schreibzugriff bleibt service_role-only.
-- asana_sync_outbox / asana_oauth_states bleiben bewusst ohne authenticated-
-- Grant (nur service_role). Idempotent.
-- =====================================================================

grant select on public.asana_connections   to authenticated;
grant select on public.asana_user_links     to authenticated;
grant select on public.asana_project_links  to authenticated;
grant select on public.asana_section_links  to authenticated;
grant select on public.asana_task_links     to authenticated;
grant select on public.asana_webhooks       to authenticated;
