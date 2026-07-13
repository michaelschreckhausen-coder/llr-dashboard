// SettingsAffiliate — Phase 8: Bestandskunden-Self-Onboarding (/settings/affiliate).
// 2-Step-Wizard (Intro + Code/ToS), Auto-Approve via self_onboard_as_affiliate.
// Detection: schon Affiliate → Link zum Affiliate-Dashboard statt Wizard.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import SettingsTabs from '../components/SettingsTabs'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const AFFILIATE_APP = 'https://affiliate.leadesk.de'
const wrap = { width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 4px' }
const card = { background: 'var(--surface,#fff)', border: '1px solid var(--border,#E5E7EB)', borderRadius: 14, padding: 24 }
const h1 = { fontSize: 22, fontWeight: 800, color: 'var(--text-strong,#111827)', margin: '0 0 6px' }
const subline = { fontSize: 14, color: 'var(--text-soft,#6B7280)', margin: '0 0 20px' }
const btnPrimary = { padding: '11px 22px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const kpi = { flex: 1, minWidth: 150, background: 'var(--surface-soft,#F8FAFC)', borderRadius: 12, padding: 16, textAlign: 'center' }

export default function SettingsAffiliate() {
  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState(null)
  const [step, setStep] = useState(1)
  const [code, setCode] = useState('')
  const [avail, setAvail] = useState(null)   // null | 'checking' | 'ok' | 'taken' | 'badformat'
  const [tos, setTos] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const debRef = useRef(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('affiliates').select('id, status, code').maybeSingle()
      setExisting(data || null); setLoading(false)
    })()
  }, [])

  // Beim Eintritt in Step 2: Code vorschlagen
  useEffect(() => {
    if (step === 2 && !code) {
      supabase.rpc('suggest_affiliate_code').then(({ data }) => { if (data) setCode(data) })
    }
  }, [step]) // eslint-disable-line

  // Debounced Verfügbarkeits-Check
  useEffect(() => {
    if (!code) { setAvail(null); return }
    if (!/^[a-z0-9][a-z0-9-]{3,29}$/.test(code)) { setAvail('badformat'); return }
    setAvail('checking')
    clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc('affiliate_code_available', { p_code: code })
      setAvail(data ? 'ok' : 'taken')
    }, 500)
    return () => clearTimeout(debRef.current)
  }, [code])

  const submit = async () => {
    setError(null); setSubmitting(true)
    const { error: e } = await supabase.rpc('self_onboard_as_affiliate', { p_code: code, p_accepted_tos: tos })
    setSubmitting(false)
    if (e) { setError(e.message); return }
    setDone(true)
    setTimeout(() => { window.location.href = AFFILIATE_APP }, 3000)
  }

  if (loading) return <div style={wrap}><SettingsTabs /><div style={{ color: '#6B7280' }}>Lade…</div></div>

  return (
    <div style={wrap}>
      <SettingsTabs />

      {existing ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🎉</div>
          <h1 style={h1}>Du bist bereits Affiliate</h1>
          <p style={subline}>Dein Code: <strong style={{ fontFamily: 'monospace' }}>{existing.code}</strong> — verwalte Klicks, Provisionen und Auszahlungen im Affiliate-Dashboard.</p>
          <a href={AFFILIATE_APP} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>Zum Affiliate-Dashboard →</a>
        </div>
      ) : done ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🎉</div>
          <h1 style={h1}>Du bist jetzt Affiliate!</h1>
          <p style={subline}>Wir haben dir eine E-Mail mit den nächsten Schritten gesendet. Du wirst gleich zum Affiliate-Dashboard weitergeleitet…</p>
          <a href={AFFILIATE_APP} style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>Jetzt zum Dashboard →</a>
        </div>
      ) : step === 1 ? (
        <div style={card}>
          <h1 style={h1}>Werde Leadesk-Affiliate</h1>
          <p style={subline}>Verdiene <strong>20 % Provision für 12 Monate</strong> pro geworbenem Kunden.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={kpi}><div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>20 %</div><div style={{ fontSize: 12, color: '#6B7280' }}>Provision</div></div>
            <div style={kpi}><div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>12 Monate</div><div style={{ fontSize: 12, color: '#6B7280' }}>Laufzeit pro Kunde</div></div>
            <div style={kpi}><div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>ab 25 €</div><div style={{ fontSize: 12, color: '#6B7280' }}>Auto-Auszahlung</div></div>
          </div>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14, fontSize: 13, color: '#1E3A8A', marginBottom: 16 }}>
            <strong>Beispiel:</strong> Ein Kunde mit 49 €-Plan = 9,80 €/Monat × 12 = <strong>117,60 €</strong> Provision.
          </div>
          <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
            Tracking über deinen persönlichen Link · Provisionen werden 14 Tage nach Zahlung bestätigt · Auszahlung monatlich via Stripe-Connect.
          </p>
          <button style={btnPrimary} onClick={() => setStep(2)}>Jetzt teilnehmen →</button>
        </div>
      ) : (
        <div style={card}>
          <h1 style={h1}>Wähle deinen Affiliate-Code</h1>
          <p style={subline}>Mit diesem Code identifizierst du deine Empfehlungen.</p>

          <input
            value={code} onChange={(e) => setCode(e.target.value.toLowerCase().trim())}
            placeholder="dein-code"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', border: `1.5px solid ${avail === 'ok' ? '#16A34A' : avail === 'taken' || avail === 'badformat' ? '#DC2626' : 'var(--border,#CBD5E1)'}`, borderRadius: 10, fontSize: 15, fontFamily: 'monospace', outline: 'none' }}
          />
          <div style={{ fontSize: 12.5, marginTop: 6, minHeight: 18, color: avail === 'ok' ? '#16A34A' : avail === 'checking' ? '#6B7280' : '#DC2626' }}>
            {avail === 'checking' && 'Prüfe Verfügbarkeit…'}
            {avail === 'ok' && '✓ verfügbar'}
            {avail === 'taken' && '✗ schon vergeben'}
            {avail === 'badformat' && '! 4–30 Zeichen, nur a–z, 0–9, Bindestrich, Start alphanumerisch'}
          </div>

          <div style={{ fontSize: 12.5, color: '#6B7280', margin: '10px 0 18px' }}>
            Dein Link: <span style={{ fontFamily: 'monospace', color: 'var(--text-strong,#111827)' }}>https://app.leadesk.de/signup?ref={code || '…'}</span>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#374151', marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Ich akzeptiere die <a href="https://leadesk.de/affiliate-bedingungen" target="_blank" rel="noreferrer" style={{ color: PRIMARY }}>Affiliate-Bedingungen</a>.</span>
          </label>

          {error && <div style={{ padding: 10, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#991B1B', fontSize: 13, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...btnPrimary, background: 'transparent', color: '#6B7280', border: '1px solid var(--border,#CBD5E1)' }} onClick={() => setStep(1)}>← Zurück</button>
            <button style={{ ...btnPrimary, opacity: (avail === 'ok' && tos && !submitting) ? 1 : 0.5 }} disabled={avail !== 'ok' || !tos || submitting} onClick={submit}>
              {submitting ? 'Wird angelegt…' : 'Werde Affiliate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
