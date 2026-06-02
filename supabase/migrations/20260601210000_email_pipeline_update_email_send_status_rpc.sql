-- File: 20260601210000_email_pipeline_update_email_send_status_rpc.sql
-- Sprint K.1 Hotfix — update_email_send_status RPC nachziehen
--
-- send-email-EF ruft public.update_email_send_status nach jedem Postmark-Send-
-- Attempt für Status-Tracking. RPC existierte historisch nur auf Prod (vermutlich
-- aus einer Phase 2.2/2.3-Migration die nie ins Repo committed wurde — Tech-Debt).
-- Auf Staging fehlt sie → send-email crash't mit PGRST202 nach jedem Send.
--
-- Diese Migration clont die exakte Prod-Definition (via pg_get_functiondef ausgelesen)
-- ins Repo + applied sie idempotent auf Staging.
--
-- Auth-Check im Function-Body: service_role-only (kein public-callable).

BEGIN;

CREATE OR REPLACE FUNCTION public.update_email_send_status(
  p_log_id              uuid,
  p_status              text,
  p_postmark_message_id text    DEFAULT NULL::text,
  p_postmark_error_code integer DEFAULT NULL::integer,
  p_postmark_response   jsonb   DEFAULT NULL::jsonb,
  p_failed_reason       text    DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', 'anon') != 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('sent','failed','rate_limited','blocked') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.email_send_log
  SET status              = p_status,
      postmark_message_id = p_postmark_message_id,
      postmark_error_code = p_postmark_error_code,
      postmark_response   = p_postmark_response,
      failed_reason       = p_failed_reason
  WHERE id = p_log_id;
END;
$function$;

-- Per-Schema-Convention: Default-PUBLIC-Execute revoken + nur service_role+authenticated berechtigen
REVOKE EXECUTE ON FUNCTION public.update_email_send_status(uuid, text, text, integer, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_email_send_status(uuid, text, text, integer, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_email_send_status(uuid, text, text, integer, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.update_email_send_status(uuid, text, text, integer, jsonb, text) IS
  'Status-Tracking-RPC für email_send_log. Wird von send-email-EF nach jedem Postmark-Call aufgerufen (sent/failed/rate_limited/blocked). Service-role-only.';

-- Verifikation
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_email_send_status'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'update_email_send_status RPC not created';
  END IF;
  RAISE NOTICE 'update_email_send_status RPC ready';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
