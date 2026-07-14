import { createClient } from '@supabase/supabase-js'

// Backend-Routing über Vercel Env-Vars je Umgebung.
//   Production:  https://supabase.leadesk.de       (Hetzner self-hosted, prod-db-01)
//   Staging:     https://supabase-staging.leadesk.de (Hetzner self-hosted, staging-db-01)
//   Lokal (DEV): .env.local
//
// Vor dem Cutover (≤ 2026-04-30) zeigte Production auf Cloud-Projekt
// jdhajqpgfrsuoluaesjn. Beim Backend-Wechsel werden alle bestehenden
// Sessions invalidiert — bewusst, siehe storageKey unten.
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// Hardening: kein stiller Fallback auf Production.
// Wenn Env-Vars fehlen, crasht die App bewusst, statt auf die falsche DB zu schreiben.
if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    '[Leadesk] VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt. ' +
    'Env-Vars in Vercel (Production + Preview) bzw. lokal in .env.local setzen.'
  )
}

// Storage-Key fest auf 'leadesk-auth-token' pinnen.
//
// Default wäre 'sb-<project-ref>-auth-token' — also je nach Backend
// ein anderer localStorage-Key. Beim Wechsel zwischen Cloud- und
// Hetzner-Backends führt das zu Multi-Token-Drift: zwei parallele
// Sessions im Browser, die sich gegenseitig überschreiben.
//
// Mit fixem Key gibt es genau einen Slot. Side-Effect: beim allerersten
// Deploy mit dieser Änderung sind alle bestehenden Sessions invalidiert,
// alle User loggen sich einmal neu ein. Das ist beim Cutover
// gewollt — danach stabil.
// One-time Cleanup: alte Cloud-Tokens (vor 30.04.2026) aus localStorage räumen.
// Wir hatten in der Übergangszeit nach dem Cutover viele User mit zwei parallelen
// auth-token-Keys im Browser: sb-<cloud-project>-auth-token (alt, ES256-signiert, abgelaufen)
// + leadesk-auth-token (neu, Hetzner, HS256). Die Extension nahm zufällig den
// ersten Match → 401 PGRST301. Dieser Block räumt einmalig alle veralteten
// auth-token-Keys.
try {
  const MIGRATION_FLAG = 'leadesk-storage-migrated-v2'
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(MIGRATION_FLAG)) {
    const stale = Object.keys(localStorage).filter(k =>
      k.includes('auth-token') && k !== 'leadesk-auth-token' && k !== 'lk-impersonation-token'
    )
    stale.forEach(k => {
      console.log('[Leadesk] Removing stale auth-token key:', k)
      localStorage.removeItem(k)
    })
    localStorage.setItem(MIGRATION_FLAG, String(Date.now()))
  }
} catch(e) { console.warn('[Leadesk] storage cleanup skipped:', e?.message) }

// Support-Impersonation-Isolation: der Admin öffnet den Support-Tab via window.open(url, 'lk-support').
// Dieser Tab bekommt einen EIGENEN storageKey UND per-Tab-sessionStorage → die echte Kundensession
// ('leadesk-auth-token' in localStorage) bleibt unberührt. sessionStorage ist PHYSISCH pro Tab isoliert:
// kein paralleler Login desselben Nutzers in einem anderen Tab kann in den Slot schreiben (kein Cross-Tab-
// Clobber, kein Reinsyncen einer fremden Session via BroadcastChannel/storage-event). Die Impersonation-
// Session ist damit auch ephemer (Tab zu = weg), was für Support gewünscht ist. Kein Auto-Refresh (Token
// hat keinen Refresh-Token); detectSessionInUrl aus, weil /support-session das Fragment leak-frei verarbeitet.
export const IS_SUPPORT_TAB = (() => {
  try { return typeof window !== 'undefined' && window.name === 'lk-support' } catch { return false }
})()

// Migration-Cleanup: die Impersonation-Session lebt seit df10eeb9 in sessionStorage. Ein etwaiger
// localStorage['lk-impersonation-token'] ist damit IMMER Altlast (durable, aus Vor-sessionStorage-Smokes)
// und wird von keinem Client mehr gelesen → hart entfernen, damit er keinen fail-closed Guard triggert
// und den JS-Zustand nicht verwirrt. Läuft in JEDEM Tab (auch Nicht-Support), da localStorage geteilt ist.
try { if (typeof localStorage !== 'undefined') localStorage.removeItem('lk-impersonation-token') } catch { /* noop */ }

// Der Storage, den der Support-Tab-Client nutzt — genau hierhin schreibt auch persistImpersonationSession().
export const IMPERSONATION_STORAGE = (IS_SUPPORT_TAB && typeof window !== 'undefined') ? window.sessionStorage : undefined

// Diagnostik (nicht-sensitiv): beim Init im Support-Tab sichtbar machen, ob der sessionStorage-Slot den
// Handoff-Reload überlebt hat. Beantwortet Coworks (b). Kein Token-Inhalt, nur Präsenz-Boolean.
if (IS_SUPPORT_TAB) {
  try { console.debug('[imp] support-tab init · ss_has_token=' + !!window.sessionStorage.getItem('lk-impersonation-token')) } catch { /* noop */ }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storageKey: IS_SUPPORT_TAB ? 'lk-impersonation-token' : 'leadesk-auth-token',
    storage: IMPERSONATION_STORAGE,   // undefined → supabase-js nutzt localStorage (Normalfall)
    persistSession: true,
    autoRefreshToken: !IS_SUPPORT_TAB,
    detectSessionInUrl: !IS_SUPPORT_TAB,
  },
})

// ROOT-FIX Impersonation-Session-Kill: der App-Load ruft an vielen Stellen supabase.auth.getUser()
// (useLeads, useTagRegistry, whitelabel, uiPrefs, useLeadViews …). getUser() geht gegen GoTrue /auth/v1/user;
// unser self-signed Weg-B-Token hat KEINE echte auth.sessions-Row → GoTrue wirft AuthSessionMissingError →
// auth-js ruft in genau diesem Fall _removeSession() → storageKey raus → SIGNED_OUT → Tab fällt auf Login
// (verifiziert in auth-js GoTrueClient.js Z.2588). Fix: im Support-Tab getUser() NIE gegen GoTrue laufen
// lassen — der EF-signierte Token IST die User-Autorität. Wir liefern den User aus der aktuellen Session
// (getSession() ist für non-expired Sessions netzwerkfrei und entfernt nichts). Nur im Support-Tab gepatcht;
// echte Kunden-Tabs behalten das Original-getUser() unangetastet.
if (IS_SUPPORT_TAB) {
  supabase.auth.getUser = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      return { data: { user: data?.session?.user ?? null }, error: null }
    } catch {
      return { data: { user: null }, error: null }
    }
  }
}

// Dev-Hilfsmittel: welche DB wird genutzt?
if (import.meta.env.DEV) {
  console.log('[Leadesk] Supabase:', SUPABASE_URL)
}
