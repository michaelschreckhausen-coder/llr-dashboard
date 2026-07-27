-- promote_inbox_contact: linkedin_url aus namensgleicher Dublette holen wenn die Zeile selbst keine hat (alte Sales-Nav-Importe)
CREATE OR REPLACE FUNCTION public.promote_inbox_contact(p_inbox_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row     public.linkedin_inbox;
  v_lead_id uuid;
BEGIN
  SELECT * INTO v_row FROM public.linkedin_inbox WHERE id = p_inbox_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbox row % not found', p_inbox_id;
  END IF;

  IF NOT public.user_in_team(v_row.team_id) THEN
    RAISE EXCEPTION 'forbidden: caller not in team %', v_row.team_id;
  END IF;

  -- linkedin_url-Fallback: alte Sales-Nav-Zeilen haben oft keine URL, aber eine
  -- namensgleiche Dublette (Profil-Scrape) hat sie. Nur uebernehmen wenn EINDEUTIG.
  IF v_row.linkedin_url IS NULL AND NULLIF(v_row.name,'') IS NOT NULL THEN
    WITH sib AS (
      SELECT DISTINCT linkedin_url FROM public.linkedin_inbox
      WHERE team_id = v_row.team_id AND lower(name) = lower(v_row.name) AND linkedin_url IS NOT NULL
    )
    SELECT linkedin_url INTO v_row.linkedin_url FROM sib WHERE (SELECT count(*) FROM sib) = 1;
  END IF;

  -- Idempotenz: bereits promoted → bestehenden Lead zurückgeben.
  IF v_row.review_status = 'promoted' AND v_row.promoted_lead_id IS NOT NULL THEN
    RETURN v_row.promoted_lead_id;
  END IF;

  -- Dedup gegen leads (inkl. archivierter). Nicht-archivierte bevorzugt.
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE team_id = v_row.team_id
    AND (
      (v_row.sales_nav_id IS NOT NULL AND sales_nav_id = v_row.sales_nav_id)
      OR (v_row.sales_nav_id IS NULL AND v_row.linkedin_url IS NOT NULL
          AND linkedin_url = v_row.linkedin_url)
    )
  ORDER BY archived ASC
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    -- Bestehenden (ggf. archivierten) Lead anreichern + reaktivieren.
    UPDATE public.leads SET
      first_name       = COALESCE(first_name,       v_row.first_name),
      last_name        = COALESCE(last_name,        v_row.last_name),
      name             = COALESCE(NULLIF(name, ''), NULLIF(v_row.name, '')),
      job_title        = COALESCE(job_title,        v_row.job_title),
      company          = COALESCE(company,          v_row.company),
      location         = COALESCE(location,         v_row.location),
      avatar_url       = COALESCE(avatar_url,       v_row.avatar_url),
      linkedin_url     = COALESCE(linkedin_url,     v_row.linkedin_url),
      headline         = COALESCE(headline,         v_row.headline),
      li_about_summary = COALESCE(li_about_summary, v_row.li_about_summary),
      sales_nav_id     = COALESCE(sales_nav_id,     v_row.sales_nav_id),
      archived         = false,
      archived_at      = NULL
    WHERE id = v_lead_id;
  ELSE
    -- Neuer Lead.
    INSERT INTO public.leads (
      team_id, user_id, source, sales_nav_id, name, first_name, last_name,
      job_title, company, location, avatar_url, linkedin_url, headline,
      li_about_summary, status, lead_status, original_source, last_synced_at
    ) VALUES (
      v_row.team_id, v_row.user_id, v_row.source, v_row.sales_nav_id,
      COALESCE(NULLIF(v_row.name, ''), 'Unbekannt'),
      v_row.first_name, v_row.last_name, v_row.job_title, v_row.company,
      v_row.location, v_row.avatar_url, v_row.linkedin_url, v_row.headline,
      v_row.li_about_summary, 'Lead', 'new', 'linkedin', now()
    )
    RETURNING id INTO v_lead_id;
  END IF;

  UPDATE public.linkedin_inbox
     SET review_status = 'promoted', promoted_lead_id = v_lead_id
   WHERE id = p_inbox_id;

  RETURN v_lead_id;
END;
$function$


