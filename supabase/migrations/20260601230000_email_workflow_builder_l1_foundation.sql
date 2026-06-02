-- File: 20260601230000_email_workflow_builder_l1_foundation.sql
-- Sprint L.1 A — Email-Workflow-Builder Foundation Schema
--
-- 5 neue Tabellen + 2 RPCs + RLS für visual Drip-Campaign-Builder. Foundation
-- für L.2 (Frontend), L.3 (Visual-Flow + Branches), L.4 (Event-Dispatcher +
-- pg_cron), L.5 (Audit + Polish).
--
-- Architecture:
--   email_workflows         → Container (name, status draft/published, account_id nullable)
--   email_workflow_triggers → was startet Workflow (event/schedule/manual + conditions)
--   email_workflow_steps    → Schritte (email/wait/branch + next/else-Pointer)
--   email_workflow_runs     → Audit pro User-Execution (status pending/running/waiting/...)
--   email_workflow_run_steps → Audit pro Step (executed/skipped/failed + email_send_log-Link)
--
-- RPCs:
--   enqueue_email_workflow(workflow_id, user_id, recipient_email?, variables?) → run_id
--   advance_email_workflow_run(run_id, branch_taken?) → jsonb {status, next_step_id}
--
-- L.1 scope: nur Email-Steps in der Runner-EF. Wait/Branch-Step-Types sind als
-- Stub im Schema reserviert für L.3.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. email_workflows
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_workflows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_active       boolean NOT NULL DEFAULT false,
  account_id      uuid REFERENCES public.accounts(id) ON DELETE CASCADE,  -- NULL = global / system workflow
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_workflows_status     ON public.email_workflows (status);
CREATE INDEX IF NOT EXISTS idx_email_workflows_account    ON public.email_workflows (account_id);
CREATE INDEX IF NOT EXISTS idx_email_workflows_is_active  ON public.email_workflows (is_active) WHERE is_active = true;

COMMENT ON TABLE public.email_workflows IS
  'Workflow-Container. account_id NULL = system-wide / multi-tenant default. status=published + is_active=true = aktiv.';

-- ════════════════════════════════════════════════════════════════
-- 2. email_workflow_triggers
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_workflow_triggers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       uuid NOT NULL REFERENCES public.email_workflows(id) ON DELETE CASCADE,
  trigger_type      text NOT NULL CHECK (trigger_type IN ('event', 'schedule', 'manual')),
  -- Event-Trigger
  event_name        text,    -- z.B. 'user.created', 'stripe.subscription.started', 'account.status_changed'
  -- Schedule-Trigger
  schedule_cron     text,    -- z.B. '0 6 * * *' für 6 Uhr täglich (pg_cron-format)
  schedule_offset_days int,  -- z.B. -1 für 'X Tage VOR trial_ends_at', oder +3 für 'X Tage NACH checkout'
  schedule_anchor   text,    -- z.B. 'trial_ends_at', 'subscription.current_period_end', 'user.created_at'
  -- Common
  conditions_jsonb  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- z.B. {"trial_days_remaining": {"$lte": 1}, "plan_slug": "trial"}
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CHECK (
    (trigger_type = 'event'    AND event_name IS NOT NULL) OR
    (trigger_type = 'schedule' AND (schedule_cron IS NOT NULL OR schedule_anchor IS NOT NULL)) OR
    (trigger_type = 'manual')
  )
);

