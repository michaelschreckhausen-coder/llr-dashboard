// Lead Radar Dashboard — UI Translations
// Stored in localStorage, no server needed

export const TRANSLATIONS = {
  de: {
    nav_dashboard:'Dashboard',nav_leads:'Leads',nav_comments:'Kommentare',nav_brand_voice:'Brand Voice',nav_settings:'Einstellungen',nav_logout:'Abmelden',
    settings_title:'Einstellungen',settings_sub:'Account & Präferenzen verwalten',settings_account:'👤 Account',settings_email:'E-Mail',settings_plan:'Plan',settings_unlimited:'Unbegrenzt',settings_per_day:'Kommentare/Tag',
    settings_pw:'🔒 Passwort ändern',settings_pw_new:'Neues Passwort',settings_pw_min:'Mindestens 8 Zeichen',settings_pw_confirm:'Neues Passwort bestätigen',settings_pw_repeat:'Passwort wiederholen',settings_pw_btn:'🔒 Passwort ändern',settings_pw_saving:'⏳ Speichere...',settings_pw_ok:'✅ Passwort erfolgreich geändert!',settings_pw_short:'Passwort muss mindestens 8 Zeichen lang sein.',settings_pw_mismatch:'Passwörter stimmen nicht überein.',
    settings_output_lang:'🌍 Ausgabesprache',settings_output_lang_label:'Sprache der generierten Kommentare',settings_output_auto:'🤖 Automatisch (Sprache des Posts)',settings_output_de:'🇩🇪 Immer Deutsch',settings_output_en:'🇬🇧 Immer Englisch',settings_output_hint:'Bei "Automatisch" erkennt die KI die Sprache des Posts und antwortet in derselben Sprache.',
    settings_ui_lang:'🖥️ Dashboard-Sprache',settings_ui_lang_label:'Sprache der Benutzeroberfläche',settings_ui_hint:'Ändert die Sprache des gesamten Dashboards. Wirkt sofort.',
    settings_bv_title:'Kommunikationsstil in Brand Voice',settings_bv_text:'Dein persönlicher Kommunikationsstil wird jetzt über Brand Voice gesteuert.',settings_bv_link:'→ Brand Voice öffnen',
    settings_save:'💾 Einstellungen speichern',settings_saving:'⏳ Speichere...',settings_saved:'✅ Gespeichert!',
  },
  en: {
    nav_dashboard:'Dashboard',nav_leads:'Leads',nav_comments:'Comments',nav_brand_voice:'Brand Voice',nav_settings:'Settings',nav_logout:'Log out',
    settings_title:'Settings',settings_sub:'Manage your account & preferences',settings_account:'👤 Account',settings_email:'Email',settings_plan:'Plan',settings_unlimited:'Unlimited',settings_per_day:'comments/day',
    settings_pw:'🔒 Change password',settings_pw_new:'New password',settings_pw_min:'At least 8 characters',settings_pw_confirm:'Confirm new password',settings_pw_repeat:'Repeat password',settings_pw_btn:'🔒 Change password',settings_pw_saving:'⏳ Saving...',settings_pw_ok:'✅ Password changed successfully!',settings_pw_short:'Password must be at least 8 characters.',settings_pw_mismatch:'Passwords do not match.',
    settings_output_lang:'🌍 Output language',settings_output_lang_label:'Language for generated comments',settings_output_auto:'🤖 Automatic (language of the post)',settings_output_de:'🇩🇪 Always German',settings_output_en:'🇬🇧 Always English',settings_output_hint:'In "Automatic" mode the AI detects the post language and replies in the same language.',
    settings_ui_lang:'🖥️ Dashboard language',settings_ui_lang_label:'User interface language',settings_ui_hint:'Changes the language of the entire dashboard. Takes effect immediately.',
    settings_bv_title:'Communication style in Brand Voice',settings_bv_text:'Your personal communication style is now managed through Brand Voice.',settings_bv_link:'→ Open Brand Voice',
    settings_save:'💾 Save settings',settings_saving:'⏳ Saving...',settings_saved:'✅ Saved!',
  }
}

export function getLang() {
  return localStorage.getItem('llr_ui_lang') || 'de'
}

export function setLang(lang) {
  localStorage.setItem('llr_ui_lang', lang)
  window.dispatchEvent(new Event('llr_lang_change'))
}

export function t(key) {
  const lang = getLang()
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.de[key] || key
}

import { useState, useEffect } from 'react'
export function useLang() {
  const [lang, setLangState] = useState(getLang)
  useEffect(() => {
    const handler = () => setLangState(getLang())
    window.addEventListener('llr_lang_change', handler)
    return () => window.removeEventListener('llr_lang_change', handler)
  }, [])
  return [lang, (l) => { setLang(l); setLangState(l) }]
}
