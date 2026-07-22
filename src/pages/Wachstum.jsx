// src/pages/Wachstum.jsx
//
// Reporting — brand-adaptives Wachstum (Bereich Profil).
//   Personal Brand  → Follower- + Connection-Verlauf (linkedin_profile_metrics)
//   Company Brand   → Follower-Verlauf (linkedin_page_metrics) + Mitarbeiter-Zeitreihe
//                     (unipile-company-stats → insights, historisch von LinkedIn)
// Verläufe entstehen aus eigenen Tages-Snapshots (analytics-snapshot Cron).

import React, { useState, useEffect } from 'react'
import { Users, UserPlus, Building2, TrendingUp, Loader2, BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import PageHeader from '../components/PageHeader'

const PRIMARY = 'rgb(49,90,231)'
const pageOuterStyle = { background:'transparent', minHeight:'100vh', padding:'24px 16px 60px' }
const pageStyle = { width:'100%', maxWidth:1068, margin:'0 auto', display:'flex', flexDirection:'column' }
const cardStyle = { background:'var(--surface)', borderRadius:16, border:'1px solid var(--border, #E4E7EC)', boxShadow:'var(--shadow-card)', padding:'18px 20px' }
const kpiTile = { flex:1, minWidth:150, background:'var(--surface)', border:'1px solid var(--border, #E4E7EC)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:'14px 16px' }
const kpiLabel = { fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:5 }
const kpiValue = { fontSize:24, fontWeight:800, color:'var(--text-strong, #111827)', marginTop:2, fontVariantNumeric:'tabular-nums', lineHeight:1.1 }
const kpiSub = { fontSize:11, color:'var(--text-muted, #6B7280)', marginTop:2 }

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const dDE = s => { try { return new Date(s).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) } catch { return s } }
const mDE = s => { try { return new Date(s).toLocaleDateString('de-DE', { month:'2-digit', year:'2-digit' }) } catch { return s } }

export default function Wachstum() {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, noBrand } = useBrandVoice()
  const isCompany = activeBrandVoice?.account_type === 'company_page'

  const [rows, setRows] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (noBrand || !activeBrandVoice?.id) { setRows([]); setStats(null); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        if (isCompany) {
          const { data } = await supabase.from('linkedin_page_metrics')
            .select('followers_count, employee_count, captured_on')
            .eq('brand_voice_id', activeBrandVoice.id).order('captured_on', { ascending: true })
          if (!cancelled) setRows(data || [])
          try {
            const { data: cs } = await supabase.functions.invoke('unipile-company-stats', { body: { brand_voice_id: activeBrandVoice.id } })
            if (!cancelled) setStats(cs && cs.ok ? cs : null)
          } catch { if (!cancelled) setStats(null) }
        } else {
          const { data } = await supabase.from('linkedin_profile_metrics')
            .select('follower_count, connections_count, captured_on')
            .eq('brand_voice_id', activeBrandVoice.id).order('captured_on', { ascending: true })
          if (!cancelled) { setRows(data || []); setStats(null) }
        }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [activeBrandVoice?.id, isCompany, noBrand])

  const last = rows.length ? rows[rows.length - 1] : null
  const first = rows.length ? rows[0] : null
  const delta = (f) => (last && first && last[f] != null && first[f] != null) ? (last[f] - first[f]) : null
  const deltaTxt = (d) => d == null ? 'Wachstum ab jetzt gemessen' : (d >= 0 ? '+' : '') + fmt(d) + ' seit Messbeginn'

  const Kpi = ({ icon, label, value, sub }) => (
    <div style={kpiTile}>
      <div style={kpiLabel}>{icon}{label}</div>
      <div style={kpiValue}>{value}</div>
      {sub != null && <div style={kpiSub}>{sub}</div>}
    </div>
  )

  const empGraph = (stats?.insights?.employeesCount?.employeesCountGraph || [])
    .map(g => ({ name: mDE(g.date), Mitarbeitende: g.count }))
  const growth = stats?.insights?.employeesCount?.growthGraph || []
  const growth12 = growth.find(g => g.monthRange === 12)?.growthPercentage

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="LinkedIn · Wachstum"
          title={isCompany ? 'Page-Wachstum' : 'Profil-Wachstum'}
          subtitle={isCompany
            ? 'Follower- und Mitarbeiterentwicklung deiner LinkedIn Company Page.'
            : 'Follower- und Verbindungsentwicklung deines LinkedIn-Profils.'}
        />

        {noBrand || !activeBrandVoice?.id ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'40px 20px' }}>
            <BarChart3 size={32} color="#CBD5E1" style={{ marginBottom:10 }} />
            <div style={{ fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:4 }}>Wähle oben eine Marke</div>
            Wachstum wird pro Marke gemessen — wechsle oben zu einer Personal oder Company Brand.
          </div>
        ) : loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {isCompany ? (<>
                <Kpi icon={<Users size={11}/>} label="Follower" value={fmt(stats?.followers_count ?? last?.followers_count)} sub={deltaTxt(delta('followers_count'))} />
                <Kpi icon={<Building2 size={11}/>} label="Mitarbeitende" value={fmt(stats?.employee_count ?? last?.employee_count)} sub={stats?.insights?.employeesCount?.averageTenure ? 'Ø Zugehörigkeit ' + stats.insights.employeesCount.averageTenure : null} />
                <Kpi icon={<TrendingUp size={11}/>} label="MA-Wachstum 12 Mon." value={growth12 != null ? (growth12 >= 0 ? '+' : '') + growth12 + ' %' : '–'} sub="laut LinkedIn" />
                <Kpi icon={<BarChart3 size={11}/>} label="Follower-Snapshots" value={fmt(rows.length)} sub="tägliche Messpunkte" />
              </>) : (<>
                <Kpi icon={<Users size={11}/>} label="Follower" value={fmt(last?.follower_count)} sub={deltaTxt(delta('follower_count'))} />
                <Kpi icon={<UserPlus size={11}/>} label="Verbindungen" value={fmt(last?.connections_count)} sub={deltaTxt(delta('connections_count'))} />
                <Kpi icon={<BarChart3 size={11}/>} label="Snapshots" value={fmt(rows.length)} sub="tägliche Messpunkte" />
              </>)}
            </div>

            <div style={cardStyle}>
              <div className="lk-eyebrow">{isCompany ? 'Follower-Verlauf' : 'Follower & Verbindungen'}</div>
              {rows.length < 2 ? (
                <div style={{ fontSize:13, color:'var(--text-muted, #6B7280)', padding:'24px 0', textAlign:'center' }}>
                  Der Verlauf entsteht aus täglichen Snapshots — ab morgen erscheinen hier erste Kurvenpunkte.
                </div>
              ) : (
                <div style={{ width:'100%', height:280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows.map(r => ({ name: dDE(r.captured_on), Follower: isCompany ? r.followers_count : r.follower_count, ...(isCompany ? {} : { Verbindungen: r.connections_count }) }))} margin={{ top:8, right:16, bottom:8, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                      <XAxis dataKey="name" tick={{ fontSize:11 }} />
                      <YAxis tick={{ fontSize:11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize:12 }} />
                      <Line type="monotone" dataKey="Follower" stroke={PRIMARY} strokeWidth={2} dot={{ r:2 }} />
                      {!isCompany && <Line type="monotone" dataKey="Verbindungen" stroke="#039855" strokeWidth={2} dot={{ r:2 }} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {isCompany && empGraph.length > 1 && (
              <div style={cardStyle}>
                <div className="lk-eyebrow">Mitarbeiterentwicklung (LinkedIn, historisch)</div>
                <div style={{ width:'100%', height:260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={empGraph} margin={{ top:8, right:16, bottom:8, left:0 }}>
                      <defs>
                        <linearGradient id="empFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                      <XAxis dataKey="name" tick={{ fontSize:11 }} minTickGap={24} />
                      <YAxis tick={{ fontSize:11 }} allowDecimals={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="Mitarbeitende" stroke={PRIMARY} strokeWidth={2} fill="url(#empFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', lineHeight:1.5 }}>
              Hinweis: Follower/Verbindungen liefert LinkedIn nur als aktuellen Wert — den Verlauf bauen wir über tägliche Snapshots auf (ab Messbeginn). Die Mitarbeiter-Zeitreihe kommt historisch direkt von LinkedIn.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
