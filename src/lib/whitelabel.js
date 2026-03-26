import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const DEFAULT_WL = {
  app_name: 'Lead Radar',
  logo_url: null,
  primary_color: '#0A66C2',
  secondary_color: '#10B981',
  accent_color: '#8B5CF6',
  sidebar_bg: '#FFFFFF',
}

export const WhiteLabelContext = createContext(DEFAULT_WL)

export function useWhiteLabel() {
  return useContext(WhiteLabelContext)
}

export async function loadWhiteLabelSettings() {
  try {
    const { data, error } = await supabase
      .from('whitelabel_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (error || !data) return DEFAULT_WL
    return { ...DEFAULT_WL, ...data }
  } catch {
    return DEFAULT_WL
  }
}

export async function saveWhiteLabelSettings(settings) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')
  const { error } = await supabase
    .from('whitelabel_settings')
    .upsert({ ...settings, user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}
