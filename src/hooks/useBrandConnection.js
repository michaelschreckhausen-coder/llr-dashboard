// useBrandConnection — zentraler Verbindungs-Status der AKTIVEN Marke.
// Quelle: RPC get_brand_connection_caps (SECURITY DEFINER, has_brand_access-Gate).
//  connected = personal: eigener OK-unipile_account | company_page: org gesetzt + acting-Account OK.
// Wird vom LinkedInConnectionGate genutzt, um profil-erhobene Daten auszublenden,
// wenn das Profil getrennt ist (Daten bleiben in der DB, kommen beim Reconnect zurueck).
//
// Selbst-Heilung (2026-08): Der Connect laeuft als Full-Redirect ueber die Marken-
// Seite (BrandVoice, ?li_unipile=…), NICHT ueber die Gate-Seite. Wer verbindet,
// waehrend die Gate-Tab offen bleibt (oder out-of-band, z.B. Jan Eckardt), sah den
// Gate bis zum manuellen Reload. Fix: beim Wieder-Sichtbar/-Fokussieren des Tabs den
// Status STILL nachziehen (kein loading-Flash) → Gate verschwindet ohne Reload.
// Zusaetzlich wird refetch() nach aussen gegeben (fuer explizite Invalidierung).
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'

const EMPTY = { loading: false, connected: false, caps: {}, accountType: 'personal', orgConnected: false, status: null }

export function useBrandConnection() {
  const { activeBrandVoice } = useBrandVoice()
  const bvId = activeBrandVoice?.id || null
  const fallbackType = activeBrandVoice?.account_type || 'personal'
  const [state, setState] = useState({ ...EMPTY, loading: true })

  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Einheitlicher Loader. silent=true → kein loading-Flash (Refetch nach Connect /
  // Tab-Refokus); silent=false → initialer Load / Marken-Wechsel (mit Orb, wie bisher).
  const load = useCallback(async (silent = false) => {
    if (!bvId) { if (mountedRef.current) setState({ ...EMPTY }); return EMPTY }
    if (!silent && mountedRef.current) setState((s) => ({ ...s, loading: true }))
    const { data, error } = await supabase.rpc('get_brand_connection_caps', { p_brand_voice_id: bvId })
    if (!mountedRef.current) return
    const next = (error || !data || data.error)
      ? { ...EMPTY, accountType: fallbackType }
      : {
          loading: false,
          connected: !!data.connected,
          caps: data.caps || {},
          accountType: data.account_type || 'personal',
          orgConnected: !!data.org_connected,
          status: data.status || null,
        }
    setState(next)
    return next
  }, [bvId, fallbackType])

  // Mount / Marken-Wechsel: unveraendertes Verhalten (mit Orb).
  useEffect(() => { load(false) }, [load])

  // Selbst-Heilung: Tab wird wieder sichtbar/fokussiert → Status still nachziehen.
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

export default useBrandConnection
