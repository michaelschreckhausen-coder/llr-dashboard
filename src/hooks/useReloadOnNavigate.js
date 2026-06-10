// src/hooks/useReloadOnNavigate.js
// Triggert reloadFn bei jedem React-Router-Pathname-Wechsel.
// Verhindert Stale-Caches in globalen Contexts (BrandVoice, Team,
// Account, Entitlements), wenn der User von Page A nach Page B
// navigiert nachdem auf A eine Mutation passierte.
//
// Verwendung in einem Provider:
//   const { pathname } = useLocation()
//   useReloadOnNavigate(load, !!session?.user?.id)

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useReloadOnNavigate(reloadFn, enabled = true) {
  const { pathname } = useLocation()
  useEffect(() => {
    if (enabled && typeof reloadFn === 'function') reloadFn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
}
