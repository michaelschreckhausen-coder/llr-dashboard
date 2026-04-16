import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
