// supabase/functions/register-affiliate-click/index.ts
//
// Affiliate-System Phase 2 — Public Click-Tracking-Endpoint (KEIN User-Auth).
// POST { code, utm_source?, utm_medium?, utm_campaign?, landed_at_url? }
//   → hasht IP (cf-connecting-ip / x-forwarded-for) + User-Agent via SHA-256
//   → ruft register_affiliate_click-RPC (service-role)
//   → { click_id: uuid | null }   (null bei unbekanntem/inaktivem Code — KEIN Error,
//      damit Tracking-Failures die Customer-Journey nie stören)
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auf supabase-edge-functions vorhanden).
// Deploy: SCP aufs Volume + docker restart supabase-edge-functions (CLAUDE.md #11).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const ALLOWED_ORIGINS = new Set([
  'https://app.leadesk.de',
  'https://staging.leadesk.de',
  'http://localhost:5173',
])

function corsHeaders(origin: string) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.leadesk.de'
  return {
    'Access-Control-Allow-Origin': allow,
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

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return new Response(JSON.stringify({ click_id: null }), { status: 405, headers })

  try {
    const body = await req.json().catch(() => ({}))
    const code = (body?.code ?? '').toString().trim()
    if (!code) return new Response(JSON.stringify({ click_id: null }), { headers })

    const ipRaw = req.headers.get('cf-connecting-ip')
      || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || ''
    const uaRaw = req.headers.get('user-agent') || ''

    const ip_hash = ipRaw ? await sha256(ipRaw) : null
    const ua_hash = uaRaw ? await sha256(uaRaw) : null

    const { data, error } = await admin.rpc('register_affiliate_click', {
      p_code: code,
      p_ip_hash: ip_hash,
      p_ua_hash: ua_hash,
      p_utm_source: body?.utm_source ?? null,
      p_utm_medium: body?.utm_medium ?? null,
      p_utm_campaign: body?.utm_campaign ?? null,
      p_landed_at_url: body?.landed_at_url ?? null,
    })

    if (error) {
      console.warn('[register-affiliate-click] rpc error:', error.message)
      return new Response(JSON.stringify({ click_id: null }), { headers })
    }
    return new Response(JSON.stringify({ click_id: data ?? null }), { headers })
  } catch (e) {
    console.warn('[register-affiliate-click] error:', (e as Error).message)
    return new Response(JSON.stringify({ click_id: null }), { headers })
  }
})
