-- Einzel-Profil-Import der Extension (import_linkedin_to_inbox) brand-scopen.
-- Gleiches Muster wie sales_nav_upsert_inbox: Import traegt die aktive Marke ->
-- Inbox-Zeile bekommt brand_voice_id -> sichtbar in der strikt brand-scoped
-- "LinkedIn Kontakte"-Ansicht. Re-Import fuellt NULL-Marke nach (nie ueberschreiben).
BEGIN;

CREATE OR REPLACE FUNCTION public.import_linkedin_to_inbox(
  p_team_id uuid, p_user_id uuid, p_profile jsonb, p_brand_voice_id uuid DEFAULT NULL
)
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
$function$;

-- Alte 3-Arg-Signatur delegiert (kein DROP, keine Ambiguitaet)
CREATE OR REPLACE FUNCTION public.import_linkedin_to_inbox(
  p_team_id uuid, p_user_id uuid, p_profile jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.import_linkedin_to_inbox(p_team_id, p_user_id, p_profile, NULL::uuid);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.import_linkedin_to_inbox(uuid,uuid,jsonb,uuid) TO authenticated, service_role;

COMMIT;
