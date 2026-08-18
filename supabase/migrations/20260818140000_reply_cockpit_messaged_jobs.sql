-- Reply-Cockpit — messaged zusaetzlich aus erledigten la_jobs. Follow-up zu
-- 20260818113000_reply_cockpit_messaged.sql. Signatur UNVERAENDERT (18 OUT-Spalten).
--
-- Anlass: messaged kam bisher allein aus linkedin_chat_messages. Das traegt fuer den
-- manuellen Weg (unipile-message-send spiegelt die gesendete Nachricht sofort selbst als
-- outbound ein), nicht aber fuer den Automations-Weg: la-runner schreibt bei
-- action message/follow_up/inmail nur la_jobs (state='done', provider_ref) und verlaesst
-- sich darauf, dass unipile-inbox-sync den Chat spaeter spiegelt. Der Sync hat drei
-- Deckel (supabase/functions/unipile-inbox-sync/index.ts, verifiziert 2026-08-18):
--   1. max_chats default 50, hart auf 200 begrenzt   (index.ts:56, Schleife :61 5x50)
--   2. pro Chat nur die letzten 30 Nachrichten       (index.ts:113 getChatMessages(c.id,null,30))
--   3. Nachrichten nur bei geaendertem last_message_at (index.ts:111)
-- Fehlt der Spiegel, erschien ein von der Automation Angeschriebener als „Vernetzt" mit
-- „Anschreiben"-Button — dieselbe Fehlerklasse wie der Ursprungsbug, nur invertiert, und
-- teurer, weil daraufhin doppelt angeschrieben wird.
--
-- ── Gap-Analyse 2026-08-18 (read-only, Population der RPC nachgebaut) ─────────
--   PROD    (128.140.123.163): population 345, alt 105, neu 113, KIPPT 8, ohne_chat 232.
--           Alle 8 in einer Kampagne: „Nachfass Messe Automatica" (paused, 12 Zeilen,
--           alt 0 -> neu 8). la_jobs: 5.059 gesamt, davon 10x action='message'/state='done',
--           kein follow_up, kein inmail. 8 von 452 Chats liegen am 30er-Fenster (max 70).
--   STAGING (178.104.210.216): population 33, alt 25, neu 25, KIPPT 0 — dort existiert
--           kein einziger Versand-Job (321 la_jobs, 0x message/follow_up/inmail).
--           Der Effekt dieser Migration ist auf Staging also NICHT sichtbar.
--
-- Rein additiv auf Funktionsebene: KEINE gespeicherte messaged-Spalte, KEIN Trigger,
-- KEIN Writer. Population (accepted_at IS NOT NULL OR ch.id IS NOT NULL), Sortierung,
-- Autorisierung und der inbound-Zweig (li) bleiben unangetastet.
--
-- Entkopplung: die Signatur ist identisch zu 113000 (18 OUT-Spalten) — DB und Frontend
-- sind unabhaengig. Diese Migration darf jederzeit vorlaufen, und ihr Rollback braucht
-- keinen Frontend-Rueckbau.
--
-- ⚠️ Signatur-Falle: RETURNS TABLE gehoert zum Rueckgabetyp → DROP + CREATE statt
--    CREATE OR REPLACE. ⚠️ Grant-Falle: Grants fallen mit der Funktion → GRANT EXECUTE
--    fuer authenticated UND service_role unten. KEIN REVOKE ... FROM PUBLIC: PUBLIC hatte
--    EXECUTE schon vor 113000 (Pre-Flight 2026-08-18: ACL = PUBLIC + authenticated +
--    service_role + supabase_admin) — ein REVOKE waere eine stille Verschaerfung.
-- ⚠️ Der Index unten laeuft CONCURRENTLY und MUSS ausserhalb der Transaktion stehen.
--    Bricht der Build ab, bleibt ein invalider Index liegen → Verify prueft indisvalid.
--
-- Pre-Flight (read-only): siehe 113000-Header; zusaetzlich pruefen, dass
--   SELECT count(*) FROM public.la_jobs WHERE state='done' AND action IN ('message','follow_up','inmail')
-- ueberhaupt Zeilen liefert — sonst ist die Migration reine Vorsorge.
--
-- Reversibel: 20260818140000_reply_cockpit_messaged_jobs.rollback.sql stellt den
-- 113000-Stand her (messaged/last_outbound_at bleiben, nur ohne den la_jobs-Zweig).
\set ON_ERROR_STOP on
BEGIN;

DROP FUNCTION IF EXISTS public.la_campaign_cockpit(uuid);

