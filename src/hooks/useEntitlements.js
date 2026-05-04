// useEntitlements — liefert dem Frontend die Modul-Freischaltung
// des aktuellen Users. Quelle: RPC public.get_my_entitlements()
// (siehe Migration 20260502110000 + Phase-5-Block-3.5-Erweiterung
// 20260504081417_extend_get_my_entitlements.sql).
//
// Pattern (Phase 5 Block 3.5):
//   - data === null && loading        → noch nicht geladen (Skeleton)
//   - data === null && !loading       → Orphan-User (kein Account zugewiesen)
//                                       oder RPC-Fehler (siehe error)
//   - data !== null                   → Account vorhanden, alle Felder verfuegbar
//
// Caller, die nur einen Modul-Check brauchen, koennen `hasModule(key)` nutzen
// und ignorieren `data`/`loading`/`error`.
//
// Reload-Trigger (4-Layer, Phase 5 Block 3.6):
//   1. Mount (default useEffect)
//   2. Manual via refresh() (z.B. "Plan aktualisieren"-Button)
//   3. visibilitychange (Tab kommt aus Hintergrund — Backup wenn Realtime weg ist)
//   4. Realtime-Subscribe auf accounts UPDATE fuer aktuelles account_id
//      (Pattern aus NotificationsBell.jsx; via supabase_realtime publication —
//      Migration 20260504104909_realtime_publication_accounts.sql)
//
// Realtime-Connection-State exposed via realtimeStatus:
//   'CONNECTING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
// Connection-Indicator-Komponenten koennen darauf rendern.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useEntitlements() {
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
      // Sonst: jsonb-Object mit allen 12 Keys (siehe Migration-Header)
      if (rpc) {
        // modules-Defensive: muss immer ein JS-Array sein (jsonb kann auch string/null sein)
        const normalized = {
          ...rpc,
          modules: Array.isArray(rpc.modules) ? rpc.modules : [],
        }
        setData(normalized)
      } else {
        setData(null)
      }
    } catch (e) {
      console.error('[useEntitlements] load failed:', e)
      setError(e.message || 'load_failed')
      setData(null)
    }
    setLoading(false)
  }, [])

  // Trigger 1: Mount
  useEffect(() => {
    load()
  }, [load])

  // Trigger 3: visibilitychange (Tab kommt aus Hintergrund)
  // Nuetzlich nach License-Grant in admin.leadesk.de — User wechselt Tab und sieht neuen Plan.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // Trigger 4: Realtime-Subscribe auf accounts UPDATE (Block 3.6)
  // RLS auf accounts (accounts_owner_select / accounts_admin_select) filtert
  // Events serverseitig — User sieht nur Updates auf eigenen Account oder, falls
  // is_leadesk_admin, alle Accounts.
  useEffect(() => {
    if (!data?.account_id) return

    const channel = supabase
      .channel(`account:${data.account_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'accounts',
          filter: `id=eq.${data.account_id}`,
        },
        () => load()
      )
      .subscribe((status) => {
        setRealtimeStatus(status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [data?.account_id, load])

  // hasModule(key): boolean
  // Backward-compat: liefert false wenn data===null (Orphan oder loading)
  const hasModule = useCallback((key) => {
    if (!data) return false
    if (!data.is_active) return false
    return Array.isArray(data.modules) && data.modules.includes(key)
  }, [data])

  return {
    // Phase 5 Block 3.5 primary API
    data,                    // null = noch nicht geladen ODER Orphan ODER Error (siehe loading/error)
    loading,
    error,
    refresh:        load,    // Manual-Reload-Button-Caller
    reload:         load,    // legacy alias

    // Convenience-Felder (alle null-safe; Caller, die nur diese nutzen,
    // bekommen sinnvolle Defaults bei Orphan/Loading)
    hasModule,
    modules:        data?.modules || [],
    isTrial:        data?.is_trial || false,
    trialEndsAt:    data?.trial_ends_at || null,
    trialDaysLeft:  data?.trial_days_left ?? null,
    accountStatus:  data?.account_status || null,
    isActive:       data?.is_active || false,
    planId:         data?.plan_id || null,
    planName:       data?.plan_name || null,

    // Phase 5 Block 3.5 neue Convenience-Felder
    planExpiresAt:  data?.plan_expires_at || null,
    grantedVia:     data?.granted_via || null,
    planManagedBy:  data?.plan_managed_by || null,
    accountId:      data?.account_id || null,

    // Phase 5 Block 3.6: Realtime-Subscription-Status
    // 'CONNECTING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
    realtimeStatus,
  }
}
