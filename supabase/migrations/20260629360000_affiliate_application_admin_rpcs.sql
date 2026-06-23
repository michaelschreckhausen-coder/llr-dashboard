-- 20260629360000_affiliate_application_admin_rpcs.sql
-- Affiliate-System Phase 12 — Admin-Verarbeitung externer Bewerbungen.
--   * admin_get_affiliate_applications  : Liste für /affiliate-applications (is_leadesk_admin)
--   * admin_reject_affiliate_application : Ablehnen + Grund + rejected-Mail (is_leadesk_admin)
--   * finalize_affiliate_application_approval : Affiliate-Row anlegen + Application schließen
--       (NUR service_role — wird von der Approve-EF gerufen, die vorher den Auth-User
--        anlegt; Admin-Check + Auth-User-Anlage passieren in der EF, nicht hier)
--
-- Reject ist pure SQL (kein Auth-User nötig). Approve braucht GoTrue-User-Anlage →
-- D2-Bridge: EF macht admin-Check + auth.admin + generateLink, ruft dann diese RPC.

BEGIN;

-- ── Liste (Admin) ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_affiliate_applications(
  p_status text DEFAULT NULL, p_limit int DEFAULT 100, p_offset int DEFAULT 0)
 RETURNS TABLE (
   id uuid, email text, name text, company_or_channel text, reach_channels jsonb,
   audience_size text, motivation text, code_wish text, recaptcha_score numeric,
   status text, email_verified_at timestamptz, decision_reason text,
   affiliate_id uuid, reviewed_at timestamptz, created_at timestamptz, total_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;

  RETURN QUERY
  SELECT a.id, a.email, a.name, a.company_or_channel, a.reach_channels, a.audience_size,
         a.motivation, a.code_wish, a.recaptcha_score, a.status, a.email_verified_at,
         a.decision_reason, a.affiliate_id, a.reviewed_at, a.created_at,
         COUNT(*) OVER ()::bigint AS total_count
  FROM public.affiliate_applications a
  WHERE (p_status IS NULL OR a.status = p_status)
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200)) OFFSET GREATEST(0, p_offset);
END;
$function$;

-- ── Ablehnen (Admin, pure SQL + Mail) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reject_affiliate_application(
  p_application_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_app   record;
  v_svc   text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;

  SELECT * INTO v_app FROM public.affiliate_applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application % not found', p_application_id; END IF;
  IF v_app.status NOT IN ('pending', 'pending_email_verify') THEN
    RAISE EXCEPTION 'reject nur aus pending (aktuell: %)', v_app.status; END IF;

  UPDATE public.affiliate_applications
     SET status = 'rejected', decision_reason = p_reason, reviewed_by = v_admin, reviewed_at = now()
   WHERE id = p_application_id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'affiliate_application_rejected', 'affiliate_applications', p_application_id, 'status',
          jsonb_build_object('status', v_app.status), jsonb_build_object('status', 'rejected'), p_reason);

  -- rejected-Mail (force: Bewerber ist kein User)
  v_svc := current_setting('app.service_role_key', true);
  IF v_svc IS NOT NULL AND length(v_svc) > 20 THEN
    PERFORM net.http_post(
      url     := 'http://kong:8000/functions/v1/send-templated-email',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_svc),
      body    := jsonb_build_object('template_key','affiliate_application_rejected','recipient_email', v_app.email,
                   'force', true, 'variables', jsonb_build_object('name', v_app.name, 'reason', p_reason))
    );
  END IF;
END;
$function$;

-- ── Finalisieren (NUR service_role; von der Approve-EF gerufen) ────────────────
CREATE OR REPLACE FUNCTION public.finalize_affiliate_application_approval(
  p_application_id uuid, p_user_id uuid, p_admin_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_app  record;
  v_aff  uuid;
BEGIN
  -- Kein JWT im service-role-Pfad → Guard auf den DB-Rollennamen (vgl. Memory
  -- securitydefiner-authjwt-guard). Admin-Check + Auth-User-Anlage hat die EF gemacht.
  IF current_user NOT IN ('service_role','supabase_admin','postgres') THEN
    RAISE EXCEPTION 'finalize_affiliate_application_approval: service-role only'; END IF;

  SELECT * INTO v_app FROM public.affiliate_applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application % not found', p_application_id; END IF;
  IF v_app.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'approve nur aus pending (aktuell: %)', v_app.status; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_app.code_wish) THEN
    RAISE EXCEPTION 'code % already taken', v_app.code_wish; END IF;

  INSERT INTO public.affiliates (user_id, code, status, approved_at, approved_by)
  VALUES (p_user_id, v_app.code_wish, 'active', now(), p_admin_id)
  RETURNING id INTO v_aff;

  UPDATE public.affiliate_applications
     SET status = 'approved', affiliate_id = v_aff, reviewed_by = p_admin_id, reviewed_at = now(),
         decision_reason = COALESCE(p_reason, decision_reason)
   WHERE id = p_application_id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (p_admin_id, 'affiliate_application_approved', 'affiliate_applications', p_application_id, 'status',
          jsonb_build_object('status','pending'), jsonb_build_object('status','approved','affiliate_id',v_aff), COALESCE(p_reason,'auto'));

  RETURN jsonb_build_object('affiliate_id', v_aff, 'code', v_app.code_wish, 'email', v_app.email, 'name', v_app.name);
END;
$function$;

-- Grants: Admin-RPCs für authenticated (JWT-Claim-gated im Body); finalize nur service_role.
REVOKE ALL ON FUNCTION public.admin_get_affiliate_applications(text, int, int) FROM public;
REVOKE ALL ON FUNCTION public.admin_reject_affiliate_application(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.finalize_affiliate_application_approval(uuid, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliate_applications(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_affiliate_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_affiliate_application_approval(uuid, uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
