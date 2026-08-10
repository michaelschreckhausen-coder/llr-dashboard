-- ============================================================================
-- FIX: infinite recursion in policy for relation "inbox_lists"
-- Folgt auf 20260810150000_inbox_list_team_shares.sql.
-- Gegenseitige RLS-Rekursion inbox_lists <-> inbox_list_team_shares mit zwei
-- SECURITY-DEFINER-Helpern brechen (RLS-Bypass im Body, Muster get_my_team_ids()).
-- Idempotent (CREATE OR REPLACE / DROP+CREATE POLICY), additiv, reversibel.
-- Bereits auf Prod (128.140.123.163) + Staging (178.104.210.216) appliziert 2026-08-10.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.inbox_list_ids_shared_with_me()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(array_agg(s.inbox_list_id), '{}'::uuid[])
  FROM public.inbox_list_team_shares s
  WHERE s.team_id = ANY (get_my_team_ids());
$fn$;
GRANT EXECUTE ON FUNCTION public.inbox_list_ids_shared_with_me() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_inbox_list_owner(p_inbox_list_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.inbox_lists il
                 WHERE il.id = p_inbox_list_id AND il.user_id = auth.uid());
$fn$;
GRANT EXECUTE ON FUNCTION public.is_inbox_list_owner(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS inbox_lists_brand_read ON public.inbox_lists;
CREATE POLICY inbox_lists_brand_read ON public.inbox_lists
  FOR SELECT USING (
    (user_id = uid())
    OR has_brand_access(brand_voice_id)
    OR (id = ANY (inbox_list_ids_shared_with_me()))
    OR ((brand_voice_id IS NULL) AND (team_id = ANY (get_my_team_ids())))
  );

DROP POLICY IF EXISTS ilts_select ON public.inbox_list_team_shares;
CREATE POLICY ilts_select ON public.inbox_list_team_shares
  FOR SELECT USING (
    team_id = ANY (get_my_team_ids())
    OR is_inbox_list_owner(inbox_list_id)
  );

DROP POLICY IF EXISTS ilts_insert ON public.inbox_list_team_shares;
CREATE POLICY ilts_insert ON public.inbox_list_team_shares
  FOR INSERT WITH CHECK ( is_inbox_list_owner(inbox_list_id) );

DROP POLICY IF EXISTS ilts_delete ON public.inbox_list_team_shares;
CREATE POLICY ilts_delete ON public.inbox_list_team_shares
  FOR DELETE USING ( is_inbox_list_owner(inbox_list_id) );

COMMIT;
