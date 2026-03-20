import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const StatCard = ({ icon, label, value, color='#0a66c2', sub }) => (
  <div className="card" style={{padding:'20px 24px'}}>
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      <div style={{fontSize:28}}>{icon}</div>
      <div>
        <div style={{fontSize:26,fontWeight:700,color}}>{value ?? '–'}</div>
        <div style={{fontSize:13,color:'#888'}}>{label}</div>
        {sub && <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{sub}</div>}
      </div>
    </div>
  </div>
)

export default function Dashboard({ session }) {
  const [stats,    setStats]    = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [activity, setActivity] = useState([])
  const [leads,    setLeads]    = useState([])
  const [comments, setComments] = useState([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const uid = session.user.id

    // Stats
    const { data: st } = await supabase.rpc('get_dashboard_stats', { p_user_id: uid })
    setStats(st)

    // Profile + plan
    const { data: pr } = await supabase
      .from('profiles').select('plan_id, plans(name, daily_limit)')
      .eq('id', uid).single()
    setProfile(pr)

    // Activity last 7 days
    const since = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const { data: usage } = await supabase
      .from('usage').select('created_at, action')
      .eq('user_id', uid).gte('created_at', since)
    if (usage) {
      const days = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const key = d.toLocaleDateString('de-DE', { weekday:'short' })
        days[key] = 0
      }
      usage.forEach(u => {
        const key = new Date(u.created_at).toLocaleDateString('de-DE', { weekday:'short' })
        if (key in days) days[key]++
      })
      setActivity(Object.entries(days).map(([name, count]) => ({ name, count })))
    }

    // Recent leads
    const { data: ld } = await supabase.from('leads')
      .select('*').eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(5)
    setLeads(ld || [])

    // Recent comments
    const { data: cm } = await supabase.from('saved_comments')
      .select('*').eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(5)
    setComments(cm || [])
  }

  const planName = profile?.plans?.name || 'Free'
  const limit    = profile?.plans?.daily_limit ?? 10

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Dashboard</h1>
        <div style={{color:'#888',fontSize:14}}>
          Willkommen zurück, {session.user.email.split('@')[0]}!
          {' '}<span style={{background:'#e8f0fb',color:'#0a66c2',padding:'2px 10px',borderRadius:12,fontSize:11,fontWeight:700}}>{planName}</span>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16,marginBottom:28}}>
        <StatCard icon="👥" label="Leads gesamt"    value={stats?.total_leads ?? 0}    color="#0a66c2"/>
        <StatCard icon="💬" label="Kommentare"       value={stats?.total_comments ?? 0} color="#057642"/>
        <StatCard icon="✅" label="Verwendet"        value={stats?.used_comments ?? 0}  color="#057642"/>
        <StatCard icon="📈" label="Diese Woche"      value={stats?.comments_this_week ?? 0} color="#b25e09"
          sub={limit === -1 ? 'Unlimitiert' : `${limit}/Tag Limit`}/>
      </div>

      {/* Charts + Recent */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:28}}>
        {/* Activity chart */}
        <div className="card" style={{padding:'20px 24px'}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:16}}>Aktivität (letzte 7 Tage)</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={activity} barSize={24}>
              <XAxis dataKey="name" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis hide allowDecimals={false}/>
              <Tooltip cursor={{fill:'#f0f7ff'}} contentStyle={{borderRadius:8,border:'1px solid #e0e0e0',fontSize:12}}/>
              <Bar dataKey="count" fill="#0a66c2" radius={[4,4,0,0]} name="Generierungen"/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lead status */}
        <div className="card" style={{padding:'20px 24px'}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:16}}>Lead Status</div>
          {stats?.leads_by_status ? (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {Object.entries(stats.leads_by_status).map(([status, count]) => (
                <div key={status} style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1,fontSize:13,color:'#555',textTransform:'capitalize'}}>{status}</div>
                  <div style={{width:`${Math.max(8, (count/Math.max(...Object.values(stats.leads_by_status)))*120)}px`,height:8,borderRadius:4,background:'#0a66c2',opacity:0.7}}/>
                  <div style={{fontSize:13,fontWeight:600,width:24,textAlign:'right'}}>{count}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{color:'#aaa',fontSize:13}}>Noch keine Leads vorhanden</div>
          )}
        </div>
      </div>

      {/* Recent leads & comments */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div className="card">
          <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:600}}>Neueste Leads</div>
            <a href="/leads" style={{fontSize:12,color:'#0a66c2'}}>Alle anzeigen →</a>
          </div>
          {leads.length === 0 ? (
            <div style={{padding:'20px',color:'#aaa',fontSize:13,textAlign:'center'}}>Noch keine Leads gespeichert</div>
          ) : leads.map(l => (
            <div key={l.id} style={{padding:'12px 20px',borderBottom:'1px solid #f8f8f8',display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'#e8f0fb',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#0a66c2',flexShrink:0}}>
                {l.name.charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.name}</div>
                <div style={{fontSize:11,color:'#888',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.company || l.headline || '–'}</div>
              </div>
              <span className={`badge badge-${l.status}`}>{l.status}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:600}}>Neueste Kommentare</div>
            <a href="/comments" style={{fontSize:12,color:'#0a66c2'}}>Alle anzeigen →</a>
          </div>
          {comments.length === 0 ? (
            <div style={{padding:'20px',color:'#aaa',fontSize:13,textAlign:'center'}}>Noch keine Kommentare gespeichert</div>
          ) : comments.map(c => (
            <div key={c.id} style={{padding:'12px 20px',borderBottom:'1px solid #f8f8f8'}}>
              <div style={{fontSize:12,color:'#555',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                {c.comment_text}
              </div>
              <div style={{fontSize:11,color:'#aaa',marginTop:4}}>
                {c.post_author && `für ${c.post_author} · `}
                {new Date(c.created_at).toLocaleDateString('de-DE')}
                {c.used && <span style={{marginLeft:6,color:'#057642',fontWeight:600}}>✓ verwendet</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
