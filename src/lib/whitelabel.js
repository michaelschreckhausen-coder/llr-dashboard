import { supabase } from './supabase'

export const DEFAULT_WL = {
  app_name: 'Lead Radar',
  logo_url: null,
  primary_color: '#0A66C2',
  secondary_color: '#10B981',
  accent_color: '#8B5CF6',
  sidebar_bg: '#FFFFFF',
}

export async function loadWhiteLabelSettings() {
  try {
    const { data, error } = await supabase
      .from('whitelabel_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data) return { ...DEFAULT_WL }
    return { ...DEFAULT_WL, ...data }
  } catch {
    return { ...DEFAULT_WL }
  }
}

export async function saveWhiteLabelSettings(settings) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')
  const { error } = await supabase
    .from('whitelabel_settings')
    .upsert({
      user_id: user.id,
      app_name: settings.app_name || DEFAULT_WL.app_name,
      logo_url: settings.logo_url || null,
      primary_color: settings.primary_color || DEFAULT_WL.primary_color,
      secondary_color: settings.secondary_color || DEFAULT_WL.secondary_color,
      accent_color: settings.accent_color || DEFAULT_WL.accent_color,
      sidebar_bg: settings.sidebar_bg || DEFAULT_WL.sidebar_bg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) throw error
}
