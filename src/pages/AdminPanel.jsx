import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
const IND = 'rgb(49,90,231)'
export default function AdminPanel({ session }) {
  const [users,setUsers]=useState([])
  const [teams,setTeams]=useState([])
  const [licenses,setLicenses]=useState([])
  const [members,setMembers]=useState([])
  const [assignments,setAssignments]=useState([])
  const [stats,setStats]=useState({users:0,teams:0,licenses:0,assigned:0})
  const [tab,setTab]=useState('users')
  const [flash,setFlash]=useState(null)
  const [newTeam,setNewTeam]=useState('')
  const [newLic,setNewLic]=useState({teamId:'',seats:'5',feature:'linkedin_suite_free'})
  const [editUser,setEditUser]=useState(null)
  const [editLic,setEditLic]=useState(null)
  const flash_=(msg,type)=>{setFlash({msg,type:type||'ok'});setTimeout(()=>setFlash(null),4000)}
  useEffect(()=>{loadAll()},[]) 
  async function loadAll() {
    const [a,b,c,d,e,f]=await Promise.all([
      supabase.from('profiles').select('*').order('created_at',{ascending:false}),
      supabase.from('teams').select('*').order('created_at',{ascending:false}),
      supabase.from('licenses').select('*, teams(name)').order('created_at',{ascending:false}),
      supabase.from('license_assignments').select('id').eq('is_active',true),
      supabase.from('team_members').select('*, teams(name)').eq('is_active',true),
      supabase.from('license_assignments').select('*, licenses(feature_key,team_id), teams(name)').eq('is_active',true),
    ])
    setUsers(a.data||[]); setTeams(b.data||[]); setLicenses(c.data||[])
    setMembers(e.data||[]); setAssignments(f.data||[])
    setStats({users:a.data?.length||0,teams:b.data?.length||0,licenses:c.data?.length||0,assigned:d.data?.length||0})
  }
  async function saveUser(u) {
    const {error}=await supabase.from('profiles').update({full_name:u.full_name,email:u.email,global_role:u.global_role}).eq('id',u.id)
    if(error){flash_(error.message,'err');return}
    if(u.team_id!==undefined){
      await supabase.from('team_members').update({is_active:false}).eq('user_id',u.id)
      if(u.team_id){
        await supabase.from('team_members').upsert({team_id:u.team_id,user_id:u.id,role:u.team_role||'user',is_active:true},{onConflict:'team_id,user_id'})
      }
    }
    if(u.license_id!==undefined){
      await supabase.from('license_assignments').update({is_active:false,revoked_at:new Date().toISOString()}).eq('user_id',u.id)
      if(u.license_id){
        const lic=licenses.find(l=>l.id===u.license_id)
        if(lic) await supabase.from('license_assignments').upsert({license_id:u.license_id,user_id:u.id,team_id:lic.team_id,is_active:true,assigned_by:session.user.id},{onConflict:'license_id,user_id'})
      }
    }
    flash_('Benutzer gespeichert'); setEditUser(null); loadAll()
  }
  async function createTeam(){
    if(!newTeam.trim())return
    const slug=newTeam.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-')
    const{error}=await supabase.from('teams').insert({name:newTeam,slug,owner_id:session.user.id,plan:'free',max_seats:5})
    if(!error){flash_('Team erstellt');setNewTeam('');loadAll()}else flash_(error.message,'err')
  }
  async function createLic(){
    if(!newLic.teamId)return
    const{error}=await supabase.from('licenses').insert({team_id:newLic.teamId,total_seats:parseInt(newLic.seats),feature_key:newLic.feature,status:'active'})
    if(!error){flash_('Lizenz erstellt');setNewLic({teamId:'',seats:'5',feature:'full_access'});loadAll()}else flash_(error.message,'err')
  }
  async function deleteTeam(id, name) {
    if (!window.confirm('Team "' + name + '" wirklich löschen? Alle Mitglieder und Lizenzen werden getrennt.')) return
    const {error} = await supabase.from('teams').delete().eq('id',id)
    if(!error){flash_('Team gelöscht');loadAll()} else flash_(error.message,'err')
  }
  async function saveLicense(lic) {
    const {error} = await supabase.from('licenses').update({total_seats:parseInt(lic.total_seats),feature_key:lic.feature_key,status:lic.status}).eq('id',lic.id)
    if(!error){flash_('Lizenz gespeichert');setEditLic(null);loadAll()} else flash_(error.message,'err')
  }
  async function deleteLicense(id, feat) {
    if (!window.confirm('Lizenz "' + feat + '" wirklich löschen?')) return
    await supabase.from('license_assignments').update({is_active:false}).eq('license_id',id)
    const {error} = await supabase.from('licenses').delete().eq('id',id)
    if(!error){flash_('Lizenz gelöscht');loadAll()} else flash_(error.message,'err')
  }
  const rC={admin:'#7C3AED',team_member:'#2563EB',user:'#6B7280'}
  const rB={admin:'#EDE9FE',team_member:'#DBEAFE',user:'#F3F4F6'}
  const getUserTeam=(uid)=>members.find(m=>m.user_id===uid)
  const getUserLicenses=(uid)=>assignments.filter(a=>a.user_id===uid)
  return (
    <div style={{maxWidth:1100}}>
      <style>{`
        .at{padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all .15s}
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
        .ip{padding:9px 12px;border:1px solid #E5E7EB;border-radius:9px;font-size:13px;outline:none;width:100%;box-sizing:border-box}
        .ip:focus{border-color:rgb(49,90,231)}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center}
        .modal{background:white;border-radius:20px;padding:32px;width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.18)}
        .ml{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
        .mr{margin-bottom:18px}
        .ebtn{padding:5px 14px;border-radius:8px;border:1px solid rgb(49,90,231);background:white;font-size:11px;font-weight:700;cursor:pointer;color:rgb(49,90,231)}
        .ebtn:hover{background:rgb(49,90,231);color:white}
        .lbg{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#F0FDF4;color:#065F46}
      `}</style>
      {flash&&<div style={{marginBottom:16,padding:'10px 16px',borderRadius:10,fontSize:13,fontWeight:700,background:flash.type==='err'?'#FEF2F2':'#F0FDF4',color:flash.type==='err'?'#991B1B':'#065F46',border:'1px solid '+(flash.type==='err'?'#FCA5A5':'#A7F3D0')}}>{flash.msg}</div>}
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:26,fontWeight:900,margin:0,color:'rgb(20,20,43)',letterSpacing:'-0.03em'}}>Admin Panel</h1>
        <p style={{color:'#6B7280',fontSize:13,margin:'4px 0 0'}}>Plattform-Verwaltung aller Nutzer, Teams und Lizenzen.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
        {[{l:'Nutzer',v:stats.users,c:'#7C3AED'},{l:'Teams',v:stats.teams,c:IND},{l:'Lizenz-Pools',v:stats.licenses,c:'#059669'},{l:'Aktive Lizenzen',v:stats.assigned,c:'#F59E0B'}].map(s=>(
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
            <button className='bx' onClick={loadAll}>Aktualisieren</button>
          </div>
          <table className='dt'><thead><tr>
            <th>Name / E-Mail</th><th>Rolle</th><th>Team</th><th>Lizenzen</th><th>Seit</th><th>Aktion</th>
          </tr></thead><tbody>
          {users.map(u=>{
            const uT=getUserTeam(u.id)
            const uL=getUserLicenses(u.id)
            return(<tr key={u.id}>
              <td><div style={{fontWeight:700}}>{u.full_name||'—'}</div><div style={{color:'#6B7280',fontSize:11}}>{u.email}</div></td>
              <td><span className='bg' style={{background:rB[u.global_role||'user'],color:rC[u.global_role||'user']}}>{u.global_role||'user'}</span></td>
              <td>{uT?<div><div style={{fontSize:12,fontWeight:600}}>{uT.teams?.name}</div><span className='bg' style={{background:rB[uT.role||'user'],color:rC[uT.role||'user'],fontSize:10,marginTop:3}}>{uT.role}</span></div>:<span style={{color:'#D1D5DB',fontSize:12}}>kein Team</span>}</td>
              <td>{uL.length>0?uL.map(a=>(<span key={a.id} className='lbg'>{a.licenses?.feature_key||'?'}</span>)):<span style={{color:'#D1D5DB',fontSize:12}}>keine</span>}</td>
              <td style={{color:'#6B7280',fontSize:12}}>{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
              <td><button className='ebtn' onClick={()=>{const t=getUserTeam(u.id);const ls=getUserLicenses(u.id);setEditUser({...u,team_id:t?.team_id||'',team_role:t?.role||'user',license_id:ls[0]?.license_id||''})}}>Bearbeiten</button></td>
            </tr>)
          })}</tbody></table>
        </div>
      )}
      {tab==='teams'&&(
        <div>
          <div style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',fontSize:14,fontWeight:800}}>Alle Teams ({teams.length})</div>
            <table className='dt'><thead><tr><th>Name</th><th>Plan</th><th>Max Seats</th><th>Erstellt</th><th></th></tr></thead>
            <tbody>{teams.map(t=>(<tr key={t.id}><td><div style={{fontWeight:700}}>{t.name}</div><div style={{color:'#9CA3AF',fontSize:11}}>{t.slug}</div></td><td><span className='bg' style={{background:'#EFF6FF',color:'#1D4ED8'}}>{t.plan}</span></td><td style={{color:'#6B7280'}}>{t.max_seats}</td><td style={{color:'#6B7280',fontSize:12}}>{new Date(t.created_at).toLocaleDateString('de-DE')}</td><td><button onClick={()=>deleteTeam(t.id,t.name)} style={{padding:'4px 10px',borderRadius:7,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#DC2626',fontSize:11,fontWeight:700,cursor:'pointer'}}>Löschen</button></td></tr>))}</tbody>
            </table>
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
            <table className='dt'><thead><tr><th>Team</th><th>Feature</th><th>Seats</th><th>Status</th><th>Gueltig bis</th><th></th></tr></thead>
            <tbody>{licenses.map(l=>(<tr key={l.id}><td style={{fontWeight:700}}>{l.teams?.name||'—'}</td><td><span className='bg' style={{background:'#F0FDF4',color:'#065F46'}}>{l.feature_key}</span></td><td><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:70,height:6,background:'#F3F4F6',borderRadius:3,overflow:'hidden'}}><div style={{width:(l.total_seats>0?l.used_seats/l.total_seats*100:0)+'%',height:'100%',background:l.used_seats/l.total_seats>.8?'#EF4444':IND,borderRadius:3}}/></div><span style={{fontSize:11,color:'#6B7280'}}>{l.used_seats}/{l.total_seats}</span></div></td><td><span className='bg' style={{background:l.status==='active'?'#F0FDF4':'#FEF2F2',color:l.status==='active'?'#065F46':'#DC2626'}}>{l.status}</span></td><td style={{color:'#6B7280',fontSize:12}}>{l.valid_until?new Date(l.valid_until).toLocaleDateString('de-DE'):'Unbegrenzt'}</td><td><div style={{display:'flex',gap:6}}><button onClick={()=>setEditLic({...l})} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgb(49,90,231)',background:'white',color:'rgb(49,90,231)',fontSize:11,fontWeight:700,cursor:'pointer'}}>Bearbeiten</button><button onClick={()=>deleteLicense(l.id,l.feature_key)} style={{padding:'4px 10px',borderRadius:7,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#DC2626',fontSize:11,fontWeight:700,cursor:'pointer'}}>Löschen</button></div></td></tr>))}</tbody>
            </table>
          </div>
          <div style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:12}}>Neue Lizenz erstellen</div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:10}}>
              <select className='ip' value={newLic.teamId} onChange={e=>setNewLic(p=>({...p,teamId:e.target.value}))}><option value=''>Team waehlen...</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input className='ip' type='number' value={newLic.seats} onChange={e=>setNewLic(p=>({...p,seats:e.target.value}))} min='1' placeholder='Seats'/>
              <select className='ip' value={newLic.feature} onChange={e=>setNewLic(p=>({...p,feature:e.target.value}))}><option value='linkedin_suite_free'>LinkedIn Suite Free</option><option value='linkedin_suite_basic'>LinkedIn Suite Basic</option><option value='linkedin_suite_pro'>LinkedIn Suite Pro</option><option value='enterprise'>Enterprise</option></select>
              <button className='bp' onClick={createLic}>Erstellen</button>
            </div>
          </div>
        </div>
      )}
      {editUser&&(
        <div className='overlay' onClick={e=>e.target===e.currentTarget&&setEditUser(null)}>
          <div className='modal'>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div><div style={{fontSize:18,fontWeight:900,color:'rgb(20,20,43)'}}>Benutzer bearbeiten</div><div style={{fontSize:12,color:'#6B7280',marginTop:2}}>{editUser.email}</div></div>
              <button onClick={()=>setEditUser(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9CA3AF',lineHeight:1}}>&#x2715;</button>
            </div>
            <div className='mr'><div className='ml'>Name</div><input className='ip' value={editUser.full_name||''} onChange={e=>setEditUser(p=>({...p,full_name:e.target.value}))} placeholder='Vollstandiger Name'/></div>
            <div className='mr'><div className='ml'>E-Mail</div><input className='ip' value={editUser.email||''} onChange={e=>setEditUser(p=>({...p,email:e.target.value}))} placeholder='E-Mail Adresse'/></div>
            <div className='mr'><div className='ml'>Plattform-Rolle</div>
              <select className='ip' value={editUser.global_role||'user'} onChange={e=>setEditUser(p=>({...p,global_role:e.target.value}))}>
                <option value='user'>User - Standard-Zugang</option>
                <option value='team_member'>Team Admin - Team verwalten</option>
                <option value='admin'>Admin - Voller Plattform-Zugang</option>
              </select>
            </div>
            <div style={{height:1,background:'#F3F4F6',margin:'20px 0'}}/>
            <div className='mr'><div className='ml'>Team zuweisen</div>
              <select className='ip' value={editUser.team_id||''} onChange={e=>setEditUser(p=>({...p,team_id:e.target.value}))}>
                <option value=''>Kein Team</option>
                {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {editUser.team_id&&(
              <div className='mr'><div className='ml'>Rolle im Team</div>
                <select className='ip' value={editUser.team_role||'user'} onChange={e=>setEditUser(p=>({...p,team_role:e.target.value}))}>
                  <option value='user'>User</option>
                  <option value='team_member'>Team Admin</option>
                </select>
              </div>
            )}
            <div style={{height:1,background:'#F3F4F6',margin:'20px 0'}}/>
            <div className='mr'><div className='ml'>Lizenz zuweisen</div>
              <select className='ip' value={editUser.license_id||''} onChange={e=>setEditUser(p=>({...p,license_id:e.target.value}))}>
                <option value=''>Keine Lizenz</option>
                {licenses.filter(l=>l.status==='active').map(l=>(<option key={l.id} value={l.id} disabled={l.used_seats>=l.total_seats&&editUser.license_id!==l.id}>{l.teams?.name} - {l.feature_key} ({l.used_seats}/{l.total_seats} Seats{l.used_seats>=l.total_seats?' - voll':''})</option>))}
              </select>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:24}}>
              <button onClick={()=>setEditUser(null)} style={{padding:'9px 18px',borderRadius:10,border:'1px solid #E5E7EB',background:'white',fontSize:13,fontWeight:700,cursor:'pointer',color:'#6B7280'}}>Abbrechen</button>
              <button className='bp' onClick={()=>saveUser(editUser)}>Speichern</button>
            </div>
          </div>
        </div>
      )}
      {editLic&&(
        <div className='overlay' onClick={e=>e.target===e.currentTarget&&setEditLic(null)}>
          <div className='modal'>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div><div style={{fontSize:18,fontWeight:900,color:'rgb(20,20,43)'}}>Lizenz bearbeiten</div><div style={{fontSize:12,color:'#6B7280',marginTop:2}}>{editLic.teams?.name||'—'}</div></div>
              <button onClick={()=>setEditLic(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9CA3AF',lineHeight:1}}>&#x2715;</button>
            </div>
            <div className='mr'><div className='ml'>Plan / Feature</div>
              <select className='ip' value={editLic.feature_key||'linkedin_suite_free'} onChange={e=>setEditLic(p=>({...p,feature_key:e.target.value}))}>
                <option value='linkedin_suite_free'>LinkedIn Suite Free</option>
                <option value='linkedin_suite_basic'>LinkedIn Suite Basic</option>
                <option value='linkedin_suite_pro'>LinkedIn Suite Pro</option>
                <option value='enterprise'>Enterprise</option>
              </select>
            </div>
            <div className='mr'><div className='ml'>Anzahl Seats</div>
              <input className='ip' type='number' min='1' value={editLic.total_seats||1} onChange={e=>setEditLic(p=>({...p,total_seats:e.target.value}))}/>
            </div>
            <div className='mr'><div className='ml'>Status</div>
              <select className='ip' value={editLic.status||'active'} onChange={e=>setEditLic(p=>({...p,status:e.target.value}))}>
                <option value='active'>Aktiv</option>
                <option value='expired'>Abgelaufen</option>
                <option value='revoked'>Widerrufen</option>
              </select>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:24}}>
              <button onClick={()=>setEditLic(null)} style={{padding:'9px 18px',borderRadius:10,border:'1px solid #E5E7EB',background:'white',fontSize:13,fontWeight:700,cursor:'pointer',color:'#6B7280'}}>Abbrechen</button>
              <button className='bp' onClick={()=>saveLicense(editLic)}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
