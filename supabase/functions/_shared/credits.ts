// _shared/credits.ts — Credits-Helper für Edge-Functions
// ─────────────────────────────────────────────────────────────────
// Pattern in einer EF:
//
//   import { getCallerContext, checkCredits, recordUsage, estimateCredits }
//     from '../_shared/credits.ts';
//
//   const ctx = await getCallerContext(req, supabaseAdmin);
//   if (!ctx) return json({ error: 'auth required' }, 401);
//
//   const estimated = await estimateCredits(provider, model, operation, hint, supabaseAdmin);
//   const check = await checkCredits(ctx.account_id, estimated, supabaseAdmin);
//   if (!check.allowed) return json({ error: 'credits_exhausted', ...check }, 402);
//
//   const result = await callProvider(...);
//
//   await recordUsage(ctx, {
//     edge_function: 'generate',
//     operation: 'text_generate',
//     provider, model,
//     input_tokens: result.usage.input_tokens,
//     output_tokens: result.usage.output_tokens,
//   }, supabaseAdmin);
//
// Top-Fallstricke #12 + #14 berücksichtigt:
//   - record_usage crasht NIE (try-catch + console.warn)
//   - checkCredits ist FAIL-OPEN in Phase 1 (lieber Free-Pass als blockierter
//     User wenn RPC down) — Phase 2 kann auf fail-closed switchen.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CallerContext = {
  user_id: string;
  account_id: string | null;
  team_id: string | null;
};

export async function getCallerContext(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<CallerContext | null> {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;

  const { data: userData, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !userData?.user) return null;

  const user_id = userData.user.id;

  // account_id via service-role-RPC (auth.uid() = NULL für service_role)
  let account_id: string | null = null;
  try {
    const { data, error: rpcErr } = await supabaseAdmin.rpc(
      'get_active_account_id_for_user',
      { p_user_id: user_id }
    );
    if (rpcErr) {
      console.warn('[credits] account-lookup RPC error:', rpcErr.message);
    } else {
      account_id = (data as string) || null;
    }
  } catch (e) {
    console.warn('[credits] account-lookup threw:', e instanceof Error ? e.message : String(e));
  }

  // team_id parallel via direct-fetch (für record_usage-Reporting)
  let team_id: string | null = null;
  try {
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('active_team_id')
      .eq('user_id', user_id)
      .maybeSingle();
    team_id = (prefs?.active_team_id as string) || null;
  } catch (_) { /* defensive — team_id ist nice-to-have, kein blocker */ }

  return { user_id, account_id, team_id };
}

export type CheckResult = {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  daily_remaining?: number;
  estimated?: number;
  daily_cap?: number;
};

export async function checkCredits(
  account_id: string | null,
  estimatedCredits: number,
  supabaseAdmin: SupabaseClient,
): Promise<CheckResult> {
  if (!account_id) {
    return { allowed: false, reason: 'no_account' };
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('check_credits_for_account', {
      p_account_id: account_id,
      p_estimated_credits: estimatedCredits,
    });
    if (error) {
      console.warn('[credits] check_credits_for_account error:', error.message);
      return { allowed: true, reason: 'check_failed_fail_open' };  // Phase 1: fail-open
    }
    return data as CheckResult;
  } catch (e) {
    console.warn('[credits] checkCredits threw:', e instanceof Error ? e.message : String(e));
    return { allowed: true, reason: 'check_failed_fail_open' };
  }
}

export type RecordParams = {
  edge_function: string;
  operation: string;  // 'text_generate' | 'image_generate' | 'transcribe'
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  units?: number;
  unit_type?: 'call' | 'image' | 'minute' | 'second';
  request_id?: string;
  status?: 'success' | 'error';
  extra_metadata?: Record<string, unknown>;
};

export async function recordUsage(
  ctx: CallerContext | null,
  params: RecordParams,
  supabaseAdmin: SupabaseClient,
): Promise<string | null> {
  if (!ctx?.account_id) {
    console.warn('[credits] recordUsage skipped — no account_id', { edge_function: params.edge_function });
    return null;
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('record_usage', {
      p_account_id: ctx.account_id,
      p_team_id: ctx.team_id,
      p_user_id: ctx.user_id,
      p_edge_function: params.edge_function,
      p_operation: params.operation,
      p_provider: params.provider || null,
      p_model: params.model || null,
      p_input_tokens: params.input_tokens || null,
      p_output_tokens: params.output_tokens || null,
      p_units: params.units || null,
      p_unit_type: params.unit_type || null,
      p_request_id: params.request_id || null,
      p_status: params.status || 'success',
      p_extra_metadata: params.extra_metadata || {},
    });
    if (error) {
      console.warn('[credits] record_usage error:', error.message, { ef: params.edge_function, op: params.operation });
      return null;
    }
    return data as string;
  } catch (e) {
    console.warn('[credits] recordUsage threw:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export type EstimateHint = {
  input_chars?: number;
  max_output_tokens?: number;
  image_count?: number;
  minutes?: number;
};

export async function estimateCredits(
  provider: string,
  model: string,
  operation: string,
  hint: EstimateHint,
  supabaseAdmin: SupabaseClient,
): Promise<number> {
  try {
    if (operation === 'image_generate' && hint.image_count) {
      const { data } = await supabaseAdmin
        .from('credit_pricing')
        .select('credits_per_unit')
        .eq('provider', provider).eq('model', model).eq('operation', operation).eq('unit', 'image')
        .maybeSingle();
      return Math.ceil((Number(data?.credits_per_unit) || 50) * hint.image_count);
    }
    if (operation === 'transcribe' && hint.minutes !== undefined) {
      const { data } = await supabaseAdmin
        .from('credit_pricing')
        .select('credits_per_unit')
        .eq('provider', provider).eq('model', model).eq('operation', operation).eq('unit', 'minute')
        .maybeSingle();
      return Math.ceil((Number(data?.credits_per_unit) || 6) * Math.max(1, hint.minutes));
    }
    if (operation === 'text_generate') {
      const inputTokens = Math.ceil((hint.input_chars || 1000) / 4);  // 4 chars ≈ 1 token Heuristik
      const outputTokens = hint.max_output_tokens || 1000;
      const [{ data: inPrice }, { data: outPrice }] = await Promise.all([
        supabaseAdmin
          .from('credit_pricing')
          .select('credits_per_unit')
          .eq('provider', provider).eq('model', model).eq('operation', operation).eq('unit', '1k_input_tokens')
          .maybeSingle(),
        supabaseAdmin
          .from('credit_pricing')
          .select('credits_per_unit')
          .eq('provider', provider).eq('model', model).eq('operation', operation).eq('unit', '1k_output_tokens')
          .maybeSingle(),
      ]);
      const inC = (inputTokens / 1000) * (Number(inPrice?.credits_per_unit) || 5);
      const outC = (outputTokens / 1000) * (Number(outPrice?.credits_per_unit) || 20);
      return Math.max(1, Math.ceil(inC + outC));
    }
  } catch (e) {
    console.warn('[credits] estimateCredits threw:', e instanceof Error ? e.message : String(e));
  }
  return 5;  // Default-Fallback
}
