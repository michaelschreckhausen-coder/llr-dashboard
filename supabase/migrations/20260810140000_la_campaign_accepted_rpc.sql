-- la_campaign_accepted: Angenommene einer Kampagne für die /messages-Kampagnen-Ansicht.
-- Rein lesend, SECURITY DEFINER + user_in_team-Guard (analog la_campaign_funnel).
-- Quelle = la_enrollments mit accepted_at IS NOT NULL (autoritativ; NICHT relation_status,
-- das von Scan-Crons auf 'unknown' zurückgesetzt wird). already_messaged = existiert ein
-- linkedin_chats-Thread mit dieser Person (brand + attendee_provider_id) → Doppel-DM-Schutz.

CREATE OR REPLACE FUNCTION public.la_campaign_accepted(p_campaign_id uuid)
 RETURNS TABLE(
   provider_id       text,
   name              text,
   public_identifier text,
   headline          text,
   profile_url       text,
   accepted_at       timestamptz,
   already_messaged  boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid;
BEGIN
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
    SELECT e.provider_id,
           e.person->>'name'        AS name,
           e.public_identifier,
           e.person->>'headline'    AS headline,
           e.person->>'profile_url' AS profile_url,
           e.accepted_at,
           EXISTS (
             SELECT 1 FROM public.linkedin_chats ch
              WHERE ch.brand_voice_id = e.brand_voice_id
                AND ch.attendee_provider_id = e.provider_id
           ) AS already_messaged
    FROM public.la_enrollments e
    WHERE e.campaign_id = p_campaign_id
      AND e.accepted_at IS NOT NULL
    ORDER BY e.accepted_at DESC;
END $function$;

GRANT EXECUTE ON FUNCTION public.la_campaign_accepted(uuid) TO authenticated;
