// src/pages/SettingsNotifications.jsx
//
// Sprint L.9 C — Notification-Preferences im Settings-Bereich
//
// User-Settings: opt-out für lifecycle/marketing-Kategorien + Locale-Pref.
// Direct UPSERT auf user_email_preferences via supabase-js (RLS-Policy
// uep_own_write erlaubt eigene-Row-Edit).
//
// Transactional/Billing/Auth-Mails sind NICHT toggleable (legal required).

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SettingsTabs from '../components/SettingsTabs'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

export default function SettingsNotifications({ session }) {
  const userId = session?.user?.id
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  // Preferences-State
  const [optedOutLifecycle, setOptedOutLifecycle] = useState(false)
  const [optedOutMarketing, setOptedOutMarketing] = useState(false)
  const [locale, setLocale] = useState('de')

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3000)
  }

  // Initial-Load
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('user_email_preferences')
        .select('opted_out_lifecycle, opted_out_marketing, locale')
        .eq('user_id', userId)
        .maybeSingle()

      if (cancelled) return
      if (err) {
        setError(err.message)
      } else if (data) {
        setOptedOutLifecycle(data.opted_out_lifecycle)
        setOptedOutMarketing(data.opted_out_marketing)
        setLocale(data.locale || 'de')
      }
      // Wenn kein Row existiert: defaults bleiben (false / false / 'de')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId])

  const saveField = async (patch) => {
    if (!userId) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('user_email_preferences')
      .upsert(
        {
          user_id: userId,
          opted_out_lifecycle: optedOutLifecycle,
          opted_out_marketing: optedOutMarketing,
          locale,
          ...patch,
          opted_out_at: (patch.opted_out_lifecycle || patch.opted_out_marketing) ? new Date().toISOString() : null,
        },
        { onConflict: 'user_id' }
      )

    setSaving(false)
    if (err) {
      setError(err.message)
      showFlash('Fehler: ' + err.message, 'error')
    } else {
      showFlash('Gespeichert')
    }
  }

  const toggleLifecycle = async () => {
    const next = !optedOutLifecycle
    setOptedOutLifecycle(next)
    await saveField({ opted_out_lifecycle: next })
  }

  const toggleMarketing = async () => {
    const next = !optedOutMarketing
    setOptedOutMarketing(next)
    await saveField({ opted_out_marketing: next })
  }

  const changeLocale = async (next) => {
    setLocale(next)
    await saveField({ locale: next })
  }

  if (loading) {
    return <div style={{ padding: 40, color: '#64748b', fontSize: 14 }}>Lade Einstellungen...</div>
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 0 24px 0' }}>
      <SettingsTabs />
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
        E-Mail-Benachrichtigungen
      </h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 32px 0' }}>
        Verwalte welche E-Mails du von Leadesk bekommst. Änderungen werden sofort gespeichert.
      </p>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 20 }}>
          Fehler: {error}
        </div>
      )}

      {/* Lifecycle-Toggle */}
      <Card>
        <CategoryRow
          icon="🌱"
          title="Lifecycle-E-Mails"
          description="Trial-Reminder, Onboarding-Tipps, Activity-Digests. Empfohlen für die ersten Wochen mit Leadesk."
          isOptedOut={optedOutLifecycle}
          onToggle={toggleLifecycle}
          disabled={saving}
        />
      </Card>

      {/* Marketing-Toggle */}
      <Card>
        <CategoryRow
          icon="📣"
          title="Marketing-E-Mails"
          description="Newsletter, Feature-Announcements, Webinar-Einladungen, Case-Studies."
          isOptedOut={optedOutMarketing}
          onToggle={toggleMarketing}
          disabled={saving}
        />
      </Card>

      {/* Transactional info */}
      <Card>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 24 }}>🔒</div>
          <div style={{ flex: 1 }}>
            <h3 style={categoryTitleStyle}>Transaktionale E-Mails</h3>
            <p style={categoryDescStyle}>
              Stripe-Quittungen, Zahlungsfehler-Hinweise, Account-Sicherheit, Sign-Up-Bestätigungen, Magic-Link-Logins. Diese E-Mails sind gesetzlich erforderlich und können nicht abbestellt werden.
            </p>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Immer aktiv
          </div>
        </div>
      </Card>

      {/* Sprache */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0' }}>Sprache der E-Mails</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <LocaleButton active={locale === 'de'} onClick={() => changeLocale('de')} disabled={saving}>Deutsch</LocaleButton>
          <LocaleButton active={locale === 'en'} onClick={() => changeLocale('en')} disabled={saving}>English</LocaleButton>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          E-Mails werden in der gewählten Sprache versendet. Falls keine Übersetzung verfügbar ist, fällt sie auf Deutsch zurück.
        </p>
      </div>

      {flash && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, padding: '10px 14px', borderRadius: 8,
          background: flash.type === 'error' ? '#fef2f2' : '#dcfce7',
          color: flash.type === 'error' ? '#991b1b' : '#166534',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>{flash.msg}</div>
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 12,
    }}>{children}</div>
  )
}

function CategoryRow({ icon, title, description, isOptedOut, onToggle, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <h3 style={categoryTitleStyle}>{title}</h3>
        <p style={categoryDescStyle}>{description}</p>
      </div>
      <ToggleSwitch enabled={!isOptedOut} onClick={onToggle} disabled={disabled} />
    </div>
  )
}

function ToggleSwitch({ enabled, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={enabled ? 'Abmelden' : 'Anmelden'}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', padding: 0,
        background: enabled ? PRIMARY : '#cbd5e1',
        position: 'relative', cursor: disabled ? 'wait' : 'pointer',
        transition: 'background 0.15s',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: enabled ? 22 : 2,
        transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function LocaleButton({ active, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px', border: '1.5px solid ' + (active ? PRIMARY : '#e2e8f0'),
        borderRadius: 8, background: active ? '#0A6FB0' : '#ffffff',
        color: active ? '#ffffff' : '#0f172a',
        fontSize: 13, fontWeight: 600, cursor: disabled ? 'wait' : 'pointer',
        fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
      }}
    >{children}</button>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────

const categoryTitleStyle = { fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: '#0f172a' }
const categoryDescStyle = { fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }
