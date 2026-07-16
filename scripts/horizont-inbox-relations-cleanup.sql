-- ════════════════════════════════════════════════════════════════════════════
-- Horizont · auto-importierte Netzwerk-Kontakte aus der LinkedIn-Inbox entfernen
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ REIHENFOLGE: ERST Migration 20260716120000_stop_relations_auto_import.sql
--    applien (Cron aus), DANN dieses Script. Sonst füllt der nächste Cron-Lauf
--    alles wieder auf.
--
-- Ausführen vom eigenen Mac (Claude hat keinen SSH-Outbound):
--   ssh root@128.140.123.163 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < scripts/horizont-inbox-relations-cleanup.sql
--
-- ── Scope: was WIRD gelöscht ───────────────────────────────────────────────
--   source = 'unipile_relations'   → der automatische Netzwerk-Dump
--   review_status = 'new'          → unangefasst
--   promoted_lead_id IS NULL       → nie zu einem Lead gemacht
--   kein Outreach dran             → nicht in connection_queue / automation_jobs
--                                     / automation_campaign_leads
--
-- ── Was NICHT gelöscht wird (bewusst) ──────────────────────────────────────
--   source = 'unipile_salesnav'    → manuell per Sales-Nav-URL importiert, gewollt
--   source = 'sales_nav' / andere  → nicht Teil des Auto-Imports
--   promoted / dismissed           → bereits bearbeitet
--   alles mit laufendem Outreach   → Löschen würde per ON DELETE CASCADE still
--                                     Kampagnen-/Queue-Rows mitreißen
--
-- ── Cascade-Surface von linkedin_inbox (verifiziert 2026-07-16) ────────────
--   connection_queue.inbox_id          ON DELETE CASCADE
--   automation_campaign_leads.inbox_id ON DELETE CASCADE
--   automation_jobs.inbox_id           ON DELETE CASCADE
--   inbox_list_members.inbox_id        ON DELETE CASCADE   (nur Listen-Zuordnung)
--   linkedin_inbox.promoted_lead_id → leads(id) ON DELETE SET NULL
--     → Leads bleiben unangetastet. Löschen läuft nur in diese Richtung nicht.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ─── TEIL A · DRY-RUN (read-only) ──────────────────────────────────────────
\echo ''
\echo '=== A1) Was wuerde geloescht werden? ==='
SELECT t.name AS team, count(*) AS wird_geloescht
FROM public.linkedin_inbox li
JOIN public.teams t ON t.id = li.team_id
WHERE t.name ILIKE '%horizont%'
  AND li.source = 'unipile_relations'
  AND li.review_status = 'new'
  AND li.promoted_lead_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.connection_queue          q WHERE q.inbox_id  = li.id)
  AND NOT EXISTS (SELECT 1 FROM public.automation_jobs           j WHERE j.inbox_id  = li.id)
  AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads c WHERE c.inbox_id  = li.id)
GROUP BY 1;

\echo ''
\echo '=== A2) Was bleibt stehen — und warum? ==='
SELECT t.name AS team,
       CASE
         WHEN li.source <> 'unipile_relations'    THEN 'anderer source: ' || li.source
         WHEN li.review_status <> 'new'           THEN 'bereits bearbeitet: ' || li.review_status
         WHEN li.promoted_lead_id IS NOT NULL     THEN 'zu Lead promoted'
         ELSE 'Outreach aktiv (Queue/Kampagne/Job)'
       END AS grund,
       count(*) AS n
FROM public.linkedin_inbox li
JOIN public.teams t ON t.id = li.team_id
WHERE t.name ILIKE '%horizont%'
  AND NOT (
        li.source = 'unipile_relations'
    AND li.review_status = 'new'
    AND li.promoted_lead_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.connection_queue          q WHERE q.inbox_id = li.id)
    AND NOT EXISTS (SELECT 1 FROM public.automation_jobs           j WHERE j.inbox_id = li.id)
    AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads c WHERE c.inbox_id = li.id)
  )
GROUP BY 1,2
ORDER BY n DESC;

\echo ''
\echo '=== A3) Cron wirklich aus? (muss 0 Rows liefern) ==='
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%relations%';

\echo ''
\echo '>>> A1/A2/A3 pruefen. Passt die Zahl? Dann TEIL B einkommentieren und neu laufen lassen. <<<'
\echo ''

-- ─── TEIL B · LÖSCHEN (destruktiv — bewusst auskommentiert) ────────────────
-- Backup zuerst:
--   ssh root@128.140.123.163 "docker exec supabase-db pg_dump -U supabase_admin -d postgres \
--     -t public.linkedin_inbox --data-only" > linkedin_inbox-backup-$(date +%Y%m%d-%H%M).sql
--
-- BEGIN;
--
-- CREATE TEMP TABLE _doomed AS
-- SELECT li.id
-- FROM public.linkedin_inbox li
-- JOIN public.teams t ON t.id = li.team_id
-- WHERE t.name ILIKE '%horizont%'
--   AND li.source = 'unipile_relations'
--   AND li.review_status = 'new'
--   AND li.promoted_lead_id IS NULL
--   AND NOT EXISTS (SELECT 1 FROM public.connection_queue          q WHERE q.inbox_id = li.id)
--   AND NOT EXISTS (SELECT 1 FROM public.automation_jobs           j WHERE j.inbox_id = li.id)
--   AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads c WHERE c.inbox_id = li.id);
--
-- SELECT count(*) AS loesche_jetzt FROM _doomed;
--
-- DELETE FROM public.linkedin_inbox WHERE id IN (SELECT id FROM _doomed);
--
-- -- Kontrolle VOR dem Commit — muss 0 sein:
-- SELECT count(*) AS rest_relations_new
-- FROM public.linkedin_inbox li JOIN public.teams t ON t.id = li.team_id
-- WHERE t.name ILIKE '%horizont%' AND li.source = 'unipile_relations' AND li.review_status = 'new';
--
-- COMMIT;   -- ← bei unerwarteten Zahlen stattdessen: ROLLBACK;
