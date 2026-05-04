// EntitlementsContext (Phase 5 Block 3.6 v2 — Provider-Refactor)
//
// Hintergrund:
//   useEntitlements() wird von 6 Components parallel gerufen
//   (Layout, TrialBanner, ModuleGuard, Billing, SettingsKonto, Profile).
//   Auf /billing sind 3 davon gleichzeitig gemounted (Layout + TrialBanner +
//   Billing) — vor diesem Refactor entstanden 3 separate Hook-Instanzen mit
//   3 Channel-Setups auf gleichem Topic `account:${id}` → Race-Condition
//   "cannot add postgres_changes callbacks ... after subscribe()".
//
// Loesung: zentralisierter Provider mit EINEM Hook-State + EINEM Channel-Setup.
// useEntitlements() (in src/hooks/useEntitlements.js) wird zum Context-Reader.
//
// Reload-Trigger (4-Layer):
//   1. Mount + session.user.id-change
//   2. Manual via refresh()
//   3. visibilitychange
//   4. Realtime-Subscribe auf accounts UPDATE (1x pro account_id, nicht 3x)
//
// Quelle: RPC public.get_my_entitlements() — siehe Migration
// 20260502110000 + Block-3.5-Erweiterung 20260504081417 + Block-3.6-v2
// 20260504155153 (publication-add accounts).

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_VALUE = {
  data: null,
  loading: true,
  error: null,
  refresh: () => {},
  realtimeStatus: 'CONNECTING',
}

const EntitlementsContext = createContext(DEFAULT_VALUE)

export function EntitlementsProvider({ session, children }) {
  const [data,            setData]            = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [realtimeStatus,  setRealtimeStatus]  = useState('CONNECTING')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: rpc, error: rpcError } = await supabase.rpc('get_my_entitlements')
      if (rpcError) throw rpcError
      // RPC returns NULL bei Orphan-User → data bleibt null (Frontend kann Orphan-Pfad detecten)
      if (rpc) {
        const normalized = {
          ...rpc,
          modules: Array.isArray(rpc.modules) ? rpc.modules : [],
        }
        setData(normalized)
      } else {
        setData(null)
      }
    } catch (e) {
      console.error('[EntitlementsContext] load failed:', e)
      setError(e.message || 'load_failed')
      setData(null)
    }
    setLoading(false)
  }, [])

  // Trigger 1: Mount + session.user.id-change (Login/Logout)
  useEffect(() => { load() }, [load, session?.user?.id])

  // Trigger 3: visibilitychange (Tab kommt aus Hintergrund — Backup wenn Realtime weg ist)
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // loadRef: stable reference auf aktuellen load-Callback fuer Realtime-Callback
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  // Trigger 4: Realtime-Subscribe auf accounts UPDATE (Block 3.6 v2)
  // RLS auf accounts (accounts_owner_select / accounts_admin_select) filtert
  // Events serverseitig — User sieht nur Updates auf eigenen Account oder, falls
  // is_leadesk_admin, alle Accounts.
  //
  // Defense-Layers:
  //   - active-Flag verhindert State-Update nach Unmount
  //   - try/catch um setup UND cleanup
  //   - load NICHT in deps, stattdessen loadRef.current()
  //
  // KRITISCH: Provider wird genau einmal pro App-Mount gerendert →
  //   genau ein Channel-Subscribe pro account_id. Kein Race mehr.
  useEffect(() => {
    if (!data?.account_id) return

    let active = true
    let channel = null

    try {
      channel = supabase
        .channel(`account:${data.account_id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'accounts',
            filter: `id=eq.${data.account_id}`,
          },
          (payload) => {
            if (!active) return
            // eslint-disable-next-line no-console
            console.log('[Realtime] account update', payload.new?.id)
            loadRef.current()
          }
        )
        .subscribe((status) => {
          if (active) setRealtimeStatus(status)
        })
    } catch (e) {
      console.error('[EntitlementsContext] realtime channel setup failed:', e)
      if (active) setRealtimeStatus('CHANNEL_ERROR')
    }

    return () => {
      active = false
      if (channel) {
        try { supabase.removeChannel(channel) }
        catch (e) { console.error('[EntitlementsContext] channel cleanup failed:', e) }
      }
    }
  }, [data?.account_id])

  const value = {
    data,
    loading,
    error,
    refresh: load,
    realtimeStatus,
  }

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  )
}

export function useEntitlementsContext() {
  return useContext(EntitlementsContext)
}
