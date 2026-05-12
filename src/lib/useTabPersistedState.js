// src/lib/useTabPersistedState.js
// State der nur bei *Browser-Tab-Wechsel* (visibility-change-hidden)
// in sessionStorage gespiegelt wird. Nicht bei normaler Sidebar-Navigation
// oder Page-Reload.
//
// Verhalten:
// - Component-Mount: liest sessionStorage. Wenn vorhanden -> restore + clear.
// - User-Action setState: rein React-State, NICHTS in storage.
// - Document visibility-change -> hidden: aktuellen Wert in sessionStorage.
// - Component-Unmount (z.B. Sidebar-Nav weg): sessionStorage clear.
// - Page-Reload: detection via PerformanceNavigationTiming, sessionStorage clear,
//   default value.
//
// Damit:
// - Sidebar-Nav weg + zurueck -> Default (Re-Mount, kein sessionStorage value)
// - Browser-Tab-Wechsel weg + zurueck -> State bleibt (visibilitychange speichert)
// - Page-Reload (F5) -> Default

import { useEffect, useRef, useState } from 'react'

function safeParse(raw, fallback) {
  if (raw == null) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
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
    if (isReloadNavigation()) {
      try { sessionStorage.removeItem(key) } catch {}
      return initial
    }
    try {
      const stored = sessionStorage.getItem(key)
      if (stored != null) {
        sessionStorage.removeItem(key)
        return safeParse(stored, initial)
      }
    } catch {}
    return initial
  })

  // Speichern bei visibility-hidden (= Tab wird gewechselt / minimiert)
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
      // Unmount (= Sidebar-Nav weg) -> nicht persistieren
      try { sessionStorage.removeItem(key) } catch {}
    }
  }, [key])

  return [value, setValue]
}

export function clearTabPersistedKey(key) {
  try { sessionStorage.removeItem(key) } catch {}
}
