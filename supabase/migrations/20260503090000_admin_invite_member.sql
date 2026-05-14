-- ================================================================
-- Leadesk: admin_invite_member-RPC (Sub-Inkrement 4.2)
-- ================================================================
--
-- Honest add-member-Flow für admin.leadesk.de Members-Tab.
-- Schließt eine der zwei Audit-Lücken aus Inkrement 4 (admin_create_
-- user-Aufruf war "global anlegen, kein Team-Bezug" — diese RPC stellt
-- den Team-Bezug her und schreibt admin_audit_log).
--
-- Modes:
--   p_create_if_missing=false → User muss existieren, sonst Fehler
--   p_create_if_missing=true  → Falls fehlt, via admin_create_user
--                               anlegen (p_password Pflicht in dem Fall)
--
-- Default-Team-Resolution (Sub-4.2-Entscheidung Option (c)):
--   ältestes Team des Accounts via ORDER BY created_at ASC LIMIT 1.
--   Tech-Debt für Mehr-Team-Accounts → Sub-Inkrement 4.4.
--
-- Auth: is_leadesk_admin-JWT-Claim (Phase 1.6 Lockdown-Pattern).
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_invite_member(
  p_account_id        uuid,
  p_email             text,
  p_role              text DEFAULT 'member',
  p_create_if_missing boolean DEFAULT false,
  p_password          text DEFAULT NULL,
  p_full_name         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id     uuid;
  v_team_id     uuid;
  v_was_created boolean := false;
BEGIN
  -- Auth-Lockdown
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- Default-Team-Resolution (ältestes Team des Accounts)
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE account_id = p_account_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'account_has_no_team' USING errcode = 'P0001';
  END IF;

  -- Existing-User-Lookup
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL AND NOT p_create_if_missing THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0001';
  END IF;

  IF v_user_id IS NULL THEN
    -- p_create_if_missing=true & user fehlt → admin_create_user verlangt
    -- non-NULL p_password (sonst crypt(NULL,...)-Crash). Frühzeitig prüfen
    -- damit Fehler im RPC-Body, nicht im Aufruf, geworfen wird.
    IF p_password IS NULL THEN
      RAISE EXCEPTION 'password_required_for_create' USING errcode = 'P0001';
    END IF;

    PERFORM public.admin_create_user(p_email, p_password, p_full_name, 'user');
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    v_was_created := true;
  END IF;

  -- Duplicate-Membership-Check (Same-Team-Same-User)
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = v_team_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'already_member' USING errcode = 'P0001';
  END IF;

  -- Insert Membership
  INSERT INTO public.team_members (team_id, user_id, role, is_active, joined_at)
  VALUES (v_team_id, v_user_id, p_role::user_role, true, NOW());

  -- Audit-Trail
  -- Spaltennamen gegen echtes admin_audit_log-Schema verifiziert:
  --   admin_user_id (NOT actor_user_id), action (NOT action_type),
  --   before_value / after_value als jsonb (NOT old/new_value text).
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    auth.uid(),
    'invite_member',
    'team_members',
    v_user_id,
    'team_id',
    NULL,
    to_jsonb(v_team_id),
    CASE WHEN v_was_created
         THEN 'invited new user to team'
         ELSE 'invited existing user to team' END
  );

  RETURN jsonb_build_object(
    'user_id',     v_user_id,
    'team_id',     v_team_id,
    'was_created', v_was_created
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_invite_member(uuid, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_invite_member(uuid, text, text, boolean, text, text) TO authenticated;
