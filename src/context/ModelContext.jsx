// src/context/ModelContext.jsx
// Globales Sprachmodell — wird im Topbar gewechselt, alle KI-Funktionen lesen den Wert.
// Persistiert in profiles.default_ai_model. Erspart pro-Funktions-Dropdowns.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_MODEL } from '../components/ModelSelector'

const ModelContext = createContext({
  model: DEFAULT_MODEL,
  setModel: () => {},
  loading: true,
})

export function ModelProvider({ session, children }) {
  const [model, setModelState] = useState(DEFAULT_MODEL)
  const [loading, setLoading] = useState(true)

  // Initial-Load aus profiles.default_ai_model
  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return }
    supabase
      .from('profiles')
      .select('default_ai_model')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.default_ai_model) setModelState(data.default_ai_model)
        setLoading(false)
      })
  }, [session?.user?.id])

  // setModel persistiert sofort
  const setModel = useCallback(async (next) => {
    if (!next || next === model) return
    setModelState(next)
    if (!session?.user?.id) return
    const { error } = await supabase
      .from('profiles')
      .update({ default_ai_model: next })
      .eq('id', session.user.id)
    if (error) console.warn('[ModelContext] persist failed:', error.message)
  }, [model, session?.user?.id])

  return (
    <ModelContext.Provider value={{ model, setModel, loading }}>
      {children}
    </ModelContext.Provider>
  )
}

export function useModel() {
  return useContext(ModelContext)
}
