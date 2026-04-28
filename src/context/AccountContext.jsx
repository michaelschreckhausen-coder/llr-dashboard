import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from './TeamContext'

const AccountContext = createContext({ account: null, loading: true, error: null, reload: () => {} })

export function AccountProvider({ session, children }) {
  const { activeTeamId } = useTeam()
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!session?.user?.id || !activeTeamId) {
      setAccount(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('teams')
      .select('account_id, accounts(id, name, billing_email, plan_id, seat_limit, plan_managed_by, status, settings, trial_ends_at, created_at, updated_at)')
      .eq('id', activeTeamId)
      .maybeSingle()
    if (queryError) {
      console.error('[AccountContext] Failed to load account:', queryError)
      setError(queryError.message)
      setLoading(false)
      return
    }
    setAccount(data?.accounts ?? null)
    setLoading(false)
  }, [session?.user?.id, activeTeamId])

  // Trigger 1: session.user.id + activeTeamId
  useEffect(() => { load() }, [load])

  // Trigger 2: Layer-B Auth-State-Change
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') load()
    })
    return () => subscription.unsubscribe()
  }, [load])

  // Trigger 3: Layer-B Visibility-Change (nur wenn account null und nicht loading)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && account === null && !loading) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [account, loading, load])

  return (
    <AccountContext.Provider value={{ account, loading, error, reload: load }}>
      {children}
    </AccountContext.Provider>
  )
}

export function useAccount() {
  return useContext(AccountContext)
}
