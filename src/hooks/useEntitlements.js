// useEntitlements — Context-Reader (Phase 5 Block 3.6 v2 Provider-Refactor)
//
// Implementation seit Provider-Refactor: src/context/EntitlementsContext.jsx
// haelt zentral Hook-State + Realtime-Subscribe.
// Dieser File ist ein duenner Wrapper, der die Public API beibehaelt
// (data/loading/error/refresh/realtimeStatus + Convenience-Felder),
// damit alle 6 existing Caller unveraendert bleiben.
//
// Bug-Hintergrund: vor dem Refactor erzeugte jeder useEntitlements-Call
// eine eigene Hook-Instanz mit eigenem Channel-Subscribe. 3 parallel-mounted
// Components (Layout + TrialBanner + Billing auf /billing) kollidierten
// auf gleichem Channel-Topic → Multi-Mount-Race.
//
// Pattern (unveraendert vs. Block 3.5):
//   - data === null && loading        → noch nicht geladen
//   - data === null && !loading       → Orphan-User oder RPC-Fehler
//   - data !== null                   → Account vorhanden
//
// Caller, die nur einen Modul-Check brauchen, koennen `hasModule(key)` nutzen.

import { useCallback } from 'react'
import { useEntitlementsContext } from '../context/EntitlementsContext'

export function useEntitlements() {
  const { data, loading, error, refresh, realtimeStatus } = useEntitlementsContext()

  // hasModule(key): boolean — Backward-compat: liefert false wenn data===null
  const hasModule = useCallback((key) => {
    if (!data) return false
    if (!data.is_active) return false
    return Array.isArray(data.modules) && data.modules.includes(key)
  }, [data])

  return {
    // Phase 5 Block 3.5 primary API
    data,
    loading,
    error,
    refresh,
    reload:         refresh,    // legacy alias

    // Convenience-Felder (alle null-safe)
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

    // Phase 5 Block 3.6 v2: Realtime-Subscription-Status
    realtimeStatus,
  }
}
