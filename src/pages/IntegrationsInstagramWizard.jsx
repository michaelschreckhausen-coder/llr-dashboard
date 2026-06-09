// Customer-Onboarding-Wizard für Instagram-/Meta-Integration (BYOA-Modell).
//
// Siehe docs/architecture/design-instagram-integration.md Sektion 13.
//
// Phase-1-Skeleton: Steps 1–7 funktional, Steps 8–11 sind Placeholder
// (TODO Phase 2, sobald OAuth + Webhook-Subscription verdrahtet).
//
// Architektur:
//   - Eine Connection pro Account (1:1, UNIQUE-Constraint auf account_id).
//   - DB-Row wird in Step 4 angelegt (sobald App-ID/Secret eingegeben).
//   - state-Token für OAuth wird in Step 7 generiert + pm_instagram_oauth_state.
//   - Frontend nutzt direkten supabase.from-Call (RLS schützt) für non-secret Felder.
//   - App-Secret-Verschlüsselung läuft via RPC pm_instagram_encrypt (service_role-side).

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const IND = 'var(--wl-primary, rgb(49,90,231))'

const PERMISSION_OPTIONS = [
  { key: 'dms',         label: 'Direktnachrichten (DMs)',     desc: 'Eingehende DMs als Leads erfassen, antworten via Send API', loginModes: ['facebook', 'instagram'] },
  { key: 'comments',    label: 'Kommentare + Mentions',        desc: 'Kommentare auf Posts/Reels + @-Mentions als Leads',          loginModes: ['facebook', 'instagram'] },
  { key: 'lead_ads',    label: 'Meta Lead Ads',                desc: 'Form-Submits aus Facebook-/Instagram-Lead-Ads importieren',  loginModes: ['facebook'] },
  { key: 'insights',    label: 'Insights / Analytics',         desc: 'Reichweite, Engagement, Demographics',                       loginModes: ['facebook', 'instagram'] },
]

const SUPABASE_FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1'

// ─── Helper: random verify-token ────────────────────────────────────────────

function randomVerifyToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Helper: random state ───────────────────────────────────────────────────

function randomState() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
}

// ─── Main Wizard Container ──────────────────────────────────────────────────

export default function IntegrationsInstagramWizard() {
  const { activeTeamId, account } = useTeam()
  const [step, setStep]               = useState(1)
  const [connection, setConnection]   = useState(null)   // pm_instagram_accounts row sobald erstellt
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  // Beim Mount: existierende Connection laden (falls Wizard mid-flight verlassen wurde)
  useEffect(() => {
    if (!activeTeamId || !account?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('pm_instagram_accounts')
        .select('*')
        .eq('account_id', account.id)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setError(error.message)
      } else if (data) {
        setConnection(data)
        // Resume auf passenden Step
        setStep(resumeStepFromOnboarding(data.onboarding_step))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [activeTeamId, account?.id])

  if (loading) return <div style={pageStyle}>Lade Verbindungs-Status…</div>
  if (!account?.id) return <div style={pageStyle}>Bitte einen Account auswählen.</div>

  return (
    <div style={pageStyle}>
      <Header step={step} connection={connection} />
      <StepProgress current={step} />
      {error && <div style={errorBoxStyle}>Fehler: {error}</div>}

      <div style={cardStyle}>
        {step === 1  && <Step1Prerequisites onNext={() => setStep(2)} />}
        {step === 2  && <Step2BusinessManager onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3  && <Step3CreateMetaApp onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4  && <Step4CredentialsForm
                          accountId={account.id}
                          teamId={activeTeamId}
                          existing={connection}
                          onSaved={(row) => { setConnection(row); setStep(5) }}
                          onBack={() => setStep(3)}
                        />}
        {step === 5  && <Step5UrlsToCopy connection={connection} onNext={() => setStep(6)} onBack={() => setStep(4)} />}
        {step === 6  && <Step6Permissions connection={connection} onSaved={(row) => { setConnection(row); setStep(7) }} onBack={() => setStep(5)} />}
        {step === 7  && <Step7OAuthLaunch connection={connection} onBack={() => setStep(6)} />}
        {step >= 8   && <StepPlaceholder step={step} onBack={() => setStep(step - 1)} />}
      </div>
    </div>
  )
}

// ─── Step-Resume-Logik ──────────────────────────────────────────────────────

function resumeStepFromOnboarding(onboardingStep) {
  switch (onboardingStep) {
    case 'meta_app_created':              return 4   // App-Row existiert, weiter zu Credentials
    case 'redirect_configured':           return 5
    case 'webhook_configured':            return 6
    case 'oauth_completed':               return 9   // Verification anstoßen
    case 'business_verification_pending': return 10  // App Review
    case 'app_review_pending':            return 11  // Live-Switch
    case 'live':                          return 11
    default:                              return 1
  }
}

// ─── Layout-Komponenten ─────────────────────────────────────────────────────

function Header({ step, connection }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>
        Instagram + Meta verbinden
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
        Bring-Your-Own-App: Du legst deine eigene Meta-App an und verbindest sie mit Leadesk. Schritt {step} von 11.
      </div>
      {connection?.ig_username && (
        <div style={{ marginTop: 12, padding: '8px 14px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, fontSize: 12, color: '#075985' }}>
          Verbunden mit <strong>@{connection.ig_username}</strong> · Status: {connection.onboarding_step}
        </div>
      )}
    </div>
  )
}

function StepProgress({ current }) {
  const steps = Array.from({ length: 11 }, (_, i) => i + 1)
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
      {steps.map(n => (
        <div key={n} style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: n <= current ? IND : '#E2E8F0',
          transition: 'background 0.2s',
        }} />
      ))}
    </div>
  )
}

