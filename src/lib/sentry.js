import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      try {
        if (event.request?.headers) { delete event.request.headers['Authorization']; delete event.request.headers['apikey'] }
        if (event.request?.url) event.request.url = event.request.url.replace(/([?&](access_token|refresh_token|token|apikey)=)[^&]+/gi, '$1[redacted]')
      } catch {}
      return event
    },
  })
}

export function setSentryUser(user, teamId) {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.setUser(user ? { id: user.id } : null)
  if (teamId) Sentry.setTag('team_id', teamId)
}

export { Sentry }
