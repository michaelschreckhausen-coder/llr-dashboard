-- Unipile-Kontakte-Import-Sprint · C Teil 1
-- sales_nav_upsert_inbox: RETURNS jsonb {id, inserted} statt boolean (id = inbox-Row-id für Listen-Verlinkung,
-- inserted = true bei INSERT / false bei UPDATE). Return-Typ-Wechsel → DROP+CREATE.
-- ⚠️ Ripple: BEIDE aufrufenden EFs (import-unipile-relations + import-unipile-salesnav) müssen ihren Zähler
-- von data===true auf data.inserted umstellen — zusammen deployt (sonst zählt relations-EF 0).

BEGIN;

DROP FUNCTION IF EXISTS public.sales_nav_upsert_inbox(uuid, uuid, jsonb);

CREATE FUNCTION public.sales_nav_upsert_inbox(p_team_id uuid, p_user_id uuid, p_lead jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sales_nav_id text := NULLIF(p_lead->>'sales_nav_id','');
  v_provider_id  text := NULLIF(p_lead->>'provider_id','');
  v_source       text := COALESCE(NULLIF(p_lead->>'source',''), 'sales_nav');
  v_existing     uuid;
  v_id           uuid;
BEGIN
  IF v_sales_nav_id IS NULL AND v_provider_id IS NULL THEN
    RAISE EXCEPTION 'sales_nav_id or provider_id required';
  END IF;

  SELECT id INTO v_existing FROM public.linkedin_inbox
  WHERE team_id = p_team_id
    AND ( (v_sales_nav_id IS NOT NULL AND sales_nav_id = v_sales_nav_id)
       OR (v_provider_id  IS NOT NULL AND provider_id  = v_provider_id) )
  ORDER BY (v_sales_nav_id IS NOT NULL AND sales_nav_id = v_sales_nav_id) DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.linkedin_inbox SET
      sales_nav_id     = COALESCE(v_sales_nav_id, sales_nav_id),
      provider_id      = COALESCE(v_provider_id,  provider_id),
      job_title        = COALESCE(NULLIF(p_lead->>'job_title',''),        job_title),
      company          = COALESCE(NULLIF(p_lead->>'company',''),          company),
      location         = COALESCE(NULLIF(p_lead->>'location',''),         location),
      avatar_url       = COALESCE(NULLIF(p_lead->>'avatar_url',''),       avatar_url),
      linkedin_url     = COALESCE(NULLIF(p_lead->>'linkedin_url',''),     linkedin_url),
      headline         = COALESCE(NULLIF(p_lead->>'headline',''),         headline),
      li_about_summary = COALESCE(NULLIF(p_lead->>'li_about_summary',''), li_about_summary),
      raw              = COALESCE(p_lead, raw),
      updated_at       = now()
    WHERE id = v_existing;
    RETURN jsonb_build_object('id', v_existing, 'inserted', false);
  END IF;

  INSERT INTO public.linkedin_inbox (
    team_id, user_id, source, sales_nav_id, provider_id, name, first_name, last_name,
    job_title, company, location, avatar_url, linkedin_url, headline, li_about_summary, raw
  ) VALUES (
    p_team_id, p_user_id, v_source, v_sales_nav_id, v_provider_id,
    COALESCE(NULLIF(p_lead->>'name',''), 'Unbekannt'),
    NULLIF(p_lead->>'first_name',''), NULLIF(p_lead->>'last_name',''),
    NULLIF(p_lead->>'job_title',''), NULLIF(p_lead->>'company',''), NULLIF(p_lead->>'location',''),
    NULLIF(p_lead->>'avatar_url',''), NULLIF(p_lead->>'linkedin_url',''), NULLIF(p_lead->>'headline',''),
    NULLIF(p_lead->>'li_about_summary',''), p_lead
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'inserted', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sales_nav_upsert_inbox(uuid, uuid, jsonb) TO service_role, authenticated;

COMMIT;
