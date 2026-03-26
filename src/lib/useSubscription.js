import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PLAN_RANK = { free:0, starter:1, pro:2, enterprise:3 }

export const PLANS = {
  free:       { id:'free',       name:'LinkedIn Suite Free',  color:'#64748B', bg:'#F1F5F9', rank:0 },
  starter:    { id:'starter',    name:'LinkedIn Suite Basic', color:'#0A66C2', bg:'#EFF6FF', rank:1 },
  pro:        { id:'pro',        name:'LinkedIn Suite Pro',   color:'#8B5CF6', bg:'#F5F3FF', rank:2 },
  enterprise: { id:'enterprise', name:'Enterprise',           color:'#F59E0B', bg:'#FFFBEB', rank:3 },
}

const DEFAULT_SUB = {
  plan_id:'free', plan_name:'LinkedIn Suite Free', status:'active',
  ai_access:false, max_leads:50, max_lists:10,
  feature_pipeline:false, feature_brand_voice:false, feature_reports:false,
  period_end:null, is_active:true,
}

export function useSubscription(session) {
  const [sub,     setSub]     = useState(DEFAULT_SUB)
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
    } catch(e) { setSub(DEFAULT_SUB) }
    setLoading(false)
  }

  // Feature-Checks
  function canUseAI()          { return sub.ai_access === true }
  function canUsePipeline()    { return sub.feature_pipeline === true }
  function canUseBrandVoice()  { return sub.feature_brand_voice === true }
  function canUseReports()     { return sub.feature_reports === true }
  function canAddLead(n)       { return sub.max_leads === -1 || n < sub.max_leads }
  function canAddList(n)       { return sub.max_lists === -1 || n < sub.max_lists }
  function isAtLeast(planId)   { return (PLAN_RANK[sub.plan_id]||0) >= (PLAN_RANK[planId]||0) }

  var plan = PLANS[sub.plan_id] || PLANS.free

  return { sub, plan, loading, canUseAI, canUsePipeline, canUseBrandVoice, canUseReports, canAddLead, canAddList, isAtLeast, reload:loadSub }
}
