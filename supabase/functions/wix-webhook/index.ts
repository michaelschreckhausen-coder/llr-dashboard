import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Plan mapping: Wix plan names -> our plan IDs
const WIX_PLAN_MAP: Record<string, string> = {
  'starter':    'starter',
  'Starter':    'starter',
  'pro':        'pro',
  'Pro':        'pro',
  'enterprise': 'enterprise',
  'Enterprise': 'enterprise',
  'free':       'free',
  'Free':       'free',
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate API key from Wix webhook header
    const apiKey = req.headers.get('x-api-key') || req.headers.get('x-wix-key')
    const expectedKey = Deno.env.get('WIX_WEBHOOK_SECRET')
    if (expectedKey && apiKey !== expectedKey) {
      console.error('Invalid webhook secret')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    console.log('Wix webhook received:', JSON.stringify(body))

    // Supabase service client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Log event
    await supabase.from('webhook_events').insert({
      source: 'wix',
      event_type: body.event || body.type || 'unknown',
      payload: body,
      processed: false
    })

    // Parse event
    const eventType: string = (body.event || body.type || '').toLowerCase()
    const email: string     = body.email || body.data?.email || body.member?.email || ''
    const wixPlanName: string = body.plan || body.data?.plan || body.planName || ''
    const wixOrderId: string  = body.orderId || body.data?.orderId || body.id || ''
    const wixPlanId: string   = body.planId  || body.data?.planId  || ''
    const wixMemberId: string = body.memberId|| body.data?.memberId|| ''

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email in payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const planId: string = WIX_PLAN_MAP[wixPlanName] || 'free'
    let status  = 'active'
    let periodEnd: string | null = null

    // Determine subscription status
    if (eventType.includes('purchas') || eventType.includes('order') || eventType.includes('activated')) {
      status = 'active'
      // Set period end to 30 days from now by default
      const end = new Date()
      end.setDate(end.getDate() + 30)
      periodEnd = end.toISOString()
    } else if (eventType.includes('cancel') || eventType.includes('ended')) {
      status = 'cancelled'
    } else if (eventType.includes('pause')) {
      status = 'paused'
    } else if (eventType.includes('trial')) {
      status = 'trialing'
      const end = new Date()
      end.setDate(end.getDate() + 14)
      periodEnd = end.toISOString()
    }

    // Upsert subscription
    const { data: result, error } = await supabase.rpc('upsert_subscription', {
      p_email:      email,
      p_plan_id:    planId,
      p_status:     status,
      p_wix_order:  wixOrderId  || null,
      p_wix_plan:   wixPlanId   || null,
      p_wix_member: wixMemberId || null,
      p_period_end: periodEnd
    })

    if (error) {
      console.error('upsert_subscription error:', error)
      await supabase.from('webhook_events').update({ processed: false, error: error.message })
        .eq('payload->>"orderId"', wixOrderId)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mark event as processed
    await supabase.from('webhook_events').update({ processed: true })
      .order('created_at', { ascending: false }).limit(1)

    console.log('Subscription upserted:', result)
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
