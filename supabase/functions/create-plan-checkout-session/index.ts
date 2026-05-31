// supabase/functions/create-plan-checkout-session/index.ts
//
// Stripe Phase 3 — Checkout-Session für Plan-Subscription.
//
// Use-Case: User klickt auf "Plan upgraden" in /settings/konto oder
//           "Plan kaufen" auf leadesk.de/pricing → wir erstellen eine
//           Stripe-Checkout-Session im subscription-mode + redirect.
//
// Pfad:
//   1. JWT-Auth → user_id (für eingeloggte App-User)
//      ODER: ohne Auth + body.email → Anonymous-Checkout (für leadesk.de
//      Buy-Now-Buttons VOR Sign-Up) — erstellt Stripe-Customer, User legt
//      Account später beim Login an (Stripe-Webhook macht Match via email).
//   2. plan-Lookup via plan_slug → plans.stripe_price_id Pflicht
//   3. account.stripe_customer_id wiederverwenden / neu anlegen
//   4. Stripe-Checkout-Session erstellen (mode=subscription)
//   5. return { url }
//
// ENV:
//   STRIPE_SECRET_KEY
//   APP_URL_PROD / APP_URL_STAGING / APP_ENV
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

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

  let body: { plan_slug?: string; email?: string; success_path?: string; cancel_path?: string; period?: 'monthly' | 'yearly' } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

  const planSlug = (body.plan_slug || '').trim()
  if (!planSlug) return json({ error: 'plan_slug required' }, 400)
  const period: 'monthly' | 'yearly' = body.period === 'yearly' ? 'yearly' : 'monthly'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Auth-Pfade
  const authHeader = req.headers.get('Authorization')
  let userId: string | null = null
  let userEmail: string | null = null
  let accountId: string | null = null

  if (authHeader) {
    // eingeloggter User
    const jwt = authHeader.replace(/^Bearer\s+/, '')
    const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
    userId = userRes.user.id
    userEmail = userRes.user.email || null

    // account_id via teams (analog addon-checkout)
    const { data: teamRow } = await supabase
      .from('team_members')
      .select('team_id, teams(account_id)')
      .eq('user_id', userId).limit(1).maybeSingle()
    accountId = (teamRow as any)?.teams?.account_id || null
  } else {
    // anonymer Buy-Now (leadesk.de): email kommt aus Body
    userEmail = (body.email || '').trim() || null
    if (!userEmail) return json({ error: 'email required for anonymous checkout' }, 400)
  }

  // 2. Plan-Lookup (inkl. yearly-Price)
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, slug, name, stripe_price_id, stripe_price_id_yearly, price_monthly, price_yearly, license_type, is_active')
    .eq('slug', planSlug)
    .maybeSingle()
  if (planErr || !plan) return json({ error: 'plan_not_found' }, 404)
  if (!plan.is_active) return json({ error: 'plan_inactive' }, 400)

  // Period → Price-ID-Lookup
  const stripePriceId = period === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id
  if (!stripePriceId) {
    return json({
      error: 'plan_not_priced_in_stripe',
      plan_slug: planSlug,
      period,
      hint: period === 'yearly' ? 'kein yearly-Price gesetzt — Fallback auf monthly via period=monthly' : undefined,
    }, 400)
  }

  // 3. Stripe-Customer
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) return json({ error: 'stripe not configured' }, 500)
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

  let customerId: string | null = null

  if (accountId) {
    // Eingeloggt: account.stripe_customer_id wiederverwenden oder anlegen
    const { data: account } = await supabase
      .from('accounts')
      .select('id, name, billing_email, stripe_customer_id')
      .eq('id', accountId).maybeSingle()

    customerId = account?.stripe_customer_id || null
    if (!customerId) {
      try {
        const cust = await stripe.customers.create({
          email: account?.billing_email || userEmail || undefined,
          name:  account?.name || undefined,
          metadata: { account_id: accountId, source: 'leadesk_plan_upgrade' },
        })
        customerId = cust.id
        await supabase.from('accounts')
          .update({ stripe_customer_id: customerId })
          .eq('id', accountId)
      } catch (e) {
        console.error('[plan-checkout] customer create failed:', (e as Error).message)
        return json({ error: 'stripe customer create failed' }, 502)
      }
    }
  } else {
    // Anonym: nur via email (Stripe legt customer auto an oder findet ihn)
    // Wir suchen NICHT bestehende customers per email — Stripe darf duplicate-customers
    // anlegen (Webhook deduplicated später via email-Match auf accounts).
    try {
      const cust = await stripe.customers.create({
        email: userEmail || undefined,
        metadata: { source: 'leadesk_marketing_site', anonymous_signup: 'true' },
      })
      customerId = cust.id
    } catch (e) {
      console.error('[plan-checkout] anon customer create failed:', (e as Error).message)
      return json({ error: 'stripe customer create failed' }, 502)
    }
  }

  // 4. Checkout-Session
  const env = Deno.env.get('APP_ENV') || 'staging'
  const appUrl = env === 'production'
    ? (Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de')
    : (Deno.env.get('APP_URL_STAGING') || 'https://staging.leadesk.de')

  const successPath = body.success_path || '/settings/konto?plan_subscribed=' + encodeURIComponent(planSlug)
  const cancelPath  = body.cancel_path  || '/settings/konto?plan_cancelled=' + encodeURIComponent(planSlug)

  let session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId!,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${appUrl}${successPath}`,
      cancel_url:  `${appUrl}${cancelPath}`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          plan_id: plan.id,
          plan_slug: plan.slug,
          period,
          account_id: accountId || '',
          user_id: userId || '',
          flow: 'plan_subscription',
        },
      },
      metadata: {
        plan_id: plan.id,
        plan_slug: plan.slug,
        period,
        account_id: accountId || '',
        user_id: userId || '',
        flow: 'plan_subscription',
      },
    })
  } catch (e) {
    console.error('[plan-checkout] session create failed:', (e as Error).message)
    return json({ error: 'stripe session create failed', detail: (e as Error).message }, 502)
  }

  return json({ url: session.url, session_id: session.id }, 200)
})
