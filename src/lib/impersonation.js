// Weg-B-Impersonation: Session DIREKT in den (isolierten) Support-Tab-Storage schreiben — umgeht supabase-js
// setSession(), das intern getUser() gegen GoTrue /auth/v1/user aufruft. Das self-signed Token hat KEINE
// echte auth.sessions-Row → GoTrue /user lehnt ab ("Auth session missing"). Mit einem ECHTEN user-Objekt
// (aus den JWT-Claims) lädt der Client die Session beim Init über _recoverAndRefresh OHNE _getUser
// (der /user-Pfad greift nur bei __isUserNotAvailableProxy). Storage-Format = JSON.stringify(session).
// Storage = sessionStorage (per-Tab, physisch von anderen Tabs unerreichbar → kein Cross-Tab-Clobber);
// EXAKT der Storage, den der Support-Tab-Client in lib/supabase.js nutzt (IMPERSONATION_STORAGE).
const STORAGE_KEY = 'lk-impersonation-token'
const store = () => (typeof window !== 'undefined' ? window.sessionStorage : null)

export function decodeJwt(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b))))
  } catch { return null }
}

// Persistiert die Impersonation-Session im isolierten storageKey. Rückgabe: die Claims (für Meta) oder null.
export function persistImpersonationSession(access_token) {
  const c = decodeJwt(access_token)
  if (!c?.sub || !c?.exp) return null
  const session = {
    access_token,
    refresh_token: 'impersonation',   // nicht-leerer Platzhalter (setSession-Guard); autoRefreshToken:false → inert
    token_type: 'bearer',
    expires_at: c.exp,
    expires_in: Math.max(0, c.exp - Math.floor(Date.now() / 1000)),
    user: {
      id: c.sub,
      aud: c.aud || 'authenticated',
      role: c.role || 'authenticated',
      email: c.email || '',
      phone: c.phone || '',
      app_metadata: c.app_metadata || {},
      user_metadata: c.user_metadata || {},
      identities: [],
      created_at: '',
      updated_at: '',
    },
  }
  try { store()?.setItem(STORAGE_KEY, JSON.stringify(session)) } catch { return null }
  return c
}

// Räumt den Support-Slot (beim Beenden / fail-closed). sessionStorage, damit es exakt den genutzten Slot trifft.
export function clearImpersonationSession() {
  try { store()?.removeItem(STORAGE_KEY) } catch { /* noop */ }
  try { store()?.removeItem('lk-impersonation-meta') } catch { /* noop */ }
}
