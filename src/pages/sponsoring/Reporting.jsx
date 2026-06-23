// Sponsoring OS — Reporting-Dashboard (Phase 2, Modul 8)
// KPI-Cards + recharts. Daten aus RPC get_sponsoring_dashboard (aktives Team).

import { useEffect, useState, useCallback } from 'react'
import { BarChart3, Loader2, RefreshCw, TrendingUp, Trophy, Activity, Percent, Target, GitBranch, Layers } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const sp = () => supabase.schema('sponsoring')

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const eur = (n) => `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`

export default function Reporting() {
  const { activeTeamId } = useTeam() || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Zusatz-Auswertungen (Phase 5): GAP, Pipeline, Inventar/Volumen je Liga
  const [gap, setGap] = useState([])           // get_sponsoring_gap → {category,settlement,soll,ist,gap}
  const [season, setSeason] = useState('')     // optionaler Saison-Filter für GAP
  const [seasons, setSeasons] = useState([])
  const [pipeline, setPipeline] = useState([]) // get_sales_pipeline → {stage,label,is_won,sponsors,pipeline_value}
  const [openInv, setOpenInv] = useState([])   // v_open_inventory_value → {league_name,open_rights,open_inventory_value}
  const [volume, setVolume] = useState([])     // v_volume_by_league → {league_name,contracts,volume_cash,volume_barter,volume_total}

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: d, error: e } = await supabase.rpc('get_sponsoring_dashboard')
    if (e) { setError(e.message); setLoading(false); return }
    setData(d); setLoading(false)
  }, [])

  // Saison-Liste aus sponsoring.targets (analog Ziele.jsx)
  const fetchSeasons = useCallback(async () => {
    if (!activeTeamId) return
    const { data: rows } = await sp().from('targets').select('season').eq('team_id', activeTeamId)
    const list = Array.from(new Set((rows || []).map((r) => r.season).filter(Boolean))).sort().reverse()
    setSeasons(list)
  }, [activeTeamId])

  const fetchGap = useCallback(async () => {
    const args = season ? { p_season: season } : {}
    const { data: g } = await supabase.rpc('get_sponsoring_gap', args)
    setGap(Array.isArray(g) ? g : [])
  }, [season])

  const fetchPipeline = useCallback(async () => {
    const { data: p } = await supabase.rpc('get_sales_pipeline')
    setPipeline(Array.isArray(p) ? p : [])
  }, [])

  const fetchInventory = useCallback(async () => {
    if (!activeTeamId) { setOpenInv([]); setVolume([]); return }
    const [{ data: oi }, { data: vl }] = await Promise.all([
      sp().from('v_open_inventory_value').select('*').eq('team_id', activeTeamId),
      sp().from('v_volume_by_league').select('*').eq('team_id', activeTeamId),
    ])
    setOpenInv(Array.isArray(oi) ? oi : [])
    setVolume(Array.isArray(vl) ? vl : [])
  }, [activeTeamId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSeasons() }, [fetchSeasons])
  useEffect(() => { fetchGap() }, [fetchGap])
  useEffect(() => { fetchPipeline() }, [fetchPipeline])
  useEffect(() => { fetchInventory() }, [fetchInventory])

  const top = (data?.top_partners || []).map((p) => ({ name: p.name, revenue: Number(p.revenue) }))

  // Defensiv gemappte Felder (Migrationen 20260628110200 / ..110500 / ..110000)
  const gapRows = (gap || []).map((r) => ({
    category: r.category, settlement: r.settlement,
    soll: Number(r.soll || 0), ist: Number(r.ist || 0), gap: Number(r.gap || 0),
  }))
  const pipelineRows = (pipeline || []).map((r) => ({
    stage: r.stage, label: r.label || `Stufe ${r.stage}`, isWon: !!r.is_won,
    sponsors: Number(r.sponsors || 0), value: Number(r.pipeline_value || 0),
  }))
  const openInvRows = (openInv || []).map((r) => ({
    league: r.league_name || 'Ohne Liga', openRights: Number(r.open_rights || 0),
    openValue: Number(r.open_inventory_value || 0),
  })).sort((a, b) => b.openValue - a.openValue)
  const volumeRows = (volume || []).map((r) => ({
    league: r.league_name || 'Ohne Liga', contracts: Number(r.contracts || 0),
    cash: Number(r.volume_cash || 0), barter: Number(r.volume_barter || 0), total: Number(r.volume_total || 0),
  })).sort((a, b) => b.total - a.total)

  const CAT_LABEL = { werbeleistung: 'Werbeleistung', hospitality: 'Hospitality' }
  const SET_LABEL = { cash: 'Cash', barter: 'Barter' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
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

          {/* ── 1. SOLL/IST-GAP nach Kategorie × Settlement ─────────────────── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div style={cardTitle}><Target size={16} color={PRIMARY} /> SOLL/IST-GAP</div>
              {seasons.length > 0 && (
                <select value={season} onChange={(e) => setSeason(e.target.value)} style={selectStyle}>
                  <option value="">Alle Saisons</option>
                  {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
            {gapRows.length === 0 ? (
              <div style={{ ...muted, padding: '12px 0' }}>Keine SOLL-Ziele hinterlegt.</div>
            ) : (
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Kategorie</th>
                    <th style={th}>Abrechnung</th>
                    <th style={{ ...th, textAlign: 'right' }}>SOLL</th>
                    <th style={{ ...th, textAlign: 'right' }}>IST</th>
                    <th style={{ ...th, textAlign: 'right' }}>GAP</th>
                  </tr>
                </thead>
                <tbody>
                  {gapRows.map((r, i) => (
                    <tr key={i}>
                      <td style={td}>{CAT_LABEL[r.category] || r.category}</td>
                      <td style={td}>{SET_LABEL[r.settlement] || r.settlement}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{eur(r.soll)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{eur(r.ist)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.gap < 0 ? '#DC2626' : 'var(--text-strong)' }}>{eur(r.gap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── 2. Vertriebs-Pipeline je Zyklusstufe ────────────────────────── */}
          <div style={card}>
            <div style={cardTitle}><GitBranch size={16} color={PRIMARY} /> Pipeline je Vertriebsstufe</div>
            {pipelineRows.length === 0 ? (
              <div style={{ ...muted, padding: '12px 0' }}>Noch kein Vertriebszyklus konfiguriert.</div>
            ) : (
              <div style={{ width: '100%', height: 40 + pipelineRows.length * 46, marginTop: 6 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineRows} layout="vertical" margin={{ left: 20, right: 60, top: 4, bottom: 4 }}>
                    <XAxis type="number" tickFormatter={(v) => eur(v)} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: 'var(--text-strong)' }} />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                      formatter={(v, _n, p) => [`${eur(v)} · ${p?.payload?.sponsors || 0} Sponsoren`, 'Erwarteter Wert']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {pipelineRows.map((r, i) => <Cell key={i} fill={r.isWon ? '#16A34A' : PRIMARY} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── 3. Offenes Inventar (EUR) + Volumen je Liga ─────────────────── */}
          <div style={card}>
            <div style={cardTitle}><Layers size={16} color={PRIMARY} /> Offenes Inventar &amp; Volumen je Liga</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginTop: 6 }}>
              <div>
                <div style={subTitle}>Offenes Inventar (EUR)</div>
                {openInvRows.length === 0 ? (
                  <div style={{ ...muted, padding: '12px 0' }}>Kein offenes Inventar.</div>
                ) : (
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Liga</th>
                        <th style={{ ...th, textAlign: 'right' }}>Freie Rechte</th>
                        <th style={{ ...th, textAlign: 'right' }}>Offener Wert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openInvRows.map((r, i) => (
                        <tr key={i}>
                          <td style={td}>{r.league}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{r.openRights}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{eur(r.openValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div style={subTitle}>Volumen je Liga (aktive Verträge)</div>
                {volumeRows.length === 0 ? (
                  <div style={{ ...muted, padding: '12px 0' }}>Noch kein Vertragsvolumen.</div>
                ) : (
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Liga</th>
                        <th style={{ ...th, textAlign: 'right' }}>Verträge</th>
                        <th style={{ ...th, textAlign: 'right' }}>Cash</th>
                        <th style={{ ...th, textAlign: 'right' }}>Barter</th>
                        <th style={{ ...th, textAlign: 'right' }}>Gesamt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volumeRows.map((r, i) => (
                        <tr key={i}>
                          <td style={td}>{r.league}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{r.contracts}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{eur(r.cash)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{eur(r.barter)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{eur(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
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
const card = { border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20, marginTop: 18 }
const cardTitle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 14 }
const subTitle = { fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-strong)' }
const selectStyle = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13 }
