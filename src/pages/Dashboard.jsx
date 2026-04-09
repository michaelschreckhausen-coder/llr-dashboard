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
function ActivityItem({ icon, name, title, company, time, badge, badgeColor }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(49,90,231,0.07)' }}>
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
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
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
      supabase.from('leads').select('id,first_name,last_name,name,job_title,headline,company,avatar_url,status,hs_score,deal_stage,deal_value,ai_buying_intent,li_connection_status,lifecycle_stage,created_at').eq('user_id', uid),
      supabase.from('ssi_scores').select('*').eq('user_id', uid).order('measured_at', { ascending: false }).limit(10),
      supabase.from('linkedin_messages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('activities').select('id,type,subject,occurred_at,lead_id').order('occurred_at', { ascending: false }).limit(5),
    ])
    setLeads(leadsRes.data || [])
    setSsi((ssiRes.data || [])[0] || null)
    setMsgs(msgsRes.data || [])
    setActivities(actRes.data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // CRM Stats
  const totalLeads     = leads.length
  const connected      = leads.filter(l => l.li_connection_status === 'verbunden').length
  const hotLeads       = leads.filter(l => l.ai_buying_intent === 'hoch').length
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
    <div style={{ maxWidth: 1100 }}>

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
          { label:'Ø Score',       val: avgScore,      icon:'⚡', color:'#8b5cf6', sub: connected+' vernetzt ('+connRate+'%)' },
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
              <PipelineBar key={col.label} label={col.label} count={col.count} total={totalLeads} color={col.color}/>
            ))
          )}
        </div>

        {/* Letzte Leads */}
        <div style={{ background:'white', borderRadius:18, padding:'22px 24px', border:'1.5px solid rgba(49,90,231,0.10)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>{ activities.length > 0 ? 'Letzte Aktivitäten' : 'Neueste Leads'}</div>
              <div style={{ fontSize:12, color:'rgb(110,114,140)', marginTop:2 }}>{ activities.length > 0 ? 'Live CRM Timeline' : 'Zuletzt hinzugefügt'}</div>
            </div>
            <button onClick={() => navigate('/leads')} style={{ fontSize:12, fontWeight:600, color:P, background:'rgba(49,90,231,0.10)', border:'none', borderRadius:10, padding:'6px 14px', cursor:'pointer' }}>
              Alle ansehen →
            </button>
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
              Alle ansehen →
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
                  <div style={{ width:36, height:36, borderRadius:'50%', background:color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color, flexShrink:0 }}>
                    {name[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
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
  )
}
