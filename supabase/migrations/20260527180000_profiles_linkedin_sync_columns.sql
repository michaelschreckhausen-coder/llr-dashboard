-- 20260527180000_profiles_linkedin_sync_columns.sql
--
-- LinkedIn-Profile-Sync Phase 1 (OIDC-only).
--
-- Erweitert public.profiles um drei Audit-/State-Spalten für den
-- automatischen Sync von LinkedIn-OIDC-Daten (picture, given_name,
-- family_name, email). Die eigentlichen Avatar-/Name-Werte landen
-- in den BESTEHENDEN Spalten profiles.avatar_url + profiles.full_name —
-- keine neuen User-facing-Felder, nur Audit/Throttle-State.
--
-- Throttle-Mechanik: Edge-Function `sync-linkedin-profile` vergleicht
-- frisches identity_data via md5-Hash gegen linkedin_data_raw. Wenn
-- gleich → No-Op (kein Modal-Trigger). Wenn ungleich → Diff-Array an
-- Frontend → Confirm-Modal → wenn User bestätigt: UPDATE der Felder
-- plus UPDATE linkedin_data_raw + linkedin_data_last_synced_at.
--
-- linkedin_url ist vorbereitend für Phase 2 (Extension-Scrape) — die
-- Extension matcht beim Besuch von linkedin.com/in/<slug>/ gegen
-- diese URL um zu erkennen ob es sich um das eigene Profil handelt.
--
-- Workflow:
--   1. Auf Hetzner-Staging applien:
--        ssh root@178.104.210.216 \
--          'docker exec -i supabase-db psql -U postgres -d postgres' \
--          < supabase/migrations/20260527180000_profiles_linkedin_sync_columns.sql
--   2. Smoke: \d profiles → 3 neue Spalten vorhanden
--   3. Erst nach Freigabe: gleiche Migration auf Hetzner-Prod
--      (ssh root@128.140.123.163 ...).
--
-- Idempotent: re-run safe.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS linkedin_data_raw jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_data_last_synced_at timestamptz;

COMMENT ON COLUMN public.profiles.linkedin_url IS
  'URL des eigenen LinkedIn-Profils (z.B. https://www.linkedin.com/in/michael-schreck/). Aus OIDC oder manuell gepflegt. Phase 2: Extension matcht diese URL für Self-Profile-Detection.';

COMMENT ON COLUMN public.profiles.linkedin_data_raw IS
  'Vollständiger letzter OIDC-Claims-Dump (sub, name, given_name, family_name, picture, locale, email). Audit + Throttle-Hash-Source. NULL = noch nie synct.';

COMMENT ON COLUMN public.profiles.linkedin_data_last_synced_at IS
  'Wann zuletzt der LinkedIn-Sync mit User-Confirm angewendet wurde. NULL = noch nie synct.';

-- PostgREST-Schema-Reload damit die neuen Spalten direkt auswählbar sind
NOTIFY pgrst, 'reload schema';

COMMIT;