CREATE INDEX IF NOT EXISTS idx_email_workflow_triggers_workflow ON public.email_workflow_triggers (workflow_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_triggers_event    ON public.email_workflow_triggers (event_name)    WHERE trigger_type = 'event'    AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_email_workflow_triggers_schedule ON public.email_workflow_triggers (schedule_anchor) WHERE trigger_type = 'schedule' AND is_active = true;

COMMENT ON TABLE public.email_workflow_triggers IS
  'Was startet einen Workflow. Event-Triggers reagieren auf Backend-Events (user.created etc.). Schedule-Triggers laufen via pg_cron (täglich 6 Uhr) und checken Bedingungen wie "trial_ends_at = today+1". Manual-Triggers nur via UI.';

-- ════════════════════════════════════════════════════════════════
-- 3. email_workflow_steps
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_workflow_steps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         uuid NOT NULL REFERENCES public.email_workflows(id) ON DELETE CASCADE,
  step_index          integer NOT NULL,
  step_type           text NOT NULL CHECK (step_type IN ('email', 'wait', 'branch')),

  -- Email-Step
  template_key        text,  -- referenziert email_templates.template_key (kein hard FK weil locale-resolution dynamisch)

  -- Wait-Step
  wait_seconds        integer,  -- pause-duration

  -- Branch-Step
  branch_condition_jsonb jsonb,  -- z.B. {"variable": "user.has_brand_voice", "operator": "equals", "value": true}

  -- Next-Step-Pointer (linear flow) / Branch-True-Pointer
  next_step_id        uuid REFERENCES public.email_workflow_steps(id) ON DELETE SET NULL,
  -- Branch-False-Pointer
  branch_else_step_id uuid REFERENCES public.email_workflow_steps(id) ON DELETE SET NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workflow_id, step_index),

  CHECK (
    (step_type = 'email'  AND template_key IS NOT NULL) OR
    (step_type = 'wait'   AND wait_seconds IS NOT NULL AND wait_seconds > 0) OR
    (step_type = 'branch' AND branch_condition_jsonb IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_email_workflow_steps_workflow ON public.email_workflow_steps (workflow_id, step_index);

COMMENT ON TABLE public.email_workflow_steps IS
  'Workflow-Schritte. step_type=email: sendet Template. wait: pause für N Sekunden. branch: split based on condition (next_step_id wenn true, branch_else_step_id wenn false). next_step_id ist standard-flow-pointer.';

-- ════════════════════════════════════════════════════════════════
-- 4. email_workflow_runs
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_workflow_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES public.email_workflows(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- nullable für anon-flow
  account_id      uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  current_step_id uuid REFERENCES public.email_workflow_steps(id) ON DELETE SET NULL,
  next_run_at     timestamptz,  -- für wait-step scheduling: pg_cron pickt fällige Runs
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled')),
  variables_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_workflow_runs_status      ON public.email_workflow_runs (status);
CREATE INDEX IF NOT EXISTS idx_email_workflow_runs_user        ON public.email_workflow_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_runs_workflow    ON public.email_workflow_runs (workflow_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_runs_next_run    ON public.email_workflow_runs (next_run_at) WHERE status IN ('pending', 'waiting');

COMMENT ON TABLE public.email_workflow_runs IS
  'Audit pro Workflow-Execution. status pending = wartet auf Runner-EF, running = wird gerade executed, waiting = wartet auf wait-step-Timer, completed/failed/cancelled = terminal.';

-- ════════════════════════════════════════════════════════════════
-- 5. email_workflow_run_steps
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_workflow_run_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.email_workflow_runs(id) ON DELETE CASCADE,
  step_id           uuid NOT NULL REFERENCES public.email_workflow_steps(id) ON DELETE CASCADE,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL CHECK (status IN ('executed', 'skipped', 'failed')),
  email_send_log_id uuid REFERENCES public.email_send_log(id) ON DELETE SET NULL,
  details_jsonb     jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_workflow_run_steps_run ON public.email_workflow_run_steps (run_id, executed_at);

COMMENT ON TABLE public.email_workflow_run_steps IS
  'Audit pro executed step in einem run. email_send_log_id verlinkt zur email_send_log-Row falls der Step eine Email gesendet hat.';

-- ════════════════════════════════════════════════════════════════
-- 6. RLS + Grants
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.email_workflows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_workflow_triggers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_workflow_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_workflow_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_workflow_run_steps  ENABLE ROW LEVEL SECURITY;

-- Hetzner-Convention: explizite Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_workflows           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_workflow_triggers   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_workflow_steps      TO authenticated;
GRANT SELECT                         ON public.email_workflow_runs       TO authenticated;
GRANT SELECT                         ON public.email_workflow_run_steps  TO authenticated;

GRANT ALL ON public.email_workflows          TO service_role;
GRANT ALL ON public.email_workflow_triggers  TO service_role;
GRANT ALL ON public.email_workflow_steps     TO service_role;
GRANT ALL ON public.email_workflow_runs      TO service_role;
GRANT ALL ON public.email_workflow_run_steps TO service_role;

-- RLS-Policies (drop+create idempotent)
DROP POLICY IF EXISTS ew_admin_full ON public.email_workflows;
CREATE POLICY ew_admin_full ON public.email_workflows
  FOR ALL USING (
    COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) = true
  );

DROP POLICY IF EXISTS ewt_admin_full ON public.email_workflow_triggers;
CREATE POLICY ewt_admin_full ON public.email_workflow_triggers
  FOR ALL USING (
    COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) = true
  );

DROP POLICY IF EXISTS ews_admin_full ON public.email_workflow_steps;
CREATE POLICY ews_admin_full ON public.email_workflow_steps
  FOR ALL USING (
    COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) = true
  );

DROP POLICY IF EXISTS ewr_admin_full ON public.email_workflow_runs;
CREATE POLICY ewr_admin_full ON public.email_workflow_runs
  FOR ALL USING (
    COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) = true
  );
-- Eigene Runs auch sehbar für User
DROP POLICY IF EXISTS ewr_own_read ON public.email_workflow_runs;
CREATE POLICY ewr_own_read ON public.email_workflow_runs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS ewrs_admin_full ON public.email_workflow_run_steps;
CREATE POLICY ewrs_admin_full ON public.email_workflow_run_steps
  FOR ALL USING (
    COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) = true
  );