// ─── Step 1: Voraussetzungs-Check ───────────────────────────────────────────

function Step1Prerequisites({ onNext }) {
  const [confirmed, setConfirmed] = useState({ business: false, page: false, tax: false })
  const ready = confirmed.business && confirmed.page && confirmed.tax

  return (
    <>
      <h2 style={h2Style}>Schritt 1: Voraussetzungen prüfen</h2>
      <p style={pStyle}>
        Bevor du startest, prüfe bitte, dass folgende Voraussetzungen erfüllt sind. Personal Instagram-Accounts werden seit Dezember 2024 nicht mehr von der Meta-API unterstützt.
      </p>
      <Checklist items={[
        { key: 'business', label: 'Mein Instagram-Account ist auf Business oder Creator umgestellt' },
        { key: 'page',     label: 'Ich habe (oder bin bereit anzulegen) eine Facebook-Seite, falls ich Lead Ads importieren möchte' },
        { key: 'tax',      label: 'Ich habe eine Gewerbeanmeldung + USt-IdNr. (für Meta Business Verification)' },
      ]} value={confirmed} onChange={setConfirmed} />
      <Footer onNext={onNext} nextDisabled={!ready} />
    </>
  )
}

// ─── Step 2: Business Manager ───────────────────────────────────────────────

function Step2BusinessManager({ onNext, onBack }) {
  return (
    <>
      <h2 style={h2Style}>Schritt 2: Meta Business Manager anlegen</h2>
      <p style={pStyle}>
        Falls du noch keinen Meta Business Manager hast, lege jetzt einen an. Das ist die Verwaltungsoberfläche, in der alle deine Meta-Apps, Seiten und Werbekonten zusammenlaufen.
      </p>
      <ExternalLinkButton href="https://business.facebook.com/overview" label="Business Manager öffnen" />
      <p style={{ ...pStyle, fontSize: 12, color: 'var(--text-muted)' }}>
        Wenn du schon einen hast: weiter zum nächsten Schritt.
      </p>
      <Footer onBack={onBack} onNext={onNext} />
    </>
  )
}

// ─── Step 3: Create Meta App ────────────────────────────────────────────────

function Step3CreateMetaApp({ onNext, onBack }) {
  return (
    <>
      <h2 style={h2Style}>Schritt 3: Meta-App im Developer Dashboard erstellen</h2>
      <p style={pStyle}>
        Im Meta Developer Dashboard erstellst du eine neue App vom Typ <strong>Business</strong>. Die App-ID + App-Secret kommen im nächsten Schritt zu uns.
      </p>
      <OrderedList items={[
        'Öffne developers.facebook.com → "My Apps" → "Create App"',
        'Wähle "Other" → "Business" als App-Typ',
        'Gib einen Namen ein (sichtbar für deine Endkunden im OAuth-Consent — z.B. dein Brand)',
        'Notiere App-ID + App-Secret (App-Settings → Basic). Secret ist initial verschlüsselt, klicke "Show".',
      ]} />
      <ExternalLinkButton href="https://developers.facebook.com/apps/" label="Meta Developer Dashboard öffnen" />
      <Footer onBack={onBack} onNext={onNext} />
    </>
  )
}

// ─── Step 4: Credentials-Form (legt Connection-Row an) ──────────────────────

