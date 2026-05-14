// src/lib/useSessionStorageState.js
// Wie useState, aber gespiegelt in sessionStorage.
// Eigenschaften:
// - Bleibt bei Browser-Tab-Wechsel (Tab unsichtbar → sichtbar) erhalten.
// - Bleibt bei React-Re-Mount (Sidebar-Wechsel etc.) erhalten.
// - Wird beim Tab-Close geleert.
// - **Wird beim Page-Reload (F5/Reload) explizit geleert** (siehe unten).
//
// Damit bekommt der User das "App-freezen"-Verhalten bei Tab-Wechsel,
// aber nach einem Refresh landet er sauber auf dem Default-Wert.
//
// Verwendung:
//   const [view, setView] = useSessionStorageState('bv_view_'+uid, 'list')

import { useEffect, useRef, useState } from 'react'

function safeParse(raw, fallback) {
  if (raw == null) return fallback
  try { return JSON.parse(raw) } catch (e) { return fallback }
}

// Bei Modul-Load einmalig prüfen ob diese Page-Instanz ein Reload war.
// Wenn ja: alle sessionStorage-Keys mit "_view_" oder "_kitab_" prefix
// abräumen, damit Wizard-View und KnowledgeImporter-Tab auf Default
// zurueckspringen.
let didResetOnReload = false
function maybeResetOnReload() {
  if (didResetOnReload) return
  didResetOnReload = true
  if (typeof window === 'undefined') return
  try {
    const navEntries = window.performance && window.performance.getEntriesByType
      ? window.performance.getEntriesByType('navigation')
      : null
    const isReload = navEntries && navEntries[0] && navEntries[0].type === 'reload'
    if (isReload) {
      // gezielt: alle Session-Keys die wir kontrollieren (view + KI-tab)
      const keysToRemove = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (!k) continue
        if (k.startsWith('bv_view_') || k.startsWith('aud_view_') || k.startsWith('ki_tab_')) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k))
    }
  } catch (e) { /* noop */ }
}

export function useSessionStorageState(key, initialValue) {
  maybeResetOnReload()

  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw == null) return initialValue
      return safeParse(raw, initialValue)
    } catch (e) { return initialValue }
  })

  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    try {
      if (value === '' || value === null || value === undefined) {
        window.sessionStorage.removeItem(key)
      } else {
        window.sessionStorage.setItem(key, JSON.stringify(value))
      }
    } catch (e) { /* quota etc. */ }
  }, [key, value])

  return [value, setValue]
}

export function clearSessionKey(key) {
  try { window.sessionStorage.removeItem(key) } catch (e) {}
}
