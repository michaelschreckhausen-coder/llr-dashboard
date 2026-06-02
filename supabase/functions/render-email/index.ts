// supabase/functions/render-email/index.ts
//
// Sprint K.1 B — Email-Render-Pipeline
//
// Renders ein email_template aus der DB: MJML → HTML, plus Variable-
// Substitution ({{key}}-Pattern), Tenant-Branding-Inject, und Unsubscribe-
// Footer für lifecycle/marketing-Kategorien.
//
// Auth: service_role only (kein public-callable Pfad).
//
// INPUT (POST body):
//   {
//     template_key: string         // e.g. 'welcome_trial_start'
//     locale?:      'de' | 'en'    // Default 'de'. Fallback auf 'de' wenn locale='en' nicht existiert.
//     account_id?:  string         // für tenant-branding-Lookup
//     user_id?:     string         // für Unsubscribe-Token (lifecycle/marketing)
//     variables?:   Record<string, any>  // {{key}}-Substitutions im MJML + Subject
//     base_url?:    string         // optional Override für Unsubscribe-Link-Domain (Default APP_URL_PROD/STAGING)
//   }
//
// OUTPUT:
//   200 { subject, html_body, template_id, template_locale, used_fallback_locale }
//   400 { error: 'invalid_input' | 'template_not_found' }
//   500 { error: 'render_failed', detail }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
// @ts-ignore — mjml type-defs sind hier optional
import mjml2html from 'https://esm.sh/mjml-browser@4.15.3'

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

function getAppUrl(): string {
  const env = Deno.env.get('APP_ENV') || 'staging'
  return env === 'production'
    ? (Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de')
    : (Deno.env.get('APP_URL_STAGING') || 'https://staging.leadesk.de')
}

// {{variable}}-Substitution — Mustache-Light (kein nesting, kein Helpers, nur key-replace).
// Akzeptiert Whitespace innerhalb der Klammern ({{ key }} und {{key}}).
function substituteVariables(source: string, variables: Record<string, any>): string {
  if (!variables || typeof variables !== 'object') return source
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    // Dot-Path-Support: {{user.name}} liest variables.user?.name
    const parts = key.split('.')
    let val: any = variables
    for (const p of parts) {
      if (val == null) return match
      val = val[p]
    }
    if (val == null) return match  // leave placeholder if unset
    return String(val)
  })
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Unsubscribe-Footer als MJML-Block (wird vor dem </mj-body>-Close eingefügt).
// Footer + Link werden nur für lifecycle/marketing-Kategorien gerendered.
function buildUnsubscribeFooterMjml(unsubscribeUrl: string, appUrl: string, locale: 'de' | 'en'): string {
  const labels = locale === 'en'
    ? {
        unsubscribe: 'Unsubscribe from these emails',
        preferences: 'Email preferences',
        company: 'Leadesk GbR · LinkedIn-Suite for B2B-Sales',
      }
    : {
        unsubscribe: 'Diese E-Mails abbestellen',
        preferences: 'E-Mail-Einstellungen verwalten',
        company: 'Leadesk GbR · LinkedIn-Suite für B2B-Sales',
      }
  return `
    <mj-section padding="20px 0 0 0">
      <mj-column>
        <mj-divider border-color="#E4E7EC" border-width="1px" padding="0" />
        <mj-text align="center" font-size="11px" color="#94A3B8" padding="16px 0 4px 0">
          ${labels.company}
        </mj-text>
        <mj-text align="center" font-size="11px" color="#94A3B8" padding="0">
          <a href="${unsubscribeUrl}" style="color: #94A3B8; text-decoration: underline;">${labels.unsubscribe}</a>
          &nbsp;·&nbsp;
          <a href="${appUrl}/settings/notifications" style="color: #94A3B8; text-decoration: underline;">${labels.preferences}</a>
        </mj-text>
      </mj-column>
    </mj-section>`
}

