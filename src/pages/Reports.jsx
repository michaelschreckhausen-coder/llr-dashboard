import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

/* ── Farben & Konfiguration ── */
const STATUS_CONFIG = {
  new:       { label:'Neu',         color:'#1D4ED8', bg:'#EFF6FF' },
  contacted: { label:'Kontaktiert', color:'#92400E', bg:'#FFFBEB' },
  replied:   { label:'Geantwortet', color:'#065F46', bg:'#ECFDF5' },
  converted: { label:'Konvertiert', color:'#5B21B6', bg:'#F5F3FF' },
}

/* ── Mini SVG Bar Chart ── */
function BarChart({ data, height = 160, colorFn }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const barW = Math.floor(100 / data.length)

  return (
    <svg viewBox={"0 0 100 " + height} preserveAspectRatio="none" style={{ width:'100%', height, display:'block' }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 20)
        const x = i * barW + barW * 0.15
        const w = barW * 0.7
        const y = height - barH - 10
        const color = colorFn ? colorFn(d, i) : '#0A66C2'
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={barH} rx="2" fill={color} opacity="0.85"/>
            {d.value > 0 && (
              <text x={x + w/2} y={y - 3} textAnchor="middle" fontSize="5" fill="#64748B" fontFamily="Inter,sans-serif" fontWeight="600">
                {d.value}
              </text>
            )}
            <text x={x + w/2} y={height - 2} textAnchor="middle" fontSize="4.5" fill="#94A3B8" fontFamily="Inter,sans-serif">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Donut Chart ── */
function DonutChart({ segments, size = 140 }) {
  const r = 40
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + seg.value, 0)

  if (total === 0) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth="16"/>
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="12" fill="#94A3B8" fontFamily="Inter,sans-serif">0</text>
    </svg>
  )

  let offset = 0
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth="16"/>
      {segments.map((seg, i) => {
        if (seg.value === 0) return null
        const pct = seg.value / total
        const dash = pct * circumference
        const gap = circumference - dash
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="16"
            strokeDasharray={dash + ' ' + gap}
            strokeDashoffset={-offset * circumference}
            strokeLinecap="butt"
            style={{ transform:'rotate(-90deg)', transformOrigin:cx+'px '+cy+'px', transition:'stroke-dasharray 0.5s ease' }}
          />
        )
        offset += pct
        return el
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0F172A" fontFamily="Inter,sans-serif">{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fill="#94A3B8" fontFamily="Inter,sans-serif">Leads</text>
    </svg>
  )
}

/* ── Line Chart ── */
function LineChart({ data, height = 100, color = '#0A66C2' }) {
  if (!data || data.length < 2) return (
    <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', color:'#CBD5E1', fontSize:12 }}>Nicht genug Daten</div>
  )
  const max = Math.max(...data.map(d => d.value), 1)
  const w = 100
  const pad = 8
  const chartH = height - pad * 2

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: pad + chartH - (d.value / max) * chartH,
    ...d
  }))

  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
  const areaD = pathD + ' L' + points[points.length-1].x.toFixed(1) + ',' + (pad+chartH) + ' L0,' + (pad+chartH) + ' Z'

  return (
    <svg viewBox={"0 0 100 " + height} preserveAspectRatio="none" style={{ width:'100%', height, display:'block' }}>
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#lineGrad)"/>
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color}/>
      ))}
    </svg>
  )
}

