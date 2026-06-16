// Sponsoring OS — Vertragsmanagement (Phase 1, Modul 5)
// Offene Angebote -> Vertrag (RPC accept_offer, bucht Inventar). Vertragsliste
// mit Laufzeit/Status. Schema 'sponsoring', team_id aus useTeam().

import { useEffect, useMemo, useState, useCallback } from 'react'
import { ScrollText, Loader2, ArrowRight, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')
const fmt = (n) => `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`
const dateStr = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—')

const CTR_STATUS = ['active', 'expiring', 'renewed', 'churned', 'expired']
const CTR_LABEL = { active: 'Aktiv', expiring: 'Läuft aus', renewed: 'Verlängert', churned: 'Gekündigt', expired: 'Abgelaufen' }
const CTR_COLOR = { active: '#059669', expiring: '#D97706', renewed: '#2563EB', churned: '#DC2626', expired: '#6B7280' }

// Angebote, die noch in einen Vertrag wandern können
const OPEN_OFFER = ['draft', 'sent', 'negotiation']

export default function Vertraege() {
  const { activeTeamId } = useTeam()
  const [offers, setOffers] = useState([])
  const [contracts, setContracts] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [convert, setConvert] = useState(null)  // offer being converted
  const [cf, setCf] = useState({ starts_on: '', ends_on: '', notice_period_days: 90 })

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [off, ctr, spn, pk] = await Promise.all([
      sp().from('offers').select('*').eq('team_id', activeTeamId).in('status', OPEN_OFFER).order('created_at', { ascending: false }),
      sp().from('contracts').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('sponsor_profiles').select('id, name').eq('team_id', activeTeamId),
      sp().from('packages').select('id, name').eq('team_id', activeTeamId),
    ])
    const err = off.error || ctr.error || spn.error || pk.error
    if (err) { setError(err.message); setLoading(false); return }
    setOffers(off.data || [])
    setContracts(ctr.data || [])
    setSponsors(spn.data || [])
    setPackages(pk.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sponsorName = useMemo(() => Object.fromEntries(sponsors.map((s) => [s.id, s.name])), [sponsors])
  const packageName = useMemo(() => Object.fromEntries(packages.map((p) => [p.id, p.name])), [packages])

  async function doConvert(e) {
    e.preventDefault()
    if (!convert) return
    setBusy(true); setError(null)
    const { error: e2 } = await supabase.rpc('accept_offer', {
      p_offer_id: convert.id,
      p_starts_on: cf.starts_on || null,
      p_ends_on: cf.ends_on || null,
      p_notice_period_days: Number(cf.notice_period_days) || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setConvert(null)
    setCf({ starts_on: '', ends_on: '', notice_period_days: 90 })
    await fetchAll(); setBusy(false)
  }

  async function updateStatus(id, status) {
    const { error: e } = await sp().from('contracts')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) { setError(e.message); return }
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ padding: 32, maxWidth: 1050, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <ScrollText size={26} color={PRIMARY} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Verträge</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.6 }}>
        Wandle angenommene Angebote in Verträge — das bucht automatisch die enthaltenen Rechte als verkauft.
      </p>

      {error && <div style={errBox}>{error}</div>}

      {/* Offene Angebote */}
      <h2 style={h2}>Offene Angebote</h2>
      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : offers.length === 0 ? (
        <div style={{ ...muted, marginBottom: 28 }}>Keine offenen Angebote.</div>
      ) : (
        <div style={{ ...tableWrap, marginBottom: 28 }}>
          <table style={table}>
            <thead><tr style={trHead}>
              <th style={th}>Sponsor</th><th style={th}>Paket</th><th style={th}>Summe</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} style={trBody}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[o.sponsor_profile_id] || '—'}</td>
                  <td style={td}>{packageName[o.package_id] || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(o.total_price)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => setConvert(o)} style={primaryBtn}>
                      In Vertrag wandeln <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verträge */}
      <h2 style={h2}>Verträge</h2>
      {loading ? null : contracts.length === 0 ? (
        <div style={muted}>Noch keine Verträge.</div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead><tr style={trHead}>
              <th style={th}>Sponsor</th><th style={th}>Paket</th><th style={th}>Summe</th><th style={th}>Laufzeit</th><th style={th}>Kündigungsfrist</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} style={trBody}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[c.sponsor_profile_id] || '—'}</td>
                  <td style={td}>{packageName[c.package_id] || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(c.total_price)}</td>
                  <td style={td}>{dateStr(c.starts_on)} – {dateStr(c.ends_on)}</td>
                  <td style={td}>{c.notice_period_days ? `${c.notice_period_days} Tage` : '—'}</td>
                  <td style={td}>
                    <select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)}
                            style={{ ...input, padding: '4px 8px', color: CTR_COLOR[c.status], fontWeight: 600 }}>
                      {CTR_STATUS.map((s) => <option key={s} value={s}>{CTR_LABEL[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Convert-Modal */}
      {convert && (
        <div style={overlay} onClick={() => !busy && setConvert(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={doConvert} style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>Vertrag erstellen</div>
              <button type="button" onClick={() => setConvert(null)} style={iconBtn}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              {sponsorName[convert.sponsor_profile_id]} · {packageName[convert.package_id]} · {fmt(convert.total_price)}
            </div>
            <Field label="Beginn"><input type="date" value={cf.starts_on} onChange={(e) => setCf({ ...cf, starts_on: e.target.value })} style={input} /></Field>
            <Field label="Ende"><input type="date" value={cf.ends_on} onChange={(e) => setCf({ ...cf, ends_on: e.target.value })} style={input} /></Field>
            <Field label="Kündigungsfrist (Tage)"><input type="number" min="0" value={cf.notice_period_days} onChange={(e) => setCf({ ...cf, notice_period_days: e.target.value })} style={input} /></Field>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, marginTop: 12, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={14} className="spin" /> : null} Vertrag anlegen &amp; Inventar buchen
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const h2 = { fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }
const modal = { width: 'min(440px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }
