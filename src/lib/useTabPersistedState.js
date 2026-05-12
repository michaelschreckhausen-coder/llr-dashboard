// src/lib/useTabPersistedState.js
// State der bei Browser-Tab-Wechsel erhalten bleibt, aber bei
// Sidebar-Navigation oder Page-Reload zurueck auf Default geht.
//
// Mechanismus:
// - lastNavigation (module-level): wird vom NavigationTimer aktualisiert
//   bei jedem React-Router-URL-Wechsel.
// - Bei Component-Mount: wenn URL-Wechsel < 1s her -> Sidebar-Nav -> Default.
//   Wenn URL stabil + sessionStorage hat Value -> restore (Browser-Tab-Wechsel).
//   Wenn Reload -> Default.
// - Bei document.visibilitychange = hidden -> aktuellen value in sessionStorage.

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

let lastNavigation = 0
let initialMountConsumed = false

// Wird einmal in App.jsx gerendered. Aktualisiert lastNavigation NUR bei
// echten location-Wechseln — der initiale Mount-Trigger wird ignoriert,
// sonst wuerde sofort nach App-Load jeder Mount als "just navigated"
// erkannt und der State auf Default gesetzt.
export function NavigationTimer() {
  const location = useLocation()
  useEffect(() => {
    if (!initialMountConsumed) {
      initialMountConsumed = true
      return // First effect = initial mount, NICHT als nav zaehlen
    }
    lastNavigation = Date.now()
  }, [location.pathname])
  return null
}

function isReloadNavigation() {
  if (typeof window === 'undefined') return false
  try {
    const nav = window.performance && window.performance.getEntriesByType
      ? window.performance.getEntriesByType('navigation')[0]
      : null
    return nav && nav.type === 'reload'
  } catch { return false }
}

export function useTabPersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial

    // Page-Reload? -> Default
    if (isReloadNavigation()) {
      try { sessionStorage.removeItem(key) } catch {}
      return initial
    }

    // URL-Wechsel innerhalb der letzten 500ms? -> Sidebar-Navigation -> Default
    const sinceLastNav = Date.now() - lastNavigation
    const isSidebarNav = lastNavigation > 0 && sinceLastNav < 500
    if (typeof console !== 'undefined') {
      console.log('[useTabPersistedState] mount key=' + key, {
        lastNavigation: lastNavigation,
        sinceLastNav: sinceLastNav,
        isSidebarNav: isSidebarNav,
        hasStored: !!sessionStorage.getItem(key)
      })
    }
    if (isSidebarNav) {
      try { sessionStorage.removeItem(key) } catch {}
      return initial
    }

    // Sonst: restore aus sessionStorage (Browser-Tab-Wechsel zurueck)
    try {
      const raw = sessionStorage.getItem(key)
      if (raw != null) {
        sessionStorage.removeItem(key)
        return JSON.parse(raw)
      }
    } catch {}
    return initial
  })

  // Bei visibility-hidden: aktuellen Wert in sessionStorage
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        try { sessionStorage.setItem(key, JSON.stringify(valueRef.current)) } catch {}
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      // KEIN sessionStorage cleanup hier — sonst werden Browser-Tab-Wechsel
      // mit Re-Mount kaputt (Re-Mount cleart sonst den eben gespeicherten Wert).
    }
  }, [key])

  return [value, setValue]
}

export function clearTabPersistedKey(key) {
  try { sessionStorage.removeItem(key) } catch {}
}
