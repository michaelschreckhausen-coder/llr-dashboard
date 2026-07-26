-- import_linkedin_to_inbox: Fallback auf aktive Marke (fuer alte Extension ohne Marken-Uebergabe)
CREATE OR REPLACE FUNCTION public.import_linkedin_to_inbox(p_team_id uuid, p_user_id uuid, p_profile jsonb, p_brand_voice_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted boolean;
  v_url      text;
  v_snid     text;
BEGIN
  v_url  := COALESCE(NULLIF(p_profile->>'linkedin_url',''), NULLIF(p_profile->>'profile_url',''));
  v_snid := NULLIF(p_profile->>'sales_nav_id','');

  IF v_url IS NULL AND v_snid IS NULL THEN
    RAISE EXCEPTION 'linkedin_url or sales_nav_id required';
  END IF;
  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'team_id required';
  END IF;
  IF NOT public.user_in_team(p_team_id) THEN
    RAISE EXCEPTION 'forbidden: caller not in team %', p_team_id;
  END IF;

  -- Fallback fuer ALTE Extension (sendet keine Marke): aktive Marke des eingeloggten Users
  -- verwenden (nur wenn er Zugriff hat) -> Import erscheint in der brand-gefilterten Inbox.
  IF p_brand_voice_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT up.active_brand_voice_id INTO p_brand_voice_id
    FROM public.user_preferences up WHERE up.user_id = auth.uid();
    IF p_brand_voice_id IS NOT NULL AND NOT public.has_brand_access(p_brand_voice_id) THEN
      p_brand_voice_id := NULL;
    END IF;
  END IF;

  IF v_snid IS NOT NULL THEN
    INSERT INTO public.linkedin_inbox (
      team_id, user_id, brand_voice_id, source, sales_nav_id, linkedin_url, name, first_name, last_name,
      headline, job_title, company, location, avatar_url, li_about_summary, raw
    ) VALUES (
      p_team_id, COALESCE(p_user_id, auth.uid()), p_brand_voice_id, 'sales_nav', v_snid, v_url,
      COALESCE(NULLIF(p_profile->>'name',''), 'Unbekannt'),
      NULLIF(p_profile->>'first_name',''),  NULLIF(p_profile->>'last_name',''),
      NULLIF(p_profile->>'headline',''),    NULLIF(p_profile->>'job_title',''),
      NULLIF(p_profile->>'company',''),     NULLIF(p_profile->>'location',''),
      NULLIF(p_profile->>'avatar_url',''),  NULLIF(p_profile->>'li_about_summary',''),
      p_profile
    )
    ON CONFLICT (team_id, sales_nav_id) WHERE sales_nav_id IS NOT NULL
    DO UPDATE SET
      job_title        = COALESCE(EXCLUDED.job_title,        public.linkedin_inbox.job_title),
      company          = COALESCE(EXCLUDED.company,          public.linkedin_inbox.company),
      location         = COALESCE(EXCLUDED.location,         public.linkedin_inbox.location),
      avatar_url       = COALESCE(EXCLUDED.avatar_url,       public.linkedin_inbox.avatar_url),
      linkedin_url     = COALESCE(EXCLUDED.linkedin_url,     public.linkedin_inbox.linkedin_url),
      headline         = COALESCE(EXCLUDED.headline,         public.linkedin_inbox.headline),
      li_about_summary = COALESCE(EXCLUDED.li_about_summary, public.linkedin_inbox.li_about_summary),
      brand_voice_id   = COALESCE(public.linkedin_inbox.brand_voice_id, EXCLUDED.brand_voice_id),
      raw              = COALESCE(EXCLUDED.raw,              public.linkedin_inbox.raw)
    RETURNING (xmax = 0) INTO v_inserted;
  ELSE
    INSERT INTO public.linkedin_inbox (
      team_id, user_id, brand_voice_id, source, linkedin_url, name, first_name, last_name,
      headline, job_title, company, location, avatar_url, li_about_summary, raw
    ) VALUES (
      p_team_id, COALESCE(p_user_id, auth.uid()), p_brand_voice_id, 'extension_import', v_url,
      COALESCE(NULLIF(p_profile->>'name',''), 'Unbekannt'),
      NULLIF(p_profile->>'first_name',''),  NULLIF(p_profile->>'last_name',''),
      NULLIF(p_profile->>'headline',''),    NULLIF(p_profile->>'job_title',''),
      NULLIF(p_profile->>'company',''),     NULLIF(p_profile->>'location',''),
      NULLIF(p_profile->>'avatar_url',''),  NULLIF(p_profile->>'li_about_summary',''),
      p_profile
    )
    ON CONFLICT (team_id, linkedin_url) WHERE linkedin_url IS NOT NULL AND sales_nav_id IS NULL
    DO UPDATE SET
      headline         = COALESCE(EXCLUDED.headline,         public.linkedin_inbox.headline),
      job_title        = COALESCE(EXCLUDED.job_title,        public.linkedin_inbox.job_title),
      company          = COALESCE(EXCLUDED.company,          public.linkedin_inbox.company),
      location         = COALESCE(EXCLUDED.location,         public.linkedin_inbox.location),
      avatar_url       = COALESCE(EXCLUDED.avatar_url,       public.linkedin_inbox.avatar_url),
      li_about_summary = COALESCE(EXCLUDED.li_about_summary, public.linkedin_inbox.li_about_summary),
      brand_voice_id   = COALESCE(public.linkedin_inbox.brand_voice_id, EXCLUDED.brand_voice_id),
      raw              = COALESCE(EXCLUDED.raw,              public.linkedin_inbox.raw)
    RETURNING (xmax = 0) INTO v_inserted;
  END IF;

  RETURN v_inserted;
END;
$function$


