// Sponsoring OS — Sponsor Success & Renewal (Phase 4, Modul 15 + 14)
// Health-Score je Vertrag + Risiko-Liste (niedriger Score / läuft bald aus).
// "Health neu berechnen" ruft recompute_sponsor_health_all. Schema 'sponsoring'.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { HeartPulse, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')
const RISK_DAYS = 90

function healthColor(s) {
  if (s == null) return 'var(--text-muted)'
  if (s >= 70) return '#059669'
  if (s >= 50) return '#D97706'
  return '#DC2626'
}
function daysUntil(d) {
  if (!d) return null
  return Math.ceil((new Date(d) - new Date()) / 86400000)
}

export default function SponsorSuccess() {
  const { activeTeamId } = useTeam()
  const [contracts, setContracts] = useState([])
  const [health, setHealth] = useState({})
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [c, h, s] = await Promise.all([
      sp().from('contracts').select('*').eq('team_id', activeTeamId),
      sp().from('v_contract_health').select('*').eq('team_id', activeTeamId),
      sp().from('sponsor_profiles').select('id, name').eq('team_id', activeTeamId),
    ])
    if (c.error || h.error || s.error) { setError((c.error || h.error || s.error).message); setLoading(false); return }
    setContracts(c.data || [])
    setHealth(Object.fromEntries((h.data || []).map((r) => [r.contract_id, r])))
    setSponsors(s.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sponsorName = useMemo(() => Object.fromEntries(sponsors.map((s) => [s.id, s.name])), [sponsors])

  async function recompute() {
    setBusy(true); setError(null); setNote(null)
    const { data, error: e } = await supabase.rpc('recompute_sponsor_health_all')
    if (e) { setError(e.message); setBusy(false); return }
    setNote(`${data} Vertrag/Verträge neu bewertet.`)
    await fetchAll(); setBusy(false)
  }

  const rows = useMemo(() => contracts.map((c) => {
    const h = health[c.id]
    const dleft = daysUntil(c.ends_on)
    const score = h?.score ?? null
    const atRisk = (score != null && score < 50) ||
      (dleft != null && dleft <= RISK_DAYS && ['active', 'expiring'].includes(c.status))
    return { ...c, score, drivers: h?.drivers, dleft, atRisk }
  }), [contracts, health])

  const risks = rows.filter((r) => r.atRisk)

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HeartPulse size={26} color={PRIMARY} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Sponsor Success</h1>
        </div>
        <button onClick={recompute} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Health neu berechnen
        </button>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 680, lineHeight: 1.6 }}>
        Health-Score je Vertrag aus Aktivierung, KI-Sichtbarkeit, Signalen und Status. Niedriger Score oder baldiges Vertragsende = Renewal-Risiko.
      </p>

      {error && <div style={errBox}>{error}</div>}
      {note && <div style={okBox}>{note}</div>}

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : (
        <>
          {/* Risiko */}
          {risks.length > 0 && (
            <div style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: 14, padding: 16, marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991B1B', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                <AlertTriangle size={16} /> {risks.length} Renewal-Risiko/-Risiken
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {risks.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{sponsorName[r.sponsor_profile_id] || 'Vertrag'}</span>
                    <span style={{ color: '#991B1B' }}>
                      {r.score != null ? `Health ${r.score}` : 'kein Score'}
                      {r.dleft != null && r.dleft <= RISK_DAYS ? ` · endet in ${r.dleft} T.` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alle Verträge */}
          {rows.length === 0 ? (
            <div style={muted}>Noch keine Verträge.</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead><tr style={trHead}>
                  <th style={th}>Sponsor</th><th style={th}>Health</th><th style={th}>Treiber</th><th style={th}>Status</th><th style={th}>Endet</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={trBody}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[r.sponsor_profile_id] || '—'}</td>
                      <td style={td}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: healthColor(r.score) }}>{r.score != null ? r.score : '—'}</span>
                      </td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)' }}>
                        {r.drivers ? `Akt. ${Math.round((r.drivers.activation_ratio || 0) * 100)}% · GEO ${r.drivers.geo_visibility || 0} · Sig ${r.drivers.signals_180d || 0}` : '—'}
                      </td>
                      <td style={td}>{r.status}</td>
                      <td style={td}>{r.ends_on ? new Date(r.ends_on).toLocaleDateString('de-DE') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const okBox = { padding: '10px 14px', borderRadius: 10, background: '#D1FAE5', color: '#065F46', fontSize: 13, marginBottom: 16 }
