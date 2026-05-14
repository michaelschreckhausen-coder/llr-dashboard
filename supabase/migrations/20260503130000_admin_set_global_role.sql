-- ================================================================
-- Leadesk: admin_set_global_role-RPC (Sub-Inkrement 4.3)
-- ================================================================
--
-- Audit-Trail für Rollen-Änderungen aus dem Members-Tab. Schließt eine
-- der zwei verbleibenden Audit-Lücken aus Inkrement 4 (admin_set_role
-- hatte keinen Reason-Param + kein Audit-Insert).
--
-- Trennung von admin_set_role: das alte RPC bleibt unangetastet, weil
-- evtl. andere Caller existieren. Frontend in admin.leadesk.de migriert
-- auf admin_set_global_role.
--
-- Audit-Format konsistent mit invite_member / plan_change:
--   action='set_global_role'
--   target_table='accounts', target_id=p_account_id
--   before_value/after_value = jsonb {user_id, user_email, role}
--   reason >= 10 Zeichen
--
-- Auth: is_leadesk_admin-JWT-Claim.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_set_global_role(
  p_user_id    uuid,
  p_new_role   text,
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
  v_old_role   text;
  v_user_email text;
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

  -- Old-Role + Email für Audit-Snapshot
  SELECT global_role::text INTO v_old_role
  FROM public.profiles WHERE id = p_user_id;
  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'User not found in profiles: %', p_user_id;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- Update + Audit (implicit txn)
  UPDATE public.profiles
  SET global_role = p_new_role::user_role
  WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id,
    'set_global_role',
    'accounts',
    p_account_id,
    NULL,
    jsonb_build_object(
      'user_id',    p_user_id,
      'user_email', v_user_email,
      'role',       v_old_role
    ),
    jsonb_build_object(
      'user_id',    p_user_id,
      'user_email', v_user_email,
      'role',       p_new_role
    ),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'user_id',  p_user_id,
    'old_role', v_old_role,
    'new_role', p_new_role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_global_role(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_global_role(uuid, text, uuid, text) TO authenticated;
