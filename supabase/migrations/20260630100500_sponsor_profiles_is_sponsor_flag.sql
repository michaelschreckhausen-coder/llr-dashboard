-- 20260630100500_sponsor_profiles_is_sponsor_flag.sql
-- Explizite Sponsor-Markierung: ein CRM-Unternehmen wird nur durch is_sponsor=true
-- zum Sponsor und erscheint nur dann in der Sponsoren-Lens. Das bloße Öffnen des
-- Sponsoring-Tabs (lazy Extension) markiert NICHT mehr automatisch.
-- Backfill mit Signal (nicht blind alle true): nur Extensions mit echtem Sponsor-
-- Signal (offers/contracts ODER status<>'lead' ODER fit_score ODER expected_value).

BEGIN;

ALTER TABLE sponsoring.sponsor_profiles
  ADD COLUMN IF NOT EXISTS is_sponsor boolean NOT NULL DEFAULT false;

-- Backfill (idempotent: nur false→true wo Signal vorhanden)
UPDATE sponsoring.sponsor_profiles sp
SET is_sponsor = true
WHERE sp.is_sponsor = false AND (
      exists (select 1 from sponsoring.offers x    where x.sponsor_profile_id = sp.id)
   or exists (select 1 from sponsoring.contracts x where x.sponsor_profile_id = sp.id)
   or sp.status <> 'lead'
   or sp.fit_score is not null
   or sp.expected_value is not null
);

CREATE INDEX IF NOT EXISTS idx_sponsor_profiles_team_is_sponsor
  ON sponsoring.sponsor_profiles(team_id, is_sponsor);

-- ── RPCs: explizite Markierung (einzeln + Bulk), Team-gated via get_or_create ──
CREATE OR REPLACE FUNCTION public.mark_sponsor(p_organization_id uuid, p_is_sponsor boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'sponsoring', 'pg_temp'
AS $function$
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id required'; END IF;
  -- get_or_create_sponsor_profile macht den user_in_team-Check + legt die Extension lazy an
  PERFORM public.get_or_create_sponsor_profile(p_organization_id);
  UPDATE sponsoring.sponsor_profiles
     SET is_sponsor = COALESCE(p_is_sponsor, false), updated_at = now()
   WHERE organization_id = p_organization_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_sponsors(p_org_ids uuid[], p_is_sponsor boolean)
 RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'sponsoring', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_n int := 0;
BEGIN
  IF p_org_ids IS NULL THEN RETURN 0; END IF;
  -- bewusst je Org einzeln (kein .in()-Bulk → Silent-Fail-Schutz); jede mit eigenem Team-Check
  FOREACH v_id IN ARRAY p_org_ids LOOP
    PERFORM public.mark_sponsor(v_id, p_is_sponsor);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_sponsor(uuid, boolean) FROM public;
REVOKE ALL ON FUNCTION public.mark_sponsors(uuid[], boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_sponsor(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sponsors(uuid[], boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
