-- ROLLBACK zu 20260818113000_reply_cockpit_messaged.sql
-- Stellt la_campaign_cockpit auf den 16-spaltigen Stand aus 20260817140000_reply_cockpit.sql
-- zurück (ohne messaged/last_outbound_at). Body zeichengleich zum dortigen Original.
-- Gleiche Signatur-Falle: DROP + CREATE, Grant muss mit.
-- ⚠️ Nur zurückrollen, wenn das Frontend NICHT auf p.messaged umgestellt ist — sonst
--    zeigt das Cockpit überall „🔗 Vernetzt" und „Angeschrieben 0" (isSent prüft
--    strikt === true, undefined fällt bewusst auf „Vernetzt").
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
  handled boolean, chat_id uuid
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
           COALESCE(e.chat_id, ch.id)                              AS chat_id
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

\echo '--- Verify: OUT-Spalten (messaged/last_outbound_at müssen WEG sein) ---'
SELECT pg_get_function_result(p.oid) AS result_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'la_campaign_cockpit';
\echo '--- Verify: Grant wieder da ---'
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'la_campaign_cockpit' ORDER BY 1;
