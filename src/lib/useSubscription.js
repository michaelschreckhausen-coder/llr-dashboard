import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PLAN_RANK = { free: 0, starter: 1, pro: 2, enterprise: 3 }

export const PLANS = {
  free:       { id: 'free',       name: 'Free',       color: '#64748B', bg: '#F1F5F9', rank: 0 },
  starter:    { id: 'starter',    name: 'Starter',    color: '#0A66C2', bg: '#EFF6FF', rank: 1 },
  pro:        { id: 'pro',        name: 'Pro',         color: '#8B5CF6', bg: '#F5F3FF', rank: 2 },
  enterprise: { id: 'enterprise', name: 'Enterprise', color: '#F59E0B', bg: '#FFFBEB', rank: 3 },
}

const DEFAULT_SUB = {
  plan_id: 'free', plan_name: 'Free', status: 'active',
  ai_access: false, max_leads: 10, max_lists: 1,
  period_end: null, is_active: true,
}

export function useSubscription(session) {
  const [sub, setSub]         = useState(DEFAULT_SUB)
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    if (!session) { setSub(DEFAULT_SUB); setLoading(false); return }
    loadSub()
  }, [session])

  async function loadSub() {
    setLoading(true)
    try {
      var res = await supabase.rpc('get_my_subscription')
      if (res.data) setSub(Object.assign({}, DEFAULT_SUB, res.data))
      else setSub(DEFAULT_SUB)
    } catch (e) {
      setSub(DEFAULT_SUB)
    }
    setLoading(false)
  }

  function canUseAI() { return sub.ai_access === true }
  function canAddLead(n) { return sub.max_leads === -1 || n < sub.max_leads }
  function canAddList(n) { return sub.max_lists === -1 || n < sub.max_lists }
  function isAtLeast(planId) { return (PLAN_RANK[sub.plan_id] || 0) >= (PLAN_RANK[planId] || 0) }

  var plan = PLANS[sub.plan_id] || PLANS.free

  return { sub, plan, loading, canUseAI, canAddLead, canAddList, isAtLeast, reload: loadSub }
}