// Branding-Default-Variables-Merge: tenant-branding überschreibt System-Defaults.
function buildBrandingVars(branding: any | null): Record<string, string> {
  return {
    brand_logo_url:        branding?.logo_url || 'https://app.leadesk.de/leadesk-icon.png',
    brand_primary_color:   branding?.primary_color || '#315AE7',
    brand_secondary_color: branding?.secondary_color || '#0F172A',
    brand_sender_name:     branding?.sender_name || 'Leadesk',
    brand_reply_to:        branding?.reply_to_email || 'support@leadesk.de',
    brand_company_name:    branding?.footer_company_name || 'Leadesk GbR',
    brand_company_address: branding?.footer_address || '',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: {
    template_key?: string
    locale?: 'de' | 'en'
    account_id?: string
    user_id?: string
    variables?: Record<string, any>
    base_url?: string
  } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const templateKey = (body.template_key || '').trim()
  if (!templateKey) return json({ error: 'invalid_input', detail: 'template_key required' }, 400)

  const requestedLocale: 'de' | 'en' = body.locale === 'en' ? 'en' : 'de'
  const variables = body.variables || {}

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Template-Lookup mit Locale-Fallback (en → de wenn en nicht existiert)
  let template: any = null
  let usedFallbackLocale = false

  const { data: tplPrimary } = await supabase
    .from('email_templates')
    .select('id, template_key, locale, category, mjml_source, subject, preheader, variable_schema, status')
    .eq('template_key', templateKey)
    .eq('locale', requestedLocale)
    .eq('status', 'published')
    .maybeSingle()

  if (tplPrimary) {
    template = tplPrimary
  } else if (requestedLocale === 'en') {
    // Fallback auf 'de'
    const { data: tplFallback } = await supabase
      .from('email_templates')
      .select('id, template_key, locale, category, mjml_source, subject, preheader, variable_schema, status')
      .eq('template_key', templateKey)
      .eq('locale', 'de')
      .eq('status', 'published')
      .maybeSingle()
    if (tplFallback) {
      template = tplFallback
      usedFallbackLocale = true
    }
  }

  if (!template) {
    return json({ error: 'template_not_found', template_key: templateKey, requested_locale: requestedLocale }, 400)
  }

  // 2. Tenant-Branding-Lookup (optional, basierend auf account_id)
  let branding: any = null
  if (body.account_id) {
    const { data: brandingRow } = await supabase
      .from('email_tenant_branding')
      .select('*')
      .eq('account_id', body.account_id)
      .maybeSingle()
    branding = brandingRow
  }
  const brandingVars = buildBrandingVars(branding)

  // 3. Unsubscribe-Token generieren (nur für lifecycle/marketing + user_id-vorhanden)
  let unsubscribeUrl = ''
  const category = template.category as string
  const needsUnsub = (category === 'lifecycle' || category === 'marketing') && body.user_id
  if (needsUnsub) {
    try {
      const { data: tokenData, error: tokenErr } = await supabase.rpc('generate_unsubscribe_token', {
        p_user_id: body.user_id,
        p_category: category,
      })
      if (tokenErr) {
        console.warn('[render-email] generate_unsubscribe_token failed:', tokenErr.message)
      } else if (tokenData) {
        const baseUrl = body.base_url || getAppUrl()
        unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(tokenData)}`
      }
    } catch (e) {
      console.warn('[render-email] unsubscribe-token error:', (e as Error).message)
    }
  }

  // 4. MJML-Source vorbereiten: alle Variables (user + branding + unsubscribe_url) mergen
  const allVars = {
    ...brandingVars,
    ...variables,
    unsubscribe_url: unsubscribeUrl,
    locale: template.locale,
    app_url: getAppUrl(),
  }

  // 5. Subject + MJML substituieren
  const subject = substituteVariables(template.subject || '', allVars)
  let mjmlSource = substituteVariables(template.mjml_source || '', allVars)

  // 6. Footer für lifecycle/marketing vor </mj-body> injizieren (nur wenn nicht schon Custom-Footer)
  if (needsUnsub && unsubscribeUrl && !/\bclass=["']?leadesk-unsubscribe-footer/i.test(mjmlSource)) {
    const footerBlock = buildUnsubscribeFooterMjml(unsubscribeUrl, getAppUrl(), template.locale)
    if (mjmlSource.includes('</mj-body>')) {
      mjmlSource = mjmlSource.replace('</mj-body>', footerBlock + '\n</mj-body>')
    } else {
      // Defensive: kein </mj-body> → log, render trotzdem
      console.warn('[render-email] MJML hat kein </mj-body>-Tag — Footer wird nicht injiziert. template:', templateKey)
    }
  }

  // 7. MJML → HTML
  let html = ''
  try {
    const result = mjml2html(mjmlSource, { validationLevel: 'soft', minify: false })
    if (result.errors && result.errors.length > 0) {
      console.warn('[render-email] MJML warnings:', JSON.stringify(result.errors.map((e: any) => e.message)))
    }
    html = result.html || ''
  } catch (e) {
    console.error('[render-email] MJML compile failed:', (e as Error).message)
    return json({ error: 'render_failed', detail: (e as Error).message }, 500)
  }

  if (!html) {
    return json({ error: 'render_failed', detail: 'empty_html' }, 500)
  }

  return json({
    subject,
    html_body: html,
    template_id: template.id,
    template_locale: template.locale,
    used_fallback_locale: usedFallbackLocale,
    category: template.category,
  })
})
