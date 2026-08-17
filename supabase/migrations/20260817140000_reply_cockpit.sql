-- Reply-Cockpit — Antwort-Tracking + KI-Sentiment auf Kampagnen-Kontakten (la_enrollments).
-- Rein additiv: Spalten + CHECKs + 3 RPCs. Keine neue Tabelle, keine RLS-Änderung.
-- Reply-Matching läuft über Profil-Identität (la_enrollments.provider_id ↔
-- linkedin_chats.attendee_provider_id, brand-scoped) — la_enrollments trägt keine chat_id
-- vom Versand (la-runner legt sie nur auf la_jobs ab). Detection-Writer = unipile-inbox-sync.
\set ON_ERROR_STOP on
BEGIN;

-- ── Spalten am Kampagnen-Kontakt (idempotent) ─────────────────────────────
ALTER TABLE public.la_enrollments
  ADD COLUMN IF NOT EXISTS sentiment          text,       -- effektiv: positiv|neutral|negativ|null
  ADD COLUMN IF NOT EXISTS sentiment_ai       text,       -- KI-Roh-Vorschlag (für „KI: X?"-Hinweis)
  ADD COLUMN IF NOT EXISTS sentiment_source   text,       -- ki|manuell (manuell gewinnt)
  ADD COLUMN IF NOT EXISTS handled            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_id            uuid,       -- linkedin_chats(id), bei Detection aufgelöst (Deep-Link/Denorm)
  ADD COLUMN IF NOT EXISTS last_reply_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_reply_excerpt text,
  ADD COLUMN IF NOT EXISTS last_reply_msg_id  text;       -- Idempotenz: zuletzt verarbeitete unipile_message_id

-- CHECKs (DROP IF EXISTS davor → wiederholbar; ADD CONSTRAINT ist nicht idempotent).
ALTER TABLE public.la_enrollments DROP CONSTRAINT IF EXISTS la_enrollments_sentiment_chk;
ALTER TABLE public.la_enrollments DROP CONSTRAINT IF EXISTS la_enrollments_sentiment_ai_chk;
ALTER TABLE public.la_enrollments DROP CONSTRAINT IF EXISTS la_enrollments_sentiment_source_chk;
ALTER TABLE public.la_enrollments
  ADD CONSTRAINT la_enrollments_sentiment_chk        CHECK (sentiment        IS NULL OR sentiment        IN ('positiv','neutral','negativ')),
  ADD CONSTRAINT la_enrollments_sentiment_ai_chk     CHECK (sentiment_ai     IS NULL OR sentiment_ai     IN ('positiv','neutral','negativ')),
  ADD CONSTRAINT la_enrollments_sentiment_source_chk CHECK (sentiment_source IS NULL OR sentiment_source IN ('ki','manuell'));

-- ── Lese-RPC: Cockpit-Kontakte einer Kampagne (Funnel/Liste/Arbeitsliste) ──
-- „replied"/Excerpt/Zeit live aus linkedin_chats+_messages abgeleitet (robust auch
-- bevor der inbox-sync-Hook die Enrollment beschrieben hat); Sentiment/handled/chat_id
-- aus der Enrollment (async vom Hook + Sentiment-EF gesetzt).
CREATE OR REPLACE FUNCTION public.la_campaign_cockpit(p_campaign_id uuid)
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

-- ── Mutations-RPCs: manuelle Ampel (manuell gewinnt) + Erledigt-Haken ──────
CREATE OR REPLACE FUNCTION public.la_set_reply_sentiment(p_enrollment_id uuid, p_sentiment text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid;
BEGIN
  IF p_sentiment IS NOT NULL AND p_sentiment NOT IN ('positiv','neutral','negativ') THEN RAISE EXCEPTION 'bad_sentiment'; END IF;
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_enrollments WHERE id = p_enrollment_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.la_enrollments
     SET sentiment = p_sentiment,
         sentiment_source = CASE WHEN p_sentiment IS NULL THEN NULL ELSE 'manuell' END,
         updated_at = now()
   WHERE id = p_enrollment_id;
END $function$;

CREATE OR REPLACE FUNCTION public.la_set_reply_handled(p_enrollment_id uuid, p_handled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid;
BEGIN
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_enrollments WHERE id = p_enrollment_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.la_enrollments SET handled = COALESCE(p_handled, false), updated_at = now() WHERE id = p_enrollment_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.la_campaign_cockpit(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.la_set_reply_sentiment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.la_set_reply_handled(uuid, boolean) TO authenticated;

COMMIT;

\echo '--- Verify: neue Spalten ---'
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='la_enrollments'
  AND column_name IN ('sentiment','sentiment_ai','sentiment_source','handled','chat_id','last_reply_at','last_reply_excerpt','last_reply_msg_id') ORDER BY 1;
\echo '--- Verify: RPCs ---'
SELECT proname FROM pg_proc WHERE proname IN ('la_campaign_cockpit','la_set_reply_sentiment','la_set_reply_handled') ORDER BY 1;
