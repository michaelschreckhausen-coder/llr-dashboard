// ════════════════════════════════════════════════════════════════
// admin-create-account-invite Edge-Function
//
// Block: Phase EmailFix-3 D2b
// Auth:  caller JWT (must have is_leadesk_admin claim)
// Flow:
//   1. Verify caller is_leadesk_admin via callerClient.rpc
//   2. Lookup owner_email in auth.users via admin_lookup_user_by_email RPC
//   3. If not found: GoTrue invite (POST /auth/v1/invite mit Service-Role)
//   4. Call admin_create_account_with_owner_id RPC with caller's JWT
//      (for audit-log identity).
//   5. On RPC failure: best-effort delete invited user
//
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface InvitePayload {
  account_name:        string
  billing_email:       string
  plan_slug:           string
  owner_email:         string
  owner_full_name?:    string | null
  owner_role?:         string
  reason:              string
  status?:             string
  granted_via?:        string
  plan_managed_by?:    string
  seat_limit?:         number
  trial_days?:         number | null
  team_name?:          string | null
  team_slug?:          string | null
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405, 'method_not_allowed')
  }

  try {
    // 1. Caller-Token extrahieren
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Missing Authorization Bearer token', 401, 'unauthorized')
    }
    const callerToken = authHeader.replace(/^Bearer\s+/i, '')

    // 2. Caller-Client (User-JWT) — Admin-Check + RPC mit caller-Identity (audit-log)
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    })

    const { data: isAdmin, error: adminErr } = await callerClient.rpc('is_leadesk_admin')
    if (adminErr) return jsonError(`Admin-check failed: ${adminErr.message}`, 500, 'admin_check_failed')
    if (!isAdmin) return jsonError('Caller is not a Leadesk admin', 403, 'forbidden')

    // 3. Payload validate
    const payload = await req.json() as InvitePayload
    const required = ['account_name', 'billing_email', 'plan_slug', 'owner_email', 'reason'] as const
    for (const k of required) {
      if (!payload[k]) return jsonError(`Missing required field: ${k}`, 400, 'invalid_payload')
    }
    if (payload.reason.trim().length < 10) {
      return jsonError('Reason must be at least 10 chars', 400, 'invalid_reason')
    }

    // 4. Lookup existing User (via caller-client → uses admin-only RPC)
    const { data: existingUserId, error: lookupErr } = await callerClient.rpc(
      'admin_lookup_user_by_email',
      { p_email: payload.owner_email }
    )
    if (lookupErr) return jsonError(`Owner-lookup failed: ${lookupErr.message}`, 500, 'lookup_failed')

    let ownerUserId: string | null = existingUserId ?? null
    let wasInvited = false

    // 5. If not existing → GoTrue invite (Service-Role)
    if (!ownerUserId) {
      const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey':        SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          email: payload.owner_email,
          data: {
            full_name:        payload.owner_full_name,
            role:             payload.owner_role ?? 'owner',
            invited_by_admin: true,
          },
        }),
      })

      if (!inviteRes.ok) {
        const errText = await inviteRes.text()
        return jsonError(
          `GoTrue invite failed (HTTP ${inviteRes.status}): ${errText}`,
          502,
          'invite_failed'
        )
      }

      const inviteData = await inviteRes.json()
      ownerUserId = inviteData?.id
      wasInvited  = true

      if (!ownerUserId) {
        return jsonError('GoTrue response missing user id', 502, 'invite_no_user_id')
      }
    }

    // 6. Call admin_create_account_with_owner_id (caller-client für audit-identity)
    const { data: rpcResult, error: rpcErr } = await callerClient.rpc(
      'admin_create_account_with_owner_id',
      {
        p_account_name:    payload.account_name,
        p_billing_email:   payload.billing_email,
        p_plan_slug:       payload.plan_slug,
        p_owner_user_id:   ownerUserId,
        p_owner_full_name: payload.owner_full_name ?? null,
        p_owner_role:      payload.owner_role ?? 'owner',
        p_was_invited:     wasInvited,
        p_reason:          payload.reason,
        p_status:          payload.status         ?? 'active',
        p_granted_via:     payload.granted_via    ?? 'manual',
        p_plan_managed_by: payload.plan_managed_by ?? 'leadesk',
        p_seat_limit:      payload.seat_limit     ?? 1,
        p_trial_days:      payload.trial_days     ?? null,
        p_team_name:       payload.team_name      ?? null,
        p_team_slug:       payload.team_slug      ?? null,
      }
    )

    if (rpcErr) {
      // 7. Cleanup: invited user löschen (best-effort)
      if (wasInvited && ownerUserId) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ownerUserId}`, {
          method:  'DELETE',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey':        SUPABASE_SERVICE_ROLE_KEY,
          },
        }).catch(() => { /* swallow cleanup errors */ })
      }
      return jsonError(
        `RPC failed: ${rpcErr.message}`,
        500,
        rpcErr.code ?? 'rpc_failed',
        { details: rpcErr.details, hint: rpcErr.hint }
      )
    }

    return jsonOk({
      success:       true,
      account_id:    rpcResult?.account_id,
      team_id:       rpcResult?.team_id,
      team_slug:     rpcResult?.team_slug,
      owner_user_id: rpcResult?.owner_user_id,
      owner_email:   rpcResult?.owner_email,
      was_invited:   wasInvited,
      audit_id:      rpcResult?.audit_id,
    })
  } catch (e: any) {
    return jsonError(String(e?.message ?? e), 500, 'internal_error')
  }
})

function jsonOk(data: any): Response {
  return new Response(JSON.stringify(data), {
    status:  200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number, code: string, extras?: any): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, error_code: code, ...extras }),
    {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  )
}
