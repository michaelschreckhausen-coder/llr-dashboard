// src/context/BrandVoiceContext.jsx
// Global aktive Brand Voice — wird im Topbar gewechselt, wirkt überall
// (Redaktionsplan, Text-Werkstatt, Visuals, Brainstorm).
//
// Lade-Logik:
//   1. user_preferences.active_brand_voice_id (persistiert pro User)
//   2. fallback: erste eigene aktive BV
//   3. fallback: erste sichtbare BV (eigene oder team-geteilte)

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BrandVoiceContext = createContext({
  activeBrandVoice: null,
  brandVoices: [],
  loading: true,
  switchBrandVoice: () => {},
  reload: () => {},
})

export function BrandVoiceProvider({ session, children }) {
  const [brandVoices, setBrandVoices] = useState([])
  const [activeBrandVoice, setActiveBV] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session?.user?.id) { setLoading(false); return }

    // Alle sichtbaren BVs (RLS filtert: eigene + team-shared)
    const { data: bvs } = await supabase
      .from('brand_voices')
      .select('id, name, brand_name, account_type, linkedin_url, linkedin_display_name, linkedin_avatar_url, linkedin_member_id, linkedin_verified_at, is_shared, is_active, user_id, team_id, ai_summary, visual_style_description, visual_color_palette, visual_keywords, visual_negative_prompt')
      .order('user_id', { ascending: true })  // eigene zuerst
      .order('created_at', { ascending: false })

    const list = bvs || []
    setBrandVoices(list)

    // User-Präferenz lesen
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('active_brand_voice_id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    let active = null
    if (prefs?.active_brand_voice_id) {
      active = list.find(bv => bv.id === prefs.active_brand_voice_id)
    }
    if (!active) active = list.find(bv => bv.user_id === session.user.id && bv.is_active)
    if (!active) active = list.find(bv => bv.user_id === session.user.id)
    if (!active) active = list[0] || null

    setActiveBV(active)
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => { load() }, [load])

  const switchBrandVoice = useCallback(async (bvId) => {
    const next = brandVoices.find(bv => bv.id === bvId)
    if (!next) return
    setActiveBV(next)
    // Persistieren
    await supabase
      .from('user_preferences')
      .upsert({ user_id: session.user.id, active_brand_voice_id: bvId }, { onConflict: 'user_id' })
  }, [brandVoices, session?.user?.id])

  return (
    <BrandVoiceContext.Provider value={{
      activeBrandVoice,
      brandVoices,
      loading,
      switchBrandVoice,
      reload: load,
    }}>
      {children}
    </BrandVoiceContext.Provider>
  )
}

export function useBrandVoice() {
  return useContext(BrandVoiceContext)
}
