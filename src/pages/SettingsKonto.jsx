import React from 'react'
import { useAccount } from '../context/AccountContext'
import { useEntitlements } from '../hooks/useEntitlements'
import SettingsTabs from '../components/SettingsTabs'
import PlanCards from '../components/PlanCards'

const STATUS_LABELS = {
  trialing:  { label: 'Test-Phase',         color: '#0369A1', bg: '#E0F2FE' },
  active:    { label: 'Aktiv',              color: '#15803D', bg: '#DCFCE7' },
  past_due:  { label: 'Zahlung überfällig', color: '#B45309', bg: '#FEF3C7' },
  suspended: { label: 'Gesperrt',           color: '#B91C1C', bg: '#FEE2E2' },
  canceled:  { label: 'Gekündigt',          color: '#475569', bg: '#F1F5F9' },
}

const GRANTED_VIA_BADGE = {
  stripe: { label: 'Stripe', bg: '#DBEAFE', color: '#1E40AF' },
  manual: { label: 'Manuell', bg: '#EDE9FE', color: '#5B21B6' },
  trial:  { label: 'Trial',   bg: '#F1F5F9', color: '#475569' },
}

export default function SettingsKonto() {
  const { account, loading, error } = useAccount()
  const { data: entitlements } = useEntitlements()
  // Phase 5 Block 3.5: planName kommt aus entitlements (RPC liefert plan_name).
  // entitlements ist account-zentrische SoT.
  const planName = entitlements?.plan_name || null
  const grantedViaBadge = entitlements?.granted_via
    ? GRANTED_VIA_BADGE[entitlements.granted_via]
    : null
  const planExpiresAt = entitlements?.plan_expires_at || null

  return (
    <div style={{ maxWidth:680 }}>
      <SettingsTabs />

      {loading && (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-soft, #6B7280)', fontSize:13 }}>
          Account-Daten werden geladen…
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding:'14px 18px', borderRadius:10,
          background:'#FEE2E2', border:'1px solid #FCA5A5',
          color:'#991B1B', fontSize:13, marginBottom:16,
        }}>
          Fehler beim Laden der Account-Daten: {error}
        </div>
      )}

      {!loading && !error && !account && (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-soft, #6B7280)', fontSize:13 }}>
          Kein Account verknüpft — bitte Support kontaktieren.
        </div>
      )}

      {!loading && !error && account && (
        <div style={{
          background:'var(--surface, white)',
          borderRadius:16,
          border:'1px solid var(--border, #E5E7EB)',
          boxShadow:'0 1px 3px rgba(15,23,42,0.05)',
          overflow:'hidden',
        }}>
          <div style={{ padding:'16px 24px', borderBottom:'1px solid #E5E7EB' }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--text-strong, #0F172A)' }}>
              Konto & Abo
            </div>
            <div style={{ fontSize:12, color:'var(--text-soft, #6B7280)', marginTop:4 }}>
              Read-only — Änderungen erfolgen über den Leadesk-Support.
            </div>
          </div>
          <Row label="Account-Name" value={account.name || '—'} />
          <Row label="Rechnungs-E-Mail" value={account.billing_email || '—'} />
          <Row label="Plan" value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{planName || '—'}</span>
              {grantedViaBadge && (
                <span style={{
                  display: 'inline-block', padding: '2px 7px', borderRadius: 6,
                  fontSize: 10, fontWeight: 700,
                  color: grantedViaBadge.color, background: grantedViaBadge.bg,
                }}>
                  {grantedViaBadge.label}
                </span>
              )}
            </span>
          } />
          <Row label="Lizenz aktiv bis" value={
            planExpiresAt
              ? new Date(planExpiresAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
              : 'unbegrenzt'
          } />
          <Row label="Sitzplätze" value={account.seat_limit != null ? String(account.seat_limit) : '—'} />
          <Row label="Status" value={
            <span style={{
              display:'inline-block', padding:'3px 9px', borderRadius:6,
              fontSize:11, fontWeight:700,
              color: STATUS_LABELS[account.status]?.color || '#475569',
              background: STATUS_LABELS[account.status]?.bg || '#F1F5F9',
            }}>
              {STATUS_LABELS[account.status]?.label || account.status || '—'}
            </span>
          } />
          <Row label="Verwaltet durch" value={account.plan_managed_by === 'stripe' ? 'Stripe' : 'Leadesk-Team'} />
          {account.trial_ends_at && (
            <Row
              label="Test-Phase endet"
              value={new Date(account.trial_ends_at).toLocaleDateString('de-DE', {
                day:'2-digit', month:'long', year:'numeric',
              })}
            />
          )}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <PlanCards currentPlanId={entitlements?.plan_id} periodEnd={planExpiresAt} />
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{
      padding:'12px 24px',
      borderBottom:'1px solid #F3F4F6',
      display:'flex', justifyContent:'space-between', alignItems:'center',
      gap:16, fontSize:13,
    }}>
      <div style={{ color:'var(--text-soft, #6B7280)', fontWeight:500 }}>{label}</div>
      <div style={{ color:'var(--text-strong, #0F172A)', fontWeight:600, textAlign:'right' }}>{value}</div>
    </div>
  )
}