function Step4CredentialsForm({ accountId, teamId, existing, onSaved, onBack }) {
  const [metaAppId,     setMetaAppId]     = useState(existing?.meta_app_id || '')
  const [metaAppSecret, setMetaAppSecret] = useState('')
  const [loginMode,     setLoginMode]     = useState(existing?.login_mode || 'facebook')
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState(null)

  async function handleSave() {
    setSaving(true)
    setErr(null)

    if (!metaAppId.trim() || !metaAppSecret.trim()) {
      setErr('Beides eingeben: App-ID und App-Secret.')
      setSaving(false)
      return
    }

    // Secret server-side verschlüsseln via RPC.
    const { data: encrypted, error: encErr } = await supabase.rpc('pm_instagram_encrypt', {
      p_plaintext: metaAppSecret,
      p_key: '<<TODO_PM_INSTAGRAM_MASTER_KEY_AUS_BACKEND_RPC>>',  // wird in echter Impl. server-side resolved
    })
    // ^^^ Hinweis: Diese RPC braucht den Master-Key. Pattern dafür: separate RPC
    // pm_instagram_create_connection(app_id, app_secret_plaintext) die Master-Key
    // aus pg-GUC liest und intern encrypted. Frontend muss den Key NIE kennen.
    // Hier als TODO-Marker — vor Production durch RPC-Wrapper ersetzen.

    if (encErr || !encrypted) {
      setErr('Verschlüsselung fehlgeschlagen: ' + (encErr?.message || 'unknown'))
      setSaving(false)
      return
    }

    const payload = {
      account_id: accountId,
      team_id: teamId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      meta_app_id: metaAppId.trim(),
      meta_app_secret_encrypted: encrypted,
      webhook_verify_token: randomVerifyToken(),
      login_mode: loginMode,
      onboarding_step: 'redirect_configured',
    }

    let row, error
    if (existing) {
      ({ data: row, error } = await supabase
        .from('pm_instagram_accounts')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single())
    } else {
      ({ data: row, error } = await supabase
        .from('pm_instagram_accounts')
        .insert(payload)
        .select()
        .single())
    }

    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved(row)
  }

  return (
    <>
      <h2 style={h2Style}>Schritt 4: App-Credentials hinterlegen</h2>
      <p style={pStyle}>
        Trage hier deine App-ID + App-Secret ein. Das Secret wird sofort verschlüsselt gespeichert und für Leadesk-Mitarbeiter nicht lesbar.
      </p>

      <label style={labelStyle}>Login-Modus</label>
      <select value={loginMode} onChange={e => setLoginMode(e.target.value)} style={inputStyle}>
        <option value="facebook">Facebook Login (mit FB-Page, ermöglicht Lead Ads)</option>
        <option value="instagram">Instagram Login (ohne FB-Page, ohne Lead Ads)</option>
      </select>

      <label style={labelStyle}>Meta App-ID</label>
      <input
        type="text"
        value={metaAppId}
        onChange={e => setMetaAppId(e.target.value)}
        placeholder="z.B. 1234567890123456"
        style={inputStyle}
      />

      <label style={labelStyle}>Meta App-Secret</label>
      <input
        type="password"
        value={metaAppSecret}
        onChange={e => setMetaAppSecret(e.target.value)}
        placeholder="Wird verschlüsselt gespeichert"
        style={inputStyle}
      />

      {err && <div style={errorBoxStyle}>{err}</div>}

      <Footer onBack={onBack} onNext={handleSave} nextLabel={saving ? 'Speichere…' : 'Speichern und weiter'} nextDisabled={saving} />
    </>
  )
}

// ─── Step 5: URLs zum Kopieren (Redirect-URI + Webhook) ─────────────────────

function Step5UrlsToCopy({ connection, onNext, onBack }) {
  const oauthRedirectUri = `${SUPABASE_FUNCTIONS_BASE}/instagram-oauth-callback`
  const webhookCallback  = `${SUPABASE_FUNCTIONS_BASE}/instagram-webhook-receiver/${connection?.id || '...'}`

  return (
    <>
      <h2 style={h2Style}>Schritt 5: Redirect-URI + Webhook in deiner Meta-App eintragen</h2>
      <p style={pStyle}>
        In deinem Meta Developer Dashboard musst du folgende Werte konfigurieren. Klicke „Kopieren" und füge sie in den entsprechenden Settings deiner App ein.
      </p>

      <CopyField
        label="OAuth Redirect-URI (Facebook Login → Settings → Valid OAuth Redirect URIs)"
        value={oauthRedirectUri}
      />

      <CopyField
        label="Webhook Callback-URL (Webhooks → Instagram bzw. Page → Callback URL)"
        value={webhookCallback}
      />

      <CopyField
        label="Webhook Verify-Token (Webhooks → Verify Token)"
        value={connection?.webhook_verify_token || '—'}
      />

      <p style={{ ...pStyle, fontSize: 12, color: 'var(--text-muted)' }}>
        Abonniere im Webhook-Setup die Felder, die zu deinen gewünschten Funktionen passen (Schritt 6 entscheidet, welche das sind).
      </p>

      <Footer onBack={onBack} onNext={onNext} />
    </>
  )
}

