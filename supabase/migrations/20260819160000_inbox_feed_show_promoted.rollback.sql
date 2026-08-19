-- ROLLBACK zu 20260819160000_inbox_feed_show_promoted.sql
-- Stellt den Stand aus 20260812130000_inbox_feed_own_brand_flag.sql wieder her:
-- Filter zurueck auf review_status='new', in_crm zurueck auf den reinen
-- sales_nav_id-Match. Signatur unveraendert, CREATE OR REPLACE, kein DROP.
-- Folge des Rueckbaus: uebernommene Kontakte verschwinden wieder aus der Kontakte-Liste,
-- die Chip-Zahl faellt zurueck auf die Zahl der ungesichteten Zeilen — und weicht damit
-- wieder von der Zielgruppen-Zahl in der Automatisierung ab. Rein Anzeige, keine Daten.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.inbox_feed(p_brand_voice_id uuid, p_mode text, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, source text, sales_nav_id text, linkedin_url text, name text, first_name text, last_name text, headline text, job_title text, company text, location text, avatar_url text, imported_at timestamp with time zone, promoted_lead_id uuid, provider_id text, in_crm boolean, own_brand boolean)
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
    -- own-brand-Rows ZUERST ins 1000er-Fenster, damit der Default-View (own_brand)
    -- nie von vielen Shared-List-Rows ausgehungert wird; dann neueste zuerst.
    ORDER BY COALESCE(li.brand_voice_id = p_brand_voice_id AND v_net, false) DESC, li.imported_at DESC
    LIMIT v_lim
  )
  SELECT b.id,b.source,b.sales_nav_id,b.linkedin_url,b.name,b.first_name,b.last_name,b.headline,b.job_title,b.company,
         b.location,b.avatar_url,b.imported_at,b.promoted_lead_id,b.provider_id,
         (b.sales_nav_id is not null and exists(select 1 from leads le where le.sales_nav_id=b.sales_nav_id and le.archived=false)) as in_crm,
         COALESCE(b.brand_voice_id = p_brand_voice_id AND v_net, false) as own_brand
  FROM base b;
END $function$;


COMMIT;

\echo '--- Verify: Filter wieder auf new, kein promoted ---'
SELECT (pg_get_functiondef(p.oid) LIKE '%review_status = ''new''%')     AS filter_alt,
       (pg_get_functiondef(p.oid) LIKE '%''promoted''%')                AS promoted_im_body_MUSS_F
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='inbox_feed';
NOTIFY pgrst, 'reload schema';
