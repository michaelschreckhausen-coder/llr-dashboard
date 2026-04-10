import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ value, max, color, size = 80, stroke = 10 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / (max || 1))
  const dash = pct * circ
  return  (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={dash + ' ' + (circ - dash)} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)' }}/>
    </svg>
  )
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function Spark({ data, color }) {
  if (!data || data.length < 2) return null
  const w = 80, h = 32
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*w
    const y = h - ((v-min)/range)*(h-4) - 2
    return x + ',' + y
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={(data.length-1)/(data.length-1)*w} cy={h - ((data[data.length-1]-min)/range)*(h-4) - 2} r="3" fill={color}/>
    </svg>
  )
}

// ─── Big Stat Card (Waalaxy-style gradient) ───────────────────────────────────
function HeroCard({ title, value, label, donutPct, donutMax, color, gradient, icon, spark, children }) {
  return (
    <div style={{
      borderRadius: 20, padding: '22px 24px', position: 'relative', overflow: 'hidden',
      background: gradient, color: 'white', minHeight: 160,
    }}>
      {/* Decorative circles */}
      <div style={{ position:'absolute', top:-40, right:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.08)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:-50, right:40, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', top:-20, left:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)', pointerEvents:'none' }}/>
      <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start', height:'100%' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <span style={{ fontSize:22 }}>{icon}</span>
            <span style={{ fontSize:13, fontWeight:600, opacity:0.9, letterSpacing:'0.02em' }}>{title}</span>
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:8 }}>
            <span style={{ fontSize:48, fontWeight:800, lineHeight:1, letterSpacing:'-0.03em' }}>{value}</span>
            {label && <span style={{ fontSize:13, opacity:0.8, fontWeight:500 }}>{label}</span>}
          </div>
          {children}
        </div>
        {donutMax !== undefined && (
          <div style={{ position:'relative', flexShrink:0 }}>
            <DonutChart value={donutPct} max={donutMax} color="white" size={90} stroke={9}/>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:16, fontWeight:800 }}>{Math.round((donutPct/donutMax)*100)}%</span>
            </div>
          </div>
        )}
        {spark && <div style={{ alignSelf:'flex-end' }}><Spark data={spark} color="rgba(255,255,255,0.8)"/></div>}
      </div>
    </div>
  )
}

// ─── Small Stat Card ──────────────────────────────────────────────────────────
function StatCard({ icon, value, label, sub, color, trend, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'white', borderRadius: 16, padding: '18px 20px',
        border: '1.5px solid ' + (hov ? color : 'rgba(49,90,231,0.10)'),
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? '0 8px 24px rgba(49,90,231,0.12)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ width:40, height:40, borderRadius:12, background: color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, color: trend >= 0 ? '#12924F' : '#B91C1C', background: trend >= 0 ? '#F0FDF4' : '#FEF2F2', padding:'3px 8px', borderRadius:999 }}>
            {trend >= 0 ? '+' : ''}{trend}
          </span>
        )}
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)', letterSpacing:'-0.02em', lineHeight:1, marginBottom:4 }}>{value}</div>
      <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', marginBottom:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'rgb(110,114,140)' }}>{sub}</div>}
    </div>
  )
}

// ─── Activity Row ─────────────────────────────────────────────────────────────
function ActivityItem({ icon, name, title, company, time, badge, badgeColor, onClick }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(49,90,231,0.07)', cursor:onClick?'pointer':'default' }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.background='#F8FAFC' }}
      onMouseLeave={e => { if(onClick) e.currentTarget.style.background='transparent' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg, rgb(49,90,231), rgb(119,161,243))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:13, fontWeight:700, flexShrink:0 }}>
        {icon}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
        <div style={{ fontSize:11, color:'rgb(110,114,140)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}{company ? ' · ' + company : ''}</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
        {badge && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:badgeColor+'20', color:badgeColor }}>{badge}</span>}
        <span style={{ fontSize:10, color:'rgb(110,114,140)' }}>{time}</span>
      </div>
    </div>
  )
}

