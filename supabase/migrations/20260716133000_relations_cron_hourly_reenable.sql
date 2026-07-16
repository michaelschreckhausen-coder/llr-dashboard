-- ════════════════════════════════════════════════════════════════
-- 20260716133000_relations_cron_hourly_reenable.sql
-- Relations-Sync wieder aktivieren — stündlich, Ziel ist jetzt linkedin_network.
-- ----------------------------------------------------------------------------
-- ⚠️ ERST APPLIEN, WENN DIE NEUE EF DEPLOYED UND NEU GESTARTET IST.
-- Sonst schreibt der alte Function-Code weiter in linkedin_inbox und flutet die
-- Triage-Queue erneut. Reihenfolge:
--   1. EF import-unipile-relations nach /opt/supabase/docker/volumes/functions/
--   2. docker restart supabase-edge-functions   (Top-Fallstrick #11 — Deno-Cache!)
--   3. Manueller Test-Call gegen EINEN Account, Ergebnis in linkedin_network prüfen
--   4. DANN diese Migration
--
-- ── Der eigentliche Bug, der hier gefixt wird ───────────────────────────────
-- 20260708120000 hat trigger_import_unipile_relations() auf Hash-Stunden-
-- Staffelung umgebaut:
--     AND (abs(hashtext(ua.unipile_account_id)) % 24) = extract(hour FROM now())::int
-- Das setzt einen STÜNDLICHEN Cron voraus. Geplant war aber weiterhin der alte
-- Schedule aus 20260707200000: '10 4 * * *' (täglich 04:10).
-- Die Migration notierte „Cron-Scheduling separat (nur Prod)" — und tat es nicht.
--
-- Effekt bei täglich 04:10: die Hash-Bedingung ist nur für Accounts mit
-- Hash-Stunde 4 erfüllt (~1/24). Alle anderen syncen NIE. Die Staffelung, die
-- Last verteilen sollte, wurde zum Filter, der 23 von 24 Accounts aussperrt.
--
-- Fix: '0 * * * *'. Jede Stunde feuern, die Hash-Bedingung macht die Verteilung.
-- Pro Account bleibt es bei genau 1 Lauf/Tag — wie ursprünglich gedacht.
--
-- Das Addon-Gate (team_has_addon(..., 'automation')) aus 20260708120000 bleibt
-- unverändert bestehen.
--
-- Idempotent: cron.schedule upsertet per jobname. Guarded für Envs ohne pg_cron.
-- ════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[relations-cron] pg_cron nicht installiert — Scheduling uebersprungen.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'import-unipile-relations',
    '0 * * * *',
    $cron$SELECT public.trigger_import_unipile_relations()$cron$
  );
  RAISE NOTICE '[relations-cron] Job auf stuendlich (0 * * * *) gesetzt — Ziel: linkedin_network.';
END $$;

COMMIT;

-- ── Verifikation ────────────────────────────────────────────────────────────
-- Schedule muss '0 * * * *' sein:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname='import-unipile-relations';
--
-- Welche Accounts feuern in welcher Stunde? (Verteilung prüfen)
--   SELECT abs(hashtext(unipile_account_id)) % 24 AS stunde, count(*)
--   FROM public.unipile_accounts WHERE status='OK' AND team_id IS NOT NULL
--   GROUP BY 1 ORDER BY 1;
--
-- Nach dem ersten Lauf — Inbox muss sauber BLEIBEN (erwartet: 0):
--   SELECT count(*) FROM public.linkedin_inbox
--   WHERE source='unipile_relations' AND review_status='new';
