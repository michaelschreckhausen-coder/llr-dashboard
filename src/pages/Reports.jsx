import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const MetricCard = ({ label, value, sub, color, icon }) => (
  <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px',flex:1,minWidth:160}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <span style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em'}}>{label}</span>
      <span style={{fontSize:18}}>{icon}</span>
    </div>
    <div style={{fontSize:28,fontWeight:800,color:color||'#0F172A',letterSpacing:'-0.03em'}}>{value}</div>
    {sub && <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>{sub}</div>}
  </div>
)

const ScoreBar = ({ score, max = 100 }) => {
  const pct = Math.min(100, (score / max) * 100)
  const color = score >= 50 ? '#22C55E' : score >= 25 ? '#F59E0B' : '#94A3B8'
  return (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <div style={{flex:1,height:6,background:'#F1F5F9',borderRadius:999,overflow:'hidden'}}>
        <div style={{width:pct+'%',height:'100%',background:color,borderRadius:999,transition:'width 0.4s'}}/>
      </div>
      <span style={{fontSize:11,fontWeight:700,color,minWidth:24,textAlign:'right'}}>{score}</span>
    </div>
  )
}

export default function Reports({ session }) {
  const uid = session?.user?.id
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState(null)
  const [topLeads, setTopLeads] = useState([])
  const [content, setContent]   = useState([])
  const [usage, setUsage]       = useState([])
  const [tab, setTab]           = useState('overview')

  const load = useCallback(async () => {
    setLoading(true)
    const [leadsR, contentR, vernR, usageR, scoredR] = await Promise.all([
      supabase.from('leads').select('id,lead_score,status,connection_status,created_at,source').eq('user_id', uid),
      supabase.from('content_history').select('id,template_label,content_type,created_at,brand_voice_snapshot').eq('user_id', uid).order('created_at',{ascending:false}).limit(50),
      supabase.from('leads').select('id,connection_status,connected_at,created_at').eq('user_id', uid).neq('connection_status','none'),
      supabase.from('usage').select('id,action,action_category,tokens_used,created_at').eq('user_id', uid).gte('created_at', new Date(Date.now()-30*24*60*60*1000).toISOString()),
      supabase.from('leads').select('id,first_name,last_name,name,job_title,headline,company,location,lead_score,connection_status,linkedin_url,icp_match').eq('user_id', uid).order('lead_score',{ascending:false,nullsFirst:false}).limit(10),
    ])

    const leads     = leadsR.data  || []
    const contents  = contentR.data || []
    const verns     = vernR.data   || []
    const usages    = usageR.data  || []
    const top       = scoredR.data || []

    // Stats
    const hot  = leads.filter(l => (l.lead_score||0) >= 50).length
    const warm = leads.filter(l => (l.lead_score||0) >= 25 && (l.lead_score||0) < 50).length
    const connected = leads.filter(l => l.connection_status === 'connected').length
    const pending   = leads.filter(l => l.connection_status === 'pending').length
    const accepted  = verns.filter(v => v.connection_status === 'connected').length
    const acceptRate = verns.length > 0 ? Math.round((accepted / verns.length) * 100) : 0
    const tokensTotal = usages.reduce((s, u) => s + (u.tokens_used || 0), 0)
    const brandVoiceUsed = contents.filter(c => c.brand_voice_snapshot).length
    const bvRate = contents.length > 0 ? Math.round((brandVoiceUsed / contents.length) * 100) : 0

    // Content by type
    const contentByType = contents.reduce((acc, c) => {
      const k = c.template_label || c.content_type || 'Sonstige'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})

    // Usage last 7 days
    const now = Date.now()
    const daily = Array.from({length:7}, (_,i) => {
      const d = new Date(now - (6-i)*24*60*60*1000)
      const key = d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})
      const count = usages.filter(u => {
        const ud = new Date(u.created_at)
        return ud.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}) === key
      }).length
      return { key, count }
    })

    setStats({ leads:leads.length, hot, warm, connected, pending, verns:verns.length, acceptRate, contents:contents.length, bvRate, tokensTotal, daily, contentByType })
    setTopLeads(top)
    setContent(contents.slice(0,20))
    setUsage(daily)
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  const tabs = [
    { id:'overview',  label:'Übersicht' },
    { id:'leads',     label:'Lead Scores' },
    { id:'content',   label:'Content' },
    { id:'usage',     label:'Nutzung' },
  ]

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'50vh',gap:12,color:'#94A3B8',fontSize:14}}>
      <div style={{width:18,height:18,border:'2px solid #E2E8F0',borderTop:'2px solid #0A66C2',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
      Lade Reports...
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  return (
    <div style={{maxWidth:1100}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:'-0.02em'}}>📊 Reports</h1>
          <p style={{color:'#64748B',fontSize:13,margin:'4px 0 0'}}>Letzte 30 Tage — Leads, Content, Vernetzungen</p>
        </div>
        <button onClick={load} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',fontSize:12,fontWeight:600,color:'#475569',cursor:'pointer'}}>
          🔄 Aktualisieren
        </button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,borderBottom:'2px solid #F1F5F9',marginBottom:20}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{padding:'8px 16px',border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:tab===t.id?'#0A66C2':'#64748B',borderBottom:tab===t.id?'2px solid #0A66C2':'2px solid transparent',marginBottom:-2}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && stats && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* KPI Row 1 */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <MetricCard label="Leads gesamt"   value={stats.leads}      sub="importiert"        icon="👥" color="#0A66C2"/>
            <MetricCard label="HOT Leads"      value={stats.hot}        sub="Score ≥ 50"        icon="🔥" color="#EF4444"/>
            <MetricCard label="WARM Leads"     value={stats.warm}       sub="Score 25-49"       icon="⚡" color="#F59E0B"/>
            <MetricCard label="Vernetzt"       value={stats.connected}  sub="Connected"         icon="🤝" color="#22C55E"/>
            <MetricCard label="Akzeptanzrate"  value={stats.acceptRate+'%'} sub={stats.verns+' Anfragen'} icon="📈"/>
          </div>
          {/* KPI Row 2 */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <MetricCard label="Texte generiert" value={stats.contents}  sub="letzter Monat"     icon="✍️" color="#8B5CF6"/>
            <MetricCard label="Brand Voice Rate" value={stats.bvRate+'%'} sub="mit Brand Voice" icon="🎙️" color="#0A66C2"/>
            <MetricCard label="Pending"          value={stats.pending}  sub="offene Anfragen"   icon="⏳" color="#F59E0B"/>
            <MetricCard label="AI Tokens"        value={(stats.tokensTotal/1000).toFixed(1)+'k'} sub="verbraucht" icon="🤖"/>
          </div>

          {/* Activity chart */}
          <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px'}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>AI-Nutzung letzte 7 Tage</div>
            <div style={{display:'flex',alignItems:'flex-end',gap:8,height:80}}>
              {stats.daily.map(d => {
                const maxVal = Math.max(...stats.daily.map(x => x.count), 1)
                const h = Math.max(4, (d.count / maxVal) * 72)
                return (
                  <div key={d.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <div style={{fontSize:10,color:'#94A3B8',fontWeight:600}}>{d.count||''}</div>
                    <div style={{width:'100%',height:h+'px',background:d.count>0?'linear-gradient(180deg,#0A66C2,#3B82F6)':'#F1F5F9',borderRadius:'4px 4px 0 0',transition:'height 0.4s'}}/>
                    <div style={{fontSize:10,color:'#94A3B8'}}>{d.key}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Content by type */}
          {Object.keys(stats.contentByType).length > 0 && (
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px'}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Content nach Template</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {Object.entries(stats.contentByType).sort((a,b)=>b[1]-a[1]).map(([type,count]) => {
                  const total = Object.values(stats.contentByType).reduce((s,v)=>s+v,0)
                  return (
                    <div key={type} style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{minWidth:130,fontSize:12,fontWeight:600,color:'#475569'}}>{type}</div>
                      <div style={{flex:1,height:8,background:'#F1F5F9',borderRadius:999,overflow:'hidden'}}>
                        <div style={{width:((count/total)*100)+'%',height:'100%',background:'linear-gradient(90deg,#8B5CF6,#0A66C2)',borderRadius:999}}/>
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:'#0A66C2',minWidth:24}}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LEADS TAB */}
      {tab === 'leads' && (
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700,fontSize:14}}>🏆 Top Leads nach Score</div>
            <div style={{fontSize:11,color:'#94A3B8'}}>Automatisch berechnet aus {stats?.leads||0} Regeln</div>
          </div>
          <div>
            {topLeads.length === 0
              ? <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>Keine Leads mit Score gefunden. Leads importieren und Scoring-Regeln konfigurieren.</div>
              : topLeads.map((lead, i) => (
                  <div key={lead.id} style={{padding:'12px 18px',borderBottom:'1px solid #F8FAFC',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:i<3?'linear-gradient(135deg,#F59E0B,#EF4444)':'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:i<3?'#fff':'#94A3B8',flexShrink:0}}>
                      {i+1}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{lead.name||'Unbekannt'}</div>
                      <div style={{fontSize:11,color:'#64748B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.job_title || lead.headline}</div>
                    </div>
                    <div style={{minWidth:120}}>
                      <ScoreBar score={lead.lead_score||0}/>
                    </div>
                    <div style={{minWidth:80,textAlign:'right'}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,background:lead.connection_status==='connected'?'#F0FDF4':lead.connection_status==='pending'?'#FFFBEB':'#F8FAFC',color:lead.connection_status==='connected'?'#166534':lead.connection_status==='pending'?'#92400E':'#94A3B8',border:'1px solid '+(lead.connection_status==='connected'?'#BBF7D0':lead.connection_status==='pending'?'#FDE68A':'#E2E8F0')}}>
                        {lead.connection_status==='connected'?'Vernetzt':lead.connection_status==='pending'?'Pending':'Offen'}
                      </span>
                    </div>
                    {lead.linkedin_url && (
                      <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#0A66C2',fontWeight:600,textDecoration:'none',flexShrink:0}}>
                        LinkedIn →
                      </a>
                    )}
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* CONTENT TAB */}
      {tab === 'content' && (
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F5F9',fontWeight:700,fontSize:14}}>
            ✍️ Generierter Content — Verlauf
          </div>
          {content.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>Noch kein Content generiert.</div>
            : content.map(c => (
                <div key={c.id} style={{padding:'12px 18px',borderBottom:'1px solid #F8FAFC'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'#EFF6FF',color:'#0A66C2'}}>{c.template_label||c.content_type||'Post'}</span>
                      {c.brand_voice_snapshot && <span style={{fontSize:10,padding:'2px 7px',borderRadius:999,background:'#F0FDF4',color:'#166534',border:'1px solid #BBF7D0'}}>BV aktiv</span>}
                    </div>
                    <span style={{fontSize:11,color:'#94A3B8'}}>{new Date(c.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* USAGE TAB */}
      {tab === 'usage' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'18px 20px'}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>AI-Nutzung letzte 7 Tage</div>
            <div style={{display:'flex',alignItems:'flex-end',gap:10,height:120}}>
              {usage.map(d => {
                const maxVal = Math.max(...usage.map(x => x.count), 1)
                const h = Math.max(4, (d.count / maxVal) * 100)
                return (
                  <div key={d.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                    <div style={{fontSize:12,color:'#64748B',fontWeight:700}}>{d.count||'-'}</div>
                    <div style={{width:'100%',height:h+'px',background:d.count>0?'linear-gradient(180deg,#8B5CF6,#0A66C2)':'#F1F5F9',borderRadius:'6px 6px 0 0',minHeight:4}}/>
                    <div style={{fontSize:11,color:'#94A3B8'}}>{d.key}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {stats && (
            <div style={{display:'flex',gap:12}}>
              <MetricCard label="AI Calls (30d)"  value={stats.contents} sub="Generierungen" icon="⚡" color="#8B5CF6"/>
              <MetricCard label="Tokens (30d)"    value={(stats.tokensTotal/1000).toFixed(1)+'k'} sub="verbraucht" icon="🔢"/>
              <MetricCard label="Brand Voice"     value={stats.bvRate+'%'} sub="aller Texte mit BV" icon="🎙️" color="#22C55E"/>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
