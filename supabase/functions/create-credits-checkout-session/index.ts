// supabase/functions/create-credits-checkout-session/index.ts
//
// Stripe Phase 3 — Checkout-Session für Credit-/Storage-/CRM-Top-Up.
//
// Use-Case: User klickt im /marketplace auf "+5.000 Credits" → wir erstellen
//           eine Stripe-Checkout-Session.
//   - type='credits':       mode='payment'      (one-shot)
//   - type='storage_gb':    mode='subscription' (sticky monthly)
//   - type='crm_companies': mode='subscription' (sticky monthly)
//   - type='crm_contacts':  mode='subscription' (sticky monthly)
//
// Pfad:
//   1. JWT-Auth → user_id (Top-Ups nur für eingeloggte User; keine
//      anonymous-Pfade weil ohne account_id keine Zuordnung möglich)
//   2. offer-Lookup via offer_slug → stripe_price_id Pflicht
//   3. account.stripe_customer_id wiederverwenden / neu anlegen
//   4. Stripe-Checkout-Session (mode abhängig von is_recurring)
//   5. return { url }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing auth' }, 401)
  const jwt = authHeader.replace(/^Bearer\s+/, '')

  let body: { offer_slug?: string; quantity?: number } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
  const offerSlug = (body.offer_slug || '').trim()
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1))  // 1-10x Range
  if (!offerSlug) return json({ error: 'offer_slug required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. JWT → user
  const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
  const userId = userRes.user.id
  const userEmail = userRes.user.email || null

  // 2. account_id via teams
  const { data: teamRow } = await supabase
    .from('team_members')
    .select('team_id, teams(account_id)')
    .eq('user_id', userId).limit(1).maybeSingle()
  const accountId: string | null = (teamRow as any)?.teams?.account_id || null
  if (!accountId) return json({ error: 'no account context' }, 400)

  // 3. offer-Lookup
  const { data: offer, error: offerErr } = await supabase
    .from('credit_topup_offers')
    .select('id, slug, type, amount, price_eur, stripe_price_id, is_recurring, is_active, label')
    .eq('slug', offerSlug)
    .maybeSingle()
  if (offerErr || !offer) return json({ error: 'offer_not_found' }, 404)
  if (!offer.is_active) return json({ error: 'offer_inactive' }, 400)
  if (!offer.stripe_price_id) return json({ error: 'offer_not_priced_in_stripe', offer_slug: offerSlug }, 400)

  // 4. Stripe-Customer
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) return json({ error: 'stripe not configured' }, 500)
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, billing_email, stripe_customer_id')
    .eq('id', accountId).maybeSingle()

  let customerId = account?.stripe_customer_id
  if (!customerId) {
    try {
      const cust = await stripe.customers.create({
        email: account?.billing_email || userEmail || undefined,
        name:  account?.name || undefined,
        metadata: { account_id: accountId, source: 'leadesk_credits_topup' },
      })
      customerId = cust.id
      await supabase.from('accounts').update({ stripe_customer_id: customerId }).eq('id', accountId)
    } catch (e) {
      console.error('[credits-checkout] customer create failed:', (e as Error).message)
      return json({ error: 'stripe customer create failed' }, 502)
    }
  }

  // 5. Checkout-Session
  const env = Deno.env.get('APP_ENV') || 'staging'
  const appUrl = env === 'production'
    ? (Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de')
    : (Deno.env.get('APP_URL_STAGING') || 'https://staging.leadesk.de')

  const successUrl = `${appUrl}/marketplace?topup_purchased=${encodeURIComponent(offer.slug)}`
  const cancelUrl  = `${appUrl}/marketplace?topup_cancelled=${encodeURIComponent(offer.slug)}`
  const mode = offer.is_recurring ? 'subscription' : 'payment'

  const sessionParams: any = {
    mode,
    customer: customerId,
    line_items: [{ price: offer.stripe_price_id, quantity }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      offer_id: offer.id,
      offer_slug: offer.slug,
      offer_type: offer.type,
      offer_amount: String(offer.amount),
      account_id: accountId,
      user_id: userId,
      quantity: String(quantity),
      flow: 'credit_topup',
    },
  }
  if (mode === 'subscription') {
    sessionParams.subscription_data = {
      metadata: sessionParams.metadata,
    }
  } else {
    // mode=payment: payment_intent_data carries metadata
    sessionParams.payment_intent_data = {
      metadata: sessionParams.metadata,
    }
  }

  let session
  try {
    session = await stripe.checkout.sessions.create(sessionParams)
  } catch (e) {
    console.error('[credits-checkout] session create failed:', (e as Error).message)
    return json({ error: 'stripe session create failed', detail: (e as Error).message }, 502)
  }

  return json({ url: session.url, session_id: session.id, mode }, 200)
})
