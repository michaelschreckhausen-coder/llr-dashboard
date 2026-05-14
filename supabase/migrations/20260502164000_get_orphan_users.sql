-- ================================================================
-- Leadesk: get_orphan_users-RPC
-- ================================================================
--
-- Liefert auth.users, die KEINEN Account haben (weder als owner_user_id
-- in accounts noch als user_id in team_members). Diagnose-Sicht für
-- admin.leadesk.de — zeigt User, bei denen der handle_new_user-Trigger
-- fehlgeschlagen ist (oder die anderweitig ohne Account in der DB sitzen).
--
-- Im Idealfall ist die Liste leer. last_sign_in_at hilft Debug:
-- "Hat sich der Orphan jemals eingeloggt?"
--
-- READ-ONLY: keine Reparatur-Aktion in der UI. Reparatur ist eine
-- separate Trigger-Session (handle_new_user erweitern um accounts/
-- teams/team_members-Inserts).
--
-- Auth: is_leadesk_admin-JWT-Claim.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_orphan_users()
RETURNS TABLE(
  id               uuid,
  email            text,
  full_name        text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.full_name::text,
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.owner_user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.user_id = u.id
  )
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_orphan_users() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_orphan_users() TO authenticated;
