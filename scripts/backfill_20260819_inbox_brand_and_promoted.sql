-- ============================================================================
-- BACKFILL (Daten, mutierend) — separat auszufuehren NACH der DDL-Migration
--   20260819140000_add_lead_to_inbox_wrapper_and_resurface_fix.sql
-- ----------------------------------------------------------------------------
-- Bewusst KEINE Migration: das hier repariert bestehende Zeilen, nicht Verhalten.
-- Getrennt gehalten (Auftrag), damit der Dry-Run-Count vor dem Schreiben sichtbar ist
-- und der Lauf einzeln, kontrolliert und wiederholbar bleibt.
--
-- Zwei unabhaengige Reparaturen, Zahlen am 2026-08-19 gegen Prod verifiziert:
--
-- (1) MARKE NACHTRAGEN — nur wo EINDEUTIG.
--     4.821 markenlose linkedin_inbox-Zeilen sind im UI unsichtbar (inbox_feed filtert
--     strikt auf die aktive Marke). Aus dem Lead ist die Marke NICHT ableitbar
--     (leads hat kein brand_voice_id). Eindeutig zuordenbar sind nur:
--       * ueber Listenmitgliedschaft: 0 Zeilen — die brandlosen Zeilen, die in Listen
--         liegen, sitzen ausschliesslich in selbst markenlosen Listen (verifiziert).
--       * ueber Team-mit-genau-EINER-Marke: 136 Zeilen (133 Team a1cdec02… / Marke
--         09047ae9…, 3 Team d6dc08b8… / Marke 7f6b365f…). Kein Konflikt, keine Ueber-
--         schneidung. (teams_exactly_1_brand: all==active==2, Wahl der Definition egal.)
--     => Es werden GENAU diese 136 nachgetragen. Die restlichen 4.685 bleiben markenlos
--        und werden NICHT geraten. Fuer sie ist ein sichtbarer UI-Weg vorgesehen
--        (Vorschlag im PR/Chat), keine stille Zuweisung.
--     Regel bewusst wie im Schreibpfad add_leads_to_inbox: nur brand_voice_id IS NULL
--     wird gesetzt — fremde Marke bliebe unberuehrt (hier per WHERE ausgeschlossen).
--
-- (2) promoted_lead_id AUFRAEUMEN — Invariante herstellen.
--     33 Zeilen haben promoted_lead_id IS NOT NULL AND review_status='new'. Das Frontend
--     rendert sie als „schon im CRM"-Label statt als Promote-Button (isFromCrm) und
--     schliesst sie aus der Bulk-Auswahl aus — sichtbar, aber nicht bedienbar. Die
--     Migration verhindert kuenftige Faelle; hier werden die bestehenden bereinigt.
--     Invariante danach: review_status='new'  =>  promoted_lead_id IS NULL.
--     Warum das in_crm nicht kaputt macht: siehe Kopf der DDL-Migration (salesnav-Zweig
--     traegt echte CRM-Zeilen unabhaengig weiter; source='crm_lead' bleibt das durable
--     „kommt aus dem CRM"-Signal).
--
-- Reihenfolge egal — die beiden UPDATEs sind disjunkt (das eine setzt brand_voice_id,
-- das andere promoted_lead_id auf verschiedenen Zeilenmengen).
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '=================== DRY-RUN (nur Zaehlung, kein Schreibvorgang) ==================='
\echo '--- (1) Markenlos gesamt / davon eindeutig ueber Team-mit-1-Marke zuordenbar ---'
SELECT
  (SELECT count(*) FROM public.linkedin_inbox WHERE brand_voice_id IS NULL) AS brandless_total,
  (SELECT count(*) FROM public.linkedin_inbox li
     JOIN (SELECT team_id FROM public.brand_voices
            WHERE team_id IS NOT NULL GROUP BY team_id HAVING count(*)=1) tb
       ON tb.team_id = li.team_id
    WHERE li.brand_voice_id IS NULL)                                        AS assignable_team_single;
\echo '--- (2) promoted_lead_id-Violatoren (review_status=new, promoted_lead_id gesetzt) ---'
SELECT count(*) AS promoted_violators
  FROM public.linkedin_inbox WHERE promoted_lead_id IS NOT NULL AND review_status='new';

\echo ''
\echo '=================== APPLY ==================='
BEGIN;

-- (1) Marke nachtragen: nur markenlose Zeilen in Teams mit genau EINER Marke.
UPDATE public.linkedin_inbox li
   SET brand_voice_id = tb.the_brand,
       updated_at     = now()
  FROM (SELECT team_id, (array_agg(id))[1] AS the_brand
          FROM public.brand_voices
         WHERE team_id IS NOT NULL
         GROUP BY team_id
        HAVING count(*) = 1) tb
 WHERE li.brand_voice_id IS NULL
   AND li.team_id = tb.team_id;

-- (2) promoted_lead_id nullen, wo die Zeile wieder in Bewertung ist.
UPDATE public.linkedin_inbox
   SET promoted_lead_id = NULL,
       updated_at       = now()
 WHERE promoted_lead_id IS NOT NULL
   AND review_status = 'new';

\echo '--- Verify (in der Transaktion, vor COMMIT) ---'
\echo '--- Erwartet: promoted_violators = 0 ---'
SELECT count(*) AS promoted_violators_nachher
  FROM public.linkedin_inbox WHERE promoted_lead_id IS NOT NULL AND review_status='new';
\echo '--- Erwartet: keine markenlose Zeile mehr in einem Team-mit-1-Marke ---'
SELECT count(*) AS rest_zuordenbar_aber_noch_null
  FROM public.linkedin_inbox li
  JOIN (SELECT team_id FROM public.brand_voices
         WHERE team_id IS NOT NULL GROUP BY team_id HAVING count(*)=1) tb
    ON tb.team_id = li.team_id
 WHERE li.brand_voice_id IS NULL;
\echo '--- Kontext: verbleibende markenlose Zeilen gesamt (der bewusst nicht geratene Rest) ---'
SELECT count(*) AS brandless_rest FROM public.linkedin_inbox WHERE brand_voice_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
