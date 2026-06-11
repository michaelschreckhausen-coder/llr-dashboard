// Baut Auth-Rücksprung-URLs immer relativ zur AKTUELLEN Origin — Subdomain-erhaltend für
// Whitelabel. NIE eine fixe Domain hardcoden: sonst landet OAuth/Reset/Identity-Link nach dem
// GoTrue-Roundtrip auf der Default-SITE_URL (app.leadesk.de) statt auf der Tenant-Subdomain.
// Voraussetzung: GoTrue ADDITIONAL_REDIRECT_URLS deckt https://*.leadesk.de (+ /**) ab —
// siehe docs/auth/gotrue-redirect-allowlist.md.
export function authRedirect(path = '') {
  return `${window.location.origin}${path}`
}
