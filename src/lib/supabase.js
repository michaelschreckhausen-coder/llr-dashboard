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
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storageKey: 'leadesk-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Dev-Hilfsmittel: welche DB wird genutzt?
if (import.meta.env.DEV) {
  console.log('[Leadesk] Supabase:', SUPABASE_URL)
}
