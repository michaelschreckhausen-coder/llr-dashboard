import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const MetricCard = ({ label, value, sub, icon, color = '#64748B' }) => (
  <div style={{flex:'1 1 160px',background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'16px 18px',minWidth:150}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</div>
      <span style={{fontSize:18}}>{icon}</span>
    </div>
    <div style={{fontSize:28,fontWeight:800,color,letterSpacing:'-0.03em',marginBottom:2}}>{value ?? '—'}</div>
    <div style={{fontSize:11,color:'#94A3B8'}}>{sub}</div>
  </div>
)

const ScoreBar = ({ score }) => (
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <div style={{flex:1,height:6,background:'rgb(238,241,252)',borderRadius:999,overflow:'hidden'}}>
      <div style={{width:Math.min(100,score)+'%',height:'100%',background:score>=50?'linear-gradient(90deg,#22C55E,#10B981)':score>=25?'linear-gradient(90deg,#F59E0B,#EF4444)':'#E5E7EB',borderRadius:999,transition:'width 0.5s'}}/>
    </div>
    <div style={{fontSize:12,fontWeight:800,color:score>=50?'#16A34A':score>=25?'#D97706':'#94A3B8',minWidth:28}}>{score}</div>
  </div>
)

const PERIOD_OPTIONS = [
  { label: '7 Tage',  days: 7  },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
]

export default function Reports({ session }) {
  const uid = session?.user?.id
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState(null)
  const [topLeads, setTopLeads] = useState([])
  const [content, setContent]   = useState([])
  const [usage, setUsage]       = useState([])
  const [tab, setTab]           = useState('overview')
  const [days, setDays]         = useState(30)

  const load = useCallback(async (overrideDays) => {
    const activeDays = overrideDays ?? days
    setLoading(true)
    const since = new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000).toISOString()
    const [leadsR, contentR, vernR, usageR, scoredR] = await Promise.all([
      supabase.from('leads').select('id,lead_score,status,connection_status,created_at,source').eq('user_id', uid),
      supabase.from('content_history').select('id,template_label,content_type,created_at,brand_voice_snapshot').eq('user_id', uid).gte('created_at', since).order('created_at',{ascending:false}).limit(50),
      supabase.from('leads').select('id,connection_status,connected_at,created_at').eq('user_id', uid).neq('connection_status','none'),
      supabase.from('usage').select('id,action,action_category,tokens_used,created_at').eq('user_id', uid).gte('created_at', since),
      supabase.from('leads').select('id,first_name,last_name,name,job_title,headline,company,location,lead_score,connection_status,linkedin_url,icp_match').eq('user_id', uid).order('lead_score',{ascending:false,nullsFirst:false}).limit(10),
    ])

    const leads    = leadsR.data  || []
    const contents = contentR.data || []
    const verns    = vernR.data   || []
    const usages   = usageR.data  || []
    const top      = scoredR.data || []

    const hot  = leads.filter(l => (l.lead_score||0) >= 50).length
    const warm = leads.filter(l => (l.lead_score||0) >= 25 && (l.lead_score||0) < 50).length
    const connected  = leads.filter(l => l.connection_status === 'connected').length
    const pending    = leads.filter(l => l.connection_status === 'pending').length
    const accepted   = verns.filter(v => v.connection_status === 'connected').length
    const acceptRate = verns.length > 0 ? Math.round((accepted / verns.length) * 100) : 0
    const tokensTotal = usages.reduce((s, u) => s + (u.tokens_used || 0), 0)
    const brandVoiceUsed = contents.filter(c => c.brand_voice_snapshot).length
    const bvRate = contents.length > 0 ? Math.round((brandVoiceUsed / contents.length) * 100) : 0

    const contentByType = contents.reduce((acc, c) => {
      const k = c.template_label || c.content_type || 'Sonstige'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})

    const chartDays = Math.min(activeDays, 30)
    const now = Date.now()
    const daily = Array.from({length: chartDays}, (_, i) => {
      const d = new Date(now - (chartDays - 1 - i) * 24 * 60 * 60 * 1000)
      const key = d.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'})
      const count = usages.filter(u => {
        const ud = new Date(u.created_at)
        return ud.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'}) === key
      }).length
      return { key, count }
    })

    setStats({ leads:leads.length, hot, warm, connected, pending, verns:verns.length, acceptRate, contents:contents.length, bvRate, tokensTotal, daily, contentByType })
    setTopLeads(top)
    setContent(contents.slice(0, 20))
    setUsage(daily)
    setLoading(false)
  }, [uid, days])

  useEffect(() => { load() }, [load])

  const handlePeriodChange = (d) => {
    setDays(d)
    load(d)
  }

  const tabs = [
    { id:'overview', label:'Übersicht' },
    { id:'leads',    label:'Lead Scores' },
    { id:'content',  label:'Content' },
    { id:'usage',    label:'Nutzung' },
  ]

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'50vh',gap:12,color:'#94A3B8',fontSize:14}}>
      <div style={{width:18,height:18,border:'2px solid #E2E8F0',borderTop:'2px solid rgb(49,90,231)',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
      Lade Reports...
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  return (
    <div style={{maxWidth:1100}}>

      {/* ── Header ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:'-0.02em'}}>📊 Reports</h1>
          <p style={{color:'#64748B',fontSize:13,margin:'4px 0 0'}}>Letzte {days} Tage — Leads, Content, Vernetzungen</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {/* Period Picker */}
          <div style={{display:'flex',background:'rgb(238,241,252)',borderRadius:8,border:'1px solid #E2E8F0',padding:3,gap:2}}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => handlePeriodChange(opt.days)}
                style={{
                  padding:'5px 12px', borderRadius:6, border:'none',
                  fontSize:12, fontWeight:700, cursor:'pointer',
                  background: days === opt.days ? 'rgb(49,90,231)' : 'transparent',
                  color:      days === opt.days ? '#fff'    : '#64748B',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={() => load()} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',fontSize:12,fontWeight:600,color:'#475569',cursor:'pointer'}}>
            🔄 Aktualisieren
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:'flex',gap:4,borderBottom:'2px solid #F1F5F9',marginBottom:20}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{padding:'8px 16px',border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:tab===t.id?'rgb(49,90,231)':'#64748B',borderBottom:tab===t.id?'2px solid rgb(49,90,231)':'2px solid transparent',marginBottom:-2}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && stats && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <MetricCard label="Leads gesamt"    value={stats.leads}           sub="importiert"              icon="👥" color="rgb(49,90,231)"/>
            <MetricCard label="HOT Leads"       value={stats.hot}             sub="Score ≥ 50"         icon="🔥" color="#EF4444"/>
            <MetricCard label="WARM Leads"      value={stats.warm}            sub="Score 25-49"             icon="⚡"       color="#F59E0B"/>
            <MetricCard label="Vernetzt"        value={stats.connected}       sub="Connected"               icon="🤝" color="#22C55E"/>
            <MetricCard label="Akzeptanzrate"   value={stats.acceptRate+'%'}  sub={stats.verns+' Anfragen'} icon="📈"/>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <MetricCard label="Texte generiert"  value={stats.contents}             sub={'letzte '+days+' Tage'}  icon="✍️" color="#8B5CF6"/>
            <MetricCard label="Brand Voice Rate" value={stats.bvRate+'%'}           sub="mit Brand Voice"         icon="🎤" color="rgb(49,90,231)"/>
            <MetricCard label="Pending"          value={stats.pending}              sub="offene Anfragen"         icon="⏳"       color="#F59E0B"/>
            <MetricCard label="AI Tokens"        value={(stats.tokensTotal/1000).toFixed(1)+'k'} sub={'letzte '+days+' Tage'} icon="🤖"/>
          </div>

          <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px'}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>AI-Nutzung letzte {Math.min(days,30)} Tage</div>
            <div style={{display:'flex',alignItems:'flex-end',gap:days>14?4:8,height:80,overflowX:'auto'}}>
              {stats.daily.map(d => {
                const maxVal = Math.max(...stats.daily.map(x => x.count), 1)
                const h = Math.max(4, (d.count / maxVal) * 72)
                return (
                  <div key={d.key} style={{flex:1,minWidth:days>20?18:undefined,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <div style={{fontSize:10,color:'#94A3B8',fontWeight:600}}>{d.count||''}</div>
                    <div style={{width:'100%',height:h+'px',background:d.count>0?'linear-gradient(180deg,rgb(49,90,231),#3B82F6)':'rgb(238,241,252)',borderRadius:'4px 4px 0 0',transition:'height 0.4s'}}/>
                    <div style={{fontSize:10,color:'#94A3B8'}}>{days>20?d.key.substring(0,2):d.key}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {Object.keys(stats.contentByType).length > 0 && (
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px'}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Content nach Template</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {Object.entries(stats.contentByType).sort((a,b)=>b[1]-a[1]).map(([type,count]) => {
                  const total = Object.values(stats.contentByType).reduce((s,v)=>s+v,0)
                  return (
                    <div key={type} style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{minWidth:130,fontSize:12,fontWeight:600,color:'#475569'}}>{type}</div>
                      <div style={{flex:1,height:8,background:'rgb(238,241,252)',borderRadius:999,overflow:'hidden'}}>
                        <div style={{width:((count/total)*100)+'%',height:'100%',background:'linear-gradient(90deg,#8B5CF6,rgb(49,90,231))',borderRadius:999}}/>
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:'rgb(49,90,231)',minWidth:24}}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LEADS TAB ── */}
      {tab === 'leads' && (
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700,fontSize:14}}>🏆 Top Leads nach Score</div>
            <div style={{fontSize:11,color:'#94A3B8'}}>Aus {stats?.leads||0} Leads</div>
          </div>
          <div>
            {topLeads.length === 0
              ? <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>Keine Leads mit Score gefunden.</div>
              : topLeads.map((lead, i) => (
                  <div key={lead.id} style={{padding:'12px 18px',borderBottom:'1px solid #F8FAFC',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:i<3?'linear-gradient(135deg,#F59E0B,#EF4444)':'rgb(238,241,252)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:i<3?'#fff':'#94A3B8',flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:'rgb(20,20,43)'}}>{lead.name||'Unbekannt'}</div>
                      <div style={{fontSize:11,color:'#64748B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.job_title || lead.headline}</div>
                    </div>
                    <div style={{minWidth:120}}><ScoreBar score={lead.lead_score||0}/></div>
                    <div style={{minWidth:80,textAlign:'right'}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,background:lead.connection_status==='connected'?'#F0FDF4':lead.connection_status==='pending'?'#FFFBEB':'rgb(238,241,252)',color:lead.connection_status==='connected'?'#166534':lead.connection_status==='pending'?'#92400E':'#94A3B8',border:'1px solid '+(lead.connection_status==='connected'?'#BBF7D0':lead.connection_status==='pending'?'#FDE68A':'#E5E7EB')}}>
                        {lead.connection_status==='connected'?'Vernetzt':lead.connection_status==='pending'?'Pending':'Offen'}
                      </span>
                    </div>
                    {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:'rgb(49,90,231)',fontWeight:600,textDecoration:'none',flexShrink:0}}>LinkedIn →</a>}
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* ── CONTENT TAB ── */}
      {tab === 'content' && (
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F5F9',fontWeight:700,fontSize:14}}>✍️ Generierter Content — Verlauf</div>
          {content.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>Noch kein Content generiert.</div>
            : content.map(c => (
                <div key={c.id} style={{padding:'12px 18px',borderBottom:'1px solid #F8FAFC'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'rgba(49,90,231,0.08)',color:'rgb(49,90,231)'}}>{c.template_label||c.content_type||'Post'}</span>
                      {c.brand_voice_snapshot && <span style={{fontSize:10,color:'#8B5CF6',fontWeight:600}}>Brand Voice</span>}
                    </div>
                    <span style={{fontSize:11,color:'#94A3B8'}}>{new Date(c.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── USAGE TAB ── */}
      {tab === 'usage' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px'}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>AI-Nutzung letzte {Math.min(days,30)} Tage</div>
            <div style={{display:'flex',alignItems:'flex-end',gap:days>14?4:10,height:120,overflowX:'auto'}}>
              {usage.map(d => {
                const maxVal = Math.max(...usage.map(x => x.count), 1)
                const h = Math.max(4, (d.count / maxVal) * 108)
                return (
                  <div key={d.key} style={{flex:1,minWidth:days>20?16:undefined,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <div style={{fontSize:10,color:'#94A3B8',fontWeight:600}}>{d.count||''}</div>
                    <div style={{width:'100%',height:h+'px',background:d.count>0?'linear-gradient(180deg,rgb(49,90,231),#3B82F6)':'rgb(238,241,252)',borderRadius:'4px 4px 0 0',transition:'height 0.4s'}}/>
                    <div style={{fontSize:9,color:'#94A3B8',whiteSpace:'nowrap'}}>{days>20?d.key.substring(0,2):d.key}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
