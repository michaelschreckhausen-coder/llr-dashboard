-- ============================================================================
-- inbox_list_status_counts — die drei Zahlen einer Liste aus EINER Quelle
-- ----------------------------------------------------------------------------
-- Anlass: fuer dieselbe Liste nennt die Oberflaeche 23 und die Automatisierung 27, die
-- Liste hat 35 Mitglieder. Alle drei sind richtig gerechnet, beantworten aber
-- verschiedene Fragen. Der Chip soll das offenlegen statt es zu verstecken.
--
-- Warum SECURITY DEFINER und nicht per PostgREST-Embedding:
-- la-audience liest die Mitglieder mit service_role, ein Nutzer liest unter RLS. Auf
-- linkedin_inbox greifen linkedin_inbox_brand (has_brand_linkedin_scope(...,'network'))
-- und linkedin_inbox_shared_list_read (inbox_in_shared_list(id)). Fuer eine EIGENE, nicht
-- geteilte Liste in einer Marke ohne network-Scope sieht der Nutzer den Chip, aber die
-- Mitglieds-Zeilen nicht — eine Zaehlung unter RLS haette dort zu wenig gezaehlt und das
-- naechste „drei Zahlen, eine Liste" eingebaut. Diese Funktion zaehlt deshalb ohne
-- Zeilen-RLS und autorisiert stattdessen PRO LISTE, genau wie inbox_lists_brand_read.
--
-- Eine Abfrage fuer alle Listen (uuid[]), kein N+1.
-- for_campaigns spiegelt exakt den Listen-Zweig von la-audience: review_status <>
-- 'dismissed' (siehe f65b3c6). Wer die Definition dort aendert, muss sie hier nachziehen.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.inbox_list_status_counts(p_list_ids uuid[])
RETURNS TABLE(list_id uuid, mitglieder integer, fuer_kampagnen integer, aussortiert integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.list_id,
         count(*)::int                                                        AS mitglieder,
         count(*) FILTER (WHERE li.review_status <> 'dismissed')::int          AS fuer_kampagnen,
         count(*) FILTER (WHERE li.review_status =  'dismissed')::int          AS aussortiert
    FROM public.inbox_list_members m
    JOIN public.linkedin_inbox li ON li.id = m.inbox_id
    JOIN public.inbox_lists il    ON il.id = m.list_id
   WHERE m.list_id = ANY(p_list_ids)
     -- Autorisierung pro Liste, gespiegelt von inbox_lists_brand_read:
     AND ( il.user_id = auth.uid()
        OR public.has_brand_access(il.brand_voice_id)
        OR il.id = ANY(public.inbox_list_ids_shared_with_me())
        OR (il.brand_voice_id IS NULL AND il.team_id = ANY(public.get_my_team_ids())) )
   GROUP BY m.list_id;
$function$;

REVOKE ALL   ON FUNCTION public.inbox_list_status_counts(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.inbox_list_status_counts(uuid[]) TO authenticated, service_role;

COMMIT;

\echo '--- Verify: Signatur, DEFINER, ACL (kein PUBLIC) ---'
SELECT p.oid::regprocedure AS signatur, p.prosecdef, p.provolatile
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='inbox_list_status_counts';
SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname='inbox_list_status_counts' ORDER BY 1;

NOTIFY pgrst, 'reload schema';
