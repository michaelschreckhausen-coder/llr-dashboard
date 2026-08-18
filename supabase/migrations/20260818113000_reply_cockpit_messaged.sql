-- Reply-Cockpit — „angeschrieben" als Serverwahrheit: la_campaign_cockpit liefert
-- messaged + last_outbound_at mit. Follow-up zu 20260817140000_reply_cockpit.sql.
--
-- Ursache: das Cockpit hat „Angeschrieben" bis b77ebccf aus dem Kampagnentyp (la_steps)
-- bzw. danach client-seitig aus linkedin_chat_messages abgeleitet. Beides trägt nicht:
--   1. Scope-Asymmetrie — linkedin_chat_messages hängt per RLS am 'inbox'-Scope
--      (linkedin_chat_messages_via_chat), das Cockpit läuft über 'automation'. Ein Team
--      mit automation-aber-ohne-inbox liest 0 Outbound-Zeilen → stumm alles „Vernetzt".
--   2. Round-Trip-Flackern — die Wahrheit kam einen Request nach der Liste.
--   3. Block-LIMIT — 60 chat_ids je Request mit LIMIT 1000 konnte einen Chat aus dem
--      Fenster fallen lassen (sent_at DESC über den ganzen Block).
-- Diese RPC ist SECURITY DEFINER und autorisiert selbst → hier ist die Wahrheit richtig.
--
-- Rein additiv auf Funktionsebene: KEINE neue Spalte, KEIN Index, KEIN Trigger, KEINE
-- Tabellenänderung. messaged wird abgeleitet, nicht gespeichert (ein Writer bräuchte
-- sonst brand_voice_id-Auflösung — bekannter Fallstrick).
-- Population, Sortierung, Autorisierung und alle bestehenden OUT-Spalten unverändert.
--
-- ⚠️ Signatur-Falle: RETURNS TABLE ist Teil des Rückgabetyps → CREATE OR REPLACE
--    scheitert an „cannot change return type of existing function". Daher
--    DROP FUNCTION IF EXISTS + CREATE FUNCTION in EINER Transaktion. Das ist kein
--    Tabellen-/Spalten-Drop (Rücksprache-Regel nicht berührt).
-- ⚠️ Grant-Falle: Grants fallen mit der Funktion. Ohne das GRANT EXECUTE unten läuft
--    das Cockpit nach dem Apply in „permission denied for function".
--
-- Deploy-Reihenfolge (beide Umgebungen): ERST diese Migration, DANN das Frontend.
-- Rückwärtskompatibel — das aktuell laufende Frontend liest die zwei neuen Spalten
-- nicht. Umgekehrt zeigte das neue Frontend gegen die alte RPC überall „Vernetzt".
--
-- ── Pre-Flight (read-only, VOR dem Apply separat ausführen) ────────────────────
-- 1) Signatur/Owner/DEFINER — erwartet: genau EINE Signatur (uuid), supabase_admin, t
--    SELECT p.oid::regprocedure AS signatur, pg_get_userbyid(p.proowner) AS owner,
--           p.prosecdef, pg_get_function_result(p.oid) AS result_type
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit' ORDER BY 1;
-- 2) Grants — erwartet EXECUTE für authenticated
--    SELECT grantee, privilege_type FROM information_schema.routine_privileges
--     WHERE routine_schema = 'public' AND routine_name = 'la_campaign_cockpit' ORDER BY 1;
-- 3) Index — erwartet idx_li_chat_msgs_chat (chat_id, sent_at)
--    SELECT indexname, indexdef FROM pg_indexes
--     WHERE schemaname = 'public' AND tablename = 'linkedin_chat_messages' ORDER BY 1;
-- Weicht etwas ab (anderer Owner, zweite Signatur, fehlender Index): NICHT applien.
--
-- Pre-Flight-Ergebnis Staging (178.104.210.216, 2026-08-18) — der einzige Nachweis,
-- den es ohne Ledger gibt: genau EINE Signatur la_campaign_cockpit(uuid), Owner
-- supabase_admin, prosecdef=t, 16 OUT-Spalten; Grants PUBLIC/authenticated/service_role/
-- supabase_admin je EXECUTE; idx_li_chat_msgs_chat (chat_id, sent_at) vorhanden;
-- Funktionsbody ohne messaged/last_outbound_at (Migration dort noch nicht gelaufen).
--
-- Reversibel: 20260818113000_reply_cockpit_messaged.rollback.sql stellt den 16-spaltigen
-- Stand aus 20260817140000 wieder her (inkl. Grant).
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
           EXISTS (
             SELECT 1 FROM public.linkedin_chat_messages m2
              WHERE m2.chat_id = COALESCE(e.chat_id, ch.id)
                AND m2.direction = 'outbound'
           )                                                        AS messaged,
           lo.sent_at                                               AS last_outbound_at
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
    -- Population = kontaktiert (hat Postfach-Thread) ODER als Verbindung angenommen.
    -- accepted_at allein greift zu eng (Antworter ohne accepted_at-Reconcile fielen sonst raus).
    WHERE e.campaign_id = p_campaign_id AND (e.accepted_at IS NOT NULL OR ch.id IS NOT NULL)
    ORDER BY (e.last_reply_at IS NOT NULL OR li.sent_at IS NOT NULL) DESC,
             COALESCE(e.last_reply_at, li.sent_at) DESC NULLS LAST,
             e.accepted_at DESC;
END $function$;

-- Grant-Set 1:1 wie vor dem DROP (Pre-Flight 2026-08-18): authenticated + service_role
-- explizit. PUBLIC EXECUTE entsteht beim CREATE per Default und war vorher auch da —
-- deshalb KEIN REVOKE (das waere eine stille Verschaerfung, kein Teil dieses Fixes).
GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid) TO service_role;

COMMIT;

\echo '--- Verify: OUT-Spalten (messaged + last_outbound_at müssen auftauchen) ---'
SELECT pg_get_function_result(p.oid) AS result_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit';
\echo '--- Verify: genau eine Signatur, SECURITY DEFINER, Owner ---'
SELECT p.oid::regprocedure AS signatur, pg_get_userbyid(p.proowner) AS owner, p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit' ORDER BY 1;
\echo '--- Verify: Grant wieder da (EXECUTE für authenticated) ---'
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'la_campaign_cockpit' ORDER BY 1;
