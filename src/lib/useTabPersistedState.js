// src/lib/useTabPersistedState.js
//
// SIMPELSTER Ansatz: Module-Level Object speichert die States.
// Das ueberlebt alle React-Re-Mounts (egal warum), aber NICHT
// Page-Reload (dann ist das Modul neu).
//
// Sidebar-Navigation = URL-Change → NavigationTimer cleart das Object.
//
// Verhalten:
// - Browser-Tab-Wechsel weg+zurueck: value bleibt ✓
// - Sidebar-Nav weg+zurueck: URL aendert sich → Object gecleart → Default ✓
// - Page-Reload: Modul wird neu geladen → Object leer → Default ✓

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

let tabState = {}
let initialMountConsumed = false

export function NavigationTimer() {
  const location = useLocation()
  useEffect(() => {
    if (!initialMountConsumed) {
      initialMountConsumed = true
      return
    }
    // Echter URL-Change → State leeren (= Sidebar-Nav)
    tabState = {}
    console.log('[NavigationTimer] URL change → tabState cleared, new path=' + location.pathname)
  }, [location.pathname])
  return null
}

export function useTabPersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    if (tabState[key] !== undefined) {
      console.log('[useTabPersistedState] mount key=' + key + ' → restore:', tabState[key])
      return tabState[key]
    }
    console.log('[useTabPersistedState] mount key=' + key + ' → default:', initial)
    return initial
  })

  // Bei jedem set: in module-state spiegeln
  useEffect(() => {
    tabState[key] = value
  }, [key, value])

  return [value, setValue]
}

export function clearTabPersistedKey(key) {
  delete tabState[key]
}
