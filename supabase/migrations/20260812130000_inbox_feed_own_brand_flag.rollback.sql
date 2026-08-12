-- ROLLBACK: inbox_feed ohne own_brand-Spalte wiederherstellen (Vor-Fix-Stand).
BEGIN;
DROP FUNCTION IF EXISTS public.inbox_feed(uuid, text, integer);
CREATE FUNCTION public.inbox_feed(p_brand_voice_id uuid, p_mode text, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, source text, sales_nav_id text, linkedin_url text, name text, first_name text, last_name text, headline text, job_title text, company text, location text, avatar_url text, imported_at timestamp with time zone, promoted_lead_id uuid, provider_id text, in_crm boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lim int := greatest(1, least(coalesce(p_limit,500), 1000));
  v_net boolean := public.has_brand_linkedin_scope(p_brand_voice_id, 'network');
BEGIN
  IF NOT public.has_brand_access(p_brand_voice_id) THEN RETURN; END IF;
  RETURN QUERY
  WITH sl AS (
    SELECT il.id FROM inbox_lists il
    WHERE il.is_shared = true
      AND il.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())
  ),
  base AS (
    SELECT li.* FROM linkedin_inbox li
    WHERE li.review_status = 'new'
      AND ( (p_mode = 'netzwerk' AND li.source = 'unipile_relations')
         OR (p_mode <> 'netzwerk' AND (li.source <> 'unipile_relations' OR li.is_prospect = true)) )
      AND ( (li.brand_voice_id = p_brand_voice_id AND v_net)
         OR EXISTS (SELECT 1 FROM inbox_list_members m WHERE m.inbox_id = li.id AND m.list_id IN (SELECT sl.id FROM sl)) )
    ORDER BY li.imported_at DESC
    LIMIT v_lim
  )
  SELECT b.id,b.source,b.sales_nav_id,b.linkedin_url,b.name,b.first_name,b.last_name,b.headline,b.job_title,b.company,
         b.location,b.avatar_url,b.imported_at,b.promoted_lead_id,b.provider_id,
         (b.sales_nav_id is not null and exists(select 1 from leads le where le.sales_nav_id=b.sales_nav_id and le.archived=false)) as in_crm
  FROM base b;
END $function$;
COMMIT;
