// Sponsoring OS — Reporting-Dashboard (Phase 2, Modul 8)
// KPI-Cards + recharts. Daten aus RPC get_sponsoring_dashboard (aktives Team).

import { useEffect, useState, useCallback } from 'react'
import { BarChart3, Loader2, RefreshCw, TrendingUp, Trophy, Activity, Percent } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../../lib/supabase'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const eur = (n) => `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`

export default function Reporting() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: d, error: e } = await supabase.rpc('get_sponsoring_dashboard')
    if (e) { setError(e.message); setLoading(false); return }
    setData(d); setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const top = (data?.top_partners || []).map((p) => ({ name: p.name, revenue: Number(p.revenue) }))

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChart3 size={26} color={PRIMARY} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Reporting</h1>
        </div>
        <button onClick={fetchData} title="Aktualisieren" style={iconBtn}><RefreshCw size={16} /></button>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>
        Überblick über Umsatz, Forecast, Auslastung und Top-Partner deines Teams.
      </p>

      {error && <div style={errBox}>{error}</div>}

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade Kennzahlen…</div>
      ) : !data ? (
        <div style={muted}>Keine Daten.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 26 }}>
            <Kpi icon={TrendingUp} label="Gesamtumsatz (aktiv)" value={eur(data.total_revenue)} />
            <Kpi icon={Activity} label="Forecast (offene Angebote)" value={eur(data.forecast)} />
            <Kpi icon={BarChart3} label="Ø Vertragswert" value={eur(data.avg_contract_value)} />
            <Kpi icon={Trophy} label="Aktive Verträge" value={data.active_contracts} />
            <Kpi icon={Percent} label="Auslastung Inventar" value={`${data.inventory_utilization}%`} sub={`${data.inventory_sold_slots}/${data.inventory_total_slots} Slots`} />
            <Kpi icon={Percent} label="Verlängerungsquote" value={data.renewal_quote != null ? `${data.renewal_quote}%` : '—'} />
            <Kpi icon={Trophy} label="Sponsoren (gewonnen)" value={`${data.won_sponsors}/${data.total_sponsors}`} />
            <Kpi icon={Activity} label="Freie Rechte" value={data.free_rights} />
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 14 }}>Top-Partner nach Umsatz</div>
            {top.length === 0 ? (
              <div style={{ ...muted, padding: '20px 0' }}>Noch keine Vertragsumsätze.</div>
            ) : (
              <div style={{ width: '100%', height: 40 + top.length * 46 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} layout="vertical" margin={{ left: 20, right: 30, top: 4, bottom: 4 }}>
                    <XAxis type="number" tickFormatter={(v) => eur(v)} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: 'var(--text-strong)' }} />
                    <Tooltip formatter={(v) => eur(v)} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                      {top.map((_, i) => <Cell key={i} fill={PRIMARY} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', marginBottom: 8 }}>
        <Icon size={16} color={PRIMARY} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
