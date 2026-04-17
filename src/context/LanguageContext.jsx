import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const LanguageContext = createContext({})

export function LanguageProvider({ children, userId }) {
  const { i18n } = useTranslation()
  const [language, setLanguageState] = useState(
    localStorage.getItem('leadesk_language') || 'de'
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('language')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.language && data.language !== language) {
          setLanguageState(data.language)
          i18n.changeLanguage(data.language)
          localStorage.setItem('leadesk_language', data.language)
        }
      })
  }, [userId])

  const setLanguage = useCallback(async (lang) => {
    if (lang === language) return
    setSaving(true)
    setLanguageState(lang)
    i18n.changeLanguage(lang)
    localStorage.setItem('leadesk_language', lang)
    if (userId) {
      await supabase
        .from('profiles')
        .update({ language: lang })
        .eq('id', userId)
    }
    setSaving(false)
  }, [language, userId, i18n])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, saving }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
