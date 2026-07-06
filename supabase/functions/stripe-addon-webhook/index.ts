// supabase/functions/stripe-addon-webhook/index.ts
//
// Eigener Stripe-Webhook-Endpoint für Marketplace-Add-on-Subscriptions.
// Separater Endpoint zum bestehenden stripe-webhook (Plan-Subscriptions).
//
// Im Stripe-Dashboard zwei Endpoints konfigurieren:
//   Plan-Webhook:    https://supabase(-staging).leadesk.de/functions/v1/stripe-webhook
//   Add-on-Webhook:  https://supabase(-staging).leadesk.de/functions/v1/stripe-addon-webhook
//
// Diese Function filtert defensiv auf metadata.flow='marketplace_addon' —
// sollten Stripe-Dashboard-Subscription-Aktionen ohne unsere Metadata
// hereinkommen, werden sie geskippt (kein Account-Addon-Side-Effect).
//
// Events:
//   - checkout.session.completed       → INSERT/UPSERT mit status='active'
//   - customer.subscription.updated    → status-Update (z.B. past_due, paused)
//   - customer.subscription.deleted    → status='canceled'
//
// ENV:
//   STRIPE_SECRET_KEY
//   STRIPE_ADDON_WEBHOOK_SECRET   (separates Secret vom Plan-Webhook!)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Defensive Konvention (Top-Fallstrick #12): error-Field von supabase-js
// IMMER auslesen + loggen mit [CTX]-Prefix.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

function ok(text = 'ok') {
  return new Response(text, { status: 200 })
}
function bad(text: string, status = 400) {
  console.warn('[stripe-addon-webhook] reject:', text)
  return new Response(text, { status })
}

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
const webhookSecret = Deno.env.get('STRIPE_ADDON_WEBHOOK_SECRET') || ''
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

function statusFromStripe(stripeStatus: string): string {
  // Stripe-Subscription-Statuses → Leadesk-Statuses (CHECK-Constraint)
  // Stripe:   incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused
  // Leadesk:  active, past_due, canceled, paused, pending
  switch (stripeStatus) {
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

async function handleSubscriptionEvent(sub: Stripe.Subscription, opts: { explicitStatus?: string } = {}) {
  const md = sub.metadata || {}
  if (md.flow !== 'marketplace_addon') {
    console.log('[stripe-addon-webhook] skip non-marketplace_addon sub:', sub.id)
    return
  }

  const accountId = md.account_id
  const addonId   = md.addon_id
  if (!accountId || !addonId) {
    console.warn('[stripe-addon-webhook] missing metadata account_id/addon_id on sub:', sub.id)
    return
  }

  const status = opts.explicitStatus || statusFromStripe(sub.status)
  const item = sub.items.data[0] || null
  const itemId = item?.id || null
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null

  const { error } = await supabase.rpc('upsert_account_addon_from_stripe', {
    p_account_id: accountId,
    p_addon_id: addonId,
    p_status: status,
    p_stripe_subscription_id: sub.id,
    p_stripe_subscription_item_id: itemId,
    p_current_period_end: periodEnd,
  })
  if (error) {
    console.error('[stripe-addon-webhook] upsert RPC error:', error.message)
    throw error
  }
  console.log(`[stripe-addon-webhook] upsert OK · account=${accountId} addon=${addonId} status=${status}`)

  // Automation-Quantity gleich beim Kauf setzen (nicht erst beim nächsten Connect) — idempotent, set-to-count.
  // Deckt den Grandfathered→Paid-Übergang ab (schon verbunden, kauft später regulär).
  await supabase.rpc('trigger_sync_automation_quantity', { p_account_id: accountId })
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const md = session.metadata || {}
  if (md.flow !== 'marketplace_addon') {
    console.log('[stripe-addon-webhook] skip non-marketplace_addon checkout:', session.id)
    return
  }
  if (!session.subscription) {
    console.warn('[stripe-addon-webhook] checkout.session.completed without subscription:', session.id)
    return
  }
  // Fetch full subscription für korrekte status/period_end-Felder.
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  const sub = await stripe.subscriptions.retrieve(subId)
  // Subscription-Metadata wurde via subscription_data.metadata gesetzt (siehe
  // create-addon-checkout-session) — wir verlassen uns auf die.
  await handleSubscriptionEvent(sub)
}

serve(async (req) => {
  if (req.method !== 'POST') return bad('method not allowed', 405)
  if (!webhookSecret || !stripeKey) return bad('stripe not configured', 500)

  const sig = req.headers.get('stripe-signature')
  if (!sig) return bad('missing signature', 400)

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret)
  } catch (e) {
    return bad(`signature verification failed: ${(e as Error).message}`, 400)
  }

  console.log('[stripe-addon-webhook] event:', event.type, event.id)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription, { explicitStatus: 'canceled' })
        break
      default:
        console.log('[stripe-addon-webhook] ignored event type:', event.type)
    }
  } catch (e) {
    // Stripe retried 4xx-Responses — wir geben 500 zurück damit der
    // Retry-Loop des Stripe-Webhook-Dispatchers greift.
    console.error('[stripe-addon-webhook] handler error:', (e as Error).message)
    return new Response(`handler error: ${(e as Error).message}`, { status: 500 })
  }

  return ok()
})
