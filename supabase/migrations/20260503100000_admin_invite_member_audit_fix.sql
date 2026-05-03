-- ================================================================
-- Leadesk: admin_invite_member Audit-Target-Fix (Sub-Inkrement 4.2.1)
-- ================================================================
--
-- Symptom: Member-Audit-Einträge tauchen im AuditTab.jsx der Account-
-- Detail-Page nicht auf — der Frontend-Filter setzt
--   .eq('target_table', 'accounts').eq('target_id', accountId)
-- voraus, der erste admin_invite_member-Body schrieb aber
--   target_table='team_members', target_id=v_user_id.
--
-- Fix: target_table='accounts', target_id=p_account_id. Member-Details
-- (user_id, user_email, team_id, team_role, was_created) wandern ins
-- after_value-jsonb-Payload. Frontend bleibt unverändert — der existing
-- AuditTab-Filter passt damit ohne Refactor.
--
-- Hinweis: Die zwei alten Member-Audit-Einträge aus den Sub-4.2-Smoke-
-- tests (Test 1+4) bleiben mit target_table='team_members' bestehen.
-- Werden im AuditTab nicht sichtbar, sind aber für SQL-basierte Audits
-- weiter abrufbar. Cleanup eigener Sub falls nötig.
--
-- Auth + Body sonst unverändert zur 20260503090000_admin_invite_member.
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

  -- Default-Team-Resolution (ältestes Team)
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
    -- p_password Pflicht wenn create_if_missing=true
    IF p_password IS NULL THEN
      RAISE EXCEPTION 'password_required_for_create' USING errcode = 'P0001';
    END IF;

    PERFORM public.admin_create_user(p_email, p_password, p_full_name, 'user');
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    v_was_created := true;
  END IF;

  -- Duplicate-Membership-Check
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = v_team_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'already_member' USING errcode = 'P0001';
  END IF;

  -- Insert Membership
  INSERT INTO public.team_members (team_id, user_id, role, is_active, joined_at)
  VALUES (v_team_id, v_user_id, p_role::user_role, true, NOW());

  -- Audit-Trail (Sub-4.2.1-Fix: target=accounts, Details ins jsonb)
  INSERT INTO public.admin_audit_log (
    admin_user_id,
    action,
    target_table,
    target_id,
    before_value,
    after_value,
    reason
  ) VALUES (
    auth.uid(),
    'invite_member',
    'accounts',
    p_account_id,
    NULL,
    jsonb_build_object(
      'user_id',     v_user_id,
      'user_email',  p_email,
      'team_id',     v_team_id,
      'team_role',   p_role,
      'was_created', v_was_created
    ),
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
