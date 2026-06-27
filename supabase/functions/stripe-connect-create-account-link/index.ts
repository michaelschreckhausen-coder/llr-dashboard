// supabase/functions/stripe-connect-create-account-link/index.ts
//
// Affiliate-System Phase 5 — Stripe-Connect-Express-Onboarding.
// POST (Affiliate-JWT im Authorization-Header):
//   1. Affiliate via auth.uid() auflösen (service-role)
//   2. Falls kein stripe_connect_account_id: Express-Account anlegen (DE, transfers)
//      → UPDATE affiliates.stripe_connect_account_id
//   3. accountLinks.create (account_onboarding) → { url }
//   4. onboarding_started_at = now()
// Frontend redirected window.location.href = url.
//
// ENV: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const ALLOWED = new Set(['https://affiliate.leadesk.de', 'http://localhost:5173'])
function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.has(origin) ? origin : 'https://affiliate.leadesk.de',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const headers = { ...cors(origin), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers })

  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers })

    const { data: ud, error: uErr } = await admin.auth.getUser(jwt)
    if (uErr || !ud?.user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    const user = ud.user

    const { data: aff, error: aErr } = await admin
      .from('affiliates')
      .select('id, stripe_connect_account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (aErr) return new Response(JSON.stringify({ error: aErr.message }), { status: 500, headers })
    if (!aff) return new Response(JSON.stringify({ error: 'no affiliate account' }), { status: 403, headers })

    let accountId = aff.stripe_connect_account_id
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        country: 'DE',
        email: user.email || undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { affiliate_id: aff.id, flow: 'affiliate_connect' },
      })
      accountId = acct.id
      const { error: updErr } = await admin.from('affiliates')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', aff.id)
      if (updErr) console.warn('[connect] account-id persist failed:', updErr.message)
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'https://affiliate.leadesk.de/einstellungen?refresh=true',
      return_url: 'https://affiliate.leadesk.de/einstellungen?onboarding=done',
      type: 'account_onboarding',
    })

    await admin.from('affiliates').update({ onboarding_started_at: new Date().toISOString() }).eq('id', aff.id)

    return new Response(JSON.stringify({ url: link.url }), { headers })
  } catch (e) {
    console.error('[stripe-connect-create-account-link] error:', (e as Error).message)
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502, headers })
  }
})