// ─── Step 6: Permission-Auswahl ─────────────────────────────────────────────

function Step6Permissions({ connection, onSaved, onBack }) {
  const [selected, setSelected] = useState(() => {
    const m = {}
    PERMISSION_OPTIONS.forEach(p => { m[p.key] = (connection?.requested_permissions || []).includes(p.key) })
    return m
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  const available = PERMISSION_OPTIONS.filter(p => p.loginModes.includes(connection?.login_mode))

  async function handleSave() {
    setSaving(true)
    const keys = Object.entries(selected).filter(([_, v]) => v).map(([k]) => k)
    const { data, error } = await supabase
      .from('pm_instagram_accounts')
      .update({
        requested_permissions: keys,
        subscribed_fields: deriveWebhookFields(keys),
        onboarding_step: 'webhook_configured',
      })
      .eq('id', connection.id)
      .select()
      .single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(data)
  }

  return (
    <>
      <h2 style={h2Style}>Schritt 6: Permissions wählen</h2>
      <p style={pStyle}>
        Welche Daten soll Leadesk von Instagram lesen? Du brauchst für jede ausgewählte Permission ein separates App Review bei Meta.
      </p>
      {available.map(p => (
        <label key={p.key} style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={!!selected[p.key]}
            onChange={e => setSelected(s => ({ ...s, [p.key]: e.target.checked }))}
            style={{ marginRight: 12 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.desc}</div>
          </div>
        </label>
      ))}
      {connection?.login_mode === 'instagram' && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12 }}>
          Hinweis: Lead Ads erfordern Facebook Login. Mit Instagram-Login-Modus nicht verfügbar.
        </div>
      )}
      {err && <div style={errorBoxStyle}>{err}</div>}
      <Footer onBack={onBack} onNext={handleSave} nextLabel={saving ? 'Speichere…' : 'Weiter zu OAuth'} nextDisabled={saving} />
    </>
  )
}

function deriveWebhookFields(permissionKeys) {
  const fields = []
  if (permissionKeys.includes('dms'))      fields.push('messages', 'message_reactions')
  if (permissionKeys.includes('comments')) fields.push('comments', 'mentions')
  if (permissionKeys.includes('insights')) fields.push('story_insights')
  return fields
}

// ─── Step 7: OAuth-Start ────────────────────────────────────────────────────

function Step7OAuthLaunch({ connection, onBack }) {
  const [launching, setLaunching] = useState(false)
  const [err, setErr]             = useState(null)

  async function startOAuth() {
    setLaunching(true)
    setErr(null)

    const state = randomState()
    const { error: stateErr } = await supabase
      .from('pm_instagram_oauth_state')
      .insert({
        state,
        connection_id: connection.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
      })

    if (stateErr) {
      setErr(stateErr.message)
      setLaunching(false)
      return
    }

    const scopes = scopesFor(connection.login_mode, connection.requested_permissions)
    const url = buildOAuthUrl(connection, scopes, state)
    window.location.href = url
  }

  return (
    <>
      <h2 style={h2Style}>Schritt 7: Mit Instagram verbinden</h2>
      <p style={pStyle}>
        Klick auf den Button startet den OAuth-Dialog bei Meta. Der Consent-Screen zeigt deinen App-Namen, nicht „Leadesk". Nach Erfolg landest du wieder hier.
      </p>
      {err && <div style={errorBoxStyle}>{err}</div>}
      <button
        onClick={startOAuth}
        disabled={launching}
        style={{ ...primaryBtnStyle, marginTop: 8 }}
      >
        {launching ? 'Weiterleitung…' : 'Mit Instagram verbinden'}
      </button>
      <Footer onBack={onBack} />
    </>
  )
}

