// supabase/functions/admin-stripe-sync-audit/index.ts
//
// Phase 4d — On-Demand-Stripe-Sync-Audit für das leadesk-admin Stripe-Sync-Dashboard.
//
// Liest alle Pattern-C account_addons (addons.stripe_price_id IS NOT NULL), ruft pro Row
// stripe.subscriptions.retrieve und klassifiziert die Drift gegen den DB-Status.
//
// KEIN Cron — wird ausschließlich on-demand vom „Live-Sync prüfen"-Button getriggert
// (Stripe-Rate-Limit-Schonung, D7a).
//
// Drift-Klassen (D7-Entscheidung 2026-06-22):
//   none     = DB-Status == aus Stripe gemappter Status
//   orange   = DB active, Stripe aber canceled/past_due/incomplete/unpaid/paused
//              (oder sonstiger Status-Mismatch ohne Webhook-Loss)
//   unlinked = Pattern-C-Row OHNE stripe_subscription_id (nie via Stripe verknüpft /
//              manueller Admin-Grant) — grau, KEIN echter Fehler
//   red      = DB canceled, Stripe aber active  → Webhook-Loss
//            | Stripe liefert 404 für eine vorhandene sub_id → Sub existiert nicht mehr
//
// Auth: is_leadesk_admin-JWT-Claim des Callers (getUser via service-role validiert das
//       Token); die eigentlichen Reads laufen mit service-role (RLS-Bypass, Cross-Account).
//
// ENV (auf supabase-edge-functions Prod+Staging vorhanden, 2026-06-22 verifiziert):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Defensive Konvention (Top-Fallstrick #12): error-Field von supabase-js IMMER auslesen.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const stripe = new Stripe(STRIPE_KEY, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Stripe-Status → Leadesk-Status (gleiches Mapping wie stripe-addon-webhook).
function leadeskStatus(s: string): string {
  switch (s) {
    case 'active':
    case 'trialing':            return 'active'
    case 'past_due':            return 'past_due'
    case 'canceled':            return 'canceled'
    case 'paused':              return 'paused'
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':              return 'pending'
    default:                    return 'pending'
  }
}

function classify(dbStatus: string, stripeStatus: string): { drift: string; reason: string } {
  const mapped = leadeskStatus(stripeStatus)
  const stripeActive = stripeStatus === 'active' || stripeStatus === 'trialing'

  if (dbStatus === mapped) {
    return { drift: 'none', reason: `DB ≈ Stripe (${stripeStatus})` }
  }
  if (dbStatus === 'canceled' && stripeActive) {
    return { drift: 'red', reason: `DB canceled, Stripe aber ${stripeStatus} — Webhook-Loss` }
  }
  if (dbStatus === 'active' && !stripeActive) {
    return { drift: 'orange', reason: `DB active, Stripe aber ${stripeStatus}` }
  }
  return { drift: 'orange', reason: `Status-Mismatch: DB ${dbStatus} vs. Stripe ${stripeStatus}` }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // --- Auth: is_leadesk_admin ---
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Missing Authorization' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    console.warn('[stripe-sync-audit] getUser failed:', userErr?.message)
    return json({ error: 'Invalid token' }, 401)
  }
  const isAdmin = (userData.user.app_metadata as Record<string, unknown> | undefined)?.is_leadesk_admin === true
  if (!isAdmin) return json({ error: 'Not authorized: is_leadesk_admin required' }, 403)

  // --- Body (optionaler account_id-Filter) ---
  let accountId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    accountId = body?.account_id || null
  } catch (_) { /* leerer Body ist ok */ }

  // --- Pattern-C-Rows laden (service-role, RLS-Bypass) ---
  let q = admin
    .from('account_addons')
    .select('id, account_id, status, stripe_subscription_id, current_period_end, accounts(name), addons!inner(slug, name, stripe_price_id)')
    .not('addons.stripe_price_id', 'is', null)
  if (accountId) q = q.eq('account_id', accountId)

  const { data: rows, error: rowsErr } = await q
  if (rowsErr) {
    console.error('[stripe-sync-audit] load rows error:', rowsErr.message)
    return json({ error: `DB-Read fehlgeschlagen: ${rowsErr.message}` }, 500)
  }

  const out = []
  for (const r of (rows || [])) {
    const acc = (r as any).accounts
    const ad = (r as any).addons
    const base = {
      account_addon_id: r.id,
      account_id: r.account_id,
      account_name: acc?.name ?? '—',
      addon_slug: ad?.slug ?? '—',
      db_status: r.status as string,
      stripe_subscription_id: r.stripe_subscription_id as string | null,
    }

    if (!r.stripe_subscription_id) {
      out.push({
        ...base,
        stripe_status: null,
        stripe_current_period_end: null,
        drift: 'unlinked',
        drift_reason: 'Pattern-C ohne Stripe-Subscription (nie verknüpft / manueller Grant)',
      })
      continue
    }

    try {
      const sub = await stripe.subscriptions.retrieve(r.stripe_subscription_id as string)
      const { drift, reason } = classify(r.status as string, sub.status)
      out.push({
        ...base,
        stripe_status: sub.status,
        stripe_current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        drift,
        drift_reason: reason,
      })
    } catch (e: any) {
      const code = e?.statusCode || e?.raw?.statusCode
      const isMissing = code === 404 || e?.code === 'resource_missing'
      out.push({
        ...base,
        stripe_status: isMissing ? 'not_found' : 'error',
        stripe_current_period_end: null,
        drift: 'red',
        drift_reason: isMissing
          ? 'Stripe kennt diese Subscription nicht mehr (404)'
          : `Stripe-Fehler: ${e?.message || 'unbekannt'}`,
      })
    }
  }

  const stats = {
    total: out.length,
    drifts: out.filter((x) => x.drift !== 'none').length,
    critical: out.filter((x) => x.drift === 'red').length,
    unlinked: out.filter((x) => x.drift === 'unlinked').length,
  }

  return json({ ok: true, rows: out, stats })
})
