import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const TASK_COLORS = {
  comment: '#0A66C2', lead: '#10B981', profile: '#F59E0B',
  message: '#8B5CF6', post: '#EC4899',
}
const TASK_ICONS = { comment: '💬', lead: '👤', profile: '🔍', message: '✉️', post: '✏️' }

function KPICard({ icon, label, value, sub, color = '#0A66C2' }) {
  return (
    <div
      style={{ background:'#FFFFFF', borderRadius:12, padding:'20px 22px', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', transition:'all 0.2s', cursor:'default' }}
      onMouseOver={e => { e.currentTarget.style.boxShadow='0 4px 12px rgba(15,23,42,0.10)'; e.currentTarget.style.transform='translateY(-1px)'; }}
      onMouseOut={e => { e.currentTarget.style.boxShadow='0 1px 3px rgba(15,23,42,0.06)'; e.currentTarget.style.transform='translateY(0)'; }}
    >
      <div style={{ display:'flex', alignItems:'flex-start', marginBottom:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, background:color+'15', flexShrink:0 }}>{icon}</div>
      </div>
      <div style={{ fontSize:30, fontWeight:800, color:'#0F172A', letterSpacing:'-0.03em', lineHeight:1 }}>{value ?? '–'}</div>
      <div style={{ fontSize:13, color:'#64748B', marginTop:5, fontWeight:500 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function TaskRow({ task, onIncrement }) {
  const pct   = task.target > 0 ? Math.min(100, Math.round((task.progress / task.target) * 100)) : 0
  const color = TASK_COLORS[task.type] || '#0A66C2'
  return (
    <div style={{ padding:'12px 14px', borderRadius:10, background:task.completed?'#F0FDF4':'#F8FAFC', border:'1px solid '+(task.completed?'#A7F3D0':'#E2E8F0'), display:'flex', alignItems:'center', gap:12, transition:'all 0.15s' }}>
      <div style={{ width:36, height:36, borderRadius:9, flexShrink:0, background:task.completed?'#DCFCE7':color+'15', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
        {task.completed ? '✓' : TASK_ICONS[task.type]}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <div style={{ fontSize:13, fontWeight:600, color:task.completed?'#065F46':'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</div>
          <div style={{ fontSize:12, fontWeight:700, color:task.completed?'#10B981':'#64748B', flexShrink:0, marginLeft:8 }}>{task.progress}/{task.target}</div>
        </div>
        <div style={{ height:5, background:'#E2E8F0', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:pct+'%', background:task.completed?'#10B981':color, borderRadius:999, transition:'width 0.4s ease' }}/>
        </div>
      </div>
      {!task.completed && (
        <button onClick={() => onIncrement(task.type)}
          style={{ background:color, color:'#fff', border:'none', borderRadius:8, padding:'5px 12px', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0, transition:'all 0.15s' }}
          onMouseOver={e => e.currentTarget.style.transform='scale(1.06)'}
          onMouseOut={e => e.currentTarget.style.transform='scale(1)'}
        >+1</button>
      )}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'10px 14px', boxShadow:'0 4px 12px rgba(15,23,42,0.1)', fontSize:12 }}>
      <div style={{ fontWeight:700, color:'#0F172A', marginBottom:6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
          <div style={{ width:8, height:8, borderRadius:2, background:p.fill }}/>
          <span style={{ color:'#64748B' }}>{p.dataKey}:</span>
          <span style={{ fontWeight:700, color:'#0F172A' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard({ session }) {
  const [hotLeads, setHotLeads] = useState([])
  const [stats,   setStats]   = useState(null)
  const [tasks,   setTasks]   = useState([])
  const [weekly,  setWeekly]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const uid = session.user.id
    await supabase.rpc('ensure_daily_tasks', { p_user_id: uid })
    const today = new Date().toISOString().split('T')[0]
    const [s, t, w, hotLeads] = await Promise.all([
      supabase.rpc('get_dashboard_stats', { p_user_id: uid }),
      supabase.from('tasks').select('id,title,type,target_value,current_value,completed').eq('user_id', uid).eq('date', today).order('completed').order('type'),
      supabase.from('weekly_activity').select('week_start,comments,leads_added,tasks_done').eq('user_id', uid).order('week_start', { ascending: true }).limit(8),
    ])
      const hotLeadsData = (await supabase.from('leads').select('id,first_name,last_name,name,job_title,headline,lead_score,connection_status,linkedin_url,status,icp_match').eq('user_id', uid).gte('lead_score', 25).order('lead_score', {ascending:false}).limit(5)).data || []
  setHotLeads(hotLeadsData)
setStats(s.data)
    setTasks((t.data || []).map(x => ({ id: x.id, title: x.title, type: x.type, target: x.target_value, progress: x.current_value, completed: x.completed })))
    setWeekly(w.data || [])
    setLoading(false)
  }

  async function incrementTask(type) {
    const uid = session.user.id
    await supabase.rpc('increment_task', { p_user_id: uid, p_type: type, p_amount: 1 })
    setTasks(prev => prev.map(t => {
      if (t.type !== type) return t
      const p = Math.min(t.progress + 1, t.target)
      return { ...t, progress: p, completed: p >= t.target }
    }))
    const { data } = await supabase.rpc('get_dashboard_stats', { p_user_id: uid })
    setStats(data)
  }

  const chartData = weekly.map(w => ({
    week: new Date(w.week_start).toLocaleDateString('de-DE', { day:'numeric', month:'short' }),
    Kommentare: w.comments, Leads: w.leads_added, Aufgaben: w.tasks_done,
  }))

  const done  = tasks.filter(t => t.completed).length
  const total = tasks.length
  const score = stats?.engagementScore || 0
  const name  = session.user.email.split('@')[0]

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'#94A3B8', gap:10, fontSize:14 }}>
      ⏳ Lade Dashboard…
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* ── Welcome Banner ── */}
      <div style={{
        background:'linear-gradient(135deg, #0A66C2 0%, #1D4ED8 60%, #3B82F6 100%)',
        borderRadius:16, padding:'28px 32px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        boxShadow:'0 4px 20px rgba(10,102,194,0.28)', position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', right:-40, top:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', right:80, bottom:-50, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }}/>
        <div style={{ zIndex:1 }}>
          <div style={{ fontSize:22, fontWeight:800, color:'#fff', letterSpacing:'-0.02em', marginBottom:4 }}>
            Willkommen, {name}! 👋
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.8)', fontWeight:400 }}>
            Mehr Leads. Mehr Sichtbarkeit. Mehr Umsatz.
          </div>
        </div>
        <div style={{ background:'rgba(255,255,255,0.15)', backdropFilter:'blur(8px)', borderRadius:12, padding:'14px 22px', textAlign:'center', border:'1px solid rgba(255,255,255,0.2)', flexShrink:0, zIndex:1 }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.03em' }}>{done}/{total}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', marginTop:2 }}>Tasks heute</div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:14 }}>
        <KPICard icon="👥" label="Leads gesamt"      value={stats?.leadsTotal ?? 0}       color="#0A66C2"/>
        <KPICard icon="🔥" label='SQL Leads'  value={stats?.leadsHot ?? 0}  color="#EF4444" sub="Status = SQL"/>
        <KPICard icon="⚡" label='MQL Leads' value={stats?.leadsWarm ?? 0} color="#F59E0B" sub="Status = MQL"/>
        <KPICard icon="💬" label="Kommentare Woche"  value={stats?.commentsThisWeek ?? 0}  color="#10B981"/>
        <KPICard icon="📊" label="Ø Lead Score" value={stats?.avgLeadScore ?? 0} color="#8B5CF6" sub="Durchschnitt"/>
        <KPICard icon="✅" label="Tasks heute"        value={done+'/'+total}               color="#F59E0B" sub="erledigt"/>
        <KPICard icon="⚡" label="Engagement Score"  value={score}                         color="#8B5CF6" sub="Komm×2 + Leads×3"/>
        <KPICard icon="📈" label="Leads diese Woche" value={stats?.leadsThisWeek ?? 0}     color="#EC4899"/>
      </div>

      {/* ── Tasks + Chart ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:20 }}>

        {/* Daily Tasks */}
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0F172A', display:'flex', alignItems:'center', gap:7 }}>
              <span>📋</span> Tägliche Aufgaben
            </div>
            <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:999, background:done===total&&total>0?'#DCFCE7':'#EFF6FF', color:done===total&&total>0?'#065F46':'#1D4ED8', border:'1px solid '+(done===total&&total>0?'#A7F3D0':'#BFDBFE') }}>
              {done}/{total} ✓
            </span>
          </div>
          <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
            {tasks.map(t => <TaskRow key={t.id} task={t} onIncrement={incrementTask}/>)}
          </div>
          {done === total && total > 0 && (
            <div style={{ margin:'0 16px 16px', padding:'12px 16px', background:'linear-gradient(135deg, #065F46, #059669)', borderRadius:10, color:'#fff', fontSize:13, fontWeight:700, textAlign:'center', boxShadow:'0 2px 8px rgba(16,185,129,0.3)' }}>
              🎉 Alle Aufgaben erledigt! Hervorragend!
            </div>
          )}
        </div>

        {/* Weekly Chart */}
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0F172A', display:'flex', alignItems:'center', gap:7 }}>
              <span>📊</span> Wöchentliche Aktivität
            </div>
            <div style={{ display:'flex', gap:12 }}>
              {[['#0A66C2','Komm.'],['#10B981','Leads'],['#F59E0B','Tasks']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#64748B', fontWeight:600 }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:c }}/>{l}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding:'16px 20px' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barSize={12} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="week" tick={{ fontSize:11, fill:'#94A3B8', fontWeight:500 }} axisLine={false} tickLine={false}/>
                  <YAxis hide allowDecimals={false}/>
                  <Tooltip content={<CustomTooltip />} cursor={{ fill:'#F8FAFC', radius:4 }}/>
                  <Bar dataKey="Kommentare" fill="#0A66C2" radius={[4,4,0,0]}/>
                  <Bar dataKey="Leads"      fill="#10B981" radius={[4,4,0,0]}/>
                  <Bar dataKey="Aufgaben"   fill="#F59E0B" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'#94A3B8' }}>
                <div style={{ fontSize:36 }}>📊</div>
                <div style={{ fontSize:13, fontWeight:600 }}>Noch keine Aktivitätsdaten</div>
                <div style={{ fontSize:12 }}>Starte deine erste Routine!</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Engagement Score ── */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'18px 22px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>⚡</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#0F172A' }}>Engagement Score</div>
              <div style={{ fontSize:12, color:'#64748B' }}>Kommentare × 2 + Leads × 3</div>
            </div>
          </div>
          <div style={{ fontSize:30, fontWeight:800, color:'#8B5CF6', letterSpacing:'-0.03em' }}>{score}</div>
        </div>
        <div style={{ height:8, background:'#F1F5F9', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:999, width:Math.min(100,(score/50)*100)+'%', background:'linear-gradient(90deg, #8B5CF6, #A855F7)', transition:'width 0.6s ease' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'#CBD5E1', fontWeight:600 }}>
          <span>0</span><span style={{ color:'#94A3B8' }}>Ziel: 50+</span><span>50+</span>
        </div>
      </div>
    
      {/* HOT LEADS WIDGET */}
      {hotLeads && hotLeads.length > 0 && (
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',marginTop:16,overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:7}}>
              🔥 HOT Leads
              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA'}}>{hotLeads.length} WARM+</span>
            </div>
            <a href="/reports" style={{fontSize:11,color:'#0A66C2',fontWeight:700,textDecoration:'none'}}>Alle ansehen →</a>
          </div>
          <div>
            {hotLeads.map((lead, i) => (
              <div key={lead.id} style={{padding:'9px 16px',borderBottom:'1px solid #F8FAFC',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:lead.lead_score>=50?'linear-gradient(135deg,#EF4444,#F59E0B)':'linear-gradient(135deg,#F59E0B,#FCD34D)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:'#fff',flexShrink:0}}>{lead.lead_score}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fullName(lead)}</div>
                  <div style={{fontSize:10,color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.job_title || lead.headline}</div>
                </div>
                {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{fontSize:10,color:'#0A66C2',fontWeight:600,textDecoration:'none',flexShrink:0}}>→</a>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
