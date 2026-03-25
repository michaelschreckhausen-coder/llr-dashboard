import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WIX_PLAN_ID_MAP: Record<string, string> = {
  '952533cd-7018-47b2-bc82-ff25ebb70dfb': 'starter', // LinkedIn Suite Basic
}

const WIX_PLAN_NAME_MAP: Record<string, string> = {
  'LinkedIn Suite Basic': 'starter',
  'linkedin suite basic': 'starter',
  'Starter': 'starter', 'starter': 'starter',
  'Pro': 'pro', 'pro': 'pro',
  'Enterprise': 'enterprise', 'enterprise': 'enterprise',
  'Free': 'free', 'free': 'free',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Accept key from header OR query parameter (for Wix automations)
    const reqUrl = new URL(req.url)
    const apiKey = req.headers.get('x-api-key')
      || req.headers.get('x-wix-key')
      || reqUrl.searchParams.get('apikey')
      || reqUrl.searchParams.get('key')
      || ''
    const expectedKey = Deno.env.get('WIX_WEBHOOK_SECRET') || ''
    if (expectedKey && apiKey !== expectedKey) {
      console.error('Invalid API key:', apiKey.substring(0, 8) + '...')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    console.log('Wix webhook:', JSON.stringify(body).substring(0, 300))

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const eventType = (body.event || body.type || body.eventType || body.trigger || 'plan_purchased').toLowerCase()
    const email = (
      body.email ||
      body.data?.email ||
      body.buyer?.email ||
      body.member?.loginEmail ||
      body.contact?.email ||
      body.order?.buyer?.email ||
      ''
    ).toLowerCase().trim()

    const wixPlanId   = body.planId   || body.data?.planId   || body.plan?.id   || body.order?.planId   || ''
    const wixPlanName = body.planName || body.data?.planName || body.plan?.name || body.order?.planName || body.plan || ''
    const wixOrderId  = body.orderId  || body.data?.orderId  || body.order?.id  || body.id || null
    const wixMemberId = body.memberId || body.data?.memberId || body.member?.id || null

    // Log event
    await sb.from('webhook_events').insert({
      source: 'wix', event_type: eventType, payload: body, processed: false
    })

    if (!email) {
      console.error('No email found in payload:', JSON.stringify(body).substring(0, 200))
      return new Response(JSON.stringify({ error: 'Missing email in payload', received: Object.keys(body) }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Resolve plan: UUID map first, then name map, then DB lookup
    let planId = WIX_PLAN_ID_MAP[wixPlanId] || WIX_PLAN_NAME_MAP[wixPlanName] || 'free'
    if (planId === 'free' && wixPlanId) {
      const { data: mapping } = await sb.from('wix_plan_mapping').select('plan_id').eq('wix_plan_id', wixPlanId).single()
      if (mapping?.plan_id) planId = mapping.plan_id
    }

    // Determine status
    let status = 'active'
    let periodEnd: string | null = null
    if (eventType.includes('cancel') || eventType.includes('ended') || eventType.includes('expire')) {
      status = 'cancelled'
    } else if (eventType.includes('pause')) {
      status = 'paused'
    } else if (eventType.includes('trial')) {
      status = 'trialing'
      const d = new Date(); d.setDate(d.getDate() + 14); periodEnd = d.toISOString()
    } else {
      const d = new Date(); d.setDate(d.getDate() + 90); periodEnd = d.toISOString()
    }

    console.log(`Upserting: email=${email} plan=${planId} status=${status}`)

    const { data: result, error } = await sb.rpc('upsert_subscription', {
      p_email: email, p_plan_id: planId, p_status: status,
      p_wix_order: wixOrderId, p_wix_plan: wixPlanId || null,
      p_wix_member: wixMemberId || null, p_period_end: periodEnd
    })

    if (error) {
      console.error('upsert error:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    console.log('Success:', JSON.stringify(result))
    return new Response(JSON.stringify({ success: true, plan: planId, status, result }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
