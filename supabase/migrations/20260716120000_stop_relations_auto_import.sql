-- Relations-Auto-Sync stoppen: kein automatischer Import des LinkedIn-Netzwerks mehr.
--
-- Grund: der Cron aus 20260707200000 zieht die KOMPLETTE 1st-degree-Kontaktliste
-- jedes OK-Unipile-Accounts nach linkedin_inbox (review_status='new'). Zwischen
-- 07.07. (ungegatet angelegt) und 08.07. 12:00 (Addon-Gate nachgezogen) feuerte er
-- für JEDEN verbundenen Account — auch ohne automation-Addon. Ergebnis: volle
-- Inboxen mit ungefragt importierten Netzwerk-Kontakten.
--
-- Scope bewusst minimal:
--   * NUR der Cron-Job wird entfernt.
--   * Edge Function import-unipile-relations bleibt liegen (Wiederverwendung beim
--     späteren Rebuild an anderer Stelle).
--   * public.trigger_import_unipile_relations() bleibt bestehen, hat danach aber
--     keinen Aufrufer mehr (verifiziert 2026-07-16: kein Caller in src/ oder
--     supabase/functions/ — der Cron war der einzige Trigger).
--
-- Idempotent + env-sicher: pg_cron existiert auf Staging ggf. nicht.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[stop-relations-cron] pg_cron nicht installiert — nichts zu tun.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-unipile-relations') THEN
    PERFORM cron.unschedule('import-unipile-relations');
    RAISE NOTICE '[stop-relations-cron] Job "import-unipile-relations" entfernt.';
  ELSE
    RAISE NOTICE '[stop-relations-cron] Job "import-unipile-relations" nicht vorhanden — bereits gestoppt.';
  END IF;
END $$;

COMMIT;

-- Verifikation (muss 0 Rows liefern):
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'import-unipile-relations';
