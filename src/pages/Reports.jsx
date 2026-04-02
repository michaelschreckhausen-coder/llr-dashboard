import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const P = 'rgb(49,90,231)'
const PL = 'rgba(49,90,231,0.09)'
const BG = 'rgb(238,241,252)'

// ─── Mini Bar Chart (pure SVG, no recharts needed) ──────────────────────────
function MiniBar({ data=[], color=P, height=60 }) {
  if (!data.length) return <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:12 }}>Keine Daten</div>
  const max = Math.max(...data.map(d => d.v), 1)
  const W = 100 / data.length
  return (
    <svg width="100%" height={height} viewBox={"0 0 "+data.length*20+" "+height} preserveAspectRatio="none" style={{ display:'block' }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.v / max) * (height - 8))
        return (
          <g key={i}>
            <rect x={i*20+2} y={height-h-4} width={16} height={h} rx={3} fill={color} opacity={0.85}/>
          </g>
        )
      })}
    </svg>
  )
}

// ─── KPI Card — like SSI subscore cards ─────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, trend }) {
  return (
    <div style={{ background:'white', borderRadius:16, border:'1px solid #E5E7EB', padding:'16px 18px', boxShadow:'0 2px 12px rgba(0,0,0,0.04)', position:'relative', overflow:'hidden', borderTop:'3px solid '+color }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
        <span style={{ fontSize:18 }}>{icon}</span>
      </div>
      <div style={{ fontSize:32, fontWeight:900, color:'rgb(20,20,43)', letterSpacing:'-0.03em', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{sub}</div>
      {trend !== undefined && (
        <div style={{ marginTop:8, fontSize:11, fontWeight:700, color: trend >= 0 ? '#10B981' : '#EF4444' }}>
          {trend >= 0 ? '+' : ''}{trend}% vs. Vormonat
        </div>
      )}
    </div>
  )
}

// ─── Gradient Hero Card — like SSI blue/purple cards ────────────────────────
function HeroCard({ title, value, sub, badge1, badge2, gradient, donut }) {
  const pct = Math.min(1, donut / 100)
  const r = 54, circ = 2*Math.PI*r
  return (
    <div style={{ background:gradient, borderRadius:20, padding:'24px 28px', color:'white', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
      <div style={{ position:'absolute', bottom:-50, left:-20, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
      <div style={{ position:'relative', zIndex:1, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>{title}</div>
          <div style={{ fontSize:56, fontWeight:900, letterSpacing:'-0.04em', lineHeight:1 }}>{value}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:6 }}>{sub}</div>
          {(badge1 || badge2) && (
            <div style={{ display:'flex', gap:14, marginTop:14 }}>
              {badge1 && <div><div style={{ fontSize:17, fontWeight:800 }}>{badge1.v}</div><div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>{badge1.l}</div></div>}
              {badge2 && <div><div style={{ fontSize:17, fontWeight:800 }}>{badge2.v}</div><div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>{badge2.l}</div></div>}
            </div>
          )}
        </div>
        <div style={{ position:'relative', flexShrink:0 }}>
          <svg width={130} height={130} style={{ transform:'rotate(-90deg)' }}>
            <circle cx={65} cy={65} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={14} strokeLinecap="round"/>
            <circle cx={65} cy={65} r={r} fill="none" stroke="white" strokeWidth={14} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} style={{ transition:'stroke-dashoffset 1s ease' }}/>
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:18, fontWeight:900, color:'white' }}>{donut}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const TABS = ['Uebersicht', 'Lead Scores', 'Content', 'SSI', 'Nutzung']
const TAB_LABELS = { 'Uebersicht':'Übersicht', 'Lead Scores':'Lead Scores', 'Content':'Content', 'SSI':'SSI Verlauf', 'Nutzung':'Nutzung' }

export default function Reports({ session }) {
  const navigate = useNavigate()
  const [leads,    setLeads]    = useState([])
  const [comments, setComments] = useState([])
  const [range,    setRange]    = useState(30)
  const [tab,      setTab]      = useState('Uebersicht')
  const [loading,  setLoading]  = useState(true)
  const [ssiHistory, setSsiHistory] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - range*86400000).toISOString()
    const [{ data: ld }, { data: cm }] = await Promise.all([
      supabase.from('leads').select('*').eq('user_id', session.user.id),
      supabase.from('saved_comments').select('*').eq('user_id', session.user.id).gte('created_at', since),
    ])
    setLeads(ld || [])
    setComments(cm || [])
    setLoading(false)
  }, [session, range])

  useEffect(()=>{
    if(!session?.user?.id)return
    supabase.from('ssi_scores').select('total_score,measured_at').eq('user_id',session.user.id).order('measured_at',{ascending:true}).limit(30).then(({data})=>{if(data)setSsiHistory(data)})
  },[session])

  useEffect(()=>{
    if(!session?.user?.id)return
    supabase.from('ssi_scores').select('total_score,measured_at').eq('user_id',session.user.id).order('measured_at',{ascending:true}).limit(30).then(({data})=>{if(data)setSsiHistory(data)})
  },[session])

  useEffect(() => { load() }, [load])

  // Computed stats
  const now = Date.now()
  const since = now - range*86400000
  const recentLeads = leads.filter(l => new Date(l.created_at).getTime() > since)
  const hot  = leads.filter(l => (l.lead_score||0) >= 50)
  const warm = leads.filter(l => (l.lead_score||0) >= 25 && (l.lead_score||0) < 50)
  const connected = leads.filter(l => l.status === 'connected' || l.vernetzt)
  const pending = leads.filter(l => l.status === 'pending')
  const withBV = comments.length
  const bvRate = recentLeads.length > 0 ? Math.round(withBV/recentLeads.length*100) : 0
  const aiTokens = comments.reduce((s,c) => s + (c.tokens_used||0), 0)
  const convRate = leads.length > 0 ? Math.round(connected.length/leads.length*100) : 0

  // Build bar data (last N days)
  function buildDailyBars(items, dateField, days=14) {
    const buckets = Array.from({length:days}, (_,i) => {
      const d = new Date(now - (days-1-i)*86400000)
      return { label: (d.getMonth()+1)+'/'+d.getDate(), v: 0 }
    })
    items.forEach(item => {
      const t = new Date(item[dateField]).getTime()
      const idx = Math.floor((t - (now - days*86400000)) / 86400000)
      if (idx >= 0 && idx < days) buckets[idx].v++
    })
    return buckets
  }

  const leadBars = buildDailyBars(recentLeads, 'created_at')
  const commentBars = buildDailyBars(comments, 'created_at')

  const inp = { padding:'8px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', fontSize:13, outline:'none', fontFamily:'inherit', cursor:'pointer' }

  return (
    <div style={{ maxWidth:1100 }}>

      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:22 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {[7,30,90].map(d => (
            <button key={d} onClick={() => setRange(d)}
              style={{ padding:'7px 14px', borderRadius:10, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
                background: range===d ? 'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))' : 'white',
                color: range===d ? 'white' : '#6B7280',
                boxShadow: range===d ? '0 4px 14px rgba(49,90,231,0.3)' : 'none',
                border: range===d ? 'none' : '1.5px solid #E5E7EB',
              }}>
              {d} Tage
            </button>
          ))}
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Hero Cards: 2 gradient cards like SSI */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <HeroCard
          title="Leads gesamt"
          value={leads.length}
          sub={recentLeads.length + ' neu in letzten ' + range + ' Tagen'}
          badge1={{ v: hot.length, l: 'Hot Leads' }}
          badge2={{ v: warm.length, l: 'Warm Leads' }}
          gradient="linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)"
          donut={convRate}
        />
        <HeroCard
          title="Vernetzungen"
          value={connected.length}
          sub={pending.length + ' ausstehende Anfragen'}
          badge1={{ v: convRate+'%', l: 'Konversionsrate' }}
          badge2={{ v: pending.length, l: 'Pending' }}
          gradient="linear-gradient(135deg, #7C3CAE 0%, #B07AE0 100%)"
          donut={convRate}
        />
      </div>

      {/* KPI Cards — 4 like SSI subscore row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Hot Leads" value={hot.length} sub="Score >= 50" color="rgb(49,90,231)" icon="🔥"/>
        <KpiCard label="Brand Voice Rate" value={bvRate+'%'} sub="mit KI generiert" color="#10B981" icon="✍️"/>
        <KpiCard label="Content erstellt" value={withBV} sub={'letzte '+range+' Tage'} color="#F59E0B" icon="✏️"/>
        <KpiCard label="AI Tokens" value={aiTokens > 1000 ? (aiTokens/1000).toFixed(1)+'k' : aiTokens} sub="verbraucht" color="#8B5CF6" icon="🤖"/>
      </div>

      {/* Tab Navigation — like SSI "Alle Messungen" section */}
      <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ display:'flex', gap:0, borderBottom:'1px solid #F3F4F6' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'14px 10px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight: tab===t ? 800 : 500,
                color: tab===t ? P : '#6B7280',
                borderBottom: tab===t ? '2px solid '+P : '2px solid transparent',
                transition:'all 0.15s' }}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div style={{ padding:'22px 24px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Lade Daten...</div>
          ) : tab === 'Uebersicht' ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Neue Leads pro Tag</div>
                <MiniBar data={leadBars} color={P} height={80}/>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Content generiert pro Tag</div>
                <MiniBar data={commentBars} color="#10B981" height={80}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'rgb(20,20,43)', marginBottom:12 }}>Lead-Status Übersicht</div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {[['Lead',connected.length+hot.length+warm.length,'#475569'],['Hot',hot.length,'rgb(49,90,231)'],['Warm',warm.length,'#F59E0B'],['Vernetzt',connected.length,'#10B981'],['Pending',pending.length,'#8B5CF6']].map(([l,v,c]) => (
                    <div key={l} style={{ background:'white', border:'1px solid #E5E7EB', borderTop:'3px solid '+c, borderRadius:12, padding:'12px 16px', minWidth:100, textAlign:'center' }}>
                      <div style={{ fontSize:22, fontWeight:900, color:c }}>{v}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : tab === 'Lead Scores' ? (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
                {[['Hot (50+)', hot.length, '#315AE7'], ['Warm (25-49)', warm.length, '#F59E0B'], ['Cold (<25)', leads.length-hot.length-warm.length, '#9CA3AF']].map(([l,v,c]) => (
                  <div key={l} style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:14, padding:'16px', borderLeft:'4px solid '+c }}>
                    <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:28, fontWeight:900, color:c }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr style={{ background:'#F9FAFB' }}>
                    {['Name','Unternehmen','Score','Status'].map((h,i) => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {leads.sort((a,b) => (b.lead_score||0)-(a.lead_score||0)).slice(0,15).map(l => (
                      <tr key={l.id} style={{ borderBottom:'1px solid #F9FAFB' }}>
                        <td style={{ padding:'10px 14px', fontWeight:600, color:'rgb(20,20,43)' }}>{l.name||'–'}</td>
                        <td style={{ padding:'10px 14px', color:'#6B7280' }}>{l.company||'–'}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontWeight:800, fontSize:15, color: (l.lead_score||0)>=50 ? P : (l.lead_score||0)>=25 ? '#F59E0B' : '#9CA3AF' }}>{l.lead_score||0}</span>
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:700,
                            background: l.status==='connected'?'#ECFDF5':l.status==='pending'?'#F5F3FF':'rgba(49,90,231,0.08)',
                            color: l.status==='connected'?'#065F46':l.status==='pending'?'#7C3AED':P }}>
                            {l.status||'Lead'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'Content' ? (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
                <KpiCard label="Texte generiert" value={comments.length} sub={'letzte '+range+' Tage'} color="#10B981" icon="✏️"/>
                <KpiCard label="AI Tokens" value={aiTokens > 1000 ? (aiTokens/1000).toFixed(1)+'k' : aiTokens} sub="verbraucht" color="#8B5CF6" icon="🤖"/>
                <KpiCard label="Brand Voice Rate" value={bvRate+'%'} sub="Nutzungsrate" color="#F59E0B" icon="✍️"/>
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Content-Aktivität</div>
              <MiniBar data={commentBars} color="#10B981" height={100}/>
            </div>
          ) : tab === 'SSI' ? (
            <div>
              <div style={{fontWeight:700,fontSize:15,color:'rgb(20,20,43)',marginBottom:4}}>SSI-Score Verlauf</div>
              <div style={{color:'#6B7280',fontSize:13,marginBottom:16}}>Dein Social Selling Index — {ssiHistory.length} Messungen</div>
              {ssiHistory.length===0 ? (
                <div style={{textAlign:'center',padding:40,color:'#9CA3AF',background:'#F9FAFB',borderRadius:12}}>
                  <div style={{fontSize:32,marginBottom:8}}>📊</div>
                  <div style={{fontWeight:600,color:'rgb(20,20,43)'}}>Noch keine Messungen</div>
                  <div style={{fontSize:13,marginTop:4}}>SSI Tracker → Auslesen um Daten zu sammeln</div>
                </div>
              ) : (
                <div style={{background:'white',borderRadius:12,border:'1px solid #E5E7EB',padding:20}}>
                  <svg width="100%" height="160" viewBox="0 0 800 160" preserveAspectRatio="none" style={{display:'block'}}>
                    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(49,90,231)" stopOpacity="0.25"/><stop offset="100%" stopColor="rgb(49,90,231)" stopOpacity="0.02"/></linearGradient></defs>
                    {(()=>{const n=ssiHistory.length,mx=Math.max(...ssiHistory.map(s=>s.total_score),100);const pts=ssiHistory.map((s,i)=>[n<2?400:i*(800/(n-1)),160-(s.total_score/mx)*140]);const ln=pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');return(<><path d={ln+' L'+(pts[pts.length-1]?.[0]||800)+',160 L0,160 Z'} fill="url(#sg)"/><path d={ln} fill="none" stroke="rgb(49,90,231)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{pts.map((p,i)=>(<g key={i}><circle cx={p[0]} cy={p[1]} r={4} fill="rgb(49,90,231)"/><text x={p[0]} y={p[1]-10} textAnchor="middle" fontSize="11" fill="rgb(20,20,43)" fontWeight="700">{ssiHistory[i].total_score}</text></g>))}</>)})()}
                  </svg>
                  <div style={{display:'flex',gap:12,marginTop:16}}>
                    {[{l:'Aktuell',v:ssiHistory[ssiHistory.length-1]?.total_score},{l:'Bester',v:Math.max(...ssiHistory.map(s=>s.total_score))},{l:'Messungen',v:ssiHistory.length}].map(({l,v})=>(
                      <div key={l} style={{background:'#F5F7FF',borderRadius:10,padding:'10px 16px',flex:1}}>
                        <div style={{fontSize:11,color:'#6B7280',fontWeight:600}}>{l}</div>
                        <div style={{fontSize:22,fontWeight:800,color:'rgb(49,90,231)'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>) : tab === 'SSI' ? (
            <div>
              <div style={{fontWeight:700,fontSize:15,color:'rgb(20,20,43)',marginBottom:4}}>SSI-Score Verlauf</div>
              <div style={{color:'#6B7280',fontSize:13,marginBottom:16}}>Dein Social Selling Index — {ssiHistory.length} Messungen</div>
              {ssiHistory.length===0 ? (
                <div style={{textAlign:'center',padding:40,color:'#9CA3AF',background:'#F9FAFB',borderRadius:12}}>
                  <div style={{fontSize:32,marginBottom:8}}>📊</div>
                  <div style={{fontWeight:600,color:'rgb(20,20,43)'}}>Noch keine Messungen</div>
                  <div style={{fontSize:13,marginTop:4}}>SSI Tracker → Auslesen um Daten zu sammeln</div>
                </div>
              ) : (
                <div style={{background:'white',borderRadius:12,border:'1px solid #E5E7EB',padding:20}}>
                  <svg width="100%" height="160" viewBox="0 0 800 160" preserveAspectRatio="none" style={{display:'block'}}>
                    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(49,90,231)" stopOpacity="0.25"/><stop offset="100%" stopColor="rgb(49,90,231)" stopOpacity="0.02"/></linearGradient></defs>
                    {(()=>{const n=ssiHistory.length,mx=Math.max(...ssiHistory.map(s=>s.total_score),100);const pts=ssiHistory.map((s,i)=>[n<2?400:i*(800/(n-1)),160-(s.total_score/mx)*140]);const ln=pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');return(<><path d={ln+' L'+(pts[pts.length-1]?.[0]||800)+',160 L0,160 Z'} fill="url(#sg)"/><path d={ln} fill="none" stroke="rgb(49,90,231)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{pts.map((p,i)=>(<g key={i}><circle cx={p[0]} cy={p[1]} r={4} fill="rgb(49,90,231)"/><text x={p[0]} y={p[1]-10} textAnchor="middle" fontSize="11" fill="rgb(20,20,43)" fontWeight="700">{ssiHistory[i].total_score}</text></g>))}</>)})()}
                  </svg>
                  <div style={{display:'flex',gap:12,marginTop:16}}>
                    {[{l:'Aktuell',v:ssiHistory[ssiHistory.length-1]?.total_score},{l:'Bester',v:Math.max(...ssiHistory.map(s=>s.total_score))},{l:'Messungen',v:ssiHistory.length}].map(({l,v})=>(
                      <div key={l} style={{background:'#F5F7FF',borderRadius:10,padding:'10px 16px',flex:1}}>
                        <div style={{fontSize:11,color:'#6B7280',fontWeight:600}}>{l}</div>
                        <div style={{fontSize:22,fontWeight:800,color:'rgb(49,90,231)'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>) : (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
                <div style={{ background:'linear-gradient(135deg, rgba(49,90,231,0.08), rgba(49,90,231,0.03))', borderRadius:14, padding:'18px', border:'1px solid rgba(49,90,231,0.15)' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Daten im System</div>
                  {[['Leads gesamt', leads.length],['Vernetzungen', connected.length],['Content-Texte', comments.length]].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(49,90,231,0.08)', fontSize:13 }}>
                      <span style={{ color:'#6B7280' }}>{l}</span>
                      <span style={{ fontWeight:700, color:'rgb(20,20,43)' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background:'linear-gradient(135deg, rgba(124,60,174,0.08), rgba(124,60,174,0.03))', borderRadius:14, padding:'18px', border:'1px solid rgba(124,60,174,0.15)' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#7C3CAE', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Performance</div>
                  {[['Konversionsrate', convRate+'%'],['Hot Lead Rate', leads.length>0?Math.round(hot.length/leads.length*100)+'%':'0%'],['AI-Nutzung', bvRate+'%']].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(124,60,174,0.08)', fontSize:13 }}>
                      <span style={{ color:'#6B7280' }}>{l}</span>
                      <span style={{ fontWeight:700, color:'rgb(20,20,43)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
