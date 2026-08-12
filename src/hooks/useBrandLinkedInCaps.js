// useBrandLinkedInCaps — pro-Bereich-Freigabe-Flags der AKTIVEN Marke (Consumer-Sicht).
// Quelle: RPC get_brand_linkedin_caps (SECURITY DEFINER, has_brand_access-Gate) →
//   { inbox, network, search, automation, engagement, analytics } je bool,
//   ODER { error:'forbidden' } wenn keinerlei Marken-Zugriff.
// Für Owner/Per-User sind alle Bereiche true (has_brand_access_direct). Ein geteiltes
// Team sieht nur die vom Eigentümer freigegebenen Bereiche → der LinkedInConnectionGate
// nutzt das, um für einen NICHT freigegebenen Bereich einen Hinweis statt einer leeren
// Seite zu zeigen. Rein additiv — die DB-Enforcement (RLS/RPCs/EFs) steht unabhängig.
//
// Muster wie useBrandConnection: gleiche Brand-Quelle (BrandVoiceContext), Silent-
// Refetch bei Tab-Refokus (Self-Heal, sobald der Owner die Freigabe ändert).
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'

const EMPTY = { loading: false, caps: {} }

export function useBrandLinkedInCaps() {
  const { activeBrandVoice } = useBrandVoice()
  const bvId = activeBrandVoice?.id || null
  const [state, setState] = useState({ ...EMPTY, loading: true })

  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async (silent = false) => {
    if (!bvId) { if (mountedRef.current) setState({ ...EMPTY }); return EMPTY }
    if (!silent && mountedRef.current) setState((s) => ({ ...s, loading: true }))
    const { data, error } = await supabase.rpc('get_brand_linkedin_caps', { p_brand_voice_id: bvId })
    if (!mountedRef.current) return
    // Fehler/forbidden → keine Bereiche granted (leeres caps). granted(area) fällt dann auf false.
    const caps = (error || !data || data.error) ? {} : data
    const next = { loading: false, caps }
    setState(next)
    return next
  }, [bvId])

  useEffect(() => { load(false) }, [load])

  useEffect(() => {
    if (!bvId) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [bvId, load])

  return { ...state, refetch: () => load(true) }
}

export default useBrandLinkedInCaps
