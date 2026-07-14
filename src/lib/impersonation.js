// Weg-B-Impersonation: Session DIREKT in den (isolierten) storageKey schreiben — umgeht supabase-js
// setSession(), das intern getUser() gegen GoTrue /auth/v1/user aufruft. Das self-signed Token hat KEINE
// echte auth.sessions-Row → GoTrue /user lehnt ab ("Auth session missing"). Mit einem ECHTEN user-Objekt
// (aus den JWT-Claims) lädt der Client die Session beim Init über _recoverAndRefresh OHNE _getUser
// (der /user-Pfad greift nur bei __isUserNotAvailableProxy). Storage-Format = JSON.stringify(session).
const STORAGE_KEY = 'lk-impersonation-token'

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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)) } catch { return null }
  return c
}
