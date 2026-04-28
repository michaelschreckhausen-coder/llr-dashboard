import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAccount } from '../context/AccountContext'
import SettingsTabs from '../components/SettingsTabs'

const STATUS_LABELS = {
  trialing:  { label: 'Test-Phase',         color: '#0369A1', bg: '#E0F2FE' },
  active:    { label: 'Aktiv',              color: '#15803D', bg: '#DCFCE7' },
  past_due:  { label: 'Zahlung überfällig', color: '#B45309', bg: '#FEF3C7' },
  suspended: { label: 'Gesperrt',           color: '#B91C1C', bg: '#FEE2E2' },
  canceled:  { label: 'Gekündigt',          color: '#475569', bg: '#F1F5F9' },
}

export default function SettingsKonto() {
  const { account, loading, error } = useAccount()
  const [planName, setPlanName] = useState(null)

  useEffect(() => {
    if (!account?.plan_id) { setPlanName(null); return }
    supabase.from('plans').select('name').eq('id', account.plan_id).maybeSingle()
      .then(({ data, error: pErr }) => {
        if (pErr) {
          console.error('[SettingsKonto] plan lookup failed:', pErr)
          return
        }
        setPlanName(data?.name || null)
      })
  }, [account?.plan_id])

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
          <Row label="Plan" value={planName || '—'} />
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
