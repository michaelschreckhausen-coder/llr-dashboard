// useCreditBudget — fetches get_my_credit_budget RPC + Realtime-Subscribe auf credit_usage
//
// Returns:
//   {
//     budget: { plan_credits, used_this_period, plan_remaining, topup_remaining,
//               total_remaining, period_start, period_end, used_today,
//               daily_cap, daily_remaining, plan_slug, plan_id, account_id }
//     storage: { storage_quota_gb, topup_gb, total_quota_gb, used_bytes,
//                used_gb, remaining_gb }
//     loading, error, refresh
//     pctUsed (number 0-100, undefined wenn keine quota)
//     pctUsedTotal (used_this_period gegen plan + topup)
//     isExhausted (boolean — total_remaining <= 0)
//     isWarning (boolean — pctUsed >= 80)
//   }
//
// Realtime-Channel-Name per useId() um Multi-Mount-Race zu vermeiden
// (Top-Fallstrick #15: Realtime-Channel-Name per Hook-Instance via useId()).

import { useEffect, useId, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export function useCreditBudget() {
  const instanceId = useId()
  const [budget, setBudget] = useState(null)
  const [storage, setStorage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [budgetRes, storageRes] = await Promise.all([
        supabase.rpc('get_my_credit_budget'),
        supabase.rpc('get_my_storage_usage'),
      ])
      if (budgetRes.error) {
        console.warn('[useCreditBudget] budget RPC error:', budgetRes.error.message)
        setError(budgetRes.error.message)
      } else {
        setBudget(budgetRes.data || null)
      }
      if (storageRes.error) {
        console.warn('[useCreditBudget] storage RPC error:', storageRes.error.message)
      } else {
        setStorage(storageRes.data || null)
      }
    } catch (e) {
      console.warn('[useCreditBudget] fetch threw:', e?.message || e)
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Realtime-Subscribe auf credit_usage-Inserts → refetch budget
  useEffect(() => {
    if (!budget?.account_id) return
    const channel = supabase
      .channel(`credit-usage-${instanceId}-${budget.account_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'credit_usage', filter: `account_id=eq.${budget.account_id}` },
        () => fetchAll()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [budget?.account_id, instanceId, fetchAll])

  const derived = useMemo(() => {
    if (!budget || budget.error) {
      return { pctUsed: undefined, pctUsedTotal: undefined, isExhausted: false, isWarning: false }
    }
    const planQuota = Number(budget.plan_credits || 0)
    const topup = Number(budget.topup_remaining || 0)
    const used = Number(budget.used_this_period || 0)
    const totalQuota = planQuota + topup
    const pctUsed = planQuota > 0 ? Math.min(100, Math.round((used / planQuota) * 100)) : undefined
    const pctUsedTotal = totalQuota > 0 ? Math.min(100, Math.round((used / totalQuota) * 100)) : undefined
    const totalRemaining = Number(budget.total_remaining || 0)
    return {
      pctUsed,
      pctUsedTotal,
      isExhausted: totalRemaining <= 0,
      isWarning: pctUsed !== undefined && pctUsed >= 80,
    }
  }, [budget])

  return {
    budget,
    storage,
    loading,
    error,
    refresh: fetchAll,
    ...derived,
  }
}
