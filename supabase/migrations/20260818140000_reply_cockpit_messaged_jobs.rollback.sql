-- ROLLBACK zu 20260818140000_reply_cockpit_messaged_jobs.sql
-- Stellt den Stand aus 20260818113000_reply_cockpit_messaged.sql wieder her: messaged und
-- last_outbound_at BLEIBEN (Signatur unveraendert, 18 OUT-Spalten), nur der la_jobs-Zweig
-- faellt weg. Body zeichengleich zu 113000.
--
-- Folge des Rueckbaus, rein Anzeige: ein von der Automation Angeschriebener, dessen Chat
-- der inbox-sync noch nicht gespiegelt hat, erscheint wieder als „🔗 Vernetzt" mit
-- „Anschreiben"-Button (Gap-Analyse 2026-08-18: 8 Zeilen auf Prod, 0 auf Staging).
-- Kein Frontend-Rueckbau noetig — die Signatur bleibt gleich.
--
-- Der Index la_jobs_enrollment_action_state_idx wird BEWUSST NICHT gedroppt: additiv,
-- schadet nicht, und ein Index-Drop auf einer laufenden Tabelle ist eine eigene
-- Ruecksprache wert.
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

GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid) TO service_role;

COMMIT;

\echo '--- Verify: la_jobs-Zweig muss WEG sein, Signatur unveraendert ---'
SELECT pg_get_functiondef(p.oid) LIKE '%public.la_jobs j%' AS hat_jobs_zweig,
       pg_get_function_result(p.oid) LIKE '%messaged boolean%' AS hat_messaged
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit';
\echo '--- Verify: Grants ---'
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'la_campaign_cockpit' ORDER BY 1;
