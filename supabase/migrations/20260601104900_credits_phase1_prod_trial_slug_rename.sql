-- ════════════════════════════════════════════════════════════════════════════
-- Credits Phase 1 — Quick-Fix: Prod-existing 'trial' → 'trial-classic' rename
-- 2026-05-30 · Prod-spezifisch, no-op auf Staging
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hintergrund (Investigation 2026-05-30):
-- Prod hat seit ~2026-05-18 einen 'trial'-Plan (UUID 2d5511fa-5654-4ea9-bd00-
-- 997cd0ebb149) mit is_default_trial=true, 14 days. Wurde durch eine reife
-- handle_new_user-Trigger-Variante manuell angelegt — 8 Accounts + 24 Profiles
-- haben jetzt plan_id auf diesen UUID.
--
-- Migration 20260601105000_seed_new_plans (Mig 7/12) will einen NEUEN
-- 'trial'-Plan inserten mit den neuen credits_quota/storage_quota_gb/etc.-
-- Feldern. ON CONFLICT (slug) DO NOTHING skipt den INSERT → Validierung
-- "count=9" failt → ROLLBACK.
--
-- Lösung: existing 'trial' auf 'trial-classic' umbenennen + is_default_trial
-- unsetzen. Damit ist slug 'trial' frei für Migration 7. UUID bleibt, daher
-- bleiben alle existing accounts.plan_id + profiles.plan_id Referenzen
-- unangefasst. Migration 7 INSERTed dann den NEUEN trial-Plan (mit neuer
-- UUID + neuen Feldern + is_default_trial=true).
--
-- Konsequenzen nach Mig 7-Apply:
-- - Existing Accounts + Profiles bleiben auf 'trial-classic' (gleiche UUID)
-- - Neuer 'trial'-Plan wird aktiv für neue Sign-Ups
-- - handle_new_user-Trigger findet neuen 'trial' via is_default_trial=true
--
-- Idempotent: prüft Existenz via UUID-Match. No-op wenn schon umbenannt
-- oder wenn kein passender 'trial' existiert (Staging-Form).

BEGIN;

DO $$
DECLARE
  v_existing_trial_id uuid := '2d5511fa-5654-4ea9-bd00-997cd0ebb149';
  v_accounts_affected integer;
  v_profiles_affected integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.plans
    WHERE id = v_existing_trial_id
      AND slug = 'trial'
  ) THEN
    -- Count current usage (für Audit-Log)
    SELECT COUNT(*) INTO v_accounts_affected FROM public.accounts WHERE plan_id = v_existing_trial_id;
    SELECT COUNT(*) INTO v_profiles_affected FROM public.profiles WHERE plan_id = v_existing_trial_id;

    UPDATE public.plans
       SET slug = 'trial-classic',
           name = 'Trial (Classic)',
           is_default_trial = false
     WHERE id = v_existing_trial_id;

    RAISE NOTICE 'Existing trial plan renamed to trial-classic (% accounts + % profiles bleiben verknüpft)',
      v_accounts_affected, v_profiles_affected;
  ELSE
    RAISE NOTICE 'Kein konflictierendes existing trial-Plan (UUID 2d5511fa) gefunden — Staging-Form, skip';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
