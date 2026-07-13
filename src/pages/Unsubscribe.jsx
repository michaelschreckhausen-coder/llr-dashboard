// src/pages/Unsubscribe.jsx
//
// Sprint L.9 B — Public Unsubscribe-Page (kein Auth)
//
// Wird vom Footer-Link in lifecycle/marketing-Mails aufgerufen.
// URL: /unsubscribe?token=<32-char-hex>
//
// Konsumiert Token via unsubscribe-EF → setzt user_email_preferences.opted_out_*
// → rendert Success/Error standalone (kein Layout, kein Login-Gate).

import { useEffect, useState } from 'react'

const PRIMARY = '#0A6FB0'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY    = import.meta.env.VITE_SUPABASE_ANON_KEY

const CATEGORY_LABEL = {
  lifecycle: 'Lifecycle-E-Mails (Trial-Reminder, Activity-Digests etc.)',
  marketing: 'Marketing-E-Mails (Newsletter, Feature-Announcements, Case-Studies)',
  all:       'alle nicht-essentiellen E-Mails',
}

export default function Unsubscribe() {
  const [status, setStatus] = useState('loading')  // 'loading' | 'success' | 'error'
  const [category, setCategory] = useState(null)
  const [errorReason, setErrorReason] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      setStatus('error')
      setErrorReason('invalid_token')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
          },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (cancelled) return

        if (data?.success) {
          setStatus('success')
          setCategory(data.category || 'all')
        } else {
          setStatus('error')
          setErrorReason(data?.reason || 'unknown_error')
        }
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErrorReason('network_error')
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <img src="/leadesk-icon.png" alt="Leadesk" width="60" style={{ marginBottom: 24 }} />

        {status === 'loading' && (
          <>
            <h1 style={titleStyle}>Verarbeite deine Abmeldung...</h1>
            <div style={spinnerStyle}></div>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 style={{ ...titleStyle, color: '#166534' }}>Abmeldung erfolgreich</h1>
            <p style={textStyle}>
              Du erhältst keine weiteren <strong>{CATEGORY_LABEL[category] || 'nicht-essentiellen E-Mails'}</strong> mehr von Leadesk.
            </p>
            <p style={{ ...textStyle, color: '#64748b', fontSize: 14 }}>
              Transaktionale E-Mails (Stripe-Quittungen, Sign-Up-Bestätigungen, Account-Sicherheit) bekommst du weiterhin — diese sind gesetzlich erforderlich.
            </p>
            <p style={{ ...textStyle, marginTop: 24 }}>
              Hast du dich versehentlich abgemeldet? Du kannst deine Präferenzen in deinem Account unter{' '}
              <a href="https://app.leadesk.de/settings/notifications" style={linkStyle}>
                Einstellungen → Benachrichtigungen
              </a>{' '}
              jederzeit wieder anpassen.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={{ ...titleStyle, color: '#991b1b' }}>Abmeldung nicht möglich</h1>
            <p style={textStyle}>
              {errorReason === 'invalid_token'   && 'Der Abmelde-Link ist ungültig oder unvollständig. Prüfe ob du die komplette URL aus der E-Mail kopiert hast.'}
              {errorReason === 'token_not_found' && 'Dieser Abmelde-Link ist nicht mehr gültig. Du kannst dich aber jederzeit in deinem Account abmelden.'}
              {errorReason === 'network_error'   && 'Verbindung zum Server fehlgeschlagen. Versuche es in ein paar Minuten erneut.'}
              {errorReason === 'server_error'    && 'Unbekannter Server-Fehler. Bitte versuche es später nochmal oder kontaktiere support@leadesk.de.'}
              {!['invalid_token','token_not_found','network_error','server_error'].includes(errorReason) && 'Unbekannter Fehler.'}
            </p>
            <p style={{ ...textStyle, marginTop: 24 }}>
              Du kannst deine E-Mail-Präferenzen jederzeit in deinem Account verwalten:{' '}
              <a href="https://app.leadesk.de/settings/notifications" style={linkStyle}>
                Einstellungen → Benachrichtigungen
              </a>
            </p>
          </>
        )}

        <div style={footerStyle}>
          Leadesk GbR · LinkedIn-Suite für B2B-Sales<br />
          <a href="https://leadesk.de" style={{ ...linkStyle, color: '#94a3b8' }}>leadesk.de</a>
        </div>
      </div>
    </div>
  )
}

// ─── Inline-Styles ───────────────────────────────────────────────────────

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f8fafc',
  padding: 24,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: 16,
  padding: 40,
  maxWidth: 560,
  width: '100%',
  boxShadow: '0 4px 24px rgba(15,23,42,0.08)',
  textAlign: 'center',
}

const titleStyle = {
  fontSize: 22,
  fontWeight: 800,
  margin: '0 0 16px 0',
  letterSpacing: '-0.01em',
  color: '#0f172a',
}

const textStyle = {
  fontSize: 15,
  lineHeight: 1.6,
  color: '#0f172a',
  margin: '0 0 12px 0',
}

const linkStyle = {
  color: PRIMARY,
  textDecoration: 'underline',
  fontWeight: 600,
}

const footerStyle = {
  marginTop: 32,
  paddingTop: 20,
  borderTop: '1px solid #e2e8f0',
  fontSize: 12,
  color: '#64748b',
  lineHeight: 1.5,
}

const spinnerStyle = {
  width: 28,
  height: 28,
  margin: '20px auto',
  borderRadius: '50%',
  border: '3px solid #e2e8f0',
  borderTopColor: PRIMARY,
  animation: 'spin 0.8s linear infinite',
}

// Inline-Keyframes injection (Inline-Styles support keine @keyframes)
if (typeof document !== 'undefined' && !document.getElementById('unsubscribe-spinner-keyframes')) {
  const style = document.createElement('style')
  style.id = 'unsubscribe-spinner-keyframes'
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}
