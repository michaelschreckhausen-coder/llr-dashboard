import React,{useEffect,useState,useCallback}from'react'
import{supabase}from'../lib/supabase'
const ICONS={limit_warning:'⚠️',limit_reached:'🚫',new_feature:'✨',payment_failed:'❌',trial_ending:'⏳',lead_scored:'🔥',vernetzung_accepted:'🤝',info:'ℹ️'}
export default function NotificationsBell({session}){
const[notifs,setNotifs]=useState([])
const[open,setOpen]=useState(false)
const unread=notifs.filter(n=>!n.read_at).length
const load=useCallback(async()=>{
const{data}=await supabase.from('notifications').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(20)
setNotifs(data||[])
},[session.user.id])
useEffect(()=>{load()},[load])
useEffect(()=>{
const ch=supabase.channel('notifs_'+session.user.id)
.on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+session.user.id},()=>load())
.subscribe()
return()=>supabase.removeChannel(ch)
},[session.user.id,load])
async function markAllRead(){
await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',session.user.id).is('read_at',null)
load()
}
return(
<div style={{position:'relative'}}>
<button onClick={()=>setOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',position:'relative',padding:'4px 8px',borderRadius:8}}>
<span style={{fontSize:20}}>🔔</span>
{unread>0&&<span style={{position:'absolute',top:0,right:0,width:16,height:16,background:'#EF4444',borderRadius:'50%',fontSize:9,fontWeight:800,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>{unread>9?'9+':unread}</span>}
</button>
{open&&(<>
<div onClick={()=>setOpen(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
<div style={{position:'absolute',top:'100%',right:0,zIndex:100,width:320,background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',boxShadow:'0 8px 32px rgba(0,0,0,0.12)',overflow:'hidden'}}>
<div style={{padding:'12px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
<span style={{fontWeight:700,fontSize:13}}>Benachrichtigungen</span>
{unread>0&&<button onClick={markAllRead} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#0A66C2',fontWeight:600}}>Alle gelesen</button>}
</div>
<div style={{maxHeight:360,overflowY:'auto'}}>
{notifs.length===0?(
<div style={{padding:24,textAlign:'center',color:'#94A3B8',fontSize:13}}>Keine Benachrichtigungen</div>
):notifs.map(n=>(
<div key={n.id} onClick={async()=>{if(!n.read_at){await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',n.id);load()}}}
style={{padding:'12px 16px',borderBottom:'1px solid #F8FAFC',cursor:'pointer',background:n.read_at?'#fff':'#F0F9FF',display:'flex',gap:10,alignItems:'flex-start'}}>
<span style={{fontSize:18,flexShrink:0}}>{ICONS[n.type]||'ℹ️'}</span>
<div style={{flex:1,minWidth:0}}>
<div style={{fontWeight:n.read_at?500:700,fontSize:12,marginBottom:2}}>{n.title}</div>
{n.body&&<div style={{fontSize:11,color:'#64748B'}}>{n.body}</div>}
<div style={{fontSize:10,color:'#94A3B8',marginTop:4}}>{new Date(n.created_at).toLocaleString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
</div>
{!n.read_at&&<div style={{width:8,height:8,borderRadius:'50%',background:'#0A66C2',flexShrink:0,marginTop:4}}/>}
</div>
))}
</div>
</div>
</>)}
</div>)
}
