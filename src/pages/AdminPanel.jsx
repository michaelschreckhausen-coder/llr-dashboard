import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
const IND = 'rgb(49,90,231)'
export default function AdminPanel({ session }) {
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [licenses, setLicenses] = useState([])
  const [stats, setStats] = useState({ users:0, teams:0, licenses:0, assigned:0 })
  const [tab, setTab] = useState('users')
  const [flash, setFlash] = useState(null)
  const [newTeam, setNewTeam] = useState('')
  const [newLic, setNewLic] = useState({ teamId:'', seats:'5', feature:'full_access' })
  const flash_ = (msg,type) => { setFlash({msg,type:type||'ok'}); setTimeout(()=>setFlash(null),4000) }
  useEffect(()=>{ load() },[])
  async function load() {
    const [a,b,c,d] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at',{ascending:false}),
      supabase.from('teams').select('*').order('created_at',{ascending:false}),
      supabase.from('licenses').select('*, teams(name)').order('created_at',{ascending:false}),
      supabase.from('license_assignments').select('id').eq('is_active',true),
    ])
    setUsers(a.data||[]); setTeams(b.data||[]); setLicenses(c.data||[])
    setStats({ users:a.data?.length||0, teams:b.data?.length||0, licenses:c.data?.length||0, assigned:d.data?.length||0 })
  }
  async function setRole(id, role) {
    const {error} = await supabase.from('profiles').update({global_role:role}).eq('id',id)
    if(!error){flash_('Rolle aktualisiert');load()} else flash_(error.message,'err')
  }
  async function createTeam() {
    if(!newTeam.trim()) return
    const slug = newTeam.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-')
    const {error} = await supabase.from('teams').insert({name:newTeam,slug,owner_id:session.user.id,plan:'free',max_seats:5})
    if(!error){flash_('Team erstellt');setNewTeam('');load()} else flash_(error.message,'err')
  }
  async function createLic() {
    if(!newLic.teamId) return
    const {error} = await supabase.from('licenses').insert({team_id:newLic.teamId,total_seats:parseInt(newLic.seats),feature_key:newLic.feature,status:'active'})
    if(!error){flash_('Lizenz erstellt');setNewLic({teamId:'',seats:'5',feature:'full_access'});load()} else flash_(error.message,'err')
  }
  const rC={admin:'#7C3AED',team_member:'#2563EB',user:'#6B7280'}
  const rB={admin:'#EDE9FE',team_member:'#DBEAFE',user:'#F3F4F6'}
  return (
    <div style={{maxWidth:1100}}>
      <style>{`.at{padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-size:13px;font-weight:700}
        .at.on{background:rgb(49,90,231);color:white}
        .at:not(.on){background:white;color:#6B7280;border:1px solid #E5E7EB}
        .at:not(.on):hover{border-color:rgb(49,90,231);color:rgb(49,90,231)}
        .dt{width:100%;border-collapse:collapse;font-size:13px}
        .dt th{padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;background:#F9FAFB;border-bottom:1px solid #E5E7EB}
        .dt td{padding:10px 14px;border-bottom:1px solid #F9FAFB;color:rgb(20,20,43)}
        .dt tr:hover td{background:#F9FAFB}
        .bg{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700}
        .bx{padding:5px 11px;border-radius:8px;border:1px solid #E5E7EB;background:white;font-size:11px;font-weight:700;cursor:pointer;color:#374151}
        .bx:hover{border-color:rgb(49,90,231);color:rgb(49,90,231)}
        .bp{background:rgb(49,90,231);color:white;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}
        .ip{padding:9px 12px;border:1px solid #E5E7EB;border-radius:9px;font-size:13px;outline:none}`,
      }</style>
      {flash&&<div style={{marginBottom:16,padding:'10px 16px',borderRadius:10,fontSize:13,fontWeight:700,background:flash.type==='err'?'#FEF2F2':'#F0FDF4',color:flash.type==='err'?'#991B1B':'#065F46',border:'1px solid '+(flash.type==='err'?'#FCA5A5':'#A7F3D0')}}>{flash.msg}</div>}
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:26,fontWeight:900,margin:0,color:'rgb(20,20,43)',letterSpacing:'-0.03em'}}>Admin Panel</h1>
        <p style={{color:'#6B7280',fontSize:13,margin:'4px 0 0'}}>Plattform-Verwaltung aller Nutzer, Teams und Lizenzen.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
        {[{l:'Nutzer',v:stats.users,c:'#7C3AED'},{l:'Teams',v:stats.teams,c:'rgb(49,90,231)'},{l:'Lizenz-Pools',v:stats.licenses,c:'#059669'},{l:'Aktive Lizenzen',v:stats.assigned,c:'#F59E0B'}].map(s=>(
          <div key={s.l} style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:'18px 22px'}}>
            <div style={{fontSize:11,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6}}>{s.l}</div>
            <div style={{fontSize:30,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:18}}>
        {[['users','Nutzer'],['teams','Teams'],['licenses','Lizenzen']].map(([k,l])=>(
          <button key={k} className={'at'+(tab===k?' on':'')} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      {tab==='users'&&(
        <div style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:14,fontWeight:800}}>Alle Nutzer ({users.length})</div>
            <button className='bx' onClick={load}>Aktualisieren</button>
          </div>
          <table className='dt'><thead><tr><th>Name / E-Mail</th><th>Rolle</th><th>Seit</th><th>Aktionen</th></tr></thead>
          <tbody>{users.map(u=>(
            <tr key={u.id}>
              <td><div style={{fontWeight:700}}>{u.full_name||'—'}</div><div style={{color:'#6B7280',fontSize:11}}>{u.email}</div></td>
              <td><span className='bg' style={{background:rB[u.global_role||'user'],color:rC[u.global_role||'user']}}>{u.global_role||'user'}</span></td>
              <td style={{color:'#6B7280'}}>{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
              <td><div style={{display:'flex',gap:6}}>
                {u.global_role!=='admin'&&<button className='bx' style={{color:'#7C3AED',borderColor:'#DDD6FE'}} onClick={()=>setRole(u.id,'admin')}>Admin</button>}
                {u.global_role!=='team_member'&&<button className='bx' style={{color:'#2563EB',borderColor:'#BFDBFE'}} onClick={()=>setRole(u.id,'team_member')}>Team Admin</button>}
                {u.global_role!=='user'&&<button className='bx' onClick={()=>setRole(u.id,'user')}>User</button>}
              </div></td>
            </tr>
          ))}</tbody></table>
        </div>
      )}
      {tab==='teams'&&(
        <div>
          <div style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',fontSize:14,fontWeight:800}}>Alle Teams ({teams.length})</div>
            <table className='dt'><thead><tr><th>Name</th><th>Plan</th><th>Max Seats</th><th>Erstellt</th></tr></thead>
            <tbody>{teams.map(t=>(
              <tr key={t.id}><td><div style={{fontWeight:700}}>{t.name}</div><div style={{color:'#9CA3AF',fontSize:11}}>{t.slug}</div></td>
              <td><span className='bg' style={{background:'#EFF6FF',color:'#1D4ED8'}}>{t.plan}</span></td>
              <td style={{color:'#6B7280'}}>{t.max_seats}</td>
              <td style={{color:'#6B7280'}}>{new Date(t.created_at).toLocaleDateString('de-DE')}</td></tr>
            ))}</tbody></table>
          </div>
          <div style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:12}}>Neues Team erstellen</div>
            <div style={{display:'flex',gap:10}}>
              <input className='ip' style={{flex:1}} value={newTeam} onChange={e=>setNewTeam(e.target.value)} placeholder='Team-Name' onKeyDown={e=>e.key==='Enter'&&createTeam()}/>
              <button className='bp' onClick={createTeam}>Team erstellen</button>
            </div>
          </div>
        </div>
      )}
      {tab==='licenses'&&(
        <div>
          <div style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',fontSize:14,fontWeight:800}}>Lizenz-Pools ({licenses.length})</div>
            <table className='dt'><thead><tr><th>Team</th><th>Feature</th><th>Seats</th><th>Status</th><th>Gueltig bis</th></tr></thead>
            <tbody>{licenses.map(l=>(
              <tr key={l.id}>
                <td style={{fontWeight:700}}>{l.teams?.name||'—'}</td>
                <td><span className='bg' style={{background:'#F0FDF4',color:'#065F46'}}>{l.feature_key}</span></td>
                <td><div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:70,height:6,background:'#F3F4F6',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:(l.total_seats>0?l.used_seats/l.total_seats*100:0)+'%',height:'100%',background:l.used_seats/l.total_seats>.8?'#EF4444':'rgb(49,90,231)',borderRadius:3}}/>
                  </div>
                  <span style={{fontSize:11,color:'#6B7280'}}>{l.used_seats}/{l.total_seats}</span>
                </div></td>
                <td><span className='bg' style={{background:l.status==='active'?'#F0FDF4':'#FEF2F2',color:l.status==='active'?'#065F46':'#DC2626'}}>{l.status}</span></td>
                <td style={{color:'#6B7280'}}>{l.valid_until?new Date(l.valid_until).toLocaleDateString('de-DE'):'Unbegrenzt'}</td>
              </tr>
            ))}</tbody></table>
          </div>
          <div style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:12}}>Neue Lizenz erstellen</div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:10}}>
              <select className='ip' value={newLic.teamId} onChange={e=>setNewLic(p=>({...p,teamId:e.target.value}))}>
                <option value=''>Team waehlen...</option>
                {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input className='ip' type='number' value={newLic.seats} onChange={e=>setNewLic(p=>({...p,seats:e.target.value}))} min='1'/>
              <select className='ip' value={newLic.feature} onChange={e=>setNewLic(p=>({...p,feature:e.target.value}))}>
                <option value='full_access'>full_access</option>
                <option value='crm'>crm</option>
                <option value='ai'>ai</option>
              </select>
              <button className='bp' onClick={createLic}>Erstellen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
