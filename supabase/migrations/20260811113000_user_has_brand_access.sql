-- Brand-Zugriff für einen EXPLIZITEN User (nicht auth.uid()) — für Publish-EFs (service_role),
-- damit jeder der die Brand geteilt bekommen hat posten darf (nicht nur der Autor).
CREATE OR REPLACE FUNCTION public.user_has_brand_access(p_user_id uuid, p_brand_voice_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT p_brand_voice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM brand_voices bv WHERE bv.id = p_brand_voice_id AND (
      (bv.team_id IN (SELECT team_id FROM team_members WHERE user_id = p_user_id)
        AND (bv.user_id = p_user_id OR bv.is_shared = true))
      OR bv.id IN (SELECT brand_voice_id FROM brand_voice_shares WHERE user_id = p_user_id)
      OR bv.id IN (SELECT ts.brand_voice_id FROM brand_voice_team_shares ts
                   JOIN team_members tm ON tm.team_id = ts.team_id WHERE tm.user_id = p_user_id)
    )
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.user_has_brand_access(uuid, uuid) TO authenticated, service_role;
