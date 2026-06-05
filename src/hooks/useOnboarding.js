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
      setTipsDismissed(new Set(Array.isArray(state.tips_dismissed) ? state.tips_dismissed : []))
      setLoading(false)
    })()
    return () => { mountedRef.current = false }
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

  // Zum manuellen Neustart aus dem Hilfe-/Konto-Menü ("Tour erneut starten").
  const restartTour = useCallback(() => {
    setTourDone(false) // optimistic
    persist({ tour_done: false })
  }, [persist])

  return { loading, tourDone, tipsDismissed, markTourDone, dismissTip, restartTour }
}
