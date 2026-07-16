-- ════════════════════════════════════════════════════════════════
-- 20260716132000_migrate_relations_inbox_to_network.sql
-- Das ungefragt importierte LinkedIn-Netzwerk aus ALLEN Team-Inboxen
-- nach public.linkedin_network verschieben.
-- ----------------------------------------------------------------------------
-- Betroffen ist jedes Team mit Unipile-Anbindung: der Cron aus 20260707200000
-- lief am 07./08.07. UNGEGATET (Addon-Gate kam erst 20260708120000, nach dem
-- 04:10-Lauf) und zog pro OK-Account bis zu 5000 Relations in die Inbox.
--
-- ⚠️ REIHENFOLGE — vorher zwingend:
--   1. 20260716120000_stop_relations_auto_import.sql  (Cron aus!)
--   2. 20260716130000_linkedin_network_table.sql
--   3. 20260716131000_network_upsert_rpc.sql
--   4. DIESE Migration
-- Ohne Schritt 1 füllt der nächste Cron-Lauf die Inbox wieder auf.
--
-- ── Zwei Schritte: COPY (alles) → DELETE (nur das Unangetastete)
--
-- COPY nimmt ALLE Relations-Rows — auch promotete und solche mit Outreach.
-- Das Netzwerk ist das Netzwerk, unabhängig davon was der User damit gemacht hat.
--
-- DELETE ist bewusst ENGER. linkedin_inbox hängt an vier Tabellen mit
-- ON DELETE CASCADE (verifiziert 2026-07-16 gegen die Migrationen):
--     connection_queue.inbox_id
--     automation_campaign_leads.inbox_id
--     automation_jobs.inbox_id
--     inbox_list_members.inbox_id
-- Ein pauschales DELETE würde still laufende Kampagnen, Queue-Einträge und
-- kuratierte Listen-Zuordnungen mitreißen — ohne Fehler, ohne Spur.
-- Darum bleibt in der Inbox stehen, was der User angefasst hat:
--     * review_status <> 'new'   → bewertet (promoted/dismissed/snoozed)
--     * promoted_lead_id gesetzt → wurde zu einem Lead
--     * Outreach dran            → Queue / Kampagne / Job läuft
--     * in einer Inbox-Liste     → bewusst einsortiert
-- Diese Rows existieren danach in BEIDEN Tabellen. Das ist gewollt: die
-- Inbox-Row trägt den Triage-/Outreach-State, die Netzwerk-Row den Netzwerk-Fakt.
--
-- linkedin_inbox.promoted_lead_id → leads(id) ON DELETE SET NULL, d.h. das
-- Löschen läuft NICHT in die leads-Tabelle. Leads bleiben unangetastet.
--
-- Idempotent: COPY per ON CONFLICT DO NOTHING, DELETE ist nach dem ersten Lauf
-- ein No-Op (die Rows sind weg).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) COPY: alle Relations-Rows ins Netzwerk ───────────────────────────────
INSERT INTO public.linkedin_network (
  team_id, user_id, provider_id, linkedin_url,
  name, first_name, last_name, headline, job_title, company, location,
  avatar_url, li_about_summary, source, raw, imported_at, last_seen_at
)
SELECT
  li.team_id, li.user_id, li.provider_id, li.linkedin_url,
  li.name, li.first_name, li.last_name, li.headline, li.job_title, li.company,
  li.location, li.avatar_url, li.li_about_summary,
  'unipile_relations', li.raw, li.imported_at, li.imported_at
FROM public.linkedin_inbox li
WHERE li.source = 'unipile_relations'
  AND (li.provider_id IS NOT NULL OR li.linkedin_url IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ── 2) DELETE: nur unangetastete Rows aus der Inbox ─────────────────────────
DELETE FROM public.linkedin_inbox li
WHERE li.source = 'unipile_relations'
  AND li.review_status = 'new'
  AND li.promoted_lead_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.connection_queue          q WHERE q.inbox_id = li.id)
  AND NOT EXISTS (SELECT 1 FROM public.automation_jobs           j WHERE j.inbox_id = li.id)
  AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads c WHERE c.inbox_id = li.id)
  AND NOT EXISTS (SELECT 1 FROM public.inbox_list_members        m WHERE m.inbox_id = li.id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verifikation nach Apply ─────────────────────────────────────────────────
-- Netzwerk pro Team:
--   SELECT t.name, count(*) FROM public.linkedin_network n
--   JOIN public.teams t ON t.id = n.team_id GROUP BY 1 ORDER BY 2 DESC;
--
-- Was absichtlich in der Inbox blieb (mit Grund):
--   SELECT t.name,
--          CASE WHEN li.review_status <> 'new'       THEN 'bewertet: ' || li.review_status
--               WHEN li.promoted_lead_id IS NOT NULL THEN 'zu Lead promoted'
--               ELSE 'Outreach/Liste haengt dran' END AS grund,
--          count(*)
--   FROM public.linkedin_inbox li JOIN public.teams t ON t.id = li.team_id
--   WHERE li.source = 'unipile_relations' GROUP BY 1,2 ORDER BY 3 DESC;
--
-- Muss 0 sein — unangetastete Relations-Rows in der Inbox:
--   SELECT count(*) FROM public.linkedin_inbox li
--   WHERE li.source='unipile_relations' AND li.review_status='new'
--     AND li.promoted_lead_id IS NULL
--     AND NOT EXISTS (SELECT 1 FROM public.connection_queue q WHERE q.inbox_id=li.id)
--     AND NOT EXISTS (SELECT 1 FROM public.automation_jobs j WHERE j.inbox_id=li.id)
--     AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads c WHERE c.inbox_id=li.id)
--     AND NOT EXISTS (SELECT 1 FROM public.inbox_list_members m WHERE m.inbox_id=li.id);
