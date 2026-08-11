-- SICHERHEITSFIX: content_brand_members darf NUR Mitglieder des aktiven Teams zeigen,
-- die zusätzlich Zugriff auf die Brand haben. KEINE team-übergreifenden User.
DROP FUNCTION IF EXISTS public.content_brand_members(uuid);
CREATE OR REPLACE FUNCTION public.content_brand_members(p_brand_voice_id uuid, p_team_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH acc AS (
    SELECT bv.user_id AS uid FROM brand_voices bv WHERE bv.id = p_brand_voice_id
    UNION
    SELECT tm.user_id FROM brand_voices bv JOIN team_members tm ON tm.team_id = bv.team_id
      WHERE bv.id = p_brand_voice_id AND bv.is_shared = true
    UNION
    SELECT s.user_id FROM brand_voice_shares s WHERE s.brand_voice_id = p_brand_voice_id
    UNION
    SELECT tm.user_id FROM brand_voice_team_shares ts JOIN team_members tm ON tm.team_id = ts.team_id
      WHERE ts.brand_voice_id = p_brand_voice_id
  )
  SELECT DISTINCT tm.user_id, p.full_name, p.email, p.avatar_url
  FROM team_members tm
  JOIN acc a ON a.uid = tm.user_id
  LEFT JOIN profiles p ON p.id = tm.user_id
  WHERE tm.team_id = p_team_id                       -- NUR aktives Team
    AND public.has_brand_access(p_brand_voice_id);   -- Caller-Gate
$fn$;
GRANT EXECUTE ON FUNCTION public.content_brand_members(uuid, uuid) TO authenticated;