CREATE FUNCTION public.la_campaign_cockpit(p_campaign_id uuid)
RETURNS TABLE(
  enrollment_id uuid, provider_id text, public_identifier text,
  name text, headline text, profile_url text, avatar_url text,
  accepted_at timestamptz, replied boolean,
  last_reply_at timestamptz, last_reply_excerpt text,
  sentiment text, sentiment_ai text, sentiment_source text,
  handled boolean, chat_id uuid,
  messaged boolean, last_outbound_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid;
BEGIN
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT e.id, e.provider_id, e.public_identifier,
           e.person->>'name'        AS name,
           COALESCE(ch.attendee_headline, e.person->>'headline') AS headline,
           e.person->>'profile_url' AS profile_url,
           ch.attendee_avatar_url   AS avatar_url,
           e.accepted_at,
           (e.last_reply_at IS NOT NULL OR li.sent_at IS NOT NULL) AS replied,
           COALESCE(e.last_reply_at, li.sent_at)                   AS last_reply_at,
           COALESCE(e.last_reply_excerpt, left(li.text, 240))      AS last_reply_excerpt,
           e.sentiment, e.sentiment_ai, e.sentiment_source, e.handled,
           COALESCE(e.chat_id, ch.id)                              AS chat_id,
           ( EXISTS (
               SELECT 1 FROM public.linkedin_chat_messages m2
                WHERE m2.chat_id = COALESCE(e.chat_id, ch.id)
                  AND m2.direction = 'outbound'
             )
             -- Zweite Quelle: erledigter Versand-Job. Der Spiegel kann fehlen (inbox-sync
             -- deckelt auf 200 Chats/Lauf, 30 Nachrichten/Chat, und holt nur bei geaendertem
             -- last_message_at) — dann waere ein von der Automation Angeschriebener als
             -- „Vernetzt" mit „Anschreiben"-Button gelaufen. Vernetzungs-Anfragen zaehlen
             -- NICHT mit: eine Verbindungs-Note ist keine Nachricht (Ursprungsbug).
             -- Bewusst ohne das Wort in Quotes, damit der LIKE-Verify unten nicht auf
             -- diesem Kommentar anschlaegt (pg_get_functiondef liefert den Body mit).
             OR EXISTS (
               SELECT 1 FROM public.la_jobs j
                WHERE j.enrollment_id = e.id AND j.state = 'done'
                  AND j.action IN ('message','follow_up','inmail')
             )
           )                                                        AS messaged,
           -- GREATEST ignoriert NULL-Argumente → liefert den vorhandenen Wert, wenn nur
           -- eine der beiden Quellen existiert.
           GREATEST(lo.sent_at, lj.done_at)                         AS last_outbound_at
    FROM public.la_enrollments e
    LEFT JOIN LATERAL (
      SELECT c.id, c.attendee_avatar_url, c.attendee_headline
      FROM public.linkedin_chats c
      WHERE c.brand_voice_id = e.brand_voice_id AND c.attendee_provider_id = e.provider_id
      ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1
    ) ch ON true
    LEFT JOIN LATERAL (
      SELECT m.text, m.sent_at FROM public.linkedin_chat_messages m
      WHERE m.chat_id = ch.id AND m.direction = 'inbound'
      ORDER BY m.sent_at DESC NULLS LAST LIMIT 1
    ) li ON true
    -- Outbound-Wahrheit: „ist eine Nachricht raus?" — deckt alle Versandwege ab
    -- (unipile-message-send, la-runner message/follow_up, manuell auf LinkedIn).
    -- Nutzt idx_li_chat_msgs_chat (chat_id, sent_at) → Index-Only-Sprung pro Zeile.
    LEFT JOIN LATERAL (
      SELECT m3.sent_at FROM public.linkedin_chat_messages m3
      WHERE m3.chat_id = COALESCE(e.chat_id, ch.id) AND m3.direction = 'outbound'
      ORDER BY m3.sent_at DESC NULLS LAST LIMIT 1
    ) lo ON true
    -- Sendezeitpunkt aus dem Job: la-runner patcht state -> 'done' (updated_at NOT NULL).
    -- Aggregat-Lateral liefert immer genau eine Zeile (max() = NULL ohne Treffer).
    LEFT JOIN LATERAL (
      SELECT max(j.updated_at) AS done_at FROM public.la_jobs j
      WHERE j.enrollment_id = e.id AND j.state = 'done'
        AND j.action IN ('message','follow_up','inmail')
    ) lj ON true
    -- Population = kontaktiert (hat Postfach-Thread) ODER als Verbindung angenommen.
    -- accepted_at allein greift zu eng (Antworter ohne accepted_at-Reconcile fielen sonst raus).
    WHERE e.campaign_id = p_campaign_id AND (e.accepted_at IS NOT NULL OR ch.id IS NOT NULL)
    ORDER BY (e.last_reply_at IS NOT NULL OR li.sent_at IS NOT NULL) DESC,
             COALESCE(e.last_reply_at, li.sent_at) DESC NULLS LAST,
             e.accepted_at DESC;
END $function$;

-- Grant-Set 1:1 wie vor dem DROP.
GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid) TO service_role;

COMMIT;

-- Additiver Index fuer den neuen Zweig. la_jobs hat bisher keinen Index auf
-- enrollment_id (nur pkey, idempotency_key, brand_voice_id und das partielle
-- la_jobs_claim_idx (state, scheduled_at) WHERE state='pending').
-- CONCURRENTLY: ausserhalb der Transaktion, blockiert laufende la-runner-Writes nicht.
CREATE INDEX CONCURRENTLY IF NOT EXISTS la_jobs_enrollment_action_state_idx
  ON public.la_jobs (enrollment_id, action, state);

\echo '--- Verify: Signatur unveraendert (18 OUT-Spalten, messaged + last_outbound_at) ---'
SELECT pg_get_function_result(p.oid) AS result_type, p.prosecdef, pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit';
\echo '--- Verify: la_jobs-Zweig im Body angekommen ---'
SELECT pg_get_functiondef(p.oid) LIKE '%public.la_jobs j%'      AS hat_jobs_zweig,
       pg_get_functiondef(p.oid) LIKE '%GREATEST(lo.sent_at%'   AS hat_greatest,
       pg_get_functiondef(p.oid) LIKE '%''invite''%'            AS invite_im_body_MUSS_F_SEIN
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit';
\echo '--- Verify: Grants ---'
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'la_campaign_cockpit' ORDER BY 1;
\echo '--- Verify: Index gebaut UND gueltig (indisvalid muss t sein) ---'
SELECT c.relname AS index, i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid) AS def
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE c.relname = 'la_jobs_enrollment_action_state_idx';
