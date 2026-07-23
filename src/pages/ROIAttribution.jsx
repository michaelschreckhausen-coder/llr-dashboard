// src/pages/ROIAttribution.jsx
//
// Analyse — ROI / Attribution (Bereich Analyse, TEAM-scoped).
// Verknüpft rohe LinkedIn-Akquise mit den CRM-Ergebnissen (Leads → Deals → gewonnen)
// und rechnet daraus Kennzahlen, die LinkedIn selbst NIE anzeigt: Pipeline-Wert aus
// LinkedIn, gewonnener Umsatz, Konversionsraten je Quelle, LinkedIn vs. übrige Kanäle.
// Grenze der Scoping-Logik: rohe Präsenz = Marke; das CRM-Ergebnis gehört dem Team →
// diese Seite ist bewusst team-weit (alle Marken), kein Brand-Umschalter.
// Hard Rules: Inline-Styles, var(--wl-primary,…), Deutsch, Hooks oben, error geprüft.

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Users, Euro, Award, Filter, TrendingUp, Handshake, ArrowRight, Radio,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import PageHeader from '../components/PageHeader'

const PRIMARY = 'rgb(49,90,231)'
const pageOuterStyle = { background:'transparent', minHeight:'100vh', padding:'24px 16px 60px' }
const pageStyle = { width:'100%', maxWidth:1068, margin:'0 auto', display:'flex', flexDirection:'column' }
const cardStyle = { background:'var(--surface)', borderRadius:16, border:'1px solid var(--border, #E4E7EC)', boxShadow:'var(--shadow-card)', padding:'18px 20px' }
const kpiTile = { flex:1, minWidth:150, background:'var(--surface)', border:'1px solid var(--border, #E4E7EC)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:'14px 16px' }
const kpiLabel = { fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:5 }
const kpiValue = { fontSize:24, fontWeight:800, color:'var(--text-strong, #111827)', marginTop:2, fontVariantNumeric:'tabular-nums', lineHeight:1.1 }
const kpiSub = { fontSize:11, color:'var(--text-muted,#6B7280)', marginTop:3 }

// LinkedIn-attribuierte Lead-Quellen (Rohaktivität, die aus LinkedIn stammt).
const LI_SOURCES = ['post_engagement', 'linkedin', 'sales_nav', 'linkedin_search', 'extension_import']
const SOURCE_LABEL = {
  post_engagement: 'Post-Engagement',
  linkedin: 'LinkedIn (allg.)',
  sales_nav: 'Sales Navigator',
  linkedin_search: 'LinkedIn-Suche',
  extension_import: 'Extension-Import',
}
// Deal-Stufen (DB deutsch). Offen = weder gewonnen noch verloren.
const CLOSED_WON = 'gewonnen'
const CLOSED_LOST = 'verloren'
// Lead-Qualifizierung: alles jenseits von „Lead" gilt als qualifiziert.
const isQualified = s => s && s !== 'Lead'

const fmtN = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const fmtEur = n => (n == null ? '–' : Math.round(Number(n)).toLocaleString('de-DE') + ' €')
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null)
const pctTxt = (num, den) => { const p = pct(num, den); return p == null ? '–' : p + ' %' }

