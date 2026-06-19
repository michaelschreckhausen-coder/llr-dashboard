-- 20260629100000_addon_rpcs_active_account_resolution.sql
-- get_my_addons() + i_have_addon() lösten den Account bisher via `LIMIT 1` OHNE
-- ORDER BY auf → bei Multi-Account-Usern (Agenturen/Berater, Member in mehreren
-- Accounts) nicht-deterministisch und IGNORIERT user_preferences.active_team_id.
-- Inkonsistent mit activate_addon()/get_my_entitlements(), die den aktiven Account
-- priorisieren. Folge: Addon auf dem AKTIVEN Account aktiviert, aber der Gate-Read
-- traf einen ANDEREN Account → Addon erscheint fälschlich nicht abonniert (Gate blockt).
-- Entdeckt 2026-06-19 beim Strike2-Prod-Cutover (michael@leadesk.de, 5 Accounts:
-- get_my_addons griff 'Linkedin Consulting', strike2 war auf SALESPLAY aktiv).
-- Fix: Account-Auflösung exakt wie activate_addon (active_team_id-priorisiert).
-- Reine RPC-Logik (CREATE OR REPLACE), idempotent, kein Schema-Change.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_addons()
 RETURNS TABLE(addon_id uuid, slug text, name text, category text, type text, status text, activated_at timestamp with time zone, current_period_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id uuid;
BEGIN
  -- Account über aktives Team auflösen (gleiche Logik wie activate_addon/get_my_entitlements)
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  LEFT JOIN public.user_preferences up ON up.user_id = auth.uid()
  WHERE tm.user_id = auth.uid()
    AND t.account_id IS NOT NULL
    AND (up.active_team_id IS NULL OR up.active_team_id = t.id)
  ORDER BY (up.active_team_id = t.id) DESC NULLS LAST, t.created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id, a.slug, a.name, a.category, a.type,
         aa.status, aa.activated_at, aa.current_period_end
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = v_account_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.i_have_addon(p_slug text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id uuid;
  v_count integer;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  LEFT JOIN public.user_preferences up ON up.user_id = auth.uid()
  WHERE tm.user_id = auth.uid()
    AND t.account_id IS NOT NULL
    AND (up.active_team_id IS NULL OR up.active_team_id = t.id)
  ORDER BY (up.active_team_id = t.id) DESC NULLS LAST, t.created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = v_account_id
    AND a.slug = p_slug
    AND aa.status = 'active';

  RETURN v_count > 0;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
