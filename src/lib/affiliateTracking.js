// Affiliate-Tracking (Phase 2): ?ref-Capture + Cookie-Persistenz (Last-Touch, 90d).
// Tracking-Failures dürfen die Customer-Journey NIE stören → alles try/catch-gekapselt.
import { supabase } from './supabase'

const COOKIE_CODE  = 'lk_aff'
const COOKIE_CLICK = 'lk_aff_click_id'
const MAX_AGE_SEC  = 90 * 24 * 60 * 60   // 90 Tage
const EF_NAME      = 'register-affiliate-click'

function setCookie(name, value, maxAgeSec) {
  // domain=.leadesk.de → cross-subdomain (app + affiliate + marketing). Auf localhost
  // kein domain-Attribut (Browser verwirft .leadesk.de-Cookies dort).
  const onLeadesk = typeof location !== 'undefined' && location.hostname.endsWith('leadesk.de')
  const domain = onLeadesk ? '; Domain=.leadesk.de' : ''
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${domain}${secure}`
}

function getCookie(name) {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

export function getStoredAffiliateCode() { return getCookie(COOKIE_CODE) }
export function getStoredClickId()       { return getCookie(COOKIE_CLICK) }

// Liest ?ref aus der URL, setzt Last-Touch-Cookie, trackt den Click via EF und
// persistiert die zurückgegebene click_id. Idempotent genug für mehrfaches Mounten.
export async function captureRefFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = (params.get('ref') || '').trim()
    if (!code) return

    setCookie(COOKIE_CODE, code, MAX_AGE_SEC)  // Last-Touch: überschreibt bestehenden Cookie

    const { data, error } = await supabase.functions.invoke(EF_NAME, {
      body: {
        code,
        utm_source:    params.get('utm_source')   || null,
        utm_medium:    params.get('utm_medium')   || null,
        utm_campaign:  params.get('utm_campaign') || null,
        landed_at_url: window.location.href,
      },
    })
    if (!error && data?.click_id) {
      setCookie(COOKIE_CLICK, data.click_id, MAX_AGE_SEC)
    }
  } catch (_) {
    // bewusst geschluckt — Tracking ist best-effort, nie blockierend
  }
}
