// supabase/functions/unsubscribe/index.ts
//
// Sprint L.9 A — Public unsubscribe-EF (Wrapper für consume_unsubscribe_token-RPC)
//
// Public anon-callable. Verify-JWT=false. Konsumiert einen Unsubscribe-Token,
// setzt user_email_preferences.opted_out_* je nach token.category. Idempotent.
//
// INPUT (GET ?token= oder POST body {token}):
//   { token: string }   (32-char hex aus generate_unsubscribe_token-RPC)
//
// OUTPUT:
//   200 { success: true, category: 'lifecycle'|'marketing'|'all', user_id: string }
//   400 { success: false, reason: 'invalid_token'|'token_not_found' }
//   500 { success: false, reason: 'server_error' }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let token = ''
  if (req.method === 'GET') {
    const url = new URL(req.url)
    token = url.searchParams.get('token') || ''
  } else if (req.method === 'POST') {
    try {
      const body = await req.json()
      token = (body?.token || '').trim()
    } catch {
      return json({ success: false, reason: 'invalid_json' }, 400)
    }
  } else {
    return json({ success: false, reason: 'method_not_allowed' }, 405)
  }

  if (!token || token.length < 16) {
    return json({ success: false, reason: 'invalid_token' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const { data, error } = await supabase.rpc('consume_unsubscribe_token', { p_token: token })

    if (error) {
      console.error('[unsubscribe] consume_unsubscribe_token failed:', error.message)
      return json({ success: false, reason: 'server_error', detail: error.message }, 500)
    }

    // consume_unsubscribe_token returnt jsonb {success, user_id?, category?, reason?}
    const result = data as { success: boolean; user_id?: string; category?: string; reason?: string }

    if (!result.success) {
      return json({ success: false, reason: result.reason || 'token_not_found' }, 400)
    }

    return json({
      success: true,
      category: result.category,
      user_id: result.user_id,
    })
  } catch (e) {
    console.error('[unsubscribe] unexpected error:', (e as Error).message)
    return json({ success: false, reason: 'server_error' }, 500)
  }
})
