-- 20260630100200_get_or_create_sponsor_profile.sql
-- Sponsor = Unternehmen (1:1-Extension), Phase 2: Lazy-Helper.
-- Liefert die Extension-Row zu einem Unternehmen; legt sie an, falls fehlend.
-- Team-Check via user_in_team(org.team_id). SECURITY DEFINER.
-- ANWENDEN VOR 1b möglich: macht zuerst name nullable (guarded), damit der
-- nameless Insert schon vor dem Spalten-Drop funktioniert (Lazy-Create-Pfad
-- testbar). 1b droppt name/website/linkedin_url später ganz.
-- status/cycle_stage haben Defaults 'lead'/0.

-- name nullable machen, solange die Spalte existiert (Idempotenz nach 1b).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='sponsoring' AND table_name='sponsor_profiles' AND column_name='name') THEN
    ALTER TABLE sponsoring.sponsor_profiles ALTER COLUMN name DROP NOT NULL;
  END IF;
END $$;

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
