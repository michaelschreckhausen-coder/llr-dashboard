import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
const IND = 'rgb(49,90,231)'
export default function TeamSettings({ session }) {
  const [team, setTeam] = useState(null)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [licenses, setLicenses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [flash, setFlash] = useState(null)
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState('user')
  const [tab, setTab] = useState('members')
  const flash_ = (msg,type) => { setFlash({msg,type:type||'ok'}); setTimeout(()=>setFlash(null),4000) }
  useEffect(()=>{ load() },[])
  async function load() {
    const uid = session.user.id
    // Finde Team des Users
    const { data:tm } = await supabase.from('team_members').select('*, teams(*)').eq('user_id',uid).eq('is_active',true).maybeSingle()
    if (!tm) return
    const teamId = tm.team_id
    setTeam(tm.teams)
    const [a,b,c,d] = await Promise.all([
      supabase.from('team_members').select('*, profiles(full_name,email,global_role)').eq('team_id',teamId).eq('is_active',true),
      supabase.from('invites').select('*').eq('team_id',teamId).eq('status','pending'),
      supabase.from('licenses').select('*').eq('team_id',teamId).eq('status','active'),
      supabase.from('license_assignments').select('*, profiles(full_name,email), licenses(feature_key)').eq('team_id',teamId).eq('is_active',true),
    ])
    setMembers(a.data||[]); setInvites(b.data||[]); setLicenses(c.data||[]); setAssignments(d.data||[])
  }
  async function sendInvite() {
    if (!invEmail.trim() || !team) return
    const { error } = await supabase.from('invites').insert({
      team_id:team.id, email:invEmail, role:invRole, invited_by:session.user.id
    })
    if(!error){flash_('Einladung gesendet');setInvEmail('');load()} else flash_(error.message,'err')
  }
  async function revokeInvite(id) {
    const {error} = await supabase.from('invites').update({status:'revoked'}).eq('id',id)
    if(!error){flash_('Einladung widerrufen');load()} else flash_(error.message,'err')
  }
  async function assignLicense(licId, userId) {
    if (!team) return
    const {error} = await supabase.from('license_assignments').upsert({
      license_id:licId, user_id:userId, team_id:team.id, is_active:true, assigned_by:session.user.id
    },{onConflict:'license_id,user_id'})
    if(!error){flash_('Lizenz zugewiesen');load()} else flash_(error.message,'err')
  }
  async function revokeLicense(assignId) {
    const {error} = await supabase.from('license_assignments').update({is_active:false,revoked_at:new Date().toISOString()}).eq('id',assignId)
    if(!error){flash_('Lizenz entzogen');load()} else flash_(error.message,'err')
  }
  const rC={admin:'#7C3AED',team_member:'#2563EB',user:'#6B7280'}
  const rB={admin:'#EDE9FE',team_member:'#DBEAFE',user:'#F3F4F6'}
  if(!team) return <div style={{padding:40,color:'#9CA3AF',textAlign:'center'}}>Kein Team gefunden. Bitte zuerst ein Team erstellen.</div>
  return (
    <div style={{maxWidth:960}}>
      <style>{`.ts-tab{padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-size:13px;font-weight:700}
        .ts-tab.on{background:rgb(49,90,231);color:white}
        .ts-tab:not(.on){background:white;color:#6B7280;border:1px solid #E5E7EB}
        .ts-tab:not(.on):hover{border-color:rgb(49,90,231);color:rgb(49,90,231)}
        .ts-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .ts-tbl th{padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;background:#F9FAFB;border-bottom:1px solid #E5E7EB}
        .ts-tbl td{padding:10px 14px;border-bottom:1px solid #F9FAFB;color:rgb(20,20,43)}
        .ts-tbl tr:hover td{background:#F9FAFB}
        .ts-bg{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700}
        .ts-bx{padding:5px 11px;border-radius:8px;border:1px solid #E5E7EB;background:white;font-size:11px;font-weight:700;cursor:pointer;color:#374151}
        .ts-bx:hover{border-color:rgb(49,90,231);color:rgb(49,90,231)}
        .ts-bxr{padding:5px 11px;border-radius:8px;border:1px solid #FCA5A5;background:white;font-size:11px;font-weight:700;cursor:pointer;color:#DC2626}
        .ts-bp{background:rgb(49,90,231);color:white;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}
        .ts-ip{padding:9px 12px;border:1px solid #E5E7EB;border-radius:9px;font-size:13px;outline:none}`,
      }</style>
      {flash&&<div style={{marginBottom:16,padding:'10px 16px',borderRadius:10,fontSize:13,fontWeight:700,background:flash.type==='err'?'#FEF2F2':'#F0FDF4',color:flash.type==='err'?'#991B1B':'#065F46',border:'1px solid '+(flash.type==='err'?'#FCA5A5':'#A7F3D0')}}>{flash.msg}</div>}
      <div style={{marginBottom:24,display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:900,margin:0,color:'rgb(20,20,43)',letterSpacing:'-0.03em'}}>Team-Einstellungen</h1>
          <p style={{color:'#6B7280',fontSize:13,margin:'4px 0 0'}}>{team.name} &middot; Plan: <strong>{team.plan}</strong> &middot; Max Seats: {team.max_seats}</p>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:24}}>
        {[{l:'Mitglieder',v:members.length,c:'rgb(49,90,231)'},{l:'Offene Einladungen',v:invites.length,c:'#F59E0B'},{l:'Lizenzen verfuegbar',v:licenses.reduce((a,l)=>a+(l.total_seats-l.used_seats),0),c:'#059669'}].map(s=>(
          <div key={s.l} style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:'16px 20px'}}>
            <div style={{fontSize:11,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:28,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:18}}>
        {[['members','Mitglieder'],['invites','Einladungen'],['licenses','Lizenzen']].map(([k,l])=>(
          <button key={k} className={'ts-tab'+(tab===k?' on':'')} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      {tab==='members'&&(
        <div style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',fontSize:14,fontWeight:800}}>Mitglieder ({members.length})</div>
          <table className='ts-tbl'><thead><tr><th>Name / E-Mail</th><th>Rolle im Team</th><th>Beigetreten</th></tr></thead>
          <tbody>{members.map(m=>(
            <tr key={m.id}>
              <td><div style={{fontWeight:700}}>{m.profiles?.full_name||'—'}</div><div style={{color:'#6B7280',fontSize:11}}>{m.profiles?.email}</div></td>
              <td><span className='ts-bg' style={{background:rB[m.role||'user'],color:rC[m.role||'user']}}>{m.role||'user'}</span></td>
              <td style={{color:'#6B7280'}}>{new Date(m.joined_at).toLocaleDateString('de-DE')}</td>
            </tr>
          ))}</tbody></table>
        </div>
      )}
      {tab==='invites'&&(
        <div>
          <div style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',fontSize:14,fontWeight:800}}>Offene Einladungen ({invites.length})</div>
            <table className='ts-tbl'><thead><tr><th>E-Mail</th><th>Rolle</th><th>Laeuft ab</th><th>Aktionen</th></tr></thead>
            <tbody>{invites.map(i=>(
              <tr key={i.id}>
                <td style={{fontWeight:600}}>{i.email}</td>
                <td><span className='ts-bg' style={{background:rB[i.role||'user'],color:rC[i.role||'user']}}>{i.role}</span></td>
                <td style={{color:'#6B7280'}}>{new Date(i.expires_at).toLocaleDateString('de-DE')}</td>
                <td><button className='ts-bxr' onClick={()=>revokeInvite(i.id)}>Widerrufen</button></td>
              </tr>
            ))}</tbody></table>
          </div>
          <div style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:12}}>Neues Mitglied einladen</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10}}>
              <input className='ts-ip' type='email' value={invEmail} onChange={e=>setInvEmail(e.target.value)} placeholder='email@beispiel.de' onKeyDown={e=>e.key==='Enter'&&sendInvite()}/>
              <select className='ts-ip' value={invRole} onChange={e=>setInvRole(e.target.value)}>
                <option value='user'>User</option>
                <option value='team_member'>Team Admin</option>
              </select>
              <button className='ts-bp' onClick={sendInvite}>Einladen</button>
            </div>
          </div>
        </div>
      )}
      {tab==='licenses'&&(
        <div>
          {licenses.map(lic=>(
            <div key={lic.id} style={{background:'white',borderRadius:16,border:'1px solid #E5E7EB',overflow:'hidden',marginBottom:16}}>
              <div style={{padding:'14px 18px',borderBottom:'1px solid #F3F4F6',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:14,fontWeight:800}}>{lic.feature_key}</div>
                  <div style={{fontSize:12,color:'#6B7280',marginTop:2}}>
                    {lic.used_seats}/{lic.total_seats} Seats belegt &mdash; {lic.total_seats-lic.used_seats} verfuegbar
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:100,height:8,background:'#F3F4F6',borderRadius:4,overflow:'hidden'}}>
                    <div style={{width:(lic.total_seats>0?lic.used_seats/lic.total_seats*100:0)+'%',height:'100%',background:lic.used_seats/lic.total_seats>.8?'#EF4444':'rgb(49,90,231)',borderRadius:4}}/>
                  </div>
                </div>
              </div>
              <div style={{padding:'12px 18px',borderBottom:'1px solid #F3F4F6',fontSize:12,fontWeight:700,color:'#9CA3AF',background:'#FAFAFA'}}>MITGLIED ZUWEISEN</div>
              <div style={{padding:'12px 18px',display:'flex',flexWrap:'wrap',gap:8}}>
                {members.map(m=>{
                  const assigned = assignments.find(a=>a.license_id===lic.id&&a.user_id===m.user_id)
                  return (
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,border:'1px solid '+(assigned?'#A7F3D0':'#E5E7EB'),background:assigned?'#F0FDF4':'white'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'rgb(20,20,43)'}}>{m.profiles?.full_name||m.profiles?.email||'—'}</span>
                      {assigned
                        ? <button className='ts-bxr' onClick={()=>revokeLicense(assigned.id)} style={{padding:'3px 8px'}}>Entziehen</button>
                        : <button className='ts-bx' onClick={()=>assignLicense(lic.id,m.user_id)} style={{padding:'3px 8px'}}>Zuweisen</button>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {licenses.length===0&&<div style={{background:'white',borderRadius:14,border:'1px solid #E5E7EB',padding:40,textAlign:'center',color:'#9CA3AF'}}>Noch keine Lizenzen vorhanden. Bitte beim Admin anfragen.</div>}
        </div>
      )}
    </div>
  )
}
