// src/hooks/useAddons.js
//
// Lädt parallel:
//   - addons-Katalog (alle is_active=true, RLS read-all-authenticated)
//   - eigene aktive Subscriptions via get_my_addons-RPC
//   - eigene Waitlist-Einträge via get_my_waitlist-RPC
//
// Plus Action joinWaitlist(slug) → ruft join_addon_waitlist-RPC,
// optimistic update auf den Waitlist-State.
//
// Realtime bewusst NICHT — Storefront ist seltener Touch-Point, Hard-Refresh OK.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAddons() {
  const [catalog, setCatalog]       = useState([])
  const [myAddons, setMyAddons]     = useState([])     // [{ addon_id, slug, status, ... }]
  const [myWaitlist, setMyWaitlist] = useState([])     // [{ addon_id, slug, created_at }]
  const [isLoading, setIsLoading]   = useState(true)
  const [error, setError]           = useState(null)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [catRes, mineRes, wlRes] = await Promise.all([
      supabase
        .from('addons')
        .select('id, slug, name, short_description, long_description, category, type, price_monthly_cents, currency, stripe_price_id, icon, highlight_color, features, activates_modules, ai_quota_increment, integration_config, is_active, is_featured, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase.rpc('get_my_addons'),
      supabase.rpc('get_my_waitlist'),
    ])
    if (!mountedRef.current) return

    if (catRes.error)  { setError(catRes.error);  setIsLoading(false); return }
    if (mineRes.error) { setError(mineRes.error); setIsLoading(false); return }
    if (wlRes.error)   { setError(wlRes.error);   setIsLoading(false); return }

    setCatalog(catRes.data || [])
    setMyAddons(mineRes.data || [])
    setMyWaitlist(wlRes.data || [])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()
    return () => { mountedRef.current = false }
  }, [load])

  // Lookups
  const subscribedSlugs = useMemo(
    () => new Set((myAddons || []).filter(a => a.status === 'active').map(a => a.slug)),
    [myAddons]
  )
  const waitlistedSlugs = useMemo(
    () => new Set((myWaitlist || []).map(w => w.slug)),
    [myWaitlist]
  )

  // Action: Free-Aktivierung (Addons mit stripe_price_id IS NULL).
  // RPC activate_addon schreibt account_addons (status active) und liefert
  // modules wie 'sponsoring' an get_my_entitlements() durch.
  const activateAddon = useCallback(async (slug) => {
    const { data, error: rpcError } = await supabase.rpc('activate_addon', { p_slug: slug })
    if (rpcError) return { error: rpcError }
    // Optimistic: Addon in myAddons als active markieren, damit die Card
    // sofort auf "Aktiv" flippt (subscribedSlugs leitet sich daraus ab).
    const addon = catalog.find(a => a.slug === slug)
    setMyAddons(prev => {
      if (prev.some(a => a.slug === slug)) {
        return prev.map(a => a.slug === slug ? { ...a, status: 'active' } : a)
      }
      return [
        { addon_id: addon?.id, slug, name: addon?.name, status: 'active', created_at: new Date().toISOString() },
        ...prev,
      ]
    })
    return { data }
  }, [catalog])

  // Action: Self-Service-Kündigung (Pattern B / Free). Paid-Addons werden NICHT
  // hier gekündigt (Stripe-Billing-Portal) — die RPC wirft dann eine Exception.
  const cancelAddon = useCallback(async (slug) => {
    const { data, error: rpcError } = await supabase.rpc('cancel_addon', { p_slug: slug })
    if (rpcError) return { error: rpcError }
    // Optimistic: Status auf 'canceled' → subscribedSlugs verliert den Slug,
    // Card flippt zurück auf den Aktivierungs-State.
    setMyAddons(prev => prev.map(a => a.slug === slug ? { ...a, status: 'canceled' } : a))
    return { data }
  }, [])

  // Action: Waitlist-Enroll
  const joinWaitlist = useCallback(async (slug) => {
    const { data, error: rpcError } = await supabase.rpc('join_addon_waitlist', { p_addon_slug: slug })
    if (rpcError) return { error: rpcError }
    // Optimistic: bei 'enrolled' Waitlist-Set updaten
    if (data === 'enrolled') {
      const addon = catalog.find(a => a.slug === slug)
      if (addon) {
        setMyWaitlist(prev => [
          { addon_id: addon.id, slug, name: addon.name, created_at: new Date().toISOString(), notified_at: null },
          ...prev,
        ])
      }
    }
    return { data }
  }, [catalog])

  return {
    catalog, myAddons, myWaitlist,
    subscribedSlugs, waitlistedSlugs,
    isLoading, error,
    reload: load,
    joinWaitlist,
    activateAddon,
    cancelAddon,
  }
}
