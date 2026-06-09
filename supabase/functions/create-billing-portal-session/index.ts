// supabase/functions/create-billing-portal-session/index.ts
//
// Stripe Phase 3 — Customer-Portal-Session.
//
// Use-Case: User klickt "Abonnement verwalten" in /settings/konto →
//           Stripe-hosted Customer-Portal (Subscription pausen/cancellen,
//           Karte ändern, Rechnungen-Download).
//
// Pfad:
//   1. JWT-Auth → account_id + stripe_customer_id
//   2. Stripe.billingPortal.sessions.create
//   3. return { url }

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

  let body: { return_path?: string } = {}
  try { body = await req.json() } catch { /* leer ist ok */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
  const userId = userRes.user.id

  const { data: teamRow } = await supabase
    .from('team_members')
    .select('team_id, teams(account_id)')
    .eq('user_id', userId).limit(1).maybeSingle()
  const accountId: string | null = (teamRow as any)?.teams?.account_id || null
  if (!accountId) return json({ error: 'no account context' }, 400)

  const { data: account } = await supabase
    .from('accounts')
    .select('stripe_customer_id')
    .eq('id', accountId).maybeSingle()

  if (!account?.stripe_customer_id) {
    return json({ error: 'no_stripe_customer', hint: 'User hat noch kein Abo abgeschlossen' }, 404)
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) return json({ error: 'stripe not configured' }, 500)
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

  const env = Deno.env.get('APP_ENV') || 'staging'
  const appUrl = env === 'production'
    ? (Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de')
    : (Deno.env.get('APP_URL_STAGING') || 'https://staging.leadesk.de')
  const returnUrl = `${appUrl}${body.return_path || '/settings/konto'}`

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: returnUrl,
    })
    return json({ url: session.url })
  } catch (e) {
    console.error('[billing-portal] session create failed:', (e as Error).message)
    return json({ error: 'stripe session create failed', detail: (e as Error).message }, 502)
  }
})
