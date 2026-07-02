// src/context/BrandVoiceContext.jsx
// Global aktive Brand Voice — wird im Topbar gewechselt, wirkt überall
// (Redaktionsplan, Text-Werkstatt, Visuals, Brainstorm).
//
// Lade-Logik:
//   1. user_preferences.active_brand_voice_id (persistiert pro User)
//   2. fallback: erste eigene aktive BV
//   3. fallback: erste sichtbare BV (eigene oder team-geteilte)

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useReloadOnNavigate } from '../hooks/useReloadOnNavigate'
import { supabase } from '../lib/supabase'
import { sharedEntityIds, scopeByTeamOrShared } from '../lib/teamShares'
import { useTeam } from './TeamContext'

const BrandVoiceContext = createContext({
  activeBrandVoice: null,
  brandVoices: [],
  loading: true,
  switchBrandVoice: () => {},
  reload: () => {},
})

// Sentinel für den markenlosen Modus (persönlich, nutzer-privat)
export const NO_BRAND = { id: null, noBrand: true, name: 'Ohne Marke', account_type: 'none' }

export function BrandVoiceProvider({ session, children }) {
  const { activeTeamId } = useTeam()
  const [brandVoices, setBrandVoices] = useState([])
  const [activeBrandVoice, setActiveBV] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session?.user?.id) { setLoading(false); return }
    if (!activeTeamId) { setBrandVoices([]); setActiveBV(null); setLoading(false); return }

    // BVs sind team-scoped — User sieht nur BVs des aktiven Teams.
    // RLS filtert zusätzlich nach is_shared / shares für nicht-eigene Items.
    const _bvShared = await sharedEntityIds('brand_voices', activeTeamId)
    const { data: bvs } = await scopeByTeamOrShared(supabase
      .from('brand_voices')
      .select('id, name, brand_name, account_type, linkedin_url, linkedin_display_name, linkedin_avatar_url, linkedin_member_id, linkedin_verified_at, is_shared, is_active, user_id, team_id, ai_summary, visual_style_description, visual_color_palette, visual_keywords, visual_negative_prompt'), activeTeamId, _bvShared)
      .order('user_id', { ascending: true })  // eigene zuerst
      .order('created_at', { ascending: false })

    const list = bvs || []
    setBrandVoices(list)

    // User-Präferenz lesen
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('active_brand_voice_id, content_no_brand')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (prefs?.content_no_brand) { setActiveBV(NO_BRAND); setLoading(false); return }
    let active = null
    if (prefs?.active_brand_voice_id) {
      active = list.find(bv => bv.id === prefs.active_brand_voice_id)
    }
    if (!active) active = list.find(bv => bv.user_id === session.user.id && bv.is_active)
    if (!active) active = list.find(bv => bv.user_id === session.user.id)
    if (!active) active = list[0] || null

    setActiveBV(active)
    setLoading(false)
  }, [session?.user?.id, activeTeamId])

  useEffect(() => { load() }, [load])
  useReloadOnNavigate(load, !!(session?.user?.id && activeTeamId))

  const switchBrandVoice = useCallback(async (bvId) => {
    if (bvId === '__none__') {
      setActiveBV(NO_BRAND)
      await supabase.from('user_preferences').upsert({ user_id: session.user.id, content_no_brand: true }, { onConflict: 'user_id' })
      return
    }
    const next = brandVoices.find(bv => bv.id === bvId)
    if (!next) return
    setActiveBV(next)
    await supabase.from('user_preferences').upsert({ user_id: session.user.id, active_brand_voice_id: bvId, content_no_brand: false }, { onConflict: 'user_id' })
  }, [brandVoices, session?.user?.id])

  return (
    <BrandVoiceContext.Provider value={{
      activeBrandVoice,
      noBrand: !!activeBrandVoice?.noBrand,
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
