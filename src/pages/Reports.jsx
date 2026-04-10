import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const P = 'rgb(49,90,231)'

function MiniBar({ data=[], color=P, height=60 }) {
  if (!data.length) return <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:12 }}>Keine Daten</div>
  const max = Math.max(...data.map(d => d.v), 1)
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${data.length*20} ${height}`} preserveAspectRatio="none" style={{ display:'block' }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.v / max) * (height - 8))
        return <rect key={i} x={i*20+2} y={height-h-4} width={16} height={h} rx={3} fill={color} opacity={0.85}/>
      })}
    </svg>
  )
}

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'16px 18px', borderTop:'3px solid '+color, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
        <span style={{ fontSize:18 }}>{icon}</span>
      </div>
      <div style={{ fontSize:32, fontWeight:900, color:'#0F172A', letterSpacing:'-0.03em', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{sub}</div>
    </div>
  )
}

function HeroCard({ title, value, sub, badge1, badge2, gradient, donut }) {
  const pct = Math.min(1, (donut||0) / 100)
  const r = 54, circ = 2*Math.PI*r
  return (
    <div style={{ background:gradient, borderRadius:20, padding:'24px 28px', color:'white', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
      <div style={{ position:'relative', zIndex:1, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>{title}</div>
          <div style={{ fontSize:52, fontWeight:900, letterSpacing:'-0.04em', lineHeight:1 }}>{value}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:6 }}>{sub}</div>
          {(badge1||badge2) && (
            <div style={{ display:'flex', gap:14, marginTop:14 }}>
              {badge1 && <div><div style={{ fontSize:17, fontWeight:800 }}>{badge1.v}</div><div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>{badge1.l}</div></div>}
              {badge2 && <div><div style={{ fontSize:17, fontWeight:800 }}>{badge2.v}</div><div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>{badge2.l}</div></div>}
            </div>
          )}
        </div>
        <div style={{ position:'relative', flexShrink:0 }}>
          <svg width={130} height={130} style={{ transform:'rotate(-90deg)' }}>
            <circle cx={65} cy={65} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={14}/>
            <circle cx={65} cy={65} r={r} fill="none" stroke="white" strokeWidth={14}
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

/* ── Pipeline Funnel Chart ── */
function FunnelChart({ stages }) {
  const max = Math.max(...stages.map(s => s.count), 1)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {stages.map((stage, i) => (
        <div key={stage.key} style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:120, fontSize:12, color:'#374151', fontWeight:600, textAlign:'right', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stage.label}</div>
          <div style={{ flex:1, height:28, background:'#F1F5F9', borderRadius:6, overflow:'hidden' }}>
            <div style={{ height:'100%', width:Math.max(4, (stage.count/max)*100)+'%', background:stage.color, borderRadius:6, transition:'width 0.6s ease', display:'flex', alignItems:'center', paddingLeft:8 }}>
              {stage.count > 0 && <span style={{ fontSize:12, fontWeight:800, color:'#fff' }}>{stage.count}</span>}
            </div>
          </div>
          {stage.value > 0 && <div style={{ fontSize:12, fontWeight:700, color:'#22c55e', flexShrink:0 }}>€{stage.value.toLocaleString('de-DE')}</div>}
          <div style={{ fontSize:12, color:'#94A3B8', flexShrink:0, minWidth:20, textAlign:'right' }}>{stage.count}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Activity Feed ── */
function ActivityFeed({ activities }) {
  const icons = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', linkedin_connection:'🔗', task:'✅', other:'📌' }
  if (!activities.length) return <div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic', padding:'20px 0' }}>Noch keine Aktivitäten</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      {activities.slice(0,10).map((a, i) => (
        <div key={a.id} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid #F1F5F9' }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{icons[a.type]||'📌'}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{a.subject || a.type}</div>
            <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{new Date(a.occurred_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const TABS = ['Uebersicht','Pipeline','Vernetzungen','Aktivitaeten','Lead Scores','SSI']
const TAB_LABELS = { 'Uebersicht':'Übersicht','Pipeline':'Pipeline','Vernetzungen':'Vernetzungen','Aktivitaeten':'Aktivitäten','Lead Scores':'Lead Scores','SSI':'SSI Verlauf' }

export default function Reports({ session }) {
  const navigate = useNavigate()
  const [leads, setLeads]           = useState([])
  const [activities, setActivities] = useState([])
  const [ssiHistory, setSsiHistory] = useState([])
  const [range, setRange]           = useState(30)
  const [tab, setTab]               = useState('Uebersicht')
  const [scoreSort,  setScoreSort]  = useState('score') // score | intent | stage | company
  const [loading, setLoading]       = useState(true)
  const [refreshKey, setRefreshKey]  = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - range*86400000).toISOString()
    const [{ data: ld }, { data: act }, { data: ssi }] = await Promise.all([
      supabase.from('leads').select('*').eq('user_id', session.user.id),
      supabase.from('activities').select('id,type,subject,body,occurred_at,lead_id,direction,outcome').eq('user_id', session.user.id).gte('occurred_at', since).order('occurred_at', { ascending:false }).limit(50),
      supabase.from('ssi_scores').select('total_score,build_brand,find_people,engage_insights,build_relationships,recorded_at').eq('user_id', session.user.id).order('recorded_at', { ascending:true }).limit(30),
    ])
    setLeads(ld || [])
    // Flatten activities with lead name
    setActivities(act||[])
    setSsiHistory(ssi || [])
    setLoading(false)
  }, [session, range, refreshKey])

  useEffect(() => { load() }, [load])

  const now = Date.now()
  const since = now - range*86400000
  const recentLeads = leads.filter(l => new Date(l.created_at).getTime() > since)
  const prevSince = Date.now() - range*2*86400000
  const prevLeads = leads.filter(l => { const t=new Date(l.created_at).getTime(); return t>prevSince && t<=since })
  const leadGrowth = prevLeads.length > 0 ? Math.round((recentLeads.length-prevLeads.length)/prevLeads.length*100) : null
  const recentActs = activities.filter(a => new Date(a.occurred_at).getTime() > since)
  const prevActs = activities.filter(a => { const t=new Date(a.occurred_at).getTime(); return t>prevSince && t<=since })
  const actGrowth = prevActs.length > 0 ? Math.round((recentActs.length-prevActs.length)/prevActs.length*100) : null

  // Pipeline Stats
  const stageOrder = ['kein_deal','prospect','opportunity','angebot','verhandlung','gewonnen','verloren']
  const stageCfg = {
    kein_deal:   { label:'Neu',           color:'#64748b', prob:5 },
    prospect:    { label:'Kontaktiert',   color:'#3b82f6', prob:15 },
    opportunity: { label:'Gespräch',      color:'#8b5cf6', prob:30 },
    angebot:     { label:'Qualifiziert',  color:'#f59e0b', prob:50 },
    verhandlung: { label:'Angebot',       color:'#f97316', prob:70 },
    gewonnen:    { label:'Gewonnen ✓',    color:'#22c55e', prob:100 },
    verloren:    { label:'Verloren ✗',    color:'#94a3b8', prob:0 },
  }

  const pipelineStages = stageOrder.map(key => ({
    key, ...stageCfg[key],
    count: leads.filter(l => (l.deal_stage || 'kein_deal') === key).length,
    value: leads.filter(l => (l.deal_stage || 'kein_deal') === key).reduce((s,l) => s+(Number(l.deal_value)||0), 0),
  }))

  const pipelineVal = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).reduce((s,l) => s+(Number(l.deal_value)||0), 0)
  const wonVal      = leads.filter(l => l.deal_stage === 'gewonnen').reduce((s,l) => s+(Number(l.deal_value)||0), 0)
  const withDeal    = leads.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal').length
  const won         = leads.filter(l => l.deal_stage === 'gewonnen').length
  const winRate     = withDeal > 0 ? Math.round(won/withDeal*100) : 0

  // Connection stats
  const connected = leads.filter(l => l.li_connection_status === 'verbunden').length
  const pending   = leads.filter(l => l.li_connection_status === 'pending').length
  const connRate  = leads.length > 0 ? Math.round(connected/leads.length*100) : 0

  // Activity stats
  const actByType = activities.reduce((acc, a) => { acc[a.type] = (acc[a.type]||0)+1; return acc }, {})

  // Intent distribution
  const intentCounts = { hoch:0, mittel:0, niedrig:0, unbekannt:0 }
  leads.forEach(l => { if (l.ai_buying_intent) intentCounts[l.ai_buying_intent] = (intentCounts[l.ai_buying_intent]||0)+1 })

  // Daily bars
  function buildBars(items, field, days=14) {
    const buckets = Array.from({length:days}, (_,i) => {
      const d = new Date(now - (days-1-i)*86400000)
      return { label:(d.getMonth()+1)+'/'+d.getDate(), v:0 }
    })
    items.forEach(item => {
      const t = new Date(item[field]).getTime()
      const idx = Math.floor((t-(now-days*86400000))/86400000)
      if (idx >= 0 && idx < days) buckets[idx].v++
    })
    return buckets
  }
  const leadBars = buildBars(recentLeads, 'created_at')
  const actBars  = buildBars(activities, 'occurred_at')

  return (
    <div style={{ maxWidth:1100 }}>
      {/* Time Range + Refresh */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:22, gap:8, alignItems:'center' }}>
        {[7,30,90].map(d => (
          <button key={d} onClick={() => setRange(d)} style={{ padding:'7px 14px', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', background:range===d?'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))':'white', color:range===d?'white':'#6B7280', boxShadow:range===d?'0 4px 14px rgba(49,90,231,0.3)':'none', border:range===d?'none':'1.5px solid #E5E7EB' }}>{d} Tage</button>
        ))}
        <button onClick={() => {
          const date = new Date().toISOString().substring(0,10)
          let rows, filename
          if (tab === 'Pipeline') {
            rows = [['Name','Firma','Deal Stage','Deal Wert','Score','Intent','Verbindung']]
            leads.filter(l=>l.deal_stage&&l.deal_stage!=='kein_deal').forEach(l=>rows.push([
              ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'',
              l.company||'',l.deal_stage||'',l.deal_value||0,l.hs_score||0,l.ai_buying_intent||'',l.li_connection_status||''
            ]))
            filename = `pipeline-${date}.csv`
          } else if (tab === 'Vernetzungen') {
            rows = [['Name','Firma','Verbindungsstatus','Antwortverhalten','Verbunden seit','Letzte Interaktion']]
            leads.forEach(l=>rows.push([
              ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'',
              l.company||'',l.li_connection_status||'',l.li_reply_behavior||'',
              l.li_connected_at?new Date(l.li_connected_at).toLocaleDateString('de-DE'):'',
              l.li_last_interaction_at?new Date(l.li_last_interaction_at).toLocaleDateString('de-DE'):''
            ]))
            filename = `vernetzungen-${date}.csv`
          } else if (tab === 'Aktivitaeten') {
            rows = [['Lead','Typ','Betreff','Datum']]
            activities.forEach(a=>{
              const lead = leads.find(l=>l.id===a.lead_id)
              const name = lead?((lead.first_name||'')+' '+(lead.last_name||'')).trim()||lead.name||'':'—'
              rows.push([name,a.type||'',a.subject||'',a.occurred_at?new Date(a.occurred_at).toLocaleDateString('de-DE'):''])
            })
            filename = `aktivitaeten-${date}.csv`
          } else if (tab === 'Lead Scores') {
            rows = [['Name','Firma','Score','Intent','Lifecycle Stage','Deal Stage']]
            leads.sort((a,b)=>(b.hs_score||0)-(a.hs_score||0)).forEach(l=>rows.push([
              ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'',
              l.company||'',l.hs_score||0,l.ai_buying_intent||'',l.lifecycle_stage||'',l.deal_stage||''
            ]))
            filename = `lead-scores-${date}.csv`
          } else {
            rows = [['Name','Firma','Score','Intent','Deal Stage','Deal Wert','Verbindung','Erstellt']]
            leads.forEach(l=>rows.push([
              ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'',
              l.company||'',l.hs_score||0,l.ai_buying_intent||'',
              l.deal_stage||'',l.deal_value||'',l.li_connection_status||'',
              l.created_at?new Date(l.created_at).toLocaleDateString('de-DE'):''
            ]))
            filename = `leads-report-${date}.csv`
          }
          const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
          const a = document.createElement('a')
          a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv)
          a.download = filename; a.click()
        }} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          ⬇ CSV {tab==='Pipeline'?`(${leads.filter(l=>l.deal_stage&&l.deal_stage!=='kein_deal').length})`:tab==='Aktivitaeten'?`(${activities.length})`:`(${leads.length})`}
        </button>
        <button onClick={() => setRefreshKey(k => k+1)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          {loading ? '⏳ Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {/* Hero Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <HeroCard title="Leads gesamt" value={leads.length} sub={recentLeads.length+' neu in letzten '+range+' Tagen'+(leadGrowth!==null?' · '+(leadGrowth>=0?'+':'')+leadGrowth+'% gg. Vorperiode':'')}
          badge1={{ v:leads.filter(l=>l.ai_buying_intent==='hoch').length, l:'Hot Intent' }}
          badge2={{ v:leads.filter(l=>l.hs_score>=50).length, l:'High Score' }}
          gradient="linear-gradient(135deg,rgb(49,90,231),rgb(119,161,243))"
          donut={connRate}/>
        <HeroCard title="Pipeline Wert" value={pipelineVal>0?'€'+Math.round(pipelineVal/1000)+'k':'€0'} sub={wonVal>0?'€'+wonVal.toLocaleString('de-DE')+' gewonnen':'Noch keine Deals gewonnen'}
          badge1={{ v:winRate+'%', l:'Win Rate' }}
          badge2={{ v:withDeal, l:'In Pipeline' }}
          gradient="linear-gradient(135deg,#7C3CAE,#B07AE0)"
          donut={winRate}/>
      </div>

      {/* KPI Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Vernetzt" value={connected} sub={connRate+'% Konversionsrate'} color={P} icon="🤝"/>
        <KpiCard label="Ausstehend" value={pending} sub="Anfragen pending" color="#f59e0b" icon="⏳"/>
        <KpiCard label="Gewonnen" value={won} sub={wonVal>0?'€'+wonVal.toLocaleString('de-DE'):''} color="#22c55e" icon="🏆"/>
        <KpiCard label="Aktivitäten" value={activities.length} sub={'letzte '+range+' Tage'} color="#8b5cf6" icon="⚡"/>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'2px solid #E5E7EB', marginBottom:24, gap:0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:'10px 18px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:tab===t?700:500, color:tab===t?P:'#64748B', borderBottom:tab===t?'2px solid '+P:'2px solid transparent', marginBottom:-2, transition:'all 0.15s' }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign:'center', padding:48, color:'#94A3B8' }}>Lade Reports…</div> : (<>

      {/* ── ÜBERSICHT ── */}
      {tab === 'Uebersicht' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'20px 20px 12px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:12 }}>📈 Neue Leads (letzte {range <= 14 ? range : 14} Tage)</div>
            <MiniBar data={leadBars} color={P} height={70}/>
          </div>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'20px 20px 12px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:12 }}>⚡ Aktivitäten (letzte 14 Tage)</div>
            <MiniBar data={actBars} color="#8b5cf6" height={70}/>
          </div>
          {/* Buying Intent */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'20px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:12 }}>🎯 Buying Intent</div>
            {[['hoch','🔥 Hoch','#ef4444'],['mittel','⚡ Mittel','#f59e0b'],['niedrig','○ Niedrig','#64748b'],['unbekannt','— Unbekannt','#CBD5E1']].map(([key,label,color]) => (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ fontSize:12, color:'#374151', width:90 }}>{label}</div>
                <div style={{ flex:1, height:18, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:Math.max(4, (intentCounts[key]||0)/Math.max(1,leads.length)*100)+'%', background:color, borderRadius:4 }}/>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:'#374151', width:20, textAlign:'right' }}>{intentCounts[key]||0}</div>
              </div>
            ))}
          </div>
          {/* Activity Types */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'20px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:12 }}>📊 Aktivitätstypen</div>
            {Object.entries(actByType).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([type,count]) => (
              <div key={type} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ fontSize:12, color:'#374151', width:130, textTransform:'capitalize' }}>{type.replace(/_/g,' ')}</div>
                <div style={{ flex:1, height:18, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:Math.max(4,(count/Math.max(1,activities.length))*100)+'%', background:P, borderRadius:4, opacity:0.8 }}/>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:'#374151', width:20, textAlign:'right' }}>{count}</div>
              </div>
            ))}
            {Object.keys(actByType).length === 0 && <div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic' }}>Keine Aktivitäten in diesem Zeitraum</div>}
          </div>
        </div>
      )}

      {/* ── PIPELINE ── */}
      {tab === 'Pipeline' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
            {[
              { label:'Pipeline Wert', val:'€'+pipelineVal.toLocaleString('de-DE'), color:'#3b82f6' },
              { label:'Gewonnen', val:'€'+wonVal.toLocaleString('de-DE'), color:'#22c55e' },
              { label:'Win Rate', val:winRate+'%', color:'#8b5cf6' },
            ].map(k => (
              <div key={k.label} style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', borderTop:'3px solid '+k.color }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{k.label}</div>
                <div style={{ fontSize:28, fontWeight:900, color:k.color }}>{k.val}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'24px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:18 }}>Pipeline Funnel</div>
            <FunnelChart stages={pipelineStages}/>
          </div>
          {/* Deals Liste nach Wert */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:700, color:'#374151' }}>
              Aktive Deals nach Wert ({leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).length})
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>
                {['Lead','Firma','Stage','Wert','Abschluss','Score'].map(h => (
                  <th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[...leads].filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage))
                  .sort((a,b) => (Number(b.deal_value)||0) - (Number(a.deal_value)||0))
                  .slice(0,15).map(lead => {
                  const name = ((lead.first_name||'')+' '+(lead.last_name||'')).trim()||lead.name||'?'
                  const stageLabels = { prospect:'Kontaktiert', opportunity:'Gespräch', angebot:'Qualifiziert', verhandlung:'Angebot', gewonnen:'Gewonnen' }
                  return (
                    <tr key={lead.id} style={{ borderBottom:'1px solid #F9FAFB' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'9px 16px' }}>
                        <span onClick={() => navigate('/leads/'+lead.id)} style={{ fontWeight:700, fontSize:12, color:'rgb(49,90,231)', cursor:'pointer' }}>{name} ↗</span>
                      </td>
                      <td style={{ padding:'9px 16px', fontSize:12, color:'#374151' }}>{lead.company||'—'}</td>
                      <td style={{ padding:'9px 16px', fontSize:11, fontWeight:600, color:'#8b5cf6' }}>{stageLabels[lead.deal_stage]||lead.deal_stage}</td>
                      <td style={{ padding:'9px 16px', fontSize:12, fontWeight:800, color:'#22c55e' }}>{lead.deal_value ? '€'+Number(lead.deal_value).toLocaleString('de-DE') : '—'}</td>
                      <td style={{ padding:'9px 16px', fontSize:11, color:'#94A3B8' }}>{lead.deal_expected_close ? new Date(lead.deal_expected_close).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}</td>
                      <td style={{ padding:'9px 16px', fontSize:12, fontWeight:700, color:'#3b82f6' }}>{lead.hs_score||0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VERNETZUNGEN ── */}
      {tab === 'Vernetzungen' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'24px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:16 }}>Verbindungsstatus</div>
            {[
              ['verbunden','✅ Vernetzt','#065F46','#ECFDF5'],
              ['pending','⏳ Ausstehend','#92400E','#FFFBEB'],
              ['nicht_verbunden','— Kein Kontakt','#475569','#F8FAFC'],
              ['abgelehnt','❌ Abgelehnt','#991B1B','#FEF2F2'],
            ].map(([key,label,color,bg]) => {
              const count = leads.filter(l => (l.li_connection_status||'nicht_verbunden') === key).length
              const pct = leads.length > 0 ? Math.round(count/leads.length*100) : 0
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ fontSize:13, color, fontWeight:600, width:130, flexShrink:0 }}>{label}</div>
                  <div style={{ flex:1, height:24, background:'#F1F5F9', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:Math.max(4,pct)+'%', background:color, borderRadius:6, opacity:0.8, display:'flex', alignItems:'center', paddingLeft:8 }}>
                      {count > 0 && <span style={{ fontSize:11, fontWeight:800, color:'#fff' }}>{count}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'#94A3B8', width:32, textAlign:'right' }}>{pct}%</div>
                </div>
              )
            })}
          </div>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'24px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:16 }}>Antwortverhalten</div>
            {[
              ['schnell','⚡ Schnell','#065F46'],
              ['langsam','🐢 Langsam','#92400E'],
              ['keine_antwort','🔇 Keine Antwort','#991B1B'],
              ['unbekannt','— Unbekannt','#94a3b8'],
            ].map(([key,label,color]) => {
              const count = leads.filter(l => (l.li_reply_behavior||'unbekannt') === key).length
              const pct = leads.length > 0 ? Math.round(count/leads.length*100) : 0
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ fontSize:13, color:'#374151', fontWeight:600, width:130, flexShrink:0 }}>{label}</div>
                  <div style={{ flex:1, height:24, background:'#F1F5F9', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:Math.max(4,pct)+'%', background:color, borderRadius:6, opacity:0.7, display:'flex', alignItems:'center', paddingLeft:8 }}>
                      {count > 0 && <span style={{ fontSize:11, fontWeight:800, color:'#fff' }}>{count}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'#94A3B8', width:32, textAlign:'right' }}>{pct}%</div>
                </div>
              )
            })}
          </div>
          {/* Konversionsrate */}
          <div style={{ gridColumn:'1/-1', background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'20px 24px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:16 }}>📈 Konversionsrate & Top Leads</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:20 }}>
              {(() => {
                const total = leads.length || 1
                const vernetzt = leads.filter(l => l.li_connection_status === 'verbunden').length
                const mitDeal = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).length
                const gewonnen = leads.filter(l => l.deal_stage === 'gewonnen').length
                return [
                  ['Gesamt Leads', total, '#475569'],
                  ['Vernetzt', vernetzt + ' (' + Math.round(vernetzt/total*100) + '%)', '#065F46'],
                  ['In Pipeline', mitDeal + ' (' + Math.round(mitDeal/total*100) + '%)', 'rgb(49,90,231)'],
                  ['Gewonnen', gewonnen + ' (' + Math.round(gewonnen/Math.max(1,mitDeal)*100) + '% WR)', '#16a34a'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:900, color:c }}>{v}</div>
                    <div style={{ fontSize:11, color:'#94A3B8', fontWeight:600, marginTop:2 }}>{l}</div>
                  </div>
                ))
              })()}
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Top 5 nach Score</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[...leads].sort((a,b) => (b.hs_score||0)-(a.hs_score||0)).slice(0,5).map(l => {
                const name = ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.name||'?'
                return (
                  <div key={l.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#0F172A', width:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                    <div style={{ flex:1, height:16, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:(l.hs_score||0)+'%', background:'linear-gradient(90deg,rgb(49,90,231),#8b5cf6)', borderRadius:4 }}/>
                    </div>
                    <span style={{ fontSize:12, fontWeight:800, color:'rgb(49,90,231)', width:28, textAlign:'right' }}>{l.hs_score||0}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── AKTIVITÄTEN ── */}
      {tab === 'Aktivitaeten' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151' }}>Aktivitäts-Feed (letzte {range} Tage) · {(actType?activities.filter(a=>a.type===actType):activities).length} Einträge</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {actType && <button onClick={()=>setActType(null)} style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #E2E8F0', background:'#F1F5F9', color:'#64748B', fontSize:11, fontWeight:600, cursor:'pointer' }}>✕ Alle</button>}
              {Object.entries(actByType).sort((a,b)=>b[1]-a[1]).map(([type,count]) => {
                const icons = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', task:'✅', other:'📌' }
                return (
                  <button key={type} onClick={()=>setActType(actType===type?null:type)}
                    style={{ padding:'4px 10px', borderRadius:8, border:'1px solid '+(actType===type?'#7c3aed':'#E2E8F0'), background:actType===type?'#F5F3FF':'#F8FAFC', color:actType===type?'#7c3aed':'#374151', fontSize:12, fontWeight:actType===type?700:400, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                    {icons[type]||'📌'} <strong>{count}</strong>
                  </button>
                )
              })}
            </div>
          </div>
          <ActivityFeed activities={actType?activities.filter(a=>a.type===actType):activities}/>
        </div>
      )}

      {/* ── LEAD SCORES ── */}
      {tab === 'Lead Scores' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>Lead Scores & Intent</span>
            <div style={{ display:'flex', gap:6 }}>
              {[['score','Score ↓'],['intent','Intent'],['stage','Stage'],['company','Firma']].map(([val,lbl]) => (
                <button key={val} onClick={() => setScoreSort(val)}
                  style={{ padding:'5px 12px', borderRadius:8, border:'1px solid '+(scoreSort===val?'#3b82f6':'#E2E8F0'), background:scoreSort===val?'#EFF6FF':'#fff', color:scoreSort===val?'#1d4ed8':'#64748B', fontSize:12, fontWeight:scoreSort===val?700:400, cursor:'pointer' }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                  {['Name','Unternehmen','Score','Intent','Deal Stage','Verbindung'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...leads].sort((a,b) => {
                  if (scoreSort === 'intent') {
                    const order = { hoch:0, mittel:1, niedrig:2, unbekannt:3 }
                    return (order[a.ai_buying_intent||'unbekannt']||3) - (order[b.ai_buying_intent||'unbekannt']||3)
                  }
                  if (scoreSort === 'stage') return (a.deal_stage||'').localeCompare(b.deal_stage||'')
                  if (scoreSort === 'company') return (a.company||'').localeCompare(b.company||'')
                  return (b.hs_score||0)-(a.hs_score||0)
                }).slice(0,25).map(lead => {
                  const name = ((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || 'Unbekannt'
                  return (
                    <tr key={lead.id} style={{ borderBottom:'1px solid #F1F5F9' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'10px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span onClick={() => navigate(`/leads/${lead.id}`)} style={{ fontWeight:700, fontSize:13, color:'#0F172A', cursor:'pointer' }}>{name}</span>
                          <button onClick={() => navigate(`/leads/${lead.id}`)} style={{ padding:'2px 7px', borderRadius:6, border:'1px solid rgba(49,90,231,0.25)', background:'rgba(49,90,231,0.07)', color:'rgb(49,90,231)', fontSize:10, fontWeight:700, cursor:'pointer', flexShrink:0 }}>↗</button>
                          {(lead.profile_url||lead.linkedin_url) && <a href={lead.profile_url||lead.linkedin_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:10, fontWeight:700, color:'#0A66C2', background:'rgba(10,102,194,0.08)', padding:'2px 7px', borderRadius:6, border:'1px solid rgba(10,102,194,0.2)', textDecoration:'none', flexShrink:0 }}>in</a>}
                        </div>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:13, color:'#374151' }}>{lead.company||'—'}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:6, background:'#E5E7EB', borderRadius:99, overflow:'hidden', minWidth:60 }}>
                            <div style={{ height:'100%', width:Math.min(lead.hs_score||0,100)+'%', background:'linear-gradient(90deg,'+P+',#8b5cf6)', borderRadius:99 }}/>
                          </div>
                          <span style={{ fontSize:12, fontWeight:800, color:P }}>{lead.hs_score||0}</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:12 }}>
                        {lead.ai_buying_intent === 'hoch' ? <span style={{ background:'#FEF2F2', color:'#ef4444', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>🔥 Hoch</span>
                          : lead.ai_buying_intent === 'mittel' ? <span style={{ background:'#FFFBEB', color:'#f59e0b', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>⚡ Mittel</span>
                          : <span style={{ color:'#94A3B8' }}>—</span>}
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:12, color:'#374151' }}>{lead.deal_stage || 'kein_deal'}</td>
                      <td style={{ padding:'10px 16px', fontSize:12 }}>
                        {lead.li_connection_status === 'verbunden' ? <span style={{ background:'#ECFDF5', color:'#065F46', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>✓ Vernetzt</span>
                          : <span style={{ color:'#94A3B8' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SSI ── */}
      {tab === 'SSI' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'24px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:20 }}>SSI Score Verlauf</div>
          {ssiHistory.length > 0 ? (
            <>
              <div style={{ display:'flex', gap:20, marginBottom:20 }}>
                <div style={{ textAlign:'center', padding:'12px 24px', background:'linear-gradient(135deg,'+P+',#8b5cf6)', borderRadius:14, color:'#fff' }}>
                  <div style={{ fontSize:36, fontWeight:900 }}>{ssiHistory[ssiHistory.length-1]?.total_score || 0}</div>
                  <div style={{ fontSize:11, opacity:0.8 }}>Aktueller SSI</div>
                </div>
                <div style={{ textAlign:'center', padding:'12px 24px', background:'#F8FAFC', borderRadius:14, border:'1px solid #E5E7EB' }}>
                  <div style={{ fontSize:36, fontWeight:900, color:'#374151' }}>{ssiHistory[0]?.total_score || 0}</div>
                  <div style={{ fontSize:11, color:'#94A3B8' }}>Anfangswert</div>
                </div>
                {ssiHistory.length > 1 && (
                  <div style={{ textAlign:'center', padding:'12px 24px', background:'#F0FDF4', borderRadius:14, border:'1px solid #BBF7D0' }}>
                    <div style={{ fontSize:36, fontWeight:900, color:'#22c55e' }}>
                      {(ssiHistory[ssiHistory.length-1]?.total_score||0) > (ssiHistory[0]?.total_score||0) ? '+' : ''}
                      {(ssiHistory[ssiHistory.length-1]?.total_score||0) - (ssiHistory[0]?.total_score||0)}
                    </div>
                    <div style={{ fontSize:11, color:'#65a30d' }}>Veränderung</div>
                  </div>
                )}
              </div>
              <MiniBar data={ssiHistory.map(s => ({ v: s.total_score||0, label: new Date(s.recorded_at).toLocaleDateString('de-DE') }))} color={P} height={120}/>
              {ssiHistory.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:16 }}>
                  {[
                    { label:'Marke aufbauen',  val: Number(ssiHistory[ssiHistory.length-1].build_brand || 0),         color:'#3b82f6' },
                    { label:'Richtige Leute',  val: Number(ssiHistory[ssiHistory.length-1].find_people || 0),          color:'#8b5cf6' },
                    { label:'Insights teilen', val: Number(ssiHistory[ssiHistory.length-1].engage_insights || 0),      color:'#f59e0b' },
                    { label:'Beziehungen',     val: Number(ssiHistory[ssiHistory.length-1].build_relationships || 0),  color:'#22c55e' },
                  ].map(sub => (
                    <div key={sub.label} style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 12px' }}>
                      <div style={{ fontSize:11, color:'#94A3B8', fontWeight:600, marginBottom:4 }}>{sub.label}</div>
                      <div style={{ fontSize:20, fontWeight:900, color:sub.color }}>{Math.round(sub.val)}</div>
                      <div style={{ height:4, background:'#E5E7EB', borderRadius:99, marginTop:6, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:Math.min(sub.val / 25 * 100, 100)+'%', background:sub.color, borderRadius:99 }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic', textAlign:'center', padding:40 }}>Noch keine SSI-Daten. Gehe zum SSI Tracker um deinen Score zu messen.</div>
          )}
        </div>
      )}
      </>)}
    </div>
  )
}
