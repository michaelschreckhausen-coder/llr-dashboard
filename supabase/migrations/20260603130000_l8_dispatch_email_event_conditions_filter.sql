-- File: 20260603130000_l8_dispatch_email_event_conditions_filter.sql
-- Sprint L.8 B — conditions_jsonb-Filter im dispatch_email_event-RPC
--
-- Bisher (L.4 V1): dispatch_email_event findet matching event-Triggers, enqueue't
-- ALLE matchings. Conditions_jsonb wurde ignoriert (TODO-Comment).
--
-- L.8 V1: Pro Trigger wird conditions_jsonb evaluiert BEVOR enqueue. Format
-- (analog Branch-Step im Runner-EF, identisch zu UI-Trigger-Editor):
--   {"variable": "user.has_brand_voice", "operator": "equals", "value": true}
-- ODER für leere Filter:
--   {} → immer true (kein Filter)
--
-- Supported Operators:
--   equals, not_equals, gt, gte, lt, lte, exists, not_exists
--
-- Variable-Lookup: dot-path in p_variables jsonb. Z.B. "user.has_brand_voice"
-- → p_variables -> 'user' ->> 'has_brand_voice'.
--
-- Idempotent via CREATE OR REPLACE.

BEGIN;

-- Helper: dotted-path-Lookup in jsonb. Returns jsonb (oder NULL).
-- Beispiel: jsonb_dotted_get('{"user":{"has_brand_voice":true}}', 'user.has_brand_voice') → 'true'
CREATE OR REPLACE FUNCTION public.jsonb_dotted_get(p_obj jsonb, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_parts text[];
  v_cur jsonb;
  v_part text;
BEGIN
  IF p_obj IS NULL OR p_path IS NULL OR p_path = '' THEN RETURN NULL; END IF;
  v_parts := string_to_array(p_path, '.');
  v_cur := p_obj;
  FOREACH v_part IN ARRAY v_parts LOOP
    IF v_cur IS NULL THEN RETURN NULL; END IF;
    v_cur := v_cur -> v_part;
  END LOOP;
  RETURN v_cur;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.jsonb_dotted_get(jsonb, text) TO authenticated, service_role;

-- Helper: Condition-Eval — true/false. Empty conditions ({}) → true.
CREATE OR REPLACE FUNCTION public.eval_workflow_condition(p_condition jsonb, p_variables jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_variable text;
  v_operator text;
  v_expected jsonb;
  v_actual jsonb;
  v_num_actual numeric;
  v_num_expected numeric;
BEGIN
  IF p_condition IS NULL OR p_condition = '{}'::jsonb THEN
    RETURN true;
  END IF;

  v_variable := p_condition ->> 'variable';
  v_operator := p_condition ->> 'operator';
  v_expected := p_condition -> 'value';

  IF v_variable IS NULL OR v_operator IS NULL THEN
    -- Ungültige Condition-Struktur — fail-safe true (skip = false wäre Lock-Out)
    RETURN true;
  END IF;

  v_actual := public.jsonb_dotted_get(p_variables, v_variable);

  CASE v_operator
    WHEN 'equals'     THEN RETURN v_actual = v_expected;
    WHEN 'not_equals' THEN RETURN v_actual IS DISTINCT FROM v_expected;
    WHEN 'exists'     THEN RETURN v_actual IS NOT NULL;
    WHEN 'not_exists' THEN RETURN v_actual IS NULL;
    WHEN 'gt'  THEN BEGIN v_num_actual := (v_actual #>> '{}')::numeric; v_num_expected := (v_expected #>> '{}')::numeric; RETURN v_num_actual >  v_num_expected; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'gte' THEN BEGIN v_num_actual := (v_actual #>> '{}')::numeric; v_num_expected := (v_expected #>> '{}')::numeric; RETURN v_num_actual >= v_num_expected; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'lt'  THEN BEGIN v_num_actual := (v_actual #>> '{}')::numeric; v_num_expected := (v_expected #>> '{}')::numeric; RETURN v_num_actual <  v_num_expected; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'lte' THEN BEGIN v_num_actual := (v_actual #>> '{}')::numeric; v_num_expected := (v_expected #>> '{}')::numeric; RETURN v_num_actual <= v_num_expected; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    ELSE
      -- Unbekannter Operator — fail-safe true
      RETURN true;
  END CASE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.eval_workflow_condition(jsonb, jsonb) TO authenticated, service_role;

-- dispatch_email_event mit Condition-Filter
CREATE OR REPLACE FUNCTION public.dispatch_email_event(
  p_event_name      text,
  p_user_id         uuid DEFAULT NULL,
  p_account_id      uuid DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_variables       jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trigger record;
  v_run_id uuid;
  v_count integer := 0;
  v_svc_key text;
  v_recipient text;
  v_condition_ok boolean;
BEGIN
  IF p_event_name IS NULL OR length(p_event_name) < 3 THEN
    RAISE EXCEPTION 'event_name required';
  END IF;

  v_svc_key := current_setting('app.service_role_key', true);

  IF p_recipient_email IS NOT NULL THEN
    v_recipient := lower(trim(p_recipient_email));
  ELSIF p_user_id IS NOT NULL THEN
    SELECT email INTO v_recipient FROM auth.users WHERE id = p_user_id;
  END IF;

  FOR v_trigger IN
    SELECT t.id AS trigger_id, t.workflow_id, t.conditions_jsonb
      FROM public.email_workflow_triggers t
      JOIN public.email_workflows w ON w.id = t.workflow_id
     WHERE t.trigger_type = 'event'
       AND t.event_name = p_event_name
       AND t.is_active = true
       AND w.status = 'published'
       AND w.is_active = true
  LOOP
    -- L.8: Condition-Eval. Wenn condition false → skip dieser Workflow.
    v_condition_ok := public.eval_workflow_condition(v_trigger.conditions_jsonb, p_variables);
    IF NOT v_condition_ok THEN
      CONTINUE;  -- skip
    END IF;

    BEGIN
      v_run_id := public.enqueue_email_workflow(
        v_trigger.workflow_id, p_user_id, v_recipient, p_account_id, p_variables
      );
      v_count := v_count + 1;

      IF v_svc_key IS NOT NULL AND length(v_svc_key) > 50 THEN
        PERFORM net.http_post(
          url := 'http://kong:8000/functions/v1/email-workflow-runner',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_svc_key),
          body := jsonb_build_object('run_id', v_run_id)::jsonb
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_email_event: workflow % failed: %', v_trigger.workflow_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.dispatch_email_event(text, uuid, uuid, text, jsonb) IS
  'Sprint L.8 V1 (2026-06-03): Conditions_jsonb-Filter via eval_workflow_condition. Workflows mit false-Condition werden geskipt. {} = immer true.';

-- Verifikation
DO $$
DECLARE
  v_test1 boolean;
  v_test2 boolean;
  v_test3 boolean;
BEGIN
  -- Test 1: equals true
  v_test1 := public.eval_workflow_condition(
    '{"variable":"user.has_brand_voice","operator":"equals","value":true}'::jsonb,
    '{"user":{"has_brand_voice":true}}'::jsonb
  );
  IF NOT v_test1 THEN RAISE EXCEPTION 'L.8 Test 1 fail: equals true expected'; END IF;

  -- Test 2: equals false
  v_test2 := public.eval_workflow_condition(
    '{"variable":"user.has_brand_voice","operator":"equals","value":true}'::jsonb,
    '{"user":{"has_brand_voice":false}}'::jsonb
  );
  IF v_test2 THEN RAISE EXCEPTION 'L.8 Test 2 fail: equals false expected'; END IF;

  -- Test 3: empty conditions = true
  v_test3 := public.eval_workflow_condition('{}'::jsonb, '{}'::jsonb);
  IF NOT v_test3 THEN RAISE EXCEPTION 'L.8 Test 3 fail: empty conditions should be true'; END IF;

  RAISE NOTICE 'Sprint L.8 V1 Migration verification PASSED (3 eval tests green)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