/* ── KPI Karte ── */
function KPICard({ label, value, sub, color = '#0A66C2', bg = '#EFF6FF', icon, trend }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'18px 20px', boxShadow:'0 1px 3px rgba(15,23,42,0.05)', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#64748B' }}>{label}</div>
        {icon && <div style={{ width:36, height:36, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{icon}</div>}
      </div>
      <div style={{ fontSize:32, fontWeight:900, color:'#0F172A', letterSpacing:'-0.03em', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#94A3B8' }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600, color: trend >= 0 ? '#065F46' : '#991B1B' }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% ggü. Vorperiode
        </div>
      )}
    </div>
  )
}

/* ── Funnel ── */
function FunnelChart({ stages }) {
  const max = stages[0]?.value || 1
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {stages.map((s, i) => {
        const pct = (s.value / max) * 100
        const convRate = i > 0 && stages[i-1].value > 0 ? Math.round(s.value / stages[i-1].value * 100) : 100
        return (
          <div key={i}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14 }}>{s.icon}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{s.label}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {i > 0 && <span style={{ fontSize:11, color:'#94A3B8' }}>{convRate}% Conversion</span>}
                <span style={{ fontSize:14, fontWeight:800, color: s.color }}>{s.value}</span>
              </div>
            </div>
            <div style={{ height:10, background:'#F1F5F9', borderRadius:999, overflow:'hidden' }}>
              <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,'+s.color+','+s.color+'99)', borderRadius:999, transition:'width 0.8s ease' }}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Haupt-Reports Seite ── */
export default function Reports({ session }) {
  const [leads,    setLeads]    = useState([])
  const [activity, setActivity] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [period,   setPeriod]   = useState('all') // 'week' | 'month' | 'all'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const uid = session.user.id
    const [{ data:ld }, { data:act }] = await Promise.all([
      supabase.from('leads').select('status,company,created_at,source,lead_score,name').eq('user_id', uid).order('created_at', { ascending:true }),
      supabase.from('weekly_activity').select('*').eq('user_id', uid).order('week_start', { ascending:true }).limit(12),
    ])
    setLeads(ld || [])
    setActivity(act || [])
    setLoading(false)
  }

  /* ── Filter nach Zeitraum ── */
  const now = new Date()
  const filtered = leads.filter(l => {
    if (period === 'week')  return new Date(l.created_at) >= new Date(now - 7*24*60*60*1000)
    if (period === 'month') return new Date(l.created_at) >= new Date(now - 30*24*60*60*1000)
    return true
  })

  /* ── KPI Berechnung ── */
  const total     = filtered.length
  const converted = filtered.filter(l => l.status === 'converted').length
  const convRate  = total > 0 ? Math.round(converted / total * 100) : 0
  const replied   = filtered.filter(l => l.status === 'replied').length
  const contacted = filtered.filter(l => l.status === 'contacted').length
  const newLeads  = filtered.filter(l => l.status === 'new').length

  /* ── Status Verteilung ── */
  const statusDist = Object.entries(STATUS_CONFIG).map(([id, cfg]) => ({
    ...cfg,
    value: filtered.filter(l => l.status === id).length
  }))

  /* ── Leads pro Unternehmen (Top 6) ── */
  const byCompany = {}
  filtered.forEach(l => { if (l.company) byCompany[l.company] = (byCompany[l.company]||0)+1 })
  const topCompanies = Object.entries(byCompany)
    .sort((a,b) => b[1]-a[1])
    .slice(0,6)
    .map(([label, value]) => ({ label: label.substring(0,12), value }))

  /* ── Leads pro Quelle ── */
  const bySource = {}
  filtered.forEach(l => { const s = l.source||'Sonstige'; bySource[s]=(bySource[s]||0)+1 })
  const sourceData = Object.entries(bySource).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value])=>({label:label.substring(0,10),value}))

  /* ── Wachstum über Zeit (letzte 8 Wochen) ── */
  const weeklyGrowth = []
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now - (i+1)*7*24*60*60*1000)
    const end   = new Date(now - i*7*24*60*60*1000)
    const count = leads.filter(l => { const d=new Date(l.created_at); return d>=start && d<end }).length
    const label = 'W' + (8-i)
    weeklyGrowth.push({ label, value: count })
  }

  /* ── Tages-Verlauf (letzte 30 Tage) ── */
  const dailyTrend = []
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now - i*24*60*60*1000)
    const dayStr = day.toISOString().split('T')[0]
    const count = leads.filter(l => l.created_at.startsWith(dayStr)).length
    dailyTrend.push({ label: i===0?'Heute':i===1?'Gest.':'', value: count })
  }

  /* ── Funnel Daten ── */
  const funnelStages = [
    { label:'Neu',         icon:'🎯', color:'#1D4ED8', value: total },
    { label:'Kontaktiert', icon:'📤', color:'#92400E', value: total - newLeads },
    { label:'Geantwortet', icon:'💬', color:'#065F46', value: replied + converted },
    { label:'Konvertiert', icon:'⭐', color:'#5B21B6', value: converted },
  ]

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#94A3B8', fontSize:14, gap:10 }}>
      <div>⏳ Lade Reports…</div>
    </div>
  )

  const cardStyle = { background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', boxShadow:'0 1px 3px rgba(15,23,42,0.05)' }
  const titleStyle = { fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:16, display:'flex', alignItems:'center', gap:8 }

  return (
    <div style={{ padding:'0 4px 32px', maxWidth:1200 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#0F172A', letterSpacing:'-0.025em', margin:0 }}>Reports</h1>
          <div style={{ fontSize:13, color:'#94A3B8', marginTop:3 }}>Analyse deiner Lead-Performance</div>
        </div>
        {/* Zeitraum Filter */}
        <div style={{ display:'flex', gap:4, background:'#F1F5F9', padding:4, borderRadius:10 }}>
          {[['all','Gesamt'],['month','30 Tage'],['week','7 Tage']].map(([val,lbl]) => (
            <button key={val} onClick={()=>setPeriod(val)}
              style={{ padding:'6px 14px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:period===val?'#fff':'transparent', color:period===val?'#0F172A':'#94A3B8', boxShadow:period===val?'0 1px 3px rgba(15,23,42,0.1)':'none', transition:'all 0.15s' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Karten ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        <KPICard label="Leads gesamt"    value={total}     icon="🎯" bg="#EFF6FF" sub={period==='all'?'Alle Zeiten':period==='month'?'Letzte 30 Tage':'Letzte 7 Tage'}/>
        <KPICard label="Konvertiert"     value={converted} icon="⭐" bg="#F5F3FF" sub={convRate + '% Konversionsrate'}/>
        <KPICard label="Geantwortet"     value={replied}   icon="💬" bg="#ECFDF5" sub={total>0?Math.round(replied/total*100)+'% Response-Rate':'—'}/>
        <KPICard label="Ø Lead Score"    value={filtered.length>0?Math.round(filtered.reduce((s,l)=>s+(l.lead_score||0),0)/filtered.length):0} icon="📊" bg="#FFF7ED" sub="Durchschnitt"/>
      </div>

      {/* ── Zeile 1: Donut + Funnel + Wochenverlauf ── */}
      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr 1fr', gap:14, marginBottom:14 }}>

        {/* Donut */}
        <div style={cardStyle}>
          <div style={titleStyle}>📊 Status-Mix</div>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
            <DonutChart segments={statusDist} size={140}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {statusDist.map(s => (
              <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }}/>
                  <span style={{ fontSize:12, color:'#475569' }}>{s.label}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:s.color }}>{s.value}</span>
                  <span style={{ fontSize:10, color:'#CBD5E1' }}>{total>0?Math.round(s.value/total*100):0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funnel */}
        <div style={cardStyle}>
          <div style={titleStyle}>🔽 Conversion Funnel</div>
          <FunnelChart stages={funnelStages}/>
          <div style={{ marginTop:16, padding:'10px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0' }}>
            <div style={{ fontSize:11, color:'#94A3B8', marginBottom:4 }}>Gesamt-Konversionsrate</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1, height:8, background:'#E2E8F0', borderRadius:999 }}>
                <div style={{ height:'100%', width:convRate+'%', background:'linear-gradient(90deg,#5B21B6,#8B5CF6)', borderRadius:999, transition:'width 0.8s' }}/>
              </div>
              <span style={{ fontSize:18, fontWeight:900, color:'#5B21B6' }}>{convRate}%</span>
            </div>
          </div>
        </div>

        {/* Wochenverlauf */}
        <div style={cardStyle}>
          <div style={titleStyle}>📈 Wöchentliches Wachstum</div>
          <BarChart data={weeklyGrowth} height={150} colorFn={(d,i) => {
            const intensity = weeklyGrowth.length > 0 ? d.value / Math.max(...weeklyGrowth.map(w=>w.value),1) : 0
            return 'rgba(10,102,194,' + (0.3 + intensity*0.7) + ')'
          }}/>
          <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', fontSize:11, color:'#94A3B8' }}>
            <span>vor 8 Wochen</span><span>heute</span>
          </div>
        </div>
      </div>

      {/* ── Zeile 2: Tages-Trend + Unternehmen + Quellen ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:14 }}>

        {/* Tages-Trend */}
        <div style={cardStyle}>
          <div style={titleStyle}>📉 Tages-Trend (30 Tage)</div>
          <LineChart data={dailyTrend} height={110} color="#0A66C2"/>
          <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', fontSize:11, color:'#94A3B8' }}>
            <span>vor 30 Tagen</span><span>heute</span>
          </div>
        </div>

        {/* Top Unternehmen */}
        <div style={cardStyle}>
          <div style={titleStyle}>🏢 Top Unternehmen</div>
          {topCompanies.length === 0 ? (
            <div style={{ color:'#CBD5E1', fontSize:12, textAlign:'center', padding:20 }}>Keine Daten</div>
          ) : (
            <BarChart data={topCompanies} height={140} colorFn={(d,i) => {
              const colors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2']
              return colors[i % colors.length]
            }}/>
          )}
        </div>

        {/* Quellen */}
        <div style={cardStyle}>
          <div style={titleStyle}>🔗 Lead-Quellen</div>
          {sourceData.length === 0 ? (
            <div style={{ color:'#CBD5E1', fontSize:12, textAlign:'center', padding:20 }}>Keine Daten</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {sourceData.map((s, i) => {
                const colors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899']
                const color = colors[i % colors.length]
                const pct = total > 0 ? Math.round(s.value / total * 100) : 0
                return (
                  <div key={i}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'#475569', textTransform:'capitalize' }}>{s.label}</span>
                      <span style={{ fontSize:12, fontWeight:700, color }}>{s.value} <span style={{ color:'#CBD5E1', fontWeight:400 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height:6, background:'#F1F5F9', borderRadius:999 }}>
                      <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:999, transition:'width 0.6s ease' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Zeile 3: Letzte Aktivitäten ── */}
      <div style={cardStyle}>
        <div style={titleStyle}>⚡ Letzte Lead-Aktivitäten</div>
        {leads.length === 0 ? (
          <div style={{ color:'#CBD5E1', fontSize:12, textAlign:'center', padding:24 }}>Noch keine Leads</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
            {leads.slice(-8).reverse().map((l, i) => {
              const cfg = STATUS_CONFIG[l.status] || STATUS_CONFIG.new
              const daysAgo = Math.floor((now - new Date(l.created_at)) / (1000*60*60*24))
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,'+cfg.color+','+cfg.color+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {(l.name||'?').substring(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name||'Unbekannt'}</div>
                    <div style={{ fontSize:10, color:'#94A3B8', marginTop:1 }}>{l.company||'—'}</div>
                  </div>
                  <div style={{ flexShrink:0, textAlign:'right' }}>
                    <span style={{ padding:'2px 7px', borderRadius:999, fontSize:9, fontWeight:700, background:cfg.bg, color:cfg.color, border:'1px solid '+cfg.color+'44', display:'block', marginBottom:2 }}>{cfg.label}</span>
                    <span style={{ fontSize:9, color:'#CBD5E1' }}>{daysAgo===0?'heute':daysAgo===1?'gestern':daysAgo+'d'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
