import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { loadWhiteLabelSettings, applyTheme, DEFAULT_WL, getCurrentSubdomain } from '../lib/whitelabel'

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [wl, setWl]           = useState(DEFAULT_WL)
  const [tenant, setTenant]   = useState(null)
  const [loading, setLoading] = useState(true)

  const loadTheme = useCallback(async () => {
    try {
      const settings = await loadWhiteLabelSettings()
      applyTheme(settings)
      setWl(settings)
      setTenant(settings._tenant || null)
    } catch {
      applyTheme(DEFAULT_WL)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTheme() }, [loadTheme])

  return (
    <TenantContext.Provider value={{ wl, setWl, tenant, loading, subdomain: getCurrentSubdomain(), reloadTheme: loadTheme }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext) || { wl: DEFAULT_WL, tenant: null, loading: false, reloadTheme: () => {} }
}
