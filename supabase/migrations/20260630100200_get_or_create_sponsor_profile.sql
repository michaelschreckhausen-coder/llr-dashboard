-- 20260630100200_get_or_create_sponsor_profile.sql
-- Sponsor = Unternehmen (1:1-Extension), Phase 2: Lazy-Helper.
-- Liefert die Extension-Row zu einem Unternehmen; legt sie an, falls fehlend.
-- Team-Check via user_in_team(org.team_id). SECURITY DEFINER.
-- ANWENDEN NACH 1b (Insert setzt KEIN name mehr — name ist dann gedroppt;
-- status/cycle_stage haben Defaults 'lead'/0).

CREATE OR REPLACE FUNCTION public.get_or_create_sponsor_profile(p_organization_id uuid)
RETURNS sponsoring.sponsor_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'sponsoring', 'pg_temp'
AS $function$
DECLARE
  v_team uuid;
  v_row  sponsoring.sponsor_profiles;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id required'; END IF;

  SELECT team_id INTO v_team FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization % not found', p_organization_id; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'not authorized for this team'; END IF;

  SELECT * INTO v_row FROM sponsoring.sponsor_profiles WHERE organization_id = p_organization_id;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO sponsoring.sponsor_profiles (organization_id, team_id)
  VALUES (p_organization_id, v_team)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_sponsor_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_sponsor_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
