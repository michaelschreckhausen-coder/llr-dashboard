import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const TASK_ICONS  = { comment:'💬', lead:'👤', profile:'🔍', message:'✉️', post:'✏️' }
const TASK_COLORS = { comment:'#0a66c2', lead:'#057642', profile:'#b25e09', message:'#7c3aed', post:'#be185d' }

function KPICard({ icon, label, value, sub, color='#0a66c2' }) {
  return (
    <div className="card" style={{ padding:'20px 22px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:26 }}>{icon}</div>
        <div>
          <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value ?? '–'}</div>
          <div style={{ fontSize:12, color:'#888', marginTop:3 }}>{label}</div>
          {sub && <div style={{ fontSize:11, color:'#aaa', marginTop:1 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, onIncrement }) {
  const pct   = task.target > 0 ? Math.round((task.progress / task.target) * 100) : 0
  const color = TASK_COLORS[task.type] || '#0a66c2'
  return (
    <div style={{ padding:'12px 14px', borderRadius:10, background:task.completed?'#f0faf4':'#fafafa', border:`1.5px solid ${task.completed?'#b7dfcb':'#eee'}`, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ fontSize:20, flexShrink:0 }}>{TASK_ICONS[task.type]}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
          <div style={{ fontSize:13, fontWeight:600, color:task.completed?'#057642':'#1a1a1a' }}>{task.completed&&'✅ '}{task.title}</div>
          <div style={{ fontSize:12, color:'#888', flexShrink:0, marginLeft:8 }}>{task.progress}/{task.target}</div>
        </div>
        <div style={{ height:6, background:'#e8e8e8', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:task.completed?'#057642':color, borderRadius:3, transition:'width 0.4s ease' }}/>
        </div>
      </div>
      {!task.completed && (
        <button onClick={()=>onIncrement(task.type)}
          style={{ background:color, color:'#fff', border:'none', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>+1</button>
      )}
    </div>
  )
}

export default function Dashboard({ session }) {
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
    const [s, t, w] = await Promise.all([
      supabase.rpc('get_dashboard_stats', { p_user_id: uid }),
      supabase.from('tasks').select('id,title,type,target_value,current_value,completed').eq('user_id',uid).eq('date',today).order('completed').order('type'),
      supabase.from('weekly_activity').select('week_start,comments,leads_added,tasks_done').eq('user_id',uid).order('week_start',{ascending:true}).limit(8),
    ])
    setStats(s.data)
    setTasks((t.data||[]).map(x=>({ id:x.id, title:x.title, type:x.type, target:x.target_value, progress:x.current_value, completed:x.completed })))
    setWeekly(w.data||[])
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
    week: new Date(w.week_start).toLocaleDateString('de-DE',{day:'numeric',month:'short'}),
    Kommentare: w.comments, Leads: w.leads_added, Aufgaben: w.tasks_done,
  }))

  const done  = tasks.filter(t=>t.completed).length
  const total = tasks.length
  const score = stats?.engagementScore || 0

  if (loading) return <div style={{color:'#aaa',padding:40,textAlign:'center'}}>⏳ Lade Dashboard...</div>

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Dashboard</h1>
        <div style={{ color:'#888', fontSize:14 }}>Willkommen zurück, {session.user.email.split('@')[0]}! 👋</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:14, marginBottom:28 }}>
        <KPICard icon="👥" label="Leads gesamt"      value={stats?.leadsTotal??0}          color="#0a66c2"/>
        <KPICard icon="💬" label="Kommentare Woche"  value={stats?.commentsThisWeek??0}    color="#057642"/>
        <KPICard icon="✅" label="Tasks heute"        value={`${done}/${total}`}            color="#b25e09" sub="erledigt"/>
        <KPICard icon="⚡" label="Engagement Score"   value={score}                          color="#7c3aed" sub="Komm×2 + Leads×3"/>
        <KPICard icon="📈" label="Leads diese Woche"  value={stats?.leadsThisWeek??0}       color="#be185d"/>
      </div>

      {/* Tasks + Chart */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:700 }}>📋 Tägliche Aufgaben</div>
            <div style={{ fontSize:12, padding:'3px 10px', borderRadius:12, background:done===total&&total>0?'#e6f4ee':'#f0f7ff', color:done===total&&total>0?'#057642':'#0a66c2', fontWeight:700 }}>{done}/{total} ✓</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {tasks.map(t => <TaskRow key={t.id} task={t} onIncrement={incrementTask}/>)}
          </div>
          {done===total&&total>0&&(
            <div style={{ marginTop:12, padding:'10px 14px', background:'linear-gradient(135deg,#057642,#04a06b)', borderRadius:10, color:'#fff', fontSize:13, fontWeight:700, textAlign:'center' }}>
              🎉 Alle Aufgaben erledigt! Großartige Arbeit!
            </div>
          )}
        </div>

        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>📊 Wöchentliche Aktivität</div>
          {chartData.length>0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barSize={14}>
                  <XAxis dataKey="week" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis hide allowDecimals={false}/>
                  <Tooltip contentStyle={{borderRadius:8,border:'1px solid #e0e0e0',fontSize:12}} cursor={{fill:'#f0f7ff'}}/>
                  <Bar dataKey="Kommentare" fill="#0a66c2" radius={[4,4,0,0]}/>
                  <Bar dataKey="Leads"      fill="#057642" radius={[4,4,0,0]}/>
                  <Bar dataKey="Aufgaben"   fill="#b25e09" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:16, marginTop:8, justifyContent:'center' }}>
                {[['#0a66c2','Kommentare'],['#057642','Leads'],['#b25e09','Aufgaben']].map(([c,l])=>(
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#666' }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:c }}/>{l}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'#aaa', fontSize:13, flexDirection:'column', gap:8 }}>
              <div style={{fontSize:32}}>📊</div>Noch keine Aktivitätsdaten.<br/>Starte deine erste Routine!
            </div>
          )}
        </div>
      </div>

      {/* Engagement Score Bar */}
      <div className="card" style={{ padding:'16px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>⚡ Engagement Score dieser Woche</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#7c3aed' }}>{score}</div>
        </div>
        <div style={{ height:10, background:'#f0eaff', borderRadius:5, overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:5, width:`${Math.min(100,(score/50)*100)}%`, background:'linear-gradient(90deg,#7c3aed,#a855f7)', transition:'width 0.6s ease' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:11, color:'#bbb' }}>
          <span>0</span><span>Kommentare×2 + Leads×3</span><span>50+</span>
        </div>
      </div>
    </div>
  )
}
