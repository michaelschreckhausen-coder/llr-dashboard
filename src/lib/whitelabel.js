// ─── Whitelabel / Tenant-System ───────────────────────────────────────────
import { supabase } from './supabase'

export const DEFAULT_WL = {
  app_name:       'Leadesk',
  logo_url:       null,
  favicon_url:    null,
  primary_color:  'var(--wl-primary, rgb(49,90,231))',
  secondary_color:'#10B981',
  accent_color:   '#8B5CF6',
  sidebar_bg:     '#FFFFFF',
  font_family:    'Inter',
  custom_css:     null,
  hide_branding:  false,
}

// Erkennt den aktuellen Tenant anhand der Subdomain/Domain
export function getCurrentSubdomain() {
  const host = window.location.hostname  // z.B. "acme.leadesk.de" oder "crm.acme.de"
  if (host === 'localhost' || host === '127.0.0.1') return 'app'
  // Leadesk-eigene Subdomains: erster Teil
  if (host.endsWith('.leadesk.de')) return host.replace('.leadesk.de', '')
  if (host.endsWith('.vercel.app'))  return 'app'
  // Custom Domain → voller Hostname
  return host
}

// Lädt Tenant + WhiteLabel-Settings per Subdomain (auch ohne Auth)
export async function loadTenantSettings(subdomain) {
  try {
    // Zuerst Tenant per Subdomain suchen
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, plan, is_active')
      .or(`subdomain.eq.${subdomain},custom_domain.eq.${subdomain}`)
      .eq('is_active', true)
      .maybeSingle()

    if (!tenant) return { ...DEFAULT_WL, _tenant: null }

    // WhiteLabel-Settings für diesen Tenant
    const { data: wl } = await supabase
      .from('whitelabel_settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    return {
      ...DEFAULT_WL,
      ...(wl || {}),
      _tenant: tenant,
    }
  } catch {
    return { ...DEFAULT_WL, _tenant: null }
  }
}

// Fallback: lädt eigene WL-Settings (für Super-Admin / Legacy)
export async function loadWhiteLabelSettings() {
  try {
    const subdomain = getCurrentSubdomain()
    return await loadTenantSettings(subdomain)
  } catch {
    return { ...DEFAULT_WL }
  }
}


// Lädt WL-Settings direkt per tenant_id (für Admin-Panel)
export async function loadSettingsByTenantId(tenantId) {
  try {
    const { data } = await supabase
      .from('whitelabel_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    return { ...DEFAULT_WL, ...(data || {}) }
  } catch {
    return { ...DEFAULT_WL }
  }
}

// Speichert WL-Settings für einen Tenant (Admin-Funktion)
export async function saveWhiteLabelSettings(settings, tenantId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const payload = {
    app_name:        settings.app_name        || DEFAULT_WL.app_name,
    logo_url:        settings.logo_url        || null,
    favicon_url:     settings.favicon_url     || null,
    primary_color:   settings.primary_color   || DEFAULT_WL.primary_color,
    secondary_color: settings.secondary_color || DEFAULT_WL.secondary_color,
    accent_color:    settings.accent_color    || DEFAULT_WL.accent_color,
    sidebar_bg:      settings.sidebar_bg      || DEFAULT_WL.sidebar_bg,
    font_family:     settings.font_family     || DEFAULT_WL.font_family,
    custom_css:      settings.custom_css      || null,
    hide_branding:   settings.hide_branding   ?? false,
    updated_at:      new Date().toISOString(),
  }

  if (tenantId) {
    payload.tenant_id = tenantId
    // Prüfe ob bereits ein Eintrag für diesen Tenant existiert
    const { data: existing } = await supabase
      .from('whitelabel_settings')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    
    let error
    if (existing) {
      // UPDATE
      ;({ error } = await supabase
        .from('whitelabel_settings')
        .update(payload)
        .eq('tenant_id', tenantId))
    } else {
      // INSERT
      ;({ error } = await supabase
        .from('whitelabel_settings')
        .insert(payload))
    }
    if (error) throw error
  } else {
    payload.user_id = user.id
    const { data: existing } = await supabase
      .from('whitelabel_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    
    let error
    if (existing) {
      ;({ error } = await supabase
        .from('whitelabel_settings')
        .update(payload)
        .eq('user_id', user.id))
    } else {
      ;({ error } = await supabase
        .from('whitelabel_settings')
        .insert(payload))
    }
    if (error) throw error
  }
}

// Injiziert CSS-Variablen in :root — macht das ganze App theming
export function applyTheme(wl) {
  const root = document.documentElement

  // Nur bei echtem Custom-Wert setzen — wenn ungesetzt greift der CSS-Fallback
  // (Dark-Mode: Sky fuer Lesbarkeit, Light-Mode: Navy). Sonst wuerde inline-style den
  // Dark-Mode-Fallback immer ueberschreiben, auch wenn der Kunde keine eigene Farbe gewaehlt hat.
  if (wl.primary_color)   root.style.setProperty('--wl-primary',   wl.primary_color)
  if (wl.secondary_color) root.style.setProperty('--wl-secondary', wl.secondary_color)
  if (wl.accent_color)    root.style.setProperty('--wl-accent',    wl.accent_color)

  // sidebar_bg: Nur setzen wenn der Tenant explizit vom Theme-Default abweicht.
  // '#FFFFFF' = "Theme-Default verwenden" (im Light: weiß, im Dark: Glass).
  // Agentur-Tenants können stattdessen z.B. ein Brand-Cream setzen das für beide
  // Themes gleich aussehen soll.
  const bg = wl.sidebar_bg
  if (bg && bg !== '#FFFFFF' && bg !== '#ffffff') {
    root.style.setProperty('--wl-sidebar-bg', bg)
  } else {
    root.style.removeProperty('--wl-sidebar-bg')
  }

  root.style.setProperty('--wl-app-name',   `"${wl.app_name || DEFAULT_WL.app_name}"`)
  root.style.setProperty('--wl-font',       wl.font_family || 'Inter')

  // Favicon updaten
  if (wl.favicon_url) {
    let link = document.querySelector("link[rel*='icon']")
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = wl.favicon_url
  }

  // Page-Title updaten
  if (wl.app_name && wl.app_name !== 'Leadesk') {
    document.title = wl.app_name
  }

  // Custom CSS injizieren
  if (wl.custom_css) {
    let styleEl = document.getElementById('wl-custom-css')
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'wl-custom-css'; document.head.appendChild(styleEl) }
    styleEl.textContent = wl.custom_css
  }

  return wl
}