-- ════════════════════════════════════════════════════════════════
-- 7. updated_at-Trigger für email_workflows
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.touch_email_workflows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS email_workflows_touch_updated_at ON public.email_workflows;
CREATE TRIGGER email_workflows_touch_updated_at
  BEFORE UPDATE ON public.email_workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_workflows_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 8. RPCs
-- ════════════════════════════════════════════════════════════════

-- 8a. enqueue_email_workflow — startet einen Workflow für einen User
CREATE OR REPLACE FUNCTION public.enqueue_email_workflow(
  p_workflow_id    uuid,
  p_user_id        uuid    DEFAULT NULL,
  p_recipient_email text   DEFAULT NULL,
  p_account_id     uuid    DEFAULT NULL,
  p_variables      jsonb   DEFAULT '{}'::jsonb
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
  -- Auth: service_role oder is_leadesk_admin
  IF coalesce(auth.jwt() ->> 'role', 'anon') NOT IN ('service_role')
     AND NOT COALESCE((((auth.jwt() -> 'app_metadata') ->> 'is_leadesk_admin'))::boolean, false) THEN
    RAISE EXCEPTION 'service_role or is_leadesk_admin required' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'Workflow % is not active (status != published OR is_active = false)', p_workflow_id;
  END IF;

  -- Erster Step ist der mit niedrigstem step_index
  SELECT id INTO v_first_step_id
    FROM public.email_workflow_steps
   WHERE workflow_id = p_workflow_id
   ORDER BY step_index ASC
   LIMIT 1;

  IF v_first_step_id IS NULL THEN
    RAISE EXCEPTION 'No steps found for workflow %', p_workflow_id;
  END IF;

  -- Recipient resolven (entweder explicit oder aus user)
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

REVOKE EXECUTE ON FUNCTION public.enqueue_email_workflow(uuid, uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email_workflow(uuid, uuid, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email_workflow(uuid, uuid, text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.enqueue_email_workflow(uuid, uuid, text, uuid, jsonb) IS
  'Startet einen Workflow für einen User. Returns run_id. Workflow muss status=published + is_active=true sein. Recipient wird aus user_id oder explicit recipient_email resolved.';

-- 8b. advance_email_workflow_run — geht zum nächsten Step (used by runner-EF)
CREATE OR REPLACE FUNCTION public.advance_email_workflow_run(
  p_run_id        uuid,
  p_branch_taken  boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_step record;
  v_next_step_id uuid;
BEGIN
  -- Auth: nur service_role
  IF coalesce(auth.jwt() ->> 'role', 'anon') != 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

  -- Letzten executed step für diesen Run holen
  SELECT s.* INTO v_current_step
    FROM public.email_workflow_run_steps rs
    JOIN public.email_workflow_steps s ON s.id = rs.step_id
   WHERE rs.run_id = p_run_id
   ORDER BY rs.executed_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No executed steps for run %', p_run_id USING ERRCODE = 'P0002';
  END IF;

  -- Next-Step-Bestimmung
  IF v_current_step.step_type = 'branch' THEN
    IF p_branch_taken = false THEN
      v_next_step_id := v_current_step.branch_else_step_id;
    ELSE
      v_next_step_id := v_current_step.next_step_id;
    END IF;
  ELSE
    v_next_step_id := v_current_step.next_step_id;
  END IF;

  -- Update Run-Status
  IF v_next_step_id IS NULL THEN
    -- Terminal: Workflow vollständig
    UPDATE public.email_workflow_runs
       SET status = 'completed',
           completed_at = now(),
           current_step_id = NULL
     WHERE id = p_run_id;
    RETURN jsonb_build_object('status', 'completed', 'run_id', p_run_id);
  ELSE
    UPDATE public.email_workflow_runs
       SET current_step_id = v_next_step_id,
           status = 'pending'
     WHERE id = p_run_id;
    RETURN jsonb_build_object('status', 'pending', 'next_step_id', v_next_step_id, 'run_id', p_run_id);
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.advance_email_workflow_run(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_email_workflow_run(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.advance_email_workflow_run(uuid, boolean) IS
  'Goes to next step in workflow. Used internal by email-workflow-runner-EF after step execution. Returns {status: pending|completed, next_step_id?}.';

-- ════════════════════════════════════════════════════════════════
-- 9. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('email_workflows', 'email_workflow_triggers', 'email_workflow_steps', 'email_workflow_runs', 'email_workflow_run_steps');
  IF v_count != 5 THEN
    RAISE EXCEPTION 'Expected 5 workflow tables, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public'
     AND p.proname IN ('enqueue_email_workflow', 'advance_email_workflow_run');
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Expected 2 workflow RPCs, found %', v_count;
  END IF;

  RAISE NOTICE 'Sprint L.1 A Schema-Migration verification PASSED (5 tables + 2 RPCs)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
