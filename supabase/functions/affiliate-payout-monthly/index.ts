// supabase/functions/affiliate-payout-monthly/index.ts
//
// Affiliate-System Phase 6 — Monthly-Payout via Stripe-Connect-Transfers.
// Auth: Bearer == SERVICE_ROLE_KEY (pg_cron) ODER is_leadesk_admin-JWT (Admin-Force).
// Body: { affiliate_id?: uuid, reason?: string }.
//
// Pro eligible Affiliate (payouts_enabled + connect_account):
//   sum pending commission_events deren conversion 'confirmed' ist.
//   < 25€ → skip; >= 25€ → stripe.transfers.create (idempotencyKey gegen Doppel-Run)
//   success → affiliate_payouts(paid) + events→paid; failure → affiliate_payouts(failed).
//
// ENV: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const MIN_PAYOUT_CENTS = 2500  // 25€

const SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', SVC_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

function monthPeriod() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  const tag = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), tag }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // --- Auth: service-role (Cron) ODER is_leadesk_admin (Admin-Force) ---
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return json({ error: 'Missing Authorization' }, 401)
  let isCron = bearer === SVC_KEY
  let adminUserId: string | null = null
  if (!isCron) {
    const { data: ud } = await admin.auth.getUser(bearer)
    if (ud?.user && (ud.user.app_metadata as Record<string, unknown> | undefined)?.is_leadesk_admin === true) {
      adminUserId = ud.user.id
    } else {
      return json({ error: 'Not authorized' }, 403)
    }
  }

  const body = await req.json().catch(() => ({}))
  const singleId: string | null = body?.affiliate_id || null
  const reason: string | null = body?.reason || null

  // --- eligible Affiliates ---
  let q = admin.from('affiliates')
    .select('id, stripe_connect_account_id')
    .eq('stripe_connect_payouts_enabled', true)
    .not('stripe_connect_account_id', 'is', null)
  if (singleId) q = q.eq('id', singleId)
  const { data: affs, error: affErr } = await q
  if (affErr) return json({ error: affErr.message }, 500)

  const period = monthPeriod()
  const stats = { processed: 0, paid_count: 0, skipped_count: 0, failed_count: 0, total_amount_cents: 0 }

  for (const aff of (affs || [])) {
    stats.processed++
    // pending commission_events deren conversion confirmed ist
    const { data: events, error: evErr } = await admin
      .from('affiliate_commission_events')
      .select('id, commission_amount_cents, affiliate_conversions!inner(status)')
      .eq('affiliate_id', aff.id)
      .eq('status', 'pending')
      .eq('affiliate_conversions.status', 'confirmed')
    if (evErr) { console.warn('[payout] events load:', evErr.message); continue }

    const ids = (events || []).map((e: any) => e.id)
    const sum = (events || []).reduce((s: number, e: any) => s + Number(e.commission_amount_cents || 0), 0)

    if (sum < MIN_PAYOUT_CENTS) { stats.skipped_count++; continue }

    try {
      const transfer = await stripe.transfers.create({
        amount: sum, currency: 'eur', destination: aff.stripe_connect_account_id as string,
        metadata: { affiliate_id: aff.id, period: period.tag, triggered_by: adminUserId || 'cron' },
      }, { idempotencyKey: `payout_${aff.id}_${period.tag}` })

      const { data: payout, error: poErr } = await admin.from('affiliate_payouts').insert({
        affiliate_id: aff.id, period_start: period.start, period_end: period.end,
        total_amount_cents: sum, stripe_transfer_id: transfer.id, status: 'paid',
        triggered_by: adminUserId, paid_at: new Date().toISOString(),
      }).select('id').single()
      if (poErr) { console.warn('[payout] payout insert:', poErr.message); stats.failed_count++; continue }

      await admin.from('affiliate_commission_events')
        .update({ status: 'paid', payout_id: payout.id, paid_at: new Date().toISOString() })
        .in('id', ids)

      stats.paid_count++; stats.total_amount_cents += sum
    } catch (e: any) {
      await admin.from('affiliate_payouts').insert({
        affiliate_id: aff.id, period_start: period.start, period_end: period.end,
        total_amount_cents: sum, status: 'failed', failure_reason: (e?.message || 'stripe transfer failed').slice(0, 500),
        triggered_by: adminUserId,
      })
      stats.failed_count++
    }
  }

  // Admin-Force-Payout → Audit
  if (adminUserId) {
    await admin.from('admin_audit_log').insert({
      admin_user_id: adminUserId, action: 'affiliate_payout_triggered', target_table: 'affiliates',
      target_id: singleId, field_name: 'payout',
      before_value: {}, after_value: stats,
      reason: reason && reason.length >= 10 ? reason : 'Admin-Force-Payout',
    })
  }

  return json({ ok: true, ...stats })
})
