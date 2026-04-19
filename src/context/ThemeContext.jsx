// ─── Leadesk Theme Context (Phase Theme-1) ───────────────────────────────────
// Verwaltet den aktiven Theme (light|dark) und den User-Wunsch (light|dark|system).
// Persistiert bei Account-Login in profiles.theme_pref (null = system), mit
// localStorage-Cache für sofortige Anwendung vor dem Login.
//
// Das Attribute data-theme auf <html> steuert alle CSS-Variablen in index.css.
// ──────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ThemeContext = createContext({
  theme:      'light',         // Tatsächlich angewandt: 'light' | 'dark'
  preference: 'system',        // User-Wunsch: 'light' | 'dark' | 'system'
  setPreference: () => {},
})

const STORAGE_KEY = 'leadesk.theme'              // Cache für applied theme (Early-Script in index.html)
const PREF_KEY    = 'leadesk.theme.pref'         // Cache für user preference

function resolvePreference(pref) {
  if (pref === 'light' || pref === 'dark') return pref
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
}

export function ThemeProvider({ children, session }) {
  // preference: 'light' | 'dark' | 'system' — kommt aus DB (bei Login) oder localStorage
  const [preference, setPreferenceState] = useState(() => {
    try {
      const cached = localStorage.getItem(PREF_KEY)
      if (cached === 'light' || cached === 'dark' || cached === 'system') return cached
    } catch {}
    return 'system'
  })

  // theme: tatsächlich angewandter Wert
  const [theme, setTheme] = useState(() => resolvePreference(preference))

  // System-Preference-Changes hören (nur wenn preference === 'system')
  useEffect(() => {
    if (preference !== 'system') return
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      const newTheme = e.matches ? 'dark' : 'light'
      setTheme(newTheme)
      applyTheme(newTheme)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  // Wenn preference wechselt, Theme neu ermitteln + anwenden
  useEffect(() => {
    const resolved = resolvePreference(preference)
    setTheme(resolved)
    applyTheme(resolved)
    try { localStorage.setItem(PREF_KEY, preference) } catch {}
  }, [preference])

  // Bei Login: profiles.theme_pref laden und bevorzugen
  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('theme_pref')
          .eq('id', session.user.id)
          .maybeSingle()
        if (cancelled) return
        // DB-Wert: null = system, 'light' oder 'dark'
        const dbPref = data?.theme_pref === 'light' || data?.theme_pref === 'dark' ? data.theme_pref : 'system'
        setPreferenceState(dbPref)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [session?.user?.id])

  // Toggle-Handler: schreibt in DB (falls eingeloggt) + lokal
  const setPreference = useCallback(async (newPref) => {
    if (newPref !== 'light' && newPref !== 'dark' && newPref !== 'system') return
    setPreferenceState(newPref)
    if (session?.user?.id) {
      try {
        await supabase
          .from('profiles')
          .update({ theme_pref: newPref === 'system' ? null : newPref })
          .eq('id', session.user.id)
      } catch {}
    }
  }, [session?.user?.id])

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
