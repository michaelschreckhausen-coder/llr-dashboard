// useEntitlements — liefert dem Frontend die Modul-Freischaltung
// des aktuellen Users. Quelle: RPC public.get_my_entitlements()
// (siehe Migration 20260502110000_module_entitlements_rpcs.sql).
//
// Der Hook ist bewusst einfach gehalten und cached den Zustand pro Mount.
// Bei Plan- oder Account-Änderung kann via reload() neu geladen werden.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = {
  account_id:      null,
  plan_id:         null,
  plan_name:       null,
  modules:         [],
  is_trial:        false,
  trial_ends_at:   null,
  trial_days_left: null,
  account_status:  null,
  is_active:       false,
}

export function useEntitlements() {
  const [data,    setData]    = useState(null)   // null = noch nicht geladen
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: rpc, error: rpcError } = await supabase.rpc('get_my_entitlements')
      if (rpcError) throw rpcError
      // RPC kann jsonb zurückgeben — modules ist dann JSON-Array
      const ents = rpc ? { ...EMPTY, ...rpc } : { ...EMPTY }
      // Sicherstellen dass modules immer ein JS-Array ist
      ents.modules = Array.isArray(ents.modules) ? ents.modules : []
      setData(ents)
    } catch (e) {
      console.error('[useEntitlements] load failed:', e)
      setError(e.message || 'load_failed')
      setData({ ...EMPTY })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // hasModule(key): boolean
  const hasModule = useCallback((key) => {
    if (!data) return false
    if (!data.is_active) return false
    return Array.isArray(data.modules) && data.modules.includes(key)
  }, [data])

  return {
    entitlements: data,
    loading,
    error,
    hasModule,
    reload: load,
    // Convenience-Felder
    modules:        data?.modules || [],
    isTrial:        data?.is_trial || false,
    trialEndsAt:    data?.trial_ends_at || null,
    trialDaysLeft:  data?.trial_days_left ?? null,
    accountStatus:  data?.account_status || null,
    isActive:       data?.is_active || false,
    planId:         data?.plan_id || null,
    planName:       data?.plan_name || null,
  }
}
