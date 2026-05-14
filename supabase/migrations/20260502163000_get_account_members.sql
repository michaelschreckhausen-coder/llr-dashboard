-- ================================================================
-- Leadesk: get_account_members-RPC
-- ================================================================
--
-- Liefert alle Members eines Accounts mit Cross-Schema-Join
-- (auth.users + profiles + team_members + teams).
-- Verwendung im Members-Tab der Account-Detail-Page.
--
-- Returns pro Member-Row: user_id, email, full_name, team_id+name,
-- team-role (aus team_members.role), global-role (aus profiles.global_role),
-- is_active, joined_at, last_sign_in_at, invited_by.
--
-- ⚠ Verwendet bewusst profiles.global_role (user_role enum), NICHT
-- profiles.role (text legacy). Schema-Drift verifiziert 2026-05-02:
--   profiles.role        text         NOT NULL DEFAULT 'user'  (Legacy)
--   profiles.global_role user_role    NULLABLE DEFAULT 'user'  (Korrekt)
-- Tech-Debt-Cleanup (role-Spalte droppen) ist eigene Session.
--
-- Auth: is_leadesk_admin-JWT-Claim (Phase 1.3-Pattern).
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_account_members(p_account_id uuid)
RETURNS TABLE(
  user_id          uuid,
  email            text,
  full_name        text,
  team_id          uuid,
  team_name        text,
  role             user_role,
  global_role      user_role,
  is_active        boolean,
  joined_at        timestamptz,
  last_sign_in_at  timestamptz,
  invited_by       uuid
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
    tm.user_id,
    u.email::text,
    p.full_name::text,
    tm.team_id,
    t.name::text       AS team_name,
    tm.role,
    p.global_role,
    tm.is_active,
    tm.joined_at,
    u.last_sign_in_at,
    tm.invited_by
  FROM public.team_members tm
  JOIN public.teams t   ON t.id = tm.team_id
  JOIN auth.users u     ON u.id = tm.user_id
  LEFT JOIN public.profiles p ON p.id = tm.user_id
  WHERE t.account_id = p_account_id
  ORDER BY t.name, p.full_name NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_account_members(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_account_members(uuid) TO authenticated;