export default function ROIAttribution() {
  const { activeTeamId } = useTeam()
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [deals, setDeals] = useState([])
  const [engStats, setEngStats] = useState({ total: 0, converted: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeamId) { setLeads([]); setDeals([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [{ data: ld }, { data: dl }, { data: eng }] = await Promise.all([
          supabase.from('leads')
            .select('id, source, status, created_at, name, company')
            .eq('team_id', activeTeamId),
          supabase.from('deals')
            .select('id, lead_id, stage, value, created_at, closed_at, title')
            .eq('team_id', activeTeamId),
          supabase.from('linkedin_post_engagers')
            .select('id, converted_lead_id')
            .eq('team_id', activeTeamId),
        ])
        if (cancelled) return
        setLeads(ld || [])
        setDeals(dl || [])
        const engRows = eng || []
        setEngStats({ total: engRows.length, converted: engRows.filter(e => e.converted_lead_id).length })
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId])

  // ── Ableitungen ──────────────────────────────────────────────────────────
  const liLeads = leads.filter(l => LI_SOURCES.includes(l.source))
  const liLeadIds = new Set(liLeads.map(l => l.id))
  const liDeals = deals.filter(d => d.lead_id && liLeadIds.has(d.lead_id))

  const openDeals = liDeals.filter(d => d.stage !== CLOSED_WON && d.stage !== CLOSED_LOST)
  const wonDeals = liDeals.filter(d => d.stage === CLOSED_WON)
  const lostDeals = liDeals.filter(d => d.stage === CLOSED_LOST)
  const negotiationDeals = liDeals.filter(d => d.stage === 'angebot' || d.stage === 'verhandlung')

  const sumV = arr => arr.reduce((a, d) => a + (Number(d.value) || 0), 0)
  const pipelineOpen = sumV(openDeals)
  const wonValue = sumV(wonDeals)
  const totalPipelineValue = sumV(liDeals)
  const dealsLeadIds = new Set(liDeals.map(d => d.lead_id))
  const leadsWithDeal = liLeads.filter(l => dealsLeadIds.has(l.id)).length
  const qualifiedLeads = liLeads.filter(l => isQualified(l.status)).length
  const avgWon = wonDeals.length ? wonValue / wonDeals.length : null
  const closedCount = wonDeals.length + lostDeals.length
  const winRate = pct(wonDeals.length, closedCount) // gewonnen / abgeschlossen

  // Trichter LinkedIn → Umsatz
  const funnel = [
    { key:'leads',     label:'LinkedIn-Leads',        value: liLeads.length,        color: PRIMARY },
    { key:'qual',      label:'Qualifiziert (LQL+)',   value: qualifiedLeads,        color: '#4F6CF0' },
    { key:'deal',      label:'Mit Deal',              value: leadsWithDeal,         color: '#7C3AED' },
    { key:'nego',      label:'Angebot/Verhandlung',   value: negotiationDeals.length, color: '#D97706' },
    { key:'won',       label:'Gewonnen',              value: wonDeals.length,       color: '#059669' },
  ]
  const funnelMax = Math.max(1, ...funnel.map(f => f.value))

  // Attribution je LinkedIn-Quelle
  const bySource = LI_SOURCES.map(src => {
    const sLeads = liLeads.filter(l => l.source === src)
    const sLeadIds = new Set(sLeads.map(l => l.id))
    const sDeals = liDeals.filter(d => sLeadIds.has(d.lead_id))
    const sWon = sDeals.filter(d => d.stage === CLOSED_WON)
    return {
      src, label: SOURCE_LABEL[src] || src,
      leads: sLeads.length,
      deals: sDeals.length,
      pipeline: sumV(sDeals.filter(d => d.stage !== CLOSED_WON && d.stage !== CLOSED_LOST)),
      won: sumV(sWon),
      wonCount: sWon.length,
    }
  }).filter(r => r.leads > 0 || r.deals > 0)
    .sort((a, b) => (b.won - a.won) || (b.pipeline - a.pipeline) || (b.leads - a.leads))

  // LinkedIn vs. übrige Kanäle (Anteil an Gesamt-Pipeline & gewonnenem Umsatz)
  const allOpen = deals.filter(d => d.stage !== CLOSED_WON && d.stage !== CLOSED_LOST)
  const allWon = deals.filter(d => d.stage === CLOSED_WON)
  const totalOpenValue = sumV(allOpen)
  const totalWonValue = sumV(allWon)
  const liPipelineShare = pct(pipelineOpen, totalOpenValue)
  const liWonShare = pct(wonValue, totalWonValue)

  const sourceChart = bySource.map(r => ({ name: r.label, Pipeline: r.pipeline, Gewonnen: r.won }))

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="Analyse · ROI"
          title="ROI · LinkedIn → CRM"
          subtitle="Was deine LinkedIn-Arbeit im CRM wirklich bringt: Leads, Pipeline-Wert und gewonnener Umsatz — plus Konversionsraten je Quelle. Diese Verknüpfung liefert LinkedIn selbst nie."
        />

        <div style={{ display:'flex', alignItems:'center', gap:7, margin:'0 0 16px 2px', fontSize:12, color:'var(--text-muted,#6B7280)' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--primary)', display:'inline-block' }} />
          Team-weit · alle Marken · Attribution über <code style={{ fontSize:11 }}>leads.source</code> × <code style={{ fontSize:11 }}>deals</code>
        </div>

        {loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : liLeads.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'40px 20px' }}>
            <TrendingUp size={32} color="#CBD5E1" style={{ marginBottom:10 }} />
            <div style={{ fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:4 }}>Noch keine LinkedIn-Leads im CRM</div>
            Sobald Leads aus LinkedIn übernommen werden (Post-Engagement, Suche, Extension), erscheint hier ihr Beitrag zu Pipeline und Umsatz.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* ── Kern-KPIs ── */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <div style={kpiTile}>
                <div style={kpiLabel}><Users size={11} /> Leads aus LinkedIn</div>
                <div style={kpiValue}>{fmtN(liLeads.length)}</div>
                <div style={kpiSub}>{pctTxt(qualifiedLeads, liLeads.length)} qualifiziert</div>
              </div>
              <div style={kpiTile}>
                <div style={kpiLabel}><Euro size={11} /> Offene Pipeline</div>
                <div style={kpiValue}>{fmtEur(pipelineOpen)}</div>
                <div style={kpiSub}>{liPipelineShare != null ? liPipelineShare + ' % der Team-Pipeline' : 'aus LinkedIn-Leads'}</div>
              </div>
              <div style={kpiTile}>
                <div style={kpiLabel}><Award size={11} /> Gewonnen</div>
                <div style={kpiValue}>{fmtEur(wonValue)}</div>
                <div style={kpiSub}>{liWonShare != null ? liWonShare + ' % des Team-Umsatzes' : `${wonDeals.length} Deals`}</div>
              </div>
              <div style={kpiTile}>
                <div style={kpiLabel}><Handshake size={11} /> Ø gewonnener Deal</div>
                <div style={kpiValue}>{avgWon != null ? fmtEur(avgWon) : '–'}</div>
                <div style={kpiSub}>{winRate != null ? winRate + ' % Abschlussquote' : 'noch kein Abschluss'}</div>
              </div>
            </div>

            {/* ── Trichter LinkedIn → Umsatz ── */}
            <div style={cardStyle}>
              <div className="lk-eyebrow">Trichter · von LinkedIn zum Abschluss</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:6 }}>
                {funnel.map((f, i) => {
                  const prev = i > 0 ? funnel[i - 1].value : null
                  const conv = prev != null ? pct(f.value, prev) : null
                  return (
                    <div key={f.key} style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:150, fontSize:12, fontWeight:600, color:'var(--text-strong,#111827)', flexShrink:0 }}>{f.label}</div>
                      <div style={{ flex:1, position:'relative', height:30, background:'#F1F5F9', borderRadius:8, overflow:'hidden' }}>
                        <div style={{ position:'absolute', inset:0, width:`${Math.max(4, (f.value / funnelMax) * 100)}%`, background:f.color, borderRadius:8, transition:'width .4s', display:'flex', alignItems:'center', paddingLeft:10 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:'#fff' }}>{fmtN(f.value)}</span>
                        </div>
                      </div>
                      <div style={{ width:96, fontSize:11, color:'var(--text-muted,#6B7280)', textAlign:'right', flexShrink:0 }}>
                        {conv != null ? <span><ArrowRight size={10} style={{ verticalAlign:'-1px' }} /> {conv} %</span> : 'Basis'}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:12 }}>
                Rechte Spalte = Übergangsquote zur jeweils vorherigen Stufe. „Qualifiziert" = Lead-Status jenseits von „Lead" (LQL/MQL/MQN/SQL).
              </div>
            </div>

            {/* ── Attribution je Quelle ── */}
            <div style={cardStyle}>
              <div className="lk-eyebrow"><Filter size={12} style={{ verticalAlign:'-2px' }} /> Attribution je LinkedIn-Quelle</div>
              <div style={{ overflowX:'auto', marginTop:6 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ textAlign:'left', color:'var(--text-muted,#6B7280)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <th style={{ padding:'6px 8px' }}>Quelle</th>
                      <th style={{ padding:'6px 8px', textAlign:'right' }}>Leads</th>
                      <th style={{ padding:'6px 8px', textAlign:'right' }}>Deals</th>
                      <th style={{ padding:'6px 8px', textAlign:'right' }}>Offene Pipeline</th>
                      <th style={{ padding:'6px 8px', textAlign:'right' }}>Gewonnen</th>
                      <th style={{ padding:'6px 8px', textAlign:'right' }}>Lead→Deal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map(r => (
                      <tr key={r.src} style={{ borderTop:'1px solid var(--border,#E4E7EC)' }}>
                        <td style={{ padding:'8px', fontWeight:600, color:'var(--text-strong,#111827)' }}>{r.label}</td>
                        <td style={{ padding:'8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtN(r.leads)}</td>
                        <td style={{ padding:'8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtN(r.deals)}</td>
                        <td style={{ padding:'8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtEur(r.pipeline)}</td>
                        <td style={{ padding:'8px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, color:r.won>0?'#059669':'inherit' }}>{r.won>0?fmtEur(r.won):'–'}</td>
                        <td style={{ padding:'8px', textAlign:'right', color:'var(--text-muted,#6B7280)' }}>{pctTxt(r.deals, r.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sourceChart.some(r => r.Pipeline > 0 || r.Gewonnen > 0) && (
                <div style={{ width:'100%', height:240, marginTop:14 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sourceChart} margin={{ top:8, right:16, bottom:8, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                      <XAxis dataKey="name" tick={{ fontSize:11 }} />
                      <YAxis tick={{ fontSize:11 }} tickFormatter={v => v>=1000?(v/1000)+'k':v} />
                      <Tooltip formatter={v => fmtEur(v)} />
                      <Bar dataKey="Pipeline" fill={PRIMARY} radius={[4,4,0,0]} maxBarSize={40} />
                      <Bar dataKey="Gewonnen" fill="#059669" radius={[4,4,0,0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* ── LinkedIn vs. übrige Kanäle + Engager-Konversion ── */}
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              <div style={{ ...cardStyle, flex:1, minWidth:280 }}>
                <div className="lk-eyebrow">LinkedIn-Anteil am Gesamtergebnis</div>
                <ShareBar label="Offene Pipeline" li={pipelineOpen} total={totalOpenValue} pctVal={liPipelineShare} fmt={fmtEur} />
                <ShareBar label="Gewonnener Umsatz" li={wonValue} total={totalWonValue} pctVal={liWonShare} fmt={fmtEur} />
                <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:10 }}>
                  Blau = aus LinkedIn-Leads, grau = alle übrigen Kanäle (Inbound, Empfehlung, Event, Kaltakquise …).
                </div>
              </div>
              <div style={{ ...cardStyle, flex:1, minWidth:280 }}>
                <div className="lk-eyebrow"><Radio size={12} style={{ verticalAlign:'-2px' }} /> Engager → Lead</div>
                <div style={{ display:'flex', gap:10, marginTop:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={kpiValue}>{fmtN(engStats.total)}</div>
                    <div style={kpiSub}>erfasste Kommentierende</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={kpiValue}>{fmtN(engStats.converted)}</div>
                    <div style={kpiSub}>als Lead übernommen</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ ...kpiValue, color:'var(--primary)' }}>{pctTxt(engStats.converted, engStats.total)}</div>
                    <div style={kpiSub}>Konversionsrate</div>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:12 }}>
                  Wie viele Menschen, die auf deine Posts reagiert haben, tatsächlich im CRM gelandet sind. Übernehmen unter <a onClick={() => navigate('/linkedin-analytics')} style={{ color:'var(--primary)', cursor:'pointer' }}>Content-Performance</a>.
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

function ShareBar({ label, li, total, pctVal, fmt }) {
  const w = total > 0 ? Math.max(2, Math.round((li / total) * 100)) : 0
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
        <span style={{ fontWeight:600, color:'var(--text-strong,#111827)' }}>{label}</span>
        <span style={{ color:'var(--text-muted,#6B7280)' }}>{fmt(li)} / {fmt(total)} · {pctVal != null ? pctVal + ' %' : '–'}</span>
      </div>
      <div style={{ height:14, background:'#F1F5F9', borderRadius:7, overflow:'hidden' }}>
        <div style={{ width:`${w}%`, height:'100%', background:'var(--primary)', borderRadius:7, transition:'width .4s' }} />
      </div>
    </div>
  )
}
