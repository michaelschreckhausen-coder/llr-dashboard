// supabase/functions/email-workflow-runner/index.ts
//
// Sprint L.1 B — Email-Workflow-Runner
//
// Executes step-by-step einen email_workflow_runs-Eintrag. Pro Invocation:
//   - Lookup current_step der Run
//   - Wenn step_type=email: variables resolven (user.first_name etc.) + send-templated-email + log
//   - Wenn step_type=wait: Run-Status auf 'waiting' setzen + next_run_at = now() + wait_seconds
//                          (L.3 scope: pg_cron-Tick pickt fällige Runs)
//   - Wenn step_type=branch: condition evaluieren + branch_taken-Pfad nehmen (L.3 scope)
//   - advance_email_workflow_run-RPC ruft next_step → loop bis terminal/wait/error
//
// Auth: service_role only.
//
// INPUT (POST body):
//   { run_id: string }
//
// OUTPUT:
//   200 { success, run_id, final_status: completed|waiting|failed, steps_executed }
//   400/500 mit error-Body

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const MAX_STEPS_PER_INVOCATION = 20  // Safety-Limit gegen infinite loops

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { run_id?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const runId = body.run_id
  if (!runId) return json({ error: 'invalid_input', detail: 'run_id required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Run-State holen
  const { data: run, error: runErr } = await supabase
    .from('email_workflow_runs')
    .select('id, workflow_id, user_id, account_id, recipient_email, current_step_id, status, variables_jsonb')
    .eq('id', runId)
    .maybeSingle()

  if (runErr) return json({ error: 'lookup_failed', detail: runErr.message }, 500)
  if (!run) return json({ error: 'run_not_found', run_id: runId }, 404)

  if (run.status === 'completed' || run.status === 'cancelled') {
    return json({ success: true, run_id: runId, final_status: run.status, steps_executed: 0, note: 'already_terminal' })
  }
  if (run.status === 'waiting') {
    // L.3: wenn now() > next_run_at, würden wir hier weitermachen. L.1: just return.
    return json({ success: true, run_id: runId, final_status: 'waiting', steps_executed: 0, note: 'still_waiting' })
  }

  // Mark as running
  await supabase
    .from('email_workflow_runs')
    .update({ status: 'running' })
    .eq('id', runId)

  // 2. Pre-resolve user-context (für variables)
  const userContext = await resolveUserContext(supabase, run.user_id, run.account_id, run.recipient_email)

  // 3. Loop: execute steps bis terminal / wait / failure
  let stepsExecuted = 0
  let currentStepId: string | null = run.current_step_id
  let finalStatus: string = 'running'

  while (currentStepId && stepsExecuted < MAX_STEPS_PER_INVOCATION) {
    const { data: step } = await supabase
      .from('email_workflow_steps')
      .select('id, step_type, template_key, wait_seconds, branch_condition_jsonb, next_step_id, branch_else_step_id, workflow_id')
      .eq('id', currentStepId)
      .maybeSingle()

    if (!step) {
      await markRunFailed(supabase, runId, `Step ${currentStepId} not found`)
      finalStatus = 'failed'
      break
    }

    if (step.step_type === 'email') {
      // Email-Step: render + send + log
      const stepResult = await executeEmailStep(supabase, run, step, userContext)
      stepsExecuted++

      if (!stepResult.success) {
        await markRunFailed(supabase, runId, stepResult.error || 'email_step_failed')
        finalStatus = 'failed'
        break
      }

      // Advance to next step via RPC
      const { data: advance } = await supabase.rpc('advance_email_workflow_run', { p_run_id: runId })
      const advanceResult = advance as { status: string; next_step_id?: string }

      if (advanceResult.status === 'completed') {
        finalStatus = 'completed'
        break
      }
      currentStepId = advanceResult.next_step_id || null
    } else if (step.step_type === 'wait') {
      // Wait-Step: L.3 scope. L.1-stub: mark run as waiting, schedule next run.
      const nextRunAt = new Date(Date.now() + (step.wait_seconds || 0) * 1000).toISOString()
      await supabase
        .from('email_workflow_runs')
        .update({ status: 'waiting', next_run_at: nextRunAt })
        .eq('id', runId)
      // Log step as executed (für audit)
      await supabase
        .from('email_workflow_run_steps')
        .insert({ run_id: runId, step_id: step.id, status: 'executed', details_jsonb: { wait_seconds: step.wait_seconds, scheduled_resume_at: nextRunAt } })
      stepsExecuted++
      finalStatus = 'waiting'
      break
    } else if (step.step_type === 'branch') {
      // L.8: echte Condition-Eval (statt L.1-Stub always-true).
      const branchVariables = buildBranchVariables(run, userContext)
      const branchTaken = evaluateCondition(step.branch_condition_jsonb, branchVariables)

      await supabase
        .from('email_workflow_run_steps')
        .insert({
          run_id: runId,
          step_id: step.id,
          status: 'executed',
          details_jsonb: {
            condition: step.branch_condition_jsonb,
            branch_taken: branchTaken,
          },
        })
      stepsExecuted++

      const { data: advance } = await supabase.rpc('advance_email_workflow_run', { p_run_id: runId, p_branch_taken: branchTaken })
      const advanceResult = advance as { status: string; next_step_id?: string }
      if (advanceResult.status === 'completed') { finalStatus = 'completed'; break }
      currentStepId = advanceResult.next_step_id || null
    } else {
      await markRunFailed(supabase, runId, `Unknown step_type: ${step.step_type}`)
      finalStatus = 'failed'
      break
    }
  }

  if (stepsExecuted >= MAX_STEPS_PER_INVOCATION) {
    console.warn(`[workflow-runner] run ${runId} hit MAX_STEPS_PER_INVOCATION, stopping at step ${currentStepId}`)
  }

  return json({
    success: finalStatus !== 'failed',
    run_id: runId,
    final_status: finalStatus,
    steps_executed: stepsExecuted,
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────

interface UserContext {
  userId: string | null
  accountId: string | null
  recipientEmail: string
  firstName: string
  fullName: string
  planName: string | null
  planSlug: string | null
  trialEndsAt: string | null
  billingEmail: string | null
}

async function resolveUserContext(
  supabase: any,
  userId: string | null,
  accountId: string | null,
  recipientEmail: string,
): Promise<UserContext> {
  const ctx: UserContext = {
    userId,
    accountId,
    recipientEmail,
    firstName: 'Hallo',
    fullName: '',
    planName: null,
    planSlug: null,
    trialEndsAt: null,
    billingEmail: null,
  }

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle()
    if (profile) {
      ctx.fullName = profile.full_name || ''
      if (profile.full_name) {
        ctx.firstName = profile.full_name.trim().split(/\s+/)[0] || ctx.firstName
      } else if (profile.email) {
        ctx.firstName = profile.email.split('@')[0]
      }
    }
  }

  if (accountId) {
    const { data: acc } = await supabase
      .from('accounts')
      .select('billing_email, plan_id, trial_ends_at, plans(name, slug)')
      .eq('id', accountId)
      .maybeSingle()
    if (acc) {
      ctx.billingEmail = acc.billing_email
      ctx.trialEndsAt = acc.trial_ends_at
      ctx.planName = (acc as any).plans?.name || null
      ctx.planSlug = (acc as any).plans?.slug || null
    }
  }

  return ctx
}

async function executeEmailStep(
  supabase: any,
  run: any,
  step: any,
  userContext: UserContext,
): Promise<{ success: boolean; error?: string; emailSendLogId?: string }> {
  if (!step.template_key) {
    return { success: false, error: 'email-step missing template_key' }
  }

  // Variables: run.variables_jsonb (custom) gemerged mit auto-resolved user-context
  const autoVars = {
    user: {
      first_name: userContext.firstName,
      full_name: userContext.fullName,
      email: userContext.recipientEmail,
    },
    account: {
      plan_name: userContext.planName,
      plan_slug: userContext.planSlug,
      trial_ends_at: userContext.trialEndsAt,
    },
  }

  const variables = {
    ...autoVars,
    ...(run.variables_jsonb || {}),
  }

  // Call send-templated-email
  try {
    const { data, error } = await supabase.functions.invoke('send-templated-email', {
      body: {
        template_key: step.template_key,
        recipient_email: userContext.recipientEmail,
        user_id: userContext.userId,
        account_id: userContext.accountId,
        variables,
        tag: `workflow-${step.workflow_id}`,
        metadata: {
          workflow_id: step.workflow_id,
          step_id: step.id,
          run_id: run.id,
        },
      },
    })

    if (error) {
      await logRunStep(supabase, run.id, step.id, 'failed', null, { error: error.message || 'send-templated-email error' })
      return { success: false, error: error.message }
    }

    const emailSendLogId = (data as any)?.log_id || null
    await logRunStep(supabase, run.id, step.id, 'executed', emailSendLogId, { template_key: step.template_key, status: (data as any)?.status })
    return { success: true, emailSendLogId }
  } catch (e) {
    await logRunStep(supabase, run.id, step.id, 'failed', null, { error: (e as Error).message })
    return { success: false, error: (e as Error).message }
  }
}

async function logRunStep(
  supabase: any,
  runId: string,
  stepId: string,
  status: 'executed' | 'skipped' | 'failed',
  emailSendLogId: string | null,
  details: Record<string, any>,
): Promise<void> {
  await supabase
    .from('email_workflow_run_steps')
    .insert({
      run_id: runId,
      step_id: stepId,
      status,
      email_send_log_id: emailSendLogId,
      details_jsonb: details,
    })
}

async function markRunFailed(supabase: any, runId: string, errorMessage: string): Promise<void> {
  await supabase
    .from('email_workflow_runs')
    .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', runId)
}

// ─── L.8: Branch-Step Condition-Eval ──────────────────────────────────────

// Merged variables für branch-eval (analog email-step variables-build, ohne render).
function buildBranchVariables(run: any, userContext: UserContext): Record<string, any> {
  return {
    user: {
      first_name: userContext.firstName,
      full_name:  userContext.fullName,
      email:      userContext.recipientEmail,
    },
    account: {
      plan_name:     userContext.planName,
      plan_slug:     userContext.planSlug,
      trial_ends_at: userContext.trialEndsAt,
    },
    ...(run.variables_jsonb || {}),
  }
}

// Dotted-path-Lookup in nested object: getDottedValue({user:{x:1}}, 'user.x') → 1
function getDottedValue(obj: any, path: string): any {
  if (obj == null || !path) return undefined
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

// Condition-Eval — analog DB-Funktion eval_workflow_condition (L.8 Migration).
// Supported Operators: equals, not_equals, gt, gte, lt, lte, exists, not_exists.
// Leere/null condition oder ungültige Struktur → true (fail-safe).
function evaluateCondition(condition: any, variables: Record<string, any>): boolean {
  if (!condition || typeof condition !== 'object') return true
  const keys = Object.keys(condition)
  if (keys.length === 0) return true  // {} = always true

  const variable = condition.variable as string | undefined
  const operator = condition.operator as string | undefined
  const expected = condition.value

  if (!variable || !operator) {
    console.warn('[workflow-runner] branch-condition without variable/operator:', condition)
    return true  // fail-safe
  }

  const actual = getDottedValue(variables, variable)

  switch (operator) {
    case 'equals':     return actual === expected
    case 'not_equals': return actual !== expected
    case 'exists':     return actual !== undefined && actual !== null
    case 'not_exists': return actual === undefined || actual === null
    case 'gt':         return Number(actual) >  Number(expected)
    case 'gte':        return Number(actual) >= Number(expected)
    case 'lt':         return Number(actual) <  Number(expected)
    case 'lte':        return Number(actual) <= Number(expected)
    default:
      console.warn(`[workflow-runner] unknown branch-condition operator: ${operator}`)
      return true  // fail-safe
  }
}
