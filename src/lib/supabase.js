import { createClient } from '@supabase/supabase-js'

// Production: jdhajqpgfrsuoluaesjn (app.leadesk.de)
// Staging:    swljvgmnxomvcevoupgg (staging.leadesk.de)
// Gesetzt über Vercel Env-Vars je Umgebung (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// Dev-Hilfsmittel: welche DB wird genutzt?
if (import.meta.env.DEV) {
  console.log('[Leadesk] Supabase:', SUPABASE_URL)
}
