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
// Dieser Tab bekommt einen EIGENEN storageKey → die echte Kundensession ('leadesk-auth-token') bleibt
// unberührt (kein Cross-Tab-Clobber). Kein Auto-Refresh (Impersonation-Token hat keinen Refresh-Token);
// detectSessionInUrl aus, weil /support-session das Fragment selbst leak-frei verarbeitet.
export const IS_SUPPORT_TAB = (() => {
  try { return typeof window !== 'undefined' && window.name === 'lk-support' } catch { return false }
})()

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storageKey: IS_SUPPORT_TAB ? 'lk-impersonation-token' : 'leadesk-auth-token',
    persistSession: true,
    autoRefreshToken: !IS_SUPPORT_TAB,
    detectSessionInUrl: !IS_SUPPORT_TAB,
  },
})

// Dev-Hilfsmittel: welche DB wird genutzt?
if (import.meta.env.DEV) {
  console.log('[Leadesk] Supabase:', SUPABASE_URL)
}
