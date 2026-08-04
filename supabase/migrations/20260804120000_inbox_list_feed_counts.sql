-- Autoritative Listen-Ansicht + echte Counts.
-- Bug: Listenansicht schnitt Member gegen Recency-Feed (max 1000); zusaetzlich
-- lud useInboxLists inbox_list_members ohne Pagination -> PostgREST-Cap 1000.
-- Bei Marken mit >1000 Member gesamt verloren Listen im Client ihre Mitglieder
-- -> "Liste nach Refresh leer". Fix: Listeninhalt + Counts server-seitig.

CREATE OR REPLACE FUNCTION public.inbox_list_feed(
  p_list_id uuid, p_limit int DEFAULT 1000, p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, source text, sales_nav_id text, linkedin_url text, name text,
  first_name text, last_name text, headline text, job_title text, company text,
  location text, avatar_url text, imported_at timestamptz, promoted_lead_id uuid,
  provider_id text, in_crm boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lim int := greatest(1, least(coalesce(p_limit,1000), 2000));
  v_off int := greatest(0, coalesce(p_offset,0));
  v_ok  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM inbox_lists il
    WHERE il.id = p_list_id
      AND (
        il.user_id = auth.uid()
        OR public.has_brand_access(il.brand_voice_id)
        OR (il.is_shared = true AND il.team_id IN (
              SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()))
        OR (il.brand_voice_id IS NULL AND il.team_id IN (
              SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()))
      )
  ) INTO v_ok;
  IF NOT v_ok THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.id, b.source, b.sales_nav_id, b.linkedin_url, b.name,
         b.first_name, b.last_name, b.headline, b.job_title, b.company,
         b.location, b.avatar_url, b.imported_at, b.promoted_lead_id, b.provider_id,
         (b.sales_nav_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM leads le WHERE le.sales_nav_id = b.sales_nav_id AND le.archived = false)) AS in_crm
  FROM inbox_list_members m
  JOIN linkedin_inbox b ON b.id = m.inbox_id
  WHERE m.list_id = p_list_id
  ORDER BY b.imported_at DESC
  LIMIT v_lim OFFSET v_off;
END $function$;

CREATE OR REPLACE FUNCTION public.inbox_list_counts(p_list_ids uuid[])
RETURNS TABLE(list_id uuid, n bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT m.list_id, count(*)::bigint
  FROM inbox_list_members m
  WHERE m.list_id = ANY(p_list_ids)
    AND EXISTS (
      SELECT 1 FROM inbox_lists il
      WHERE il.id = m.list_id
        AND (
          il.user_id = auth.uid()
          OR public.has_brand_access(il.brand_voice_id)
          OR (il.is_shared = true AND il.team_id IN (
                SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()))
          OR (il.brand_voice_id IS NULL AND il.team_id IN (
                SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()))
        )
    )
  GROUP BY m.list_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.inbox_list_feed(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_list_counts(uuid[])       TO authenticated;
