import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// useOnboarding — Persistenz-Layer für die In-App-Tour + Area-Tipps.
//
// Liest/schreibt user_preferences.onboarding_state (jsonb). Hält bewusst NUR den
// persistenten Teil (tour_done, tips_dismissed). Die Step-Navigation der Tour
// ist flüchtiger UI-State und lebt in <TourGuide>.
//
// Writes sind optimistisch + fire-and-forget mit console.warn bei Fehler
// (Konvention CLAUDE.md Top-Fallstrick #12: error-Feld nie still schlucken).
// Onboarding-State ist unkritisch genug, dass ein fehlgeschlagener Write kein
// Rollback rechtfertigt — schlimmstenfalls sieht der User einen Tipp nochmal.
// ─────────────────────────────────────────────────────────────────────────────

export function useOnboarding() {
  const [loading, setLoading] = useState(true)
  const [tourDone, setTourDone] = useState(true)        // pessimistisch: erst zeigen wenn DB sagt "noch nicht"
  const [tipsDismissed, setTipsDismissed] = useState(() => new Set())
  const [contentIntroSeen, setContentIntroSeen] = useState(true) // pessimistisch
  const [areaToursDone, setAreaToursDone] = useState({}) // {content:true,branding:true,…} — fehlt = noch nicht gesehen
  const userIdRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mountedRef.current) return
      if (!user) { setLoading(false); return }
      userIdRef.current = user.id

      const { data: row, error } = await supabase
        .from('user_preferences')
        .select('onboarding_state')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mountedRef.current) return
      if (error) {
        console.warn('[useOnboarding] read fehlgeschlagen:', error.message)
        setLoading(false)
        return
      }

      const state = row?.onboarding_state || {}
      setTourDone(state.tour_done === true)
      setContentIntroSeen(state.content_intro_seen === true)
      setAreaToursDone(state.area_tours_done && typeof state.area_tours_done === 'object' ? state.area_tours_done : {})
      setTipsDismissed(new Set(Array.isArray(state.tips_dismissed) ? state.tips_dismissed : []))
      setLoading(false)
    })()
    return () => { mountedRef.current = false }
  }, [])

  // Instanz-Sync: useOnboarding wird an mehreren Stellen gemountet (Layout für
  // die Tour, GettingStarted für den Reset-Button). Die Instanzen teilen keinen
  // State, darum koppeln wir sie über ein window-Event — restartTour() in der
  // einen Instanz lässt die Tour in der anderen sofort erscheinen.
  useEffect(() => {
    const onRestart = () => setTourDone(false)
    window.addEventListener('leadesk:tour-restart', onRestart)
    return () => window.removeEventListener('leadesk:tour-restart', onRestart)
  }, [])

  // Merge-Patch auf onboarding_state. Liest aktuellen Stand frisch, damit ein
  // paralleler Tour-Done-Write den tips_dismissed-Write nicht überschreibt.
  const persist = useCallback(async (patch) => {
    const uid = userIdRef.current
    if (!uid) return
    const { data: row } = await supabase
      .from('user_preferences')
      .select('onboarding_state')
      .eq('user_id', uid)
      .maybeSingle()
    const next = { ...(row?.onboarding_state || {}), ...patch }
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: uid, onboarding_state: next, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' })
    if (error) console.warn('[useOnboarding] persist fehlgeschlagen:', error.message)
  }, [])

  const markContentIntroSeen = useCallback(() => {
    setContentIntroSeen(true) // optimistic
    persist({ content_intro_seen: true })
  }, [persist])

  // Bereichstour als gesehen markieren (pro Bereich-Key). Liest den letzten
  // Client-State via funktionalem Update, persist() merged frisch in die DB.
  const markAreaTourDone = useCallback((area) => {
    if (!area) return
    setAreaToursDone(prev => {
      if (prev[area]) return prev
      const next = { ...prev, [area]: true }
      persist({ area_tours_done: next })
      return next
    })
  }, [persist])

  const markTourDone = useCallback(() => {
    setTourDone(true) // optimistic
    persist({ tour_done: true })
  }, [persist])

  const dismissTip = useCallback((key) => {
    setTipsDismissed(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      persist({ tips_dismissed: Array.from(next) })
      return next
    })
  }, [persist])

  // Zum manuellen Neustart (z.B. aus /getting-started). Persistiert + feuert das
  // Sync-Event, damit auch die Tour-Instanz im Layout sofort wieder anspringt.
  const restartTour = useCallback(() => {
    setTourDone(false) // optimistic (eigene Instanz)
    persist({ tour_done: false })
    window.dispatchEvent(new Event('leadesk:tour-restart'))
  }, [persist])

  return { loading, tourDone, tipsDismissed, contentIntroSeen, areaToursDone, markContentIntroSeen, markAreaTourDone, markTourDone, dismissTip, restartTour }
}
