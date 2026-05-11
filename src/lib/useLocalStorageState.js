// src/lib/useLocalStorageState.js
// Wie useState, aber gespiegelt in localStorage. Beim Mount wird der gespeicherte
// Wert geladen (falls vorhanden), bei jedem Set wird er geschrieben.
// Loesung gegen "alle Eingaben weg nach Sidebar-Switch / F5".
//
// Verwendung:
//   const [name, setName, clearName] = useLocalStorageState('bv_draft_name_'+uid, '')

import { useEffect, useRef, useState } from 'react'

function safeParse(raw, fallback) {
  if (raw == null) return fallback
  try { return JSON.parse(raw) } catch (e) { return fallback }
}

export function useLocalStorageState(key, initialValue) {
  // Lazy initialiser: einmalig localStorage lesen
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const raw = window.localStorage.getItem(key)
      if (raw == null) return initialValue
      return safeParse(raw, initialValue)
    } catch (e) { return initialValue }
  })

  // Erste Render-Pass macht KEIN Schreiben (nur Read), spaetere Setter-Aufrufe schreiben.
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    try {
      if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
        // Leere Werte raus, damit localStorage nicht verstopft
        window.localStorage.removeItem(key)
      } else {
        window.localStorage.setItem(key, JSON.stringify(value))
      }
    } catch (e) { /* QuotaExceeded oder kein localStorage — ignore */ }
  }, [key, value])

  function clear() {
    try { window.localStorage.removeItem(key) } catch (e) {}
    setValue(initialValue)
  }

  return [value, setValue, clear]
}

// Loescht alle Drafts unter einem gegebenen Key-Prefix. Nuetzlich beim erfolgreichen Save.
export function clearDraftsByPrefix(prefix) {
  if (typeof window === 'undefined') return
  try {
    const keysToRemove = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) keysToRemove.push(k)
    }
    keysToRemove.forEach(k => window.localStorage.removeItem(k))
  } catch (e) { /* ignore */ }
}
