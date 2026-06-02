-- File: 20260602110000_l4_v1_1_enqueue_workflow_auth_fix.sql
-- Sprint L.4 V1.1 — Auth-Guard-Fix für enqueue_email_workflow
--
-- Bug: enqueue_email_workflow's Auth-Guard prüft auth.jwt() → das ist im
-- SECURITY-DEFINER-Trigger-Chain (handle_new_user → dispatch_email_event →
-- enqueue_email_workflow) NULL, weil kein PostgREST/GoTrue-Request läuft.
-- Resultat: Phase 8 (L.4 Event-Dispatcher) feuert nie, weil enqueue immer
-- mit 42501 abbricht.
--
-- Fix: dritter Auth-Pfad current_user IN ('supabase_admin','postgres',
-- 'service_role') — der Postgres-Rolle, unter der der SECURITY-DEFINER-Chain
-- läuft. API-Calls bleiben weiter geschützt (laufen als authenticated/anon
-- mit JWT).
--
-- Idempotent: CREATE OR REPLACE FUNCTION.
--
-- Anwendung: vor Re-Smoke des L.4 Welcome-Workflow.

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_email_workflow(
  p_workflow_id     uuid,
  p_user_id         uuid    DEFAULT NULL,
  p_recipient_email text    DEFAULT NULL,
  p_account_id      uuid    DEFAULT NULL,
  p_variables       jsonb   DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_run_id uuid;
  v_first_step_id uuid;
  v_recipient text;
  v_workflow_active boolean;
BEGIN
  -- Auth: 3 Pfade
  --   1. Interner/Trigger-Pfad: current_user ist Postgres-Rolle die SECURITY-DEFINER-Chain ausführt
  --      (supabase_admin/postgres/service_role)
  --   2. API mit service_role-JWT: auth.jwt()->>'role' = 'service_role'
  --   3. is_leadesk_admin im JWT app_metadata
  IF current_user NOT IN ('supabase_admin', 'postgres', 'service_role')
     AND coalesce(auth.jwt() ->> 'role', 'anon') NOT IN ('service_role')
     AND NOT COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) THEN
    RAISE EXCEPTION 'service_role or is_leadesk_admin required (current_user: %)', current_user USING ERRCODE = '42501';
  END IF;

  -- Workflow muss published + active sein
  SELECT (status = 'published' AND is_active = true)
    INTO v_workflow_active
    FROM public.email_workflows
   WHERE id = p_workflow_id;

  IF v_workflow_active IS NULL THEN
    RAISE EXCEPTION 'Workflow % not found', p_workflow_id;
  END IF;
  IF NOT v_workflow_active THEN
    RAISE EXCEPTION 'Workflow % is not active', p_workflow_id;
  END IF;

  -- Erster Step
  SELECT id INTO v_first_step_id
    FROM public.email_workflow_steps
   WHERE workflow_id = p_workflow_id
   ORDER BY step_index ASC
   LIMIT 1;

  IF v_first_step_id IS NULL THEN
    RAISE EXCEPTION 'No steps found for workflow %', p_workflow_id;
  END IF;

  -- Recipient resolven
  IF p_recipient_email IS NOT NULL THEN
    v_recipient := lower(trim(p_recipient_email));
  ELSIF p_user_id IS NOT NULL THEN
    SELECT email INTO v_recipient FROM auth.users WHERE id = p_user_id;
    IF v_recipient IS NULL THEN
      RAISE EXCEPTION 'recipient_email required (user % has no email)', p_user_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Either p_user_id or p_recipient_email must be provided';
  END IF;

  -- Run-Row insert
  INSERT INTO public.email_workflow_runs (
    workflow_id, user_id, account_id, recipient_email,
    current_step_id, status, variables_jsonb
  )
  VALUES (
    p_workflow_id, p_user_id, p_account_id, v_recipient,
    v_first_step_id, 'pending', COALESCE(p_variables, '{}'::jsonb)
  )
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

COMMENT ON FUNCTION public.enqueue_email_workflow(uuid, uuid, text, uuid, jsonb) IS
  'Sprint L.4 V1.1 (2026-06-02): Auth-Guard erweitert um current_user-Bypass für SECURITY-DEFINER-Trigger-Chain. API-Calls bleiben durch JWT-Check geschützt.';

-- Verifikation
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'enqueue_email_workflow' AND pronamespace = 'public'::regnamespace;
  IF v_def !~ 'current_user NOT IN' THEN
    RAISE EXCEPTION 'enqueue_email_workflow Auth-Fix not present';
  END IF;
  RAISE NOTICE 'Sprint L.4 V1.1 Auth-Fix verification PASSED';
END $$;

COMMIT;
