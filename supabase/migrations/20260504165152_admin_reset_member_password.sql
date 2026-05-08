-- Phase 5 Block 4: admin_reset_member_password (Hybrid-Pwd-Reset)
--
-- Decisions (Block-4-Discovery, finalized by Michael):
--   Q1=(i) RPC + Frontend resetPasswordForEmail (kein Edge-Function)
--   Q2=Force-Pwd-Change auf next Login: NEIN fuer Block 4 (Block 4.5 nachruesten)
--   Q3=Magic-Link-Warning conditional auf @leadesk.de (Postmark Sandbox-aware)
--   Q4=p_account_id-Param, Pattern matched admin_set_global_role / admin_remove_member
--
-- Architektur:
--   - SECURITY DEFINER, JWT-Claim-Auth-Gate (Top-Fallstrick #9)
--   - 4 Validierungen: method-enum, reason >=10 chars (matches CHECK),
--     target existence, account-membership (sec — verhindert Cross-Account-Reset)
--   - Rate-Limit: 3 Resets / 24h rolling pro Target via admin_audit_log
--   - Branch: temp_password schreibt encrypted_password via crypt(bf,10);
--             magic_link audit-only (Frontend ruft danach resetPasswordForEmail)
--   - Audit: action='member_pwd_reset', after_value mit method+account_id+timestamp,
--            KEIN raw pwd, KEIN encrypted_password-Hash
--
-- Reason-Min: 10 chars (admin_audit_log_reason_check), konsistent mit allen
--   anderen admin-RPCs der Block-1.x/2/3-Phase.
-- Bcrypt cost 10: gotrue-kompatibel (gotrue erwartet bcrypt-format).

CREATE OR REPLACE FUNCTION public.admin_reset_member_password(
  p_target_user_id uuid,
  p_account_id     uuid,
  p_method         text,         -- 'magic_link' | 'temp_password'
  p_reason         text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_admin_user_id uuid;
  v_recent_resets int;
  v_temp_pwd      text;
  v_target_email  text;
BEGIN
  -- 1. Auth-Gate (JWT-Claim, Pattern aus admin_grant_license_v2 etc.)
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean,
       false
     ) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;

  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Method-enum
  IF p_method NOT IN ('magic_link', 'temp_password') THEN
    RAISE EXCEPTION 'Invalid method: must be magic_link or temp_password'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Reason-min (matches admin_audit_log_reason_check)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Target existence + email-fetch fuer Frontend-Response
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Account-Membership-Check (sec — verhindert Cross-Account-Reset-Abuse)
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = p_target_user_id AND t.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Target user is not member of given account'
      USING ERRCODE = '22023';
  END IF;

  -- 6. Rate-Limit: 3 Resets / 24h rolling pro Target
  SELECT count(*) INTO v_recent_resets
  FROM public.admin_audit_log
  WHERE action = 'member_pwd_reset'
    AND target_id = p_target_user_id
    AND created_at > now() - interval '24 hours';

  IF v_recent_resets >= 3 THEN
    RAISE EXCEPTION 'Rate limit: max 3 password resets per 24h per user'
      USING ERRCODE = '53000';
  END IF;

  -- 7. Branch: temp_password vs magic_link
  IF p_method = 'temp_password' THEN
    -- Strong random pwd: gen_random_bytes(12) base64 = 16 chars,
    -- translate ersetzt URL-unsafe chars + padding.
    v_temp_pwd := translate(encode(gen_random_bytes(12), 'base64'), '/+=', 'XYZ');
    -- Defensive fallback wenn <14 chars (sollte nicht vorkommen, aber sicher ist sicher)
    IF length(v_temp_pwd) < 14 THEN
      v_temp_pwd := v_temp_pwd || encode(gen_random_bytes(3), 'hex');
    END IF;

    -- Bcrypt cost 10 (gotrue-kompatibel)
    UPDATE auth.users
    SET encrypted_password = crypt(v_temp_pwd, gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = p_target_user_id;

    -- Audit: KEIN raw pwd, KEIN hash. Pattern aus admin_grant_license_v2.
    INSERT INTO public.admin_audit_log (
      admin_user_id, action, target_table, target_id,
      before_value, after_value, reason
    ) VALUES (
      v_admin_user_id, 'member_pwd_reset', 'auth.users', p_target_user_id,
      NULL,
      jsonb_build_object(
        'method', 'temp_password',
        'account_id', p_account_id,
        'generated_at', now()
      ),
      p_reason
    );

    RETURN jsonb_build_object(
      'method', 'temp_password',
      'temp_password', v_temp_pwd,
      'target_email', v_target_email,
      'message', 'Temporäres Passwort generiert. Kopiere es JETZT — wird nicht erneut angezeigt.'
    );

  ELSE  -- 'magic_link'
    -- Audit-only (Frontend ruft danach supabase.auth.resetPasswordForEmail)
    INSERT INTO public.admin_audit_log (
      admin_user_id, action, target_table, target_id,
      before_value, after_value, reason
    ) VALUES (
      v_admin_user_id, 'member_pwd_reset', 'auth.users', p_target_user_id,
      NULL,
      jsonb_build_object(
        'method', 'magic_link',
        'account_id', p_account_id,
        'triggered_at', now()
      ),
      p_reason
    );

    RETURN jsonb_build_object(
      'method', 'magic_link',
      'target_email', v_target_email,
      'message', 'Magic-Link wird per Mail gesendet.'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_reset_member_password IS
  'Phase 5 Block 4: Admin Member-Pwd-Reset (Hybrid). p_method=temp_password schreibt encrypted_password + returnt raw Pwd einmal. p_method=magic_link nur Audit (Frontend triggert resetPasswordForEmail). Rate-Limit 3/24h via admin_audit_log. Account-Membership-Check verhindert Cross-Account-Abuse.';

GRANT EXECUTE ON FUNCTION public.admin_reset_member_password(uuid, uuid, text, text)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_member_password(uuid, uuid, text, text)
  FROM anon;

NOTIFY pgrst, 'reload schema';