function scopesFor(loginMode, requested) {
  if (loginMode === 'facebook') {
    const s = ['instagram_basic', 'pages_show_list', 'pages_read_engagement']
    if (requested.includes('dms'))      s.push('instagram_manage_messages')
    if (requested.includes('comments')) s.push('instagram_manage_comments', 'pages_manage_metadata')
    if (requested.includes('lead_ads')) s.push('leads_retrieval', 'ads_management')
    if (requested.includes('insights')) s.push('instagram_manage_insights')
    return s
  } else {
    const s = ['instagram_business_basic']
    if (requested.includes('dms'))      s.push('instagram_business_manage_messages')
    if (requested.includes('comments')) s.push('instagram_business_manage_comments')
    if (requested.includes('insights')) s.push('instagram_business_manage_insights')
    return s
  }
}

function buildOAuthUrl(connection, scopes, state) {
  const redirectUri = `${SUPABASE_FUNCTIONS_BASE}/instagram-oauth-callback`
  const baseUrl = connection.login_mode === 'facebook'
    ? 'https://www.facebook.com/v25.0/dialog/oauth'
    : 'https://api.instagram.com/oauth/authorize'

  const params = new URLSearchParams({
    client_id: connection.meta_app_id,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(','),
    response_type: 'code',
  })
  return `${baseUrl}?${params.toString()}`
}

// ─── Step 8–11: Placeholder ─────────────────────────────────────────────────

function StepPlaceholder({ step, onBack }) {
  const labels = {
    8:  'Webhook-Subscription bestätigen',
    9:  'Business Verification anstoßen',
    10: 'App Review pro Permission',
    11: 'Live-Switch',
  }
  return (
    <>
      <h2 style={h2Style}>Schritt {step}: {labels[step] || '—'}</h2>
      <p style={pStyle}>
        Dieser Schritt ist in Phase 2 implementiert. Du kannst dein Onboarding ab hier direkt im Meta Developer Dashboard fortsetzen, und sobald deine App auf „Live" steht, sind alle Features in Leadesk freigeschaltet.
      </p>
      <Footer onBack={onBack} />
    </>
  )
}

// ─── Sub-Komponenten + Styles ───────────────────────────────────────────────

function Checklist({ items, value, onChange }) {
  return (
    <div>
      {items.map(it => (
        <label key={it.key} style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={!!value[it.key]}
            onChange={e => onChange({ ...value, [it.key]: e.target.checked })}
            style={{ marginRight: 12 }}
          />
          <span style={{ fontSize: 14 }}>{it.label}</span>
        </label>
      ))}
    </div>
  )
}

function OrderedList({ items }) {
  return (
    <ol style={{ paddingLeft: 20, color: 'var(--text-strong)', fontSize: 14, lineHeight: 1.6 }}>
      {items.map((it, i) => <li key={i} style={{ marginBottom: 6 }}>{it}</li>)}
    </ol>
  )
}

function ExternalLinkButton({ href, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'inline-block',
      padding: '10px 20px',
      background: IND,
      color: '#fff',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      textDecoration: 'none',
      marginTop: 8,
      marginBottom: 8,
    }}>
      {label} →
    </a>
  )
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  async function doCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" value={value} readOnly style={{ ...inputStyle, marginBottom: 0, fontFamily: 'monospace', fontSize: 12 }} />
        <button onClick={doCopy} style={secondaryBtnStyle}>{copied ? '✓ Kopiert' : 'Kopieren'}</button>
      </div>
    </div>
  )
}

function Footer({ onBack, onNext, nextLabel = 'Weiter', nextDisabled = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
      {onBack ? <button onClick={onBack} style={secondaryBtnStyle}>← Zurück</button> : <span />}
      {onNext && (
        <button onClick={onNext} disabled={nextDisabled} style={{ ...primaryBtnStyle, opacity: nextDisabled ? 0.5 : 1 }}>
          {nextLabel}
        </button>
      )}
    </div>
  )
}

const pageStyle = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '32px 24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const cardStyle = {
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '28px 32px',
  border: '1px solid #E2E8F0',
}

const h2Style = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: '0 0 12px',
}

const pStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: 'var(--text)',
  margin: '0 0 16px',
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-strong)',
  marginBottom: 6,
  marginTop: 12,
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  fontSize: 14,
  marginBottom: 8,
  boxSizing: 'border-box',
}

const primaryBtnStyle = {
  padding: '10px 22px',
  background: IND,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryBtnStyle = {
  padding: '10px 18px',
  background: '#fff',
  color: 'var(--text-strong)',
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const checkboxRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '10px 12px',
  border: '1px solid #E2E8F0',
  borderRadius: 6,
  marginBottom: 8,
  cursor: 'pointer',
}

const errorBoxStyle = {
  padding: '10px 14px',
  background: '#FEF2F2',
  border: '1px solid #FCA5A5',
  borderRadius: 6,
  fontSize: 13,
  color: '#991B1B',
  marginBottom: 16,
}
