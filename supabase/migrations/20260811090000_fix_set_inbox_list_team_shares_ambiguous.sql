-- ============================================================================
-- FIX: set_inbox_list_team_shares wirft "team_id is ambiguous"
-- Ursache: OUT-Spalte team_id (RETURNS TABLE) kollidiert mit Spalte team_id
-- (u.a. ON CONFLICT (inbox_list_id, team_id)). plpgsql default variable_conflict=error.
-- Fix: #variable_conflict use_column — bare Bezeichner lösen auf die SPALTE auf.
-- Rückgabe ist positional (RETURN QUERY), Result-Spalten team_id/team_name bleiben
-- → Frontend-API unverändert. Reine CREATE-OR-REPLACE, reversibel.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.set_inbox_list_team_shares(p_list_id uuid, p_team_ids uuid[])
RETURNS TABLE(team_id uuid, team_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
#variable_conflict use_column
DECLARE
  v_owner   uuid;
  v_allowed uuid[];
  v_targets uuid[];
BEGIN
  SELECT il.user_id INTO v_owner FROM public.inbox_lists il WHERE il.id = p_list_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Liste % nicht gefunden', p_list_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Nicht berechtigt: nur der Eigentümer der Liste darf die Freigabe ändern'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_allowed := get_my_team_ids();
  SELECT COALESCE(array_agg(DISTINCT t), '{}'::uuid[])
    INTO v_targets
    FROM unnest(COALESCE(p_team_ids, '{}'::uuid[])) AS t
    WHERE t = ANY (v_allowed);

  DELETE FROM public.inbox_list_team_shares s
   WHERE s.inbox_list_id = p_list_id
     AND NOT (s.team_id = ANY (v_targets));

  INSERT INTO public.inbox_list_team_shares (inbox_list_id, team_id, shared_by)
  SELECT p_list_id, t, auth.uid() FROM unnest(v_targets) AS t
  ON CONFLICT (inbox_list_id, team_id) DO NOTHING;

  UPDATE public.inbox_lists il
     SET is_shared = (cardinality(v_targets) > 0), updated_at = now()
   WHERE il.id = p_list_id;

  RETURN QUERY
    SELECT s.team_id, tm.name
      FROM public.inbox_list_team_shares s
      JOIN public.teams tm ON tm.id = s.team_id
     WHERE s.inbox_list_id = p_list_id
     ORDER BY tm.name;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_inbox_list_team_shares(uuid, uuid[]) TO authenticated, service_role;

COMMIT;
