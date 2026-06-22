// supabase/functions/create-addon-checkout-session/index.ts
//
// Erstellt eine Stripe-Checkout-Session für ein Marketplace-Add-on.
//
// Pfad:
//   1. JWT-Auth aus Authorization-Header → user_id
//   2. account_id via teams.account_id-Brücke (erstes Team des Users)
//   3. addon-Lookup über slug → stripe_price_id Pflicht
//   4. account.stripe_customer_id wiederverwenden ODER neu in Stripe anlegen
//      → in accounts-Row schreiben
//   5. Stripe-Checkout-Session anlegen (mode=subscription)
//      metadata.flow='marketplace_addon' damit der Add-on-Webhook
//      die richtigen Events erkennt
//   6. Return { url }
//
// ENV (in docker-compose.yml als environment-Eintrag ergänzen, kein env_file):
//   STRIPE_SECRET_KEY
//   APP_URL_PROD     z.B. https://app.leadesk.de
//   APP_URL_STAGING  z.B. https://staging.leadesk.de
//   APP_ENV          'production' | 'staging'   (steuert welche URL Success/Cancel nutzt)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Top-Fallstrick #12: service-role-Grant auf accounts/addons/teams/team_members
// muss vorhanden sein (sind sie auf Hetzner-Prod laut Phase-0/Phase-2-Migration).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing auth' }, 401)
  const jwt = authHeader.replace(/^Bearer\s+/, '')

  // Body
  let body: { addon_slug?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
  const addonSlug = (body.addon_slug || '').trim()
  if (!addonSlug) return json({ error: 'addon_slug required' }, 400)

  // Service-role-Client für DB-Reads (umgeht RLS, wir machen Auth-Check selbst)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. JWT → user
  const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userRes?.user) {
    console.warn('[create-addon-checkout-session] auth failed:', userErr?.message)
    return json({ error: 'unauthorized' }, 401)
  }
  const userId = userRes.user.id
  const userEmail = userRes.user.email || null

  // 2. account_id via teams.account_id (erstes Team des Users)
  const { data: teamRow, error: teamErr } = await supabase
    .from('team_members')
    .select('team_id, teams(account_id)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (teamErr) {
    console.error('[create-addon-checkout-session] team lookup error:', teamErr.message)
    return json({ error: 'team lookup failed' }, 500)
  }
  const accountId: string | null = teamRow?.teams?.account_id || null
  if (!accountId) return json({ error: 'no account context' }, 400)

  // 3. addon-Lookup
  const { data: addon, error: addonErr } = await supabase
    .from('addons')
    .select('id, slug, name, stripe_price_id, currency, trial_period_days')
    .eq('slug', addonSlug)
    .eq('is_active', true)
    .maybeSingle()
  if (addonErr) {
    console.error('[create-addon-checkout-session] addon lookup error:', addonErr.message)
    return json({ error: 'addon lookup failed' }, 500)
  }
  if (!addon) return json({ error: 'addon_not_found' }, 404)
  if (!addon.stripe_price_id) return json({ error: 'addon_not_priced' }, 400)

  // 4. account-Lookup + Stripe-Customer wiederverwenden oder neu anlegen
  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('id, name, billing_email, stripe_customer_id')
    .eq('id', accountId)
    .maybeSingle()
  if (accountErr || !account) {
    console.error('[create-addon-checkout-session] account lookup error:', accountErr?.message)
    return json({ error: 'account lookup failed' }, 500)
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) return json({ error: 'stripe not configured' }, 500)
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

  let customerId = account.stripe_customer_id
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: account.billing_email || userEmail || undefined,
        name: account.name || undefined,
        metadata: { account_id: account.id, source: 'leadesk_marketplace' },
      })
      customerId = customer.id
      const { error: updErr } = await supabase
        .from('accounts')
        .update({ stripe_customer_id: customerId })
        .eq('id', account.id)
      if (updErr) console.warn('[create-addon-checkout-session] customer-id persist failed:', updErr.message)
    } catch (e) {
      console.error('[create-addon-checkout-session] stripe customer create failed:', (e as Error).message)
      return json({ error: 'stripe customer create failed' }, 502)
    }
  }

  // 5. Checkout-Session anlegen
  const env = Deno.env.get('APP_ENV') || 'staging'
  const appUrl = env === 'production'
    ? (Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de')
    : (Deno.env.get('APP_URL_STAGING') || 'https://staging.leadesk.de')
  const successUrl = `${appUrl}/marketplace?addon_subscribed=${encodeURIComponent(addon.slug)}`
  const cancelUrl  = `${appUrl}/marketplace?addon_canceled=${encodeURIComponent(addon.slug)}`

  let session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: addon.stripe_price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      // Subscription-Metadata wandert auf das subscription-Objekt
      // und ist im customer.subscription.* Webhook abrufbar.
      subscription_data: {
        // Trial nur wenn am Addon konfiguriert (addons.trial_period_days) — z.B.
        // Free→Paid-Cutover strike2/sales-nav = 14d. auralis/premium = NULL = kein Trial.
        ...(addon.trial_period_days ? { trial_period_days: addon.trial_period_days } : {}),
        metadata: {
          account_id: account.id,
          addon_id: addon.id,
          addon_slug: addon.slug,
          flow: 'marketplace_addon',
        },
      },
      // Session-Metadata zusätzlich für checkout.session.completed
      metadata: {
        account_id: account.id,
        addon_id: addon.id,
        addon_slug: addon.slug,
        flow: 'marketplace_addon',
      },
    })
  } catch (e) {
    console.error('[create-addon-checkout-session] stripe session create failed:', (e as Error).message)
    return json({ error: 'stripe session create failed' }, 502)
  }

  return json({ url: session.url, session_id: session.id }, 200)
})