// ─── Pipeline Bar ─────────────────────────────────────────────────────────────
function PipelineBar({ label, count, total, color }) {
  const pct = total > 0 ? (count/total)*100 : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'rgb(20,20,43)' }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:700, color }}>
          {count} <span style={{ color:'rgb(110,114,140)', fontWeight:400 }}>Lead{count!==1?'s':''}</span>
        </span>
      </div>
      <div style={{ height:7, background:'rgba(49,90,231,0.08)', borderRadius:999, overflow:'hidden' }}>
        <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:999, transition:'width 0.8s ease' }}/>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [ssi, setSsi] = useState(null)
  const [pmTasks, setPmTasks] = useState([])
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [quickAct, setQuickAct]             = useState(false)
  const [qaLead,   setQaLead]               = useState('')
  const [qaType,   setQaType]               = useState('call')
  const [qaSubj,   setQaSubj]               = useState('')
  const [qaSaving, setQaSaving]             = useState(false)
  const [greeting, setGreeting] = useState('Hallo')

  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'Michael'
  const firstName = userName.split(' ')[0]

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting('Guten Morgen')
    else if (h < 18) setGreeting('Hallo')
    else setGreeting('Guten Abend')
  }, [])

  const [activities, setActivities] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session?.user?.id
    if (!uid) { setLoading(false); return }
    const [leadsRes, ssiRes, msgsRes, actRes] = await Promise.all([
      supabase.from('leads').select('id,first_name,last_name,name,job_title,headline,company,avatar_url,status,hs_score,deal_stage,deal_value,deal_expected_close,ai_buying_intent,li_connection_status,lifecycle_stage,created_at,next_followup,last_activity_at,is_favorite').eq('user_id', uid),
      supabase.from('ssi_scores').select('*').eq('user_id', uid).order('recorded_at', { ascending: false }).limit(10),
      supabase.from('linkedin_messages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('activities').select('id,type,subject,occurred_at,lead_id').eq('user_id', uid).order('occurred_at', { ascending: false }).limit(20),
    ])
    setLeads(leadsRes.data || [])
    setSsi((ssiRes.data || [])[0] || null)
    setMsgs(msgsRes.data || [])
    setActivities(actRes.data || [])
    setLoading(false)
    // PM-Tasks separat (kein Blocking)
    supabase.from('pm_task_assignments')
      .select('task_id, pm_tasks(id,title,priority,due_date, pm_columns(name,color), pm_projects(name,color))')
      .eq('assignee_id', uid).limit(8)
      .then(({ data }) => { if (data) setPmTasks(data.filter(a => a.pm_tasks).map(a => a.pm_tasks)) })
      .catch(() => {})
  }, [session])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => load(), 60000)
    return () => clearInterval(t)
  }, [load])

  // Countdown bis Auto-Refresh
  const [countdown, setCountdown] = useState(60)
  useEffect(() => {
    setCountdown(60)
    const t = setInterval(() => setCountdown(c => c <= 1 ? 60 : c - 1), 1000)
    return () => clearInterval(t)
  }, [load])

  // CRM Stats
  const totalLeads     = leads.length
  const connected      = leads.filter(l => l.li_connection_status === 'verbunden').length
  const hotLeads       = leads.filter(l => l.ai_buying_intent === 'hoch').length
  const todayActs      = activities.filter(a => new Date(a.occurred_at).toDateString() === new Date().toDateString()).length
  const weekActs       = activities.filter(a => (Date.now()-new Date(a.occurred_at))<7*86400000).length
  const inPipeline     = leads.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal' && l.deal_stage !== 'verloren').length
  const won            = leads.filter(l => l.deal_stage === 'gewonnen').length
  const pipelineValue  = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).reduce((s,l) => s+(Number(l.deal_value)||0), 0)
  const wonValue       = leads.filter(l => l.deal_stage === 'gewonnen').reduce((s,l) => s+(Number(l.deal_value)||0), 0)
  const winRate        = inPipeline > 0 ? Math.round(won/inPipeline*100) : 0
  const avgScore       = leads.length > 0 ? Math.round(leads.reduce((s,l)=>s+(l.hs_score||0),0)/leads.length) : 0
  const connRate       = totalLeads > 0 ? Math.round(connected/totalLeads*100) : 0

  // Legacy stats for existing UI parts
  const sqlLeads = leads.filter(l => l.status === 'SQL').length
  const convRate = totalLeads > 0 ? Math.round((sqlLeads/totalLeads)*100) : 0
  const ssiScore = ssi?.total_score ? Math.round(ssi.total_score) : 0

  // Pipeline distribution (neue Stages)
  const pipelineCols = [
    { label: 'Neu',        color: '#64748b', count: leads.filter(l=>!l.deal_stage||l.deal_stage==='kein_deal').length },
    { label: 'Kontaktiert',color: '#3b82f6', count: leads.filter(l=>l.deal_stage==='prospect').length },
    { label: 'Gespräch',   color: '#8b5cf6', count: leads.filter(l=>l.deal_stage==='opportunity').length },
    { label: 'Angebot',    color: '#f59e0b', count: leads.filter(l=>l.deal_stage==='angebot').length },
    { label: 'Gewonnen',   color: '#22c55e', count: won },
  ]

  const recentLeads = [...leads].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,5)
  const ssiSpark = ssiScore > 0 ? [ssiScore-8, ssiScore-5, ssiScore-3, ssiScore-1, ssiScore] : null
  const P = 'rgb(49,90,231)'

  return (
    <>
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, color:'#94A3B8', fontWeight:600 }}>
            {new Date().toLocaleDateString('de-DE', {weekday:'long', day:'2-digit', month:'long', year:'numeric'})}
          </div>
        </div>
        <button onClick={() => { load(); setCountdown(60) }} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#fff', fontSize:12, fontWeight:700, color:'#475569', cursor:'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: countdown <= 5 ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          ↺ {countdown}s
        </button>
      </div>

      {/* ── HERO GREETING ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'rgb(20,20,43)', margin: '0 0 4px', letterSpacing: '-0.03em' }}>
          {greeting}, {firstName}
        </h1>
        <p style={{ fontSize: 14, color: 'rgb(110,114,140)', margin: 0 }}>
          Hier ist deine Sales-Übersicht für heute.
        </p>
      </div>

      {/* ── CRM KPI ROW ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Pipeline Wert', val: pipelineValue > 0 ? '€'+Math.round(pipelineValue/1000)+'k' : '€0', icon:'💼', color:'#3b82f6', sub: inPipeline+' Deals aktiv' },
          { label:'Win Rate',      val: winRate+'%',   icon:'🏆', color:'#22c55e', sub: won+' gewonnen' },
          { label:'Hot Leads',     val: hotLeads,      icon:'🔥', color:'#ef4444', sub: 'Hoher Buying Intent' },
          { label:'Heute aktiv',   val: todayActs,     icon:'✅', color:'#8b5cf6', sub: weekActs+' diese Woche' },
        ].map(k => (
          <div key={k.label} style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:'14px 18px', borderTop:'3px solid '+k.color, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>{k.label}</div>
              <span style={{ fontSize:16 }}>{k.icon}</span>
            </div>
            <div style={{ fontSize:26, fontWeight:900, color:'#0F172A', lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── TWO HERO CARDS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <HeroCard
          title="LinkedIn Leads"
          icon="👥"
          value={totalLeads}
          label="gesamt"
          donutPct={sqlLeads}
          donutMax={Math.max(totalLeads, 1)}
          color={P}
          gradient="linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)">
          <div style={{ display:'flex', gap:16, marginTop:8 }}>
            <div><div style={{ fontSize:18, fontWeight:800 }}>{convRate}%</div><div style={{ fontSize:11, opacity:0.8 }}>Konversionsrate</div></div>
            <div><div style={{ fontSize:18, fontWeight:800 }}>{sqlLeads}</div><div style={{ fontSize:11, opacity:0.8 }}>SQL Leads</div></div>
          </div>
        </HeroCard>

        <HeroCard
          title="Social Selling Index"
          icon="📊"
          value={ssiScore || '—'}
          label={ssiScore ? 'von 100' : 'nicht erfasst'}
          donutPct={ssiScore}
          donutMax={100}
          color="#7C3AED"
          gradient="linear-gradient(135deg, rgb(91,79,216) 0%, rgb(167,139,250) 100%)">
          {ssi && (
            <div style={{ display:'flex', gap:16, marginTop:8 }}>
              {ssi.industry_rank && <div><div style={{ fontSize:18, fontWeight:800 }}>Top {ssi.industry_rank}%</div><div style={{ fontSize:11, opacity:0.8 }}>Branche</div></div>}
              {ssi.network_rank && <div><div style={{ fontSize:18, fontWeight:800 }}>Top {ssi.network_rank}%</div><div style={{ fontSize:11, opacity:0.8 }}>Netzwerk</div></div>}
            </div>
          )}
          {!ssi && (
            <button onClick={() => navigate('/ssi')} style={{ marginTop:10, padding:'6px 14px', borderRadius:10, border:'1.5px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              SSI jetzt erfassen
            </button>
          )}
        </HeroCard>
      </div>

      {/* ── STAT CARDS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
            <StatCard icon="🏆" value={leads.filter(l => l.status === 'MQL').length} label="MQL Leads" sub="Marketing qualifiziert" color="#B45309" onClick={() => navigate('/pipeline')}/>
        <StatCard icon="💬" value={msgs.length} label="Nachrichten" sub="archiviert" color="#0891B2" trend={msgs.length > 0 ? msgs.length : undefined} onClick={() => navigate('/messages')}/>
            <StatCard icon="⭐" value={'—'} label="Ø Bewertung" sub="deiner Nachrichten" color="#D97706"/>
            <StatCard icon="🔗" value={leads.filter(l => l.status === 'LQL').length} label="LQL Leads" sub="LinkedIn qualifiziert" color={P} onClick={() => navigate('/pipeline')}/>
      </div>

      {/* ── BOTTOM GRID ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Pipeline Verteilung */}
        <div style={{ background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(49,90,231,0.10)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Pipeline Überblick</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>{totalLeads} Leads verteilt</div>
            </div>
            <button onClick={() => navigate('/pipeline')} style={{ fontSize:12, fontWeight:600, color:P, background:'rgba(49,90,231,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>
              Ansehen →
            </button>
          </div>
          {loading ? (
            <div style={{ color:'rgb(110,114,140)', fontSize:13 }}>Lädt...</div>
          ) : totalLeads === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'rgb(110,114,140)', fontSize:13 }}>
              Noch keine Leads. <span onClick={() => navigate('/leads')} style={{ color:P, cursor:'pointer', fontWeight:600 }}>Jetzt hinzufügen →</span>
            </div>
          ) : (
            pipelineCols.map(col => (
              <div key={col.label} onClick={() => navigate('/pipeline')} style={{ cursor:'pointer' }}>
                <PipelineBar label={col.label} count={col.count} total={totalLeads} color={col.color}/>
              </div>
            ))
          )}
        </div>

        {/* Letzte Leads */}
        <div style={{ background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(49,90,231,0.10)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>{ activities.length > 0 ? 'Letzte Aktivitäten' : 'Neueste Leads'}</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>{ activities.length > 0 ? 'Live CRM Timeline' : 'Zuletzt hinzugefügt'}</div>
              {/* 7-Tage Mini-Aktivitäts-Balken */}
              {activities.length > 0 && (() => {
                const days = 7
                const buckets = Array.from({length:days},(_,i)=>{
                  const d=new Date(); d.setDate(d.getDate()-(days-1-i)); d.setHours(0,0,0,0)
                  return {date:d,count:0,label:d.toLocaleDateString('de-DE',{weekday:'short'})}
                })
                activities.forEach(a=>{
                  const d=new Date(a.occurred_at); d.setHours(0,0,0,0)
                  const idx=buckets.findIndex(b=>b.date.toDateString()===d.toDateString())
                  if(idx>=0)buckets[idx].count++
                })
                const max=Math.max(...buckets.map(b=>b.count),1)
                return(
                  <div style={{display:'flex',gap:4,alignItems:'flex-end',height:32,marginTop:8}}>
                    {buckets.map((b,i)=>(
                      <div key={i} title={`${b.label}: ${b.count} Aktivitäten`} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flex:1}}>
                        <div style={{width:'100%',borderRadius:3,background:b.count>0?'rgb(49,90,231)':'#E2E8F0',height:Math.max(4,Math.round((b.count/max)*24)),transition:'height 0.3s'}}/>
                        <span style={{fontSize:8,color:'#94A3B8',fontWeight:600}}>{b.label.charAt(0)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => setQuickAct(true)}
                style={{ fontSize:12, fontWeight:600, color:'#16a34a', background:'rgba(22,163,74,0.09)', border:'1px solid rgba(22,163,74,0.2)', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>
                + Aktivität
              </button>
              <button onClick={() => navigate('/leads')} style={{ fontSize:12, fontWeight:600, color:P, background:'rgba(49,90,231,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>
                Alle →
              </button>
            </div>
          </div>
          {loading ? (
            <div style={{ color:'rgb(110,114,140)', fontSize:13 }}>Lädt...</div>
          ) : activities.length > 0 ? (
            // Zeige echte Aktivitäten aus der activities-Tabelle
            activities.slice(0,5).map(act => {
              const icons = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', linkedin_connection:'🔗', task:'✅', other:'📌' }
              const lead = leads.find(l => l.id === act.lead_id)
              const name = lead ? (((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || 'Unbekannt') : '—'
              return (
                <ActivityItem
                  key={act.id}
                  icon={icons[act.type] || '📌'}
                  name={name}
                  title={act.subject || act.type}
                  company={lead?.company || ''}
                  time={new Date(act.occurred_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}
                  badge={act.type}
                  badgeColor={act.type==='meeting'?'#15803D':act.type==='email'?'#B45309':act.type==='call'?'#7C3AED':P}
                  onClick={lead ? () => navigate(`/leads/${lead.id}`) : undefined}
                />
              )
            })
          ) : recentLeads.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'rgb(110,114,140)', fontSize:13 }}>Noch keine Leads und Aktivitäten.</div>
          ) : (
            // Fallback: neue Leads anzeigen wenn keine Aktivitäten
            recentLeads.map(lead => (
              <ActivityItem
                key={lead.id}
                icon={(((lead.first_name||'')+' '+(lead.last_name||'')).trim()||lead.name||'?')[0].toUpperCase()}
                name={((lead.first_name||'')+' '+(lead.last_name||'')).trim()||lead.name||'Unbekannt'}
                title={lead.job_title||lead.headline||lead.position||''}
                company={lead.company||''}
                time={new Date(lead.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}
                onClick={() => navigate(`/leads/${lead.id}`)}
                badge={lead.status}
                badgeColor={lead.status==='SQL'?'#15803D':lead.status==='MQL'?'#B45309':lead.status==='LQL'?P:'#6B7280'}
              />
            ))
          )}
        </div>
      </div>

      {/* ── HOT LEADS WIDGET ── */}
      {leads.filter(l => l.hs_score >= 50).length > 0 && (
        <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(239,68,68,0.15)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🔥 Hot Leads — Jetzt handeln</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>Score ≥ 50 · Höchstes Abschluss-Potenzial</div>
            </div>
            <button onClick={() => navigate('/leads')} style={{ fontSize:12, fontWeight:600, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>
              Alle Hot Leads →
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[...leads].sort((a,b) => (b.hs_score||0)-(a.hs_score||0)).filter(l => l.hs_score >= 50).slice(0,4).map(lead => {
              const name = (((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || 'Unbekannt')
              const score = lead.hs_score || 0
              const color = score >= 70 ? '#ef4444' : '#f59e0b'
              const stageCfg = {
                kein_deal: '—', prospect: 'Kontaktiert', opportunity: 'Gespräch',
                angebot: 'Qualifiziert', verhandlung: 'Angebot', gewonnen: '✓ Gewonnen', verloren: 'Verloren'
              }
              return (
                <div key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'#FFF7F7', borderRadius:12, border:'1px solid rgba(239,68,68,0.12)', cursor:'pointer', transition:'background 0.15s' }} onMouseEnter={e=>e.currentTarget.style.background='#FEE2E2'} onMouseLeave={e=>e.currentTarget.style.background='#FFF7F7'}>
                  <div onClick={() => navigate(`/leads/${lead.id}`)} style={{ cursor:'pointer', width:36, height:36, borderRadius:'50%', background:color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color, flexShrink:0 }}>
                    {name[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div onClick={() => navigate(`/leads/${lead.id}`)} style={{ cursor:'pointer', fontWeight:700, fontSize:13, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                    <div style={{ fontSize:11, color:'#64748B', marginTop:1 }}>{lead.company || lead.job_title || '—'} · {stageCfg[lead.deal_stage] || '—'}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    {lead.deal_value > 0 && <span style={{ fontSize:11, fontWeight:700, color:'#22c55e' }}>€{Number(lead.deal_value).toLocaleString('de-DE')}</span>}
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <div style={{ width:32, height:4, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:Math.min(score,100)+'%', background:color, borderRadius:99 }}/>
                      </div>
                      <span style={{ fontSize:12, fontWeight:800, color }}>{score}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── FÄLLIGE FOLLOW-UPS ── */}
      {/* ── FOLLOW-UP WIDGET: Überfällig + Bald fällig ── */}
      {leads.filter(l => l.next_followup && new Date(l.next_followup) <= new Date(Date.now() + 7*86400000)).length > 0 && (() => {
        const now = new Date()
        const overdue = leads.filter(l => l.next_followup && new Date(l.next_followup) < now)
        const upcoming = leads.filter(l => l.next_followup && new Date(l.next_followup) >= now && new Date(l.next_followup) <= new Date(now.getTime() + 7*86400000))
        return (
          <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'20px 24px', border:'1.5px solid rgba(239,68,68,0.2)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🔔 Follow-up Radar</div>
                <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>Überfällig + Nächste 7 Tage</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {overdue.length > 0 && <span style={{ fontSize:12, fontWeight:700, background:'#FEF2F2', color:'#ef4444', padding:'4px 10px', borderRadius:8 }}>{overdue.length} überfällig</span>}
                {upcoming.length > 0 && <span style={{ fontSize:12, fontWeight:700, background:'#FFFBEB', color:'#d97706', padding:'4px 10px', borderRadius:8 }}>{upcoming.length} bald</span>}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[...overdue, ...upcoming].slice(0,5).map(lead => {
                const name = (((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || '?')
                const due = new Date(lead.next_followup)
                const isOver = due < now
                const diffDays = Math.round(Math.abs(now - due) / 86400000)
                const label = isOver
                  ? (diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Gestern' : `${diffDays}d über`)
                  : (diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Morgen' : `in ${diffDays}d`)
                return (
                  <div key={lead.id} onClick={() => navigate('/leads/'+lead.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, background: isOver ? '#FEF2F2' : '#FFFBEB', border:`1px solid ${isOver ? '#FECACA' : '#FDE68A'}`, cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background: isOver ? '#FEE2E2' : '#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11, color: isOver ? '#B91C1C' : '#92400E', flexShrink:0 }}>{name[0]?.toUpperCase()}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                      <div style={{ fontSize:11, color: isOver ? '#B91C1C' : '#92400E' }}>{lead.company||'—'} · Score {lead.hs_score||0}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color: isOver ? '#ef4444' : '#d97706', background: isOver ? '#FEE2E2' : '#FEF3C7', padding:'2px 8px', borderRadius:6, flexShrink:0 }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── AKTIVE PIPELINE-KONTAKTE ── */}
      {leads.filter(l => l.deal_stage && !['kein_deal','verloren','gewonnen'].includes(l.deal_stage) && l.li_connection_status === 'verbunden').length > 0 && (
        <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(245,158,11,0.15)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>⏰ Aktive Pipeline-Kontakte</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>Vernetzt — In Pipeline</div>
            </div>
            <button onClick={() => navigate('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'#d97706', background:'rgba(245,158,11,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>Pipeline →</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {leads.filter(l => l.deal_stage && !['kein_deal','verloren','gewonnen'].includes(l.deal_stage) && l.li_connection_status === 'verbunden').slice(0,4).map(lead => {
              const name = (((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || '?')
              const stageLabels = { prospect:'Kontaktiert', opportunity:'Gespräch', angebot:'Qualifiziert', verhandlung:'Angebot' }
              return (
                <div key={lead.id} onClick={() => navigate('/leads/'+lead.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:'#FFFBEB', border:'1px solid #FDE68A', cursor:'pointer' }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, color:'#92400E', flexShrink:0 }}>{name[0]?.toUpperCase()}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                    <div style={{ fontSize:11, color:'#92400E' }}>{stageLabels[lead.deal_stage]||lead.deal_stage} · {lead.company||'—'}</div>
                  </div>
                  {lead.deal_value > 0 && <span style={{ fontSize:11, fontWeight:700, color:'#22c55e' }}>€{Number(lead.deal_value).toLocaleString('de-DE')}</span>}
                  <span style={{ fontSize:11, fontWeight:700, color:'#d97706', background:'#FEF3C7', padding:'2px 8px', borderRadius:6 }}>Score {lead.hs_score||0}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── BALD SCHLIESSENDE DEALS ── */}
      {leads.filter(l => l.deal_expected_close && !['kein_deal','verloren','gewonnen'].includes(l.deal_stage) && new Date(l.deal_expected_close) <= new Date(Date.now()+30*86400000)).length > 0 && (() => {
        const now = new Date()
        const closing = leads
          .filter(l => l.deal_expected_close && !['kein_deal','verloren','gewonnen'].includes(l.deal_stage) && new Date(l.deal_expected_close) <= new Date(now.getTime()+30*86400000))
          .sort((a,b) => new Date(a.deal_expected_close)-new Date(b.deal_expected_close))
        return (
          <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'20px 24px', border:'1.5px solid rgba(34,197,94,0.2)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🎯 Bald schließende Deals</div>
                <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>Abschluss in den nächsten 30 Tagen</div>
              </div>
              <button onClick={() => navigate('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'#16a34a', background:'rgba(34,197,94,0.1)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>Pipeline →</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {closing.slice(0,4).map(lead => {
                const name = (((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || '?')
                const due = new Date(lead.deal_expected_close)
                const diffDays = Math.ceil((due - now) / 86400000)
                const isOver = diffDays < 0
                const label = isOver ? `${Math.abs(diffDays)}d überfällig` : diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Morgen' : `in ${diffDays}d`
                return (
                  <div key={lead.id} onClick={() => navigate('/leads/'+lead.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background: isOver ? '#FEF2F2' : '#F0FDF4', border:`1px solid ${isOver ? '#FECACA' : '#A7F3D0'}`, cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background: isOver ? '#FEE2E2' : '#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, color: isOver ? '#B91C1C' : '#15803D', flexShrink:0 }}>{name[0]?.toUpperCase()}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                      <div style={{ fontSize:11, color:'#64748B' }}>{lead.company||'—'}</div>
                    </div>
                    {lead.deal_value > 0 && <span style={{ fontSize:12, fontWeight:800, color:'#16a34a', flexShrink:0 }}>€{Number(lead.deal_value).toLocaleString('de-DE')}</span>}
                    <span style={{ fontSize:11, fontWeight:700, color: isOver ? '#ef4444' : '#16a34a', background: isOver ? '#FEE2E2' : '#DCFCE7', padding:'2px 8px', borderRadius:6, flexShrink:0 }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── BALD SCHLIESSENDE DEALS ── */}
      {(() => {
        const closingDeals = leads.filter(l => l.deal_expected_close && l.deal_stage && !['kein_deal','verloren','gewonnen'].includes(l.deal_stage))
          .map(l => ({ ...l, daysLeft: Math.ceil((new Date(l.deal_expected_close) - new Date()) / 86400000) }))
          .filter(l => l.daysLeft <= 30)
          .sort((a,b) => a.daysLeft - b.daysLeft)
        if (!closingDeals.length) return null
        return (
          <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(245,158,11,0.2)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🎯 Bald schließende Deals</div>
                <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>{closingDeals.length} Deal{closingDeals.length!==1?'s':''} in den nächsten 30 Tagen</div>
              </div>
              <button onClick={() => navigate('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'#d97706', background:'rgba(245,158,11,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>Pipeline →</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {closingDeals.slice(0,4).map(lead => {
                const name = [lead.first_name,lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unbekannt'
                const isOver = lead.daysLeft < 0
                return (
                  <div key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isOver?'#FEF2F2':'#FFFBEB', border:`1px solid ${isOver?'#FECACA':'#FDE68A'}`, cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.opacity='0.85'}
                    onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                      <div style={{ fontSize:11, color:'#92400E' }}>{lead.company||'—'} · {lead.deal_stage}</div>
                    </div>
                    {lead.deal_value > 0 && <span style={{ fontSize:12, fontWeight:800, color:'#16a34a', flexShrink:0 }}>€{Number(lead.deal_value).toLocaleString('de-DE')}</span>}
                    <span style={{ fontSize:11, fontWeight:700, color:isOver?'#ef4444':lead.daysLeft<=7?'#d97706':'#92400E', background:isOver?'#FEE2E2':'rgba(255,255,255,0.7)', padding:'2px 8px', borderRadius:6, flexShrink:0, border:`1px solid ${isOver?'#FECACA':'#FDE68A'}` }}>
                      {isOver ? `${Math.abs(lead.daysLeft)}d über` : lead.daysLeft===0 ? 'Heute!' : `${lead.daysLeft}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── MEINE AUFGABEN (PM) ── */}
      {pmTasks.length > 0 && (
        <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(139,92,246,0.15)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>📋 Meine Aufgaben</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>
                {pmTasks.length} Tasks
                {pmTasks.filter(t=>t.due_date&&new Date(t.due_date)<new Date()).length > 0 && (
                  <span style={{ marginLeft:6, color:'#ef4444', fontWeight:700 }}>
                    · {pmTasks.filter(t=>t.due_date&&new Date(t.due_date)<new Date()).length} überfällig
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => navigate('/projekte')} style={{ fontSize:12, fontWeight:600, color:'#7C3AED', background:'rgba(139,92,246,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>Aufgaben →</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pmTasks.slice(0,5).map(task => {
              const pr = {low:{c:'#22c55e',bg:'#F0FDF4'},medium:{c:'#f59e0b',bg:'#FFFBEB'},high:{c:'#ef4444',bg:'#FEF2F2'},urgent:{c:'#7c3aed',bg:'#F5F3FF'}}[task.priority||'medium']||{c:'#64748B',bg:'#F1F5F9'}
              const due = task.due_date ? new Date(task.due_date) : null
              const isOverdue = due && due < new Date()
              return (
                <div key={task.id} onClick={() => navigate('/projekte')} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isOverdue?'#FEF2F2':'#F9F5FF', border:`1px solid ${isOverdue?'#FECACA':'#DDD6FE'}`, cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.opacity='0.85'}
                  onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:task.pm_columns?.color||'#8B5CF6', flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</div>
                    <div style={{ fontSize:11, color:'#7C3AED' }}>{task.pm_projects?.name||'—'} · {task.pm_columns?.name||'—'}</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:pr.bg, color:pr.c, flexShrink:0 }}>{task.priority||'—'}</span>
                  {due && <span style={{ fontSize:10, fontWeight:600, color:isOverdue?'#ef4444':'#64748B', flexShrink:0 }}>📅 {due.toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SSI TEILSCORES (wenn vorhanden) ── */}
      {ssi && (
        <div style={{ marginTop:16, background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(49,90,231,0.10)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>SSI Teilscores</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>Letzte Messung: {new Date(ssi.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
            </div>
            <button onClick={() => navigate('/ssi')} style={{ fontSize:12, fontWeight:600, color:'#7C3AED', background:'rgba(124,58,237,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>
              Details →
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
            {[
              { label:'Marke aufbauen', key:'build_brand', color:'rgb(49,90,231)' },
              { label:'Personen finden', key:'find_people', color:'#15803D' },
              { label:'Insights nutzen', key:'engage_insights', color:'#B45309' },
              { label:'Beziehungen', key:'build_relationships', color:'#7C3AED' },
            ].map(({ label, key, color }) => {
              const val = ssi[key] || 0
              return (
                <div key={key} style={{ textAlign:'center' }}>
                  <div style={{ position:'relative', display:'inline-block' }}>
                    <DonutChart value={val} max={25} color={color} size={72} stroke={8}/>
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:14, fontWeight:800, color }}>{val}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:'rgb(20,20,43)', marginTop:6 }}>{label}</div>
                  <div style={{ fontSize:10, color:'rgb(110,114,140)' }}>/ 25</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>

    {quickAct && (
      <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(3px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={() => setQuickAct(false)}>
        <div style={{ background:'#fff', borderRadius:20, width:400, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding:'16px 22px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:800, fontSize:15 }}>+ Aktivität loggen</span>
            <button onClick={() => setQuickAct(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#94A3B8' }}>×</button>
          </div>
          <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>LEAD *</label>
              <select value={qaLead} onChange={e => setQaLead(e.target.value)}
                style={{ width:'100%', padding:'9px 11px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit' }}>
                <option value=''>— Lead auswählen —</option>
                {leads.map(l => { const n=(((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'?'); return <option key={l.id} value={l.id}>{n}{l.company?' · '+l.company:''}</option> })}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:6 }}>TYP</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {[['call','📞 Anruf'],['email','📧 E-Mail'],['meeting','🤝 Meeting'],['linkedin_message','💬 LinkedIn'],['note','📝 Notiz'],['task','✅ Task']].map(([v,l]) => (
                  <button key={v} onClick={() => setQaType(v)}
                    style={{ padding:'6px 11px', borderRadius:8, border:'1.5px solid '+(qaType===v?'#3b82f6':'#E2E8F0'), background:qaType===v?'#EFF6FF':'#fff', color:qaType===v?'#1d4ed8':'#374151', fontSize:12, fontWeight:qaType===v?700:400, cursor:'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>BETREFF</label>
              <input value={qaSubj} onChange={e => setQaSubj(e.target.value)} placeholder="z.B. Erstgespräch, Demo vereinbart…"
                style={{ width:'100%', padding:'9px 11px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', boxSizing:'border-box' }}/>
            </div>
            <button disabled={!qaLead||qaSaving} onClick={async () => {
              setQaSaving(true)
              await supabase.from('activities').insert({ lead_id:qaLead, user_id:session?.user?.id, type:qaType, subject:qaSubj||qaType, direction:'outbound', occurred_at:new Date().toISOString() })
              setQaSaving(false); setQuickAct(false); setQaLead(''); setQaSubj(''); setQaType('call'); load()
            }} style={{ padding:'11px', borderRadius:10, border:'none', background:qaLead?'#16a34a':'#E5E7EB', color:'#fff', fontSize:13, fontWeight:700, cursor:qaLead?'pointer':'default' }}>
              {qaSaving ? 'Speichern…' : '✓ Aktivität speichern'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}