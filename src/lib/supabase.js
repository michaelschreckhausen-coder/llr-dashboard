import { createClient } from '@supabase/supabase-js'

// Production: jdhajqpgfrsuoluaesjn (app.leadesk.de)
// Staging:    swljvgmnxomvcevoupgg (staging.leadesk.de)
// Gesetzt über Vercel Env-Vars je Umgebung (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// Dev-Hilfsmittel: welche DB wird genutzt?
if (import.meta.env.DEV) {
  console.log('[Leadesk] Supabase:', SUPABASE_URL)
}
