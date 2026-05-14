-- ================================================================
-- Leadesk: admin_remove_member-RPC (Sub-Inkrement 4.3)
-- ================================================================
--
-- Audit-Trail für Member-Removes aus dem Members-Tab. Schließt die
-- letzte Audit-Lücke aus Inkrement 4 (Frontend nutzte Direct-DELETE
-- auf team_members ohne Audit-Insert + nur window.confirm-Friction).
--
-- Atomic: DELETE + Audit-Insert in einer impliziten Transaktion. Kein
-- partial-state Risiko (vs. Direct-DELETE + Frontend-side Audit-Call).
--
-- Audit-Format konsistent mit invite_member / set_global_role:
--   action='remove_member'
--   target_table='accounts', target_id=p_account_id
--   before_value = jsonb {user_id, user_email, team_id, team_name, team_role}
--   after_value  = NULL (Member ist weg)
--   reason >= 10 Zeichen
--
-- Auth: is_leadesk_admin-JWT-Claim.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_remove_member(
  p_user_id    uuid,
  p_team_id    uuid,
  p_account_id uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_team_role  text;
  v_user_email text;
  v_team_name  text;
BEGIN
  -- Auth
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  -- Reason-Pflicht
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)';
  END IF;

  -- Pre-Read für Audit-Snapshot (vor DELETE — sonst Race-Condition)
  SELECT role::text INTO v_team_role
  FROM public.team_members
  WHERE user_id = p_user_id AND team_id = p_team_id;
  IF v_team_role IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0001';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  SELECT name  INTO v_team_name  FROM public.teams      WHERE id = p_team_id;

  -- Delete + Audit
  DELETE FROM public.team_members
  WHERE user_id = p_user_id AND team_id = p_team_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id,
    'remove_member',
    'accounts',
    p_account_id,
    NULL,
    jsonb_build_object(
      'user_id',    p_user_id,
      'user_email', v_user_email,
      'team_id',    p_team_id,
      'team_name',  v_team_name,
      'team_role',  v_team_role
    ),
    NULL,
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'user_id',      p_user_id,
    'team_id',      p_team_id,
    'removed_role', v_team_role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_remove_member(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_remove_member(uuid, uuid, uuid, text) TO authenticated;
