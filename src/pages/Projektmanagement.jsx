import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Helpers
function relDate(iso) {
  if (!iso) return null
  const d = new Date(iso), now = new Date()
  const days = Math.floor((now - d) / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}
function dueBadge(iso) {
  if (!iso) return null
  const d = new Date(iso), now = new Date()
  now.setHours(0,0,0,0); d.setHours(0,0,0,0)
  const diff = Math.floor((d - now) / 86400000)
  if (diff < 0) return { label: d.toLocaleDateString('de-DE',{day:'2-digit',month:'short'}), color:'#ef4444', bg:'#FEF2F2' }
  if (diff === 0) return { label:'Heute', color:'#f59e0b', bg:'#FFFBEB' }
  if (diff === 1) return { label:'Morgen', color:'#10b981', bg:'#F0FDF4' }
  return { label: d.toLocaleDateString('de-DE',{day:'2-digit',month:'short'}), color:'#64748B', bg:'#F1F5F9' }
}
const PRIORITY_CFG = { low:{label:'Niedrig',c:'#22c55e',bg:'#F0FDF4'}, medium:{label:'Mittel',c:'#f59e0b',bg:'#FFFBEB'}, high:{label:'Hoch',c:'#ef4444',bg:'#FEF2F2'}, urgent:{label:'Dringend',c:'#7c3aed',bg:'#F5F3FF'} }

// ─── Modal
function Modal({title,onClose,children,width=500}){
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:width,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,0.2)'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'18px 24px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'#fff',zIndex:1,borderRadius:'20px 20px 0 0'}}>
          <span style={{fontWeight:800,fontSize:16,color:'#0F172A'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#94A3B8'}}>×</button>
        </div>
        <div style={{padding:'20px 24px'}}>{children}</div>
      </div>
    </div>
  )
}

// ─── Label Chip
function LabelChip({label,small=false}){
  return(
    <span style={{display:'inline-block',padding:small?'2px 7px':'3px 9px',borderRadius:4,background:label.color,color:'#fff',fontSize:small?10:11,fontWeight:700,maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={label.name}>
      {label.name||'​'}
    </span>
  )
}

// ─── Avatar
function Avatar({user,size=26}){
  const init=(user?.full_name||user?.email||'?')[0].toUpperCase()
  const colors=['#0A66C2','#8B5CF6','#059669','#DC2626','#D97706','#0891B2']
  const color=colors[(user?.email||'').charCodeAt(0)%colors.length]||'#0A66C2'
  return(
    <div title={user?.full_name||user?.email} style={{width:size,height:size,borderRadius:'50%',background:color,color:'#fff',fontSize:size*0.42,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:'2px solid #fff'}}>
      {init}
    </div>
  )
}

// ─── TaskCard
function TaskCard({task,onOpen,onDragStart,onDragEnd,draggingId,checklistProgress,taskAssignees,taskLabels,onDragOverTask,dragOverTaskId}){
  const due=dueBadge(task.due_date)
  const prog=checklistProgress[task.id]
  const assignees=taskAssignees[task.id]||[]
  const labels=taskLabels[task.id]||[]
  const isDragging=draggingId===task.id
  const pr=PRIORITY_CFG[task.priority]
  return(
    <div draggable onDragStart={()=>onDragStart(task)} onDragEnd={onDragEnd} onClick={()=>onOpen(task)} onDragOver={e=>{e.preventDefault();onDragOverTask&&onDragOverTask(task)}}
      style={{background:task.cover_color?`linear-gradient(160deg,${task.cover_color}22 0%,#fff 60%)`:'#fff',border:`1.5px solid ${task.cover_color?task.cover_color+'44':'#E2E8F0'}`,borderLeft:task.cover_color?`4px solid ${task.cover_color}`:'1.5px solid #E2E8F0',borderRadius:10,padding:'10px 12px',cursor:'pointer',marginBottom:6,opacity:isDragging?0.4:1,transition:'all 0.15s',boxShadow:isDragging?'none':'0 1px 3px rgba(0,0,0,0.06)'}}
      onMouseEnter={e=>{if(!isDragging)e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.12)'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow=isDragging?'none':'0 1px 3px rgba(0,0,0,0.06)'}}>
      {labels.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>{labels.slice(0,4).map(l=><LabelChip key={l.id} label={l} small/>)}</div>}
      <div style={{fontSize:13,fontWeight:600,color:'#0F172A',lineHeight:1.4,marginBottom:7}}>{task.title}</div>
      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
        {pr&&<span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:99,background:pr.bg,color:pr.c}}>{pr.label}</span>}
        {due&&<span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:6,background:due.bg,color:due.color}}>📅 {due.label}</span>}
        {prog&&prog.total>0&&<><span style={{fontSize:10,color:prog.done===prog.total?'#22c55e':'#64748B'}}>✅ {prog.done}/{prog.total}</span></>}
        {task.estimated_hours&&<span style={{fontSize:10,color:'#94A3B8'}}>⏱ {task.estimated_hours}h</span>}
      </div>
      {prog&&prog.total>0&&(
        <div style={{height:3,background:'#E5E7EB',borderRadius:99,marginTop:5,overflow:'hidden'}}>
          <div style={{height:'100%',width:Math.round(prog.done/prog.total*100)+'%',background:prog.done===prog.total?'#22c55e':'#3b82f6',borderRadius:99}}/>
        </div>
      )}
      {assignees.length>0&&(
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
          <div style={{display:'flex'}}>
            {assignees.slice(0,3).map((a,i)=><div key={a.id} style={{marginLeft:i>0?-8:0}}><Avatar user={a} size={22}/></div>)}
            {assignees.length>3&&<div style={{width:22,height:22,borderRadius:'50%',background:'#E2E8F0',color:'#64748B',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:-8,border:'2px solid #fff'}}>+{assignees.length-3}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KanbanColumn
function KanbanColumn({col,tasks,draggingId,dragOverColId,onDragStart,onDragEnd,onDragOver,onDrop,onTaskOpen,onAddTask,onEditCol,checklistProgress,taskAssignees,taskLabels,onDragOverTask,dragOverTaskId}){
  const isOver=dragOverColId===col.id
  const wipOk=!col.wip_limit||tasks.length<=col.wip_limit
  return(
    <div onDragOver={e=>{e.preventDefault();onDragOver(col.id)}} onDrop={()=>onDrop(col.id)}
      style={{width:272,flexShrink:0,background:isOver?'#EFF6FF':'#F8FAFC',borderRadius:14,padding:'10px 8px',border:`2px solid ${isOver?'#3b82f6':col.color+'33'}`,transition:'all 0.15s',minHeight:200}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,padding:'0 4px'}}>
        <div style={{width:10,height:10,borderRadius:'50%',background:col.color,flexShrink:0}}/>
        <span style={{fontWeight:800,fontSize:13,color:'#0F172A',flex:1}}>{col.name}</span>
        <span style={{fontSize:11,color:'#94A3B8',fontWeight:600,background:'#E2E8F0',padding:'1px 7px',borderRadius:99}}>{tasks.length}{col.wip_limit?`/${col.wip_limit}`:''}</span>
        {!wipOk&&<span title="WIP-Limit überschritten">⚠️</span>}
        <button onClick={()=>onEditCol(col)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:16,padding:'0 2px'}}>···</button>
      </div>
      {tasks.map(t=><TaskCard key={t.id} task={t} onOpen={onTaskOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} draggingId={draggingId} checklistProgress={checklistProgress} taskAssignees={taskAssignees} taskLabels={taskLabels} onDragOverTask={onDragOverTask} dragOverTaskId={dragOverTaskId}/>)}
      <button onClick={()=>onAddTask(col.id)} style={{width:'100%',padding:'8px',borderRadius:10,border:'1.5px dashed #CBD5E1',background:'transparent',color:'#94A3B8',fontSize:12,fontWeight:600,cursor:'pointer',marginTop:4}}
        onMouseEnter={e=>{e.currentTarget.style.background='#EFF6FF';e.currentTarget.style.color='#3b82f6';e.currentTarget.style.borderColor='#3b82f6'}}
        onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#94A3B8';e.currentTarget.style.borderColor='#CBD5E1'}}>
        + Task hinzufügen
      </button>
    </div>
  )
}

// ─── TaskDetailModal
function TaskDetailModal({task,columns,onClose,onSaved,onDeleted,session,allUsers,initialAssignees,taskLabels,projectLabels,onAssigneesChanged,onLabelsChanged}){
  const [form,setForm]=useState({title:task.title,description:task.description||'',priority:task.priority,due_date:task.due_date||'',cover_color:task.cover_color||'',estimated_hours:task.estimated_hours||'',column_id:task.column_id})
  const [checklist,setChecklist]=useState([])
  const [comments,setComments]=useState([])
  const [attachments,setAttachments]=useState([])
  const [activityLog,setActivityLog]=useState([])
  const [newCheck,setNewCheck]=useState('')
  const [newComment,setNewComment]=useState('')
  const [saving,setSaving]=useState(false)
  const [tab,setTab]=useState('detail')
  const [uploading,setUploading]=useState(false)
  const [assignees,setAssignees]=useState(initialAssignees||[])
  const [labels,setLabels]=useState(taskLabels||[])
  const uid=session?.user?.id
  const userName=session?.user?.user_metadata?.full_name||session?.user?.email||'Unbekannt'

  useEffect(()=>{loadChecklist();loadComments();loadAttachments();loadActivity()},[])
  useEffect(()=>{
    if(tab==='team'&&allUsers.length===0){
      supabase.from('profiles').select('id,full_name,email,avatar_url').order('full_name')
        .then(({data})=>{if(data?.length>0&&onAssigneesChanged)onAssigneesChanged('__reload_users__',data)})
    }
  },[tab])

  async function loadChecklist(){const{data}=await supabase.from('pm_checklist_items').select('*').eq('task_id',task.id).order('position');setChecklist(data||[])}
  async function loadComments(){const{data}=await supabase.from('pm_comments').select('*').eq('task_id',task.id).order('created_at');setComments(data||[])}
  async function loadAttachments(){const{data}=await supabase.from('pm_attachments').select('*').eq('task_id',task.id).order('created_at',{ascending:false});setAttachments(data||[])}
  async function loadActivity(){const{data}=await supabase.from('pm_activity_log').select('*').eq('task_id',task.id).order('created_at',{ascending:false}).limit(20);setActivityLog(data||[])}
  async function logActivity(action,detail){await supabase.from('pm_activity_log').insert({task_id:task.id,user_id:uid,action,detail});loadActivity()}

  async function toggleAssignee(user){
    const isAssigned=assignees.some(a=>a.id===user.id)
    if(isAssigned){
      await supabase.from('pm_task_assignments').delete().eq('task_id',task.id).eq('assignee_id',user.id)
      const next=assignees.filter(a=>a.id!==user.id)
      setAssignees(next);onAssigneesChanged&&onAssigneesChanged(task.id,next)
      logActivity('unassigned',`${userName} hat ${user.full_name||user.email} entfernt`)
    }else{
      await supabase.from('pm_task_assignments').insert({task_id:task.id,assignee_id:user.id,assigned_by:uid})
      const next=[...assignees,user]
      setAssignees(next);onAssigneesChanged&&onAssigneesChanged(task.id,next)
      logActivity('assigned',`${userName} hat ${user.full_name||user.email} zugewiesen`)
    }
  }

  async function toggleLabel(label){
    const has=labels.some(l=>l.id===label.id)
    if(has){
      await supabase.from('pm_task_labels').delete().eq('task_id',task.id).eq('label_id',label.id)
      const next=labels.filter(l=>l.id!==label.id)
      setLabels(next);onLabelsChanged&&onLabelsChanged(task.id,next)
    }else{
      await supabase.from('pm_task_labels').insert({task_id:task.id,label_id:label.id})
      const next=[...labels,label]
      setLabels(next);onLabelsChanged&&onLabelsChanged(task.id,next)
    }
  }

  async function save(){
    setSaving(true)
    await supabase.from('pm_tasks').update({...form,updated_at:new Date().toISOString()}).eq('id',task.id)
    if(form.column_id!==task.column_id)logActivity('moved',`${userName} hat Task verschoben`)
    setSaving(false);onSaved()
  }

  async function addCheckItem(){if(!newCheck.trim())return;await supabase.from('pm_checklist_items').insert({task_id:task.id,user_id:uid,title:newCheck.trim(),position:checklist.length});setNewCheck('');loadChecklist()}
  async function toggleCheck(item){await supabase.from('pm_checklist_items').update({done:!item.done}).eq('id',item.id);if(!item.done)logActivity('completed',`"${item.title}" abgehakt`);loadChecklist()}
  async function deleteCheck(id){await supabase.from('pm_checklist_items').delete().eq('id',id);loadChecklist()}
  async function addComment(){if(!newComment.trim())return;await supabase.from('pm_comments').insert({task_id:task.id,user_id:uid,content:newComment.trim()});setNewComment('');loadComments();logActivity('commented',`${userName} hat kommentiert`)}
  async function deleteComment(id){await supabase.from('pm_comments').delete().eq('id',id);loadComments()}
  async function uploadFile(e){
    const file=e.target.files[0];if(!file)return
    setUploading(true)
    const path=`pm-attachments/${task.id}/${Date.now()}_${file.name}`
    const{error}=await supabase.storage.from('pm-attachments').upload(path,file)
    if(!error){
      const{data:{publicUrl}}=supabase.storage.from('pm-attachments').getPublicUrl(path)
      await supabase.from('pm_attachments').insert({task_id:task.id,user_id:uid,file_name:file.name,file_url:publicUrl,file_size:file.size,file_type:file.type})
      logActivity('attachment',`${userName} hat "${file.name}" angehängt`);loadAttachments()
    }
    setUploading(false)
  }
  async function deleteAttachment(att){await supabase.from('pm_attachments').delete().eq('id',att.id);loadAttachments()}

  const done=checklist.filter(i=>i.done).length,total=checklist.length
  const TABS=[
    {id:'detail',label:'📋 Details'},
    {id:'labels',label:`🏷️ Labels${labels.length>0?` (${labels.length})`:''}` },
    {id:'team',label:`👥 Team${assignees.length>0?` (${assignees.length})`:''}` },
    {id:'checklist',label:`✅ Checkliste${total>0?` (${done}/${total})`:''}` },
    {id:'comments',label:`💬 Kommentare${comments.length>0?` (${comments.length})`:''}` },
    {id:'attachments',label:`📎 Anhänge${attachments.length>0?` (${attachments.length})`:''}` },
    {id:'activity',label:'🕐 Aktivität'},
  ]
  const inp={padding:'9px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:13,fontFamily:'inherit',outline:'none',width:'100%',boxSizing:'border-box'}

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:1000,padding:'24px 16px',overflowY:'auto'}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:740,boxShadow:'0 24px 64px rgba(0,0,0,0.2)',marginBottom:24}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:'18px 24px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
          <div style={{flex:1}}>
            <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={{fontWeight:800,fontSize:18,border:'none',padding:'0',color:'#0F172A',background:'transparent',width:'100%',fontFamily:'inherit',outline:'none'}}/>
            {labels.length>0&&<div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:8}}>{labels.map(l=><LabelChip key={l.id} label={l}/>)}</div>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:24,color:'#94A3B8',flexShrink:0}}>×</button>
        </div>
        {/* Tabs */}
        <div style={{display:'flex',gap:0,padding:'0 24px',borderBottom:'1px solid #F1F5F9',overflowX:'auto'}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'11px 12px',border:'none',borderBottom:tab===t.id?'2.5px solid #0A66C2':'2.5px solid transparent',background:'none',cursor:'pointer',fontSize:12,fontWeight:tab===t.id?700:500,color:tab===t.id?'#0A66C2':'#64748B',whiteSpace:'nowrap'}}>
              {t.label}
            </button>
          ))}
        </div>
        {/* Tab Content */}
        <div style={{padding:'20px 24px'}}>
          {/* DETAILS */}
          {tab==='detail'&&(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>BESCHREIBUNG</label>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={4} placeholder="Was muss gemacht werden?" style={{...inp,resize:'vertical',lineHeight:1.6}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>PRIORITÄT</label>
                  <select value={form.priority||'medium'} onChange={e=>setForm(p=>({...p,priority:e.target.value}))} style={inp}>
                    <option value="low">↓ Niedrig</option><option value="medium">→ Mittel</option><option value="high">↑ Hoch</option><option value="urgent">🚨 Dringend</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>FÄLLIGKEITSDATUM</label>
                  <input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>GESCHÄTZTE STUNDEN</label>
                  <input type="number" value={form.estimated_hours} onChange={e=>setForm(p=>({...p,estimated_hours:e.target.value}))} placeholder="z.B. 2.5" style={inp} min={0} step={0.5}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>SPALTE VERSCHIEBEN</label>
                  <select value={form.column_id} onChange={e=>setForm(p=>({...p,column_id:e.target.value}))} style={inp}>
                    {columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:8}}>COVER-FARBE</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {['#ef4444','#f97316','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#374151',''].map(c=>(
                    <button key={c} onClick={()=>setForm(p=>({...p,cover_color:c}))} style={{width:28,height:28,borderRadius:8,background:c||'#F1F5F9',border:form.cover_color===c?'3px solid #0F172A':'2px solid transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {!c&&<span style={{fontSize:14,color:'#94A3B8'}}>✕</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:8,borderTop:'1px solid #F1F5F9'}}>
                <button onClick={()=>{if(window.confirm('Task löschen?'))onDeleted(task.id)}} style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#ef4444',fontSize:13,fontWeight:700,cursor:'pointer'}}>🗑 Löschen</button>
                <button onClick={save} disabled={saving} style={{padding:'9px 20px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.7:1}}>{saving?'Speichern…':'✓ Speichern'}</button>
              </div>
            </div>
          )}
          {/* LABELS */}
          {tab==='labels'&&(
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:14}}>Labels auswählen</div>
              {projectLabels.length===0&&<div style={{color:'#CBD5E1',textAlign:'center',padding:'24px 0',fontStyle:'italic'}}>Keine Labels — erstelle Labels über 🏷️ Labels im Board-Header.</div>}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {projectLabels.map(label=>{
                  const has=labels.some(l=>l.id===label.id)
                  return(
                    <div key={label.id} onClick={()=>toggleLabel(label)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,cursor:'pointer',border:`1.5px solid ${has?label.color:'#E2E8F0'}`,background:has?label.color+'18':'#F8FAFC'}}
                      onMouseEnter={e=>e.currentTarget.style.background=has?label.color+'25':'#EFF6FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=has?label.color+'18':'#F8FAFC'}>
                      <div style={{width:36,height:18,borderRadius:4,background:label.color,flexShrink:0}}/>
                      <span style={{flex:1,fontSize:13,fontWeight:600,color:'#0F172A'}}>{label.name||'(ohne Name)'}</span>
                      {has&&<span style={{fontSize:16,color:label.color}}>✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {/* TEAM */}
          {tab==='team'&&(
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:12}}>Zugewiesene Mitglieder</div>
              {assignees.length===0&&<div style={{color:'#CBD5E1',fontSize:13,textAlign:'center',padding:'16px 0',fontStyle:'italic'}}>Noch niemand zugewiesen</div>}
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:18}}>
                {assignees.map(a=>(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:10,background:'#F0FDF4',border:'1px solid #A7F3D0'}}>
                    <Avatar user={a} size={34}/>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:'#0F172A'}}>{a.full_name||'—'}</div><div style={{fontSize:11,color:'#64748B'}}>{a.email}</div></div>
                    <button onClick={()=>toggleAssignee(a)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:20}} onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
                  </div>
                ))}
              </div>
              <div style={{borderTop:'1px solid #F1F5F9',paddingTop:16}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:10}}>Mitglied hinzufügen</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {allUsers.filter(u=>!assignees.some(a=>a.id===u.id)).map(u=>(
                    <div key={u.id} onClick={()=>toggleAssignee(u)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:10,background:'#F8FAFC',border:'1px solid #E5E7EB',cursor:'pointer'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#EFF6FF'} onMouseLeave={e=>e.currentTarget.style.background='#F8FAFC'}>
                      <Avatar user={u} size={34}/>
                      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{u.full_name||'—'}</div><div style={{fontSize:11,color:'#64748B'}}>{u.email}</div></div>
                      <span style={{fontSize:11,color:'#0A66C2',fontWeight:700}}>+ Zuweisen</span>
                    </div>
                  ))}
                  {allUsers.length===0&&<div style={{color:'#CBD5E1',fontSize:13,textAlign:'center',padding:'8px 0'}}>Lädt User…</div>}
                </div>
              </div>
            </div>
          )}
          {/* CHECKLISTE */}
          {tab==='checklist'&&(
            <div>
              {total>0&&(
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span style={{fontSize:12,color:'#64748B'}}>{done} von {total} erledigt</span><span style={{fontSize:12,fontWeight:700,color:done===total?'#22c55e':'#0A66C2'}}>{Math.round(done/total*100)}%</span></div>
                  <div style={{height:8,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.round(done/total*100)}%`,background:done===total?'#22c55e':'#0A66C2',borderRadius:99,transition:'width 0.3s'}}/></div>
                </div>
              )}
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                {checklist.map(item=>(
                  <div key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:10,background:item.done?'#F0FDF4':'#F8FAFC',border:`1px solid ${item.done?'#A7F3D0':'#E2E8F0'}`}}>
                    <input type="checkbox" checked={item.done} onChange={()=>toggleCheck(item)} style={{width:16,height:16,cursor:'pointer',accentColor:'#22c55e'}}/>
                    <span style={{flex:1,fontSize:13,color:item.done?'#64748B':'#0F172A',textDecoration:item.done?'line-through':'none'}}>{item.title}</span>
                    <button onClick={()=>deleteCheck(item.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:16}} onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8}}>
                <input value={newCheck} onChange={e=>setNewCheck(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCheckItem()} placeholder="Neuer Eintrag…" style={{...inp,flex:1}}/>
                <button onClick={addCheckItem} style={{padding:'9px 16px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>+ Hinzufügen</button>
              </div>
            </div>
          )}
          {/* KOMMENTARE */}
          {tab==='comments'&&(
            <div>
              <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
                {comments.length===0&&<div style={{color:'#CBD5E1',textAlign:'center',padding:'20px 0',fontStyle:'italic'}}>Noch keine Kommentare</div>}
                {comments.map(c=>(
                  <div key={c.id} style={{padding:'12px 14px',borderRadius:12,background:'#F8FAFC',border:'1px solid #E2E8F0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontSize:11,fontWeight:700,color:'#0A66C2'}}>💬 {relDate(c.created_at)}</span>{c.user_id===uid&&<button onClick={()=>deleteComment(c.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:14}}>✕</button>}</div>
                    <div style={{fontSize:13,color:'#374151',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{c.content}</div>
                  </div>
                ))}
              </div>
              <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey)addComment()}} rows={3} placeholder="Kommentar… (Strg+Enter zum Senden)" style={{...inp,resize:'vertical',marginBottom:8}}/>
              <button onClick={addComment} style={{padding:'9px 20px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>💬 Kommentieren</button>
            </div>
          )}
          {/* ANHÄNGE */}
          {tab==='attachments'&&(
            <div>
              <div style={{marginBottom:14}}>
                <label style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:10,border:'1.5px dashed #CBD5E1',cursor:'pointer',fontSize:13,fontWeight:600,color:'#64748B',justifyContent:'center'}}>
                  <input type="file" onChange={uploadFile} style={{display:'none'}}/>
                  {uploading?'⏳ Wird hochgeladen…':'📎 Datei hochladen'}
                </label>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {attachments.length===0&&<div style={{color:'#CBD5E1',textAlign:'center',padding:'20px 0',fontStyle:'italic'}}>Noch keine Anhänge</div>}
                {attachments.map(att=>(
                  <div key={att.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,background:'#F8FAFC',border:'1px solid #E2E8F0'}}>
                    <span style={{fontSize:20}}>{att.file_type?.includes('image')?'🖼':att.file_type?.includes('pdf')?'📄':'📎'}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:13,fontWeight:600,color:'#0A66C2',textDecoration:'none',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.file_name}</a>
                      <span style={{fontSize:11,color:'#94A3B8'}}>{att.file_size?(att.file_size/1024).toFixed(0)+' KB':''} · {relDate(att.created_at)}</span>
                    </div>
                    <button onClick={()=>deleteAttachment(att)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:16}} onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* AKTIVITÄT */}
          {tab==='activity'&&(
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:12}}>Aktivitäts-Log</div>
              {activityLog.length===0&&<div style={{color:'#CBD5E1',textAlign:'center',padding:'20px 0',fontStyle:'italic'}}>Noch keine Aktivitäten</div>}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {activityLog.map(log=>(
                  <div key={log.id} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid #F8FAFC'}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'#EFF6FF',color:'#0A66C2',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {log.action==='assigned'?'👤':log.action==='commented'?'💬':log.action==='completed'?'✅':log.action==='moved'?'🔀':log.action==='attachment'?'📎':'📝'}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:'#374151'}}>{log.detail||log.action}</div>
                      <div style={{fontSize:10,color:'#94A3B8',marginTop:2}}>{relDate(log.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Label Manager
function LabelManagerModal({projectId,labels,onClose,onSaved}){
  const [list,setList]=useState(labels)
  const [newName,setNewName]=useState('')
  const [newColor,setNewColor]=useState('#0079BF')
  const [saving,setSaving]=useState(false)
  async function addLabel(){if(!newName.trim())return;setSaving(true);const{data}=await supabase.from('pm_labels').insert({project_id:projectId,name:newName.trim(),color:newColor}).select().single();if(data)setList(p=>[...p,data]);setNewName('');setSaving(false);onSaved()}
  async function deleteLabel(id){await supabase.from('pm_labels').delete().eq('id',id);setList(p=>p.filter(l=>l.id!==id));onSaved()}
  async function updateLabel(id,field,value){await supabase.from('pm_labels').update({[field]:value}).eq('id',id);setList(p=>p.map(l=>l.id===id?{...l,[field]:value}:l));onSaved()}
  const inp={padding:'7px 10px',borderRadius:8,border:'1.5px solid #E2E8F0',fontSize:13,fontFamily:'inherit',outline:'none'}
  return(
    <Modal title="🏷️ Labels verwalten" onClose={onClose} width={420}>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:18}}>
        {list.length===0&&<div style={{color:'#CBD5E1',textAlign:'center',padding:'12px 0',fontStyle:'italic'}}>Noch keine Labels</div>}
        {list.map(l=>(
          <div key={l.id} style={{display:'flex',alignItems:'center',gap:10}}>
            <input type="color" value={l.color} onChange={e=>updateLabel(l.id,'color',e.target.value)} style={{width:32,height:32,borderRadius:6,border:'none',cursor:'pointer',padding:2}}/>
            <input value={l.name} onChange={e=>updateLabel(l.id,'name',e.target.value)} placeholder="Label-Name" style={{...inp,flex:1}}/>
            <div style={{width:60,height:24,borderRadius:4,background:l.color,flexShrink:0}}/>
            <button onClick={()=>deleteLabel(l.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:18}} onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
          </div>
        ))}
      </div>
      <div style={{borderTop:'1px solid #F1F5F9',paddingTop:16}}>
        <div style={{fontSize:12,fontWeight:700,color:'#64748B',marginBottom:10}}>NEUES LABEL</div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input type="color" value={newColor} onChange={e=>setNewColor(e.target.value)} style={{width:36,height:36,borderRadius:8,border:'none',cursor:'pointer',padding:2}}/>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addLabel()} placeholder="Label-Name" style={{...inp,flex:1,padding:'9px 12px'}}/>
          <button onClick={addLabel} disabled={saving||!newName.trim()} style={{padding:'9px 16px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.7:1}}>+ Label</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── List View
function ListView({tasks,columns,taskAssignees,taskLabels,onOpen}){
  const colMap=Object.fromEntries(columns.map(c=>[c.id,c]))
  return(
    <div style={{background:'#fff',borderRadius:16,border:'1.5px solid #E2E8F0',overflow:'hidden'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'#F8FAFC'}}>
            {['Titel','Status','Priorität','Fälligkeit','Mitglieder','Labels'].map(h=>(
              <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#64748B',borderBottom:'1px solid #E2E8F0'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task,i)=>{
            const col=colMap[task.column_id]
            const due=dueBadge(task.due_date)
            const asgns=taskAssignees[task.id]||[]
            const lbls=taskLabels[task.id]||[]
            const pr=PRIORITY_CFG[task.priority]
            return(
              <tr key={task.id} onClick={()=>onOpen(task)} style={{cursor:'pointer',background:i%2===0?'#fff':'#FAFBFC',borderBottom:'1px solid #F1F5F9'}}
                onMouseEnter={e=>e.currentTarget.style.background='#EFF6FF'}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#FAFBFC'}>
                <td style={{padding:'10px 14px'}}><div style={{fontWeight:600,fontSize:13,color:'#0F172A'}}>{task.title}</div>{task.description&&<div style={{fontSize:11,color:'#94A3B8',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{task.description}</div>}</td>
                <td style={{padding:'10px 14px'}}>{col&&<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:col.color+'22',color:col.color}}>● {col.name}</span>}</td>
                <td style={{padding:'10px 14px'}}>{pr&&<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:pr.bg,color:pr.c}}>{pr.label}</span>}</td>
                <td style={{padding:'10px 14px'}}>{due&&<span style={{fontSize:11,fontWeight:600,color:due.color}}>📅 {due.label}</span>}</td>
                <td style={{padding:'10px 14px'}}><div style={{display:'flex'}}>{asgns.slice(0,3).map((a,i)=><div key={a.id} style={{marginLeft:i>0?-6:0}}><Avatar user={a} size={22}/></div>)}</div></td>
                <td style={{padding:'10px 14px'}}><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{lbls.slice(0,3).map(l=><LabelChip key={l.id} label={l} small/>)}</div></td>
              </tr>
            )
          })}
          {tasks.length===0&&<tr><td colSpan={6} style={{padding:'32px',textAlign:'center',color:'#CBD5E1',fontStyle:'italic'}}>Keine Tasks gefunden</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Export
export default function Projektmanagement({session}){
  const navigate=useNavigate()
  const [projects,setProjects]=useState([])
  const [activeProj,setActiveProj]=useState(null)
  const [columns,setColumns]=useState([])
  const [tasks,setTasks]=useState([])
  const [loading,setLoading]=useState(true)
  const [checklistProgress,setChecklistProgress]=useState({})
  const [draggingTask,setDraggingTask]=useState(null)
  const [dragOverCol,setDragOverCol]=useState(null)
  const [dragOverTask,setDragOverTask]=useState(null)
  const [taskDetail,setTaskDetail]=useState(null)
  const [colModal,setColModal]=useState(null)
  const [projModal,setProjModal]=useState(null)
  const [addTaskCol,setAddTaskCol]=useState(null)
  const [quickTitle,setQuickTitle]=useState('')
  const [saving,setSaving]=useState(false)
  const [flash,setFlash]=useState(null)
  const [colForm,setColForm]=useState({name:'',color:'#0A66C2',wip_limit:''})
  const [projForm,setProjForm]=useState({name:'',description:'',color:'#0A66C2'})
  const [sortBy,setSortBy]=useState('position')
  const [taskAssignees,setTaskAssignees]=useState({})
  const [taskLabels,setTaskLabels]=useState({})
  const [allUsers,setAllUsers]=useState([])
  const [projectLabels,setProjectLabels]=useState([])
  const [viewMode,setViewMode]=useState('board')
  const [filterMember,setFilterMember]=useState('')
  const [filterLabel,setFilterLabel]=useState('')
  const [filterPriority,setFilterPriority]=useState('')
  const [searchQuery,setSearchQuery]=useState('')
  const [showLabelManager,setShowLabelManager]=useState(false)

  useEffect(()=>{loadProjects();loadAllUsers()},[])
  useEffect(()=>{if(activeProj){loadColumns();loadTasks();loadProjectLabels()}},[activeProj])

  async function loadAllUsers(){try{const{data}=await supabase.from('profiles').select('id,full_name,email,avatar_url').order('full_name');if(data?.length>0)setAllUsers(data)}catch(e){}}
  async function loadProjectLabels(){const{data}=await supabase.from('pm_labels').select('*').eq('project_id',activeProj).order('created_at');setProjectLabels(data||[])}
  function showFlash(msg,type='ok'){setFlash({msg,type});setTimeout(()=>setFlash(null),3000)}

  async function loadProjects(){
    const{data}=await supabase.from('pm_projects').select('*').order('created_at')
    setProjects(data||[])
    if(data?.length>0&&!activeProj)setActiveProj(data[0].id)
  }
  async function loadColumns(){const{data}=await supabase.from('pm_columns').select('*').eq('project_id',activeProj).order('position');setColumns(data||[]);setLoading(false)}
  async function loadTasks(){
    const{data}=await supabase.from('pm_tasks').select('*').eq('project_id',activeProj).order('position')
    setTasks(data||[])
    if(data?.length>0){
      const ids=data.map(t=>t.id)
      const[{data:items},{data:assigns},{data:lbls}]=await Promise.all([
        supabase.from('pm_checklist_items').select('task_id,done').in('task_id',ids),
        supabase.from('pm_task_assignments').select('task_id,assignee_id,profiles:assignee_id(full_name,avatar_url,email)').in('task_id',ids),
        supabase.from('pm_task_labels').select('task_id,pm_labels(*)').in('task_id',ids)
      ])
      const prog={}
      items?.forEach(i=>{if(!prog[i.task_id])prog[i.task_id]={done:0,total:0};prog[i.task_id].total++;if(i.done)prog[i.task_id].done++})
      setChecklistProgress(prog)
      const asgn={}
      assigns?.forEach(a=>{if(!asgn[a.task_id])asgn[a.task_id]=[];asgn[a.task_id].push({id:a.assignee_id,...a.profiles})})
      setTaskAssignees(asgn)
      const tlbls={}
      lbls?.forEach(l=>{if(!tlbls[l.task_id])tlbls[l.task_id]=[];if(l.pm_labels)tlbls[l.task_id].push(l.pm_labels)})
      setTaskLabels(tlbls)
    }
  }

  function getFilteredTasks(colTasks){
    let res=[...colTasks]
    if(searchQuery)res=res.filter(t=>t.title.toLowerCase().includes(searchQuery.toLowerCase())||(t.description||'').toLowerCase().includes(searchQuery.toLowerCase()))
    if(filterMember)res=res.filter(t=>(taskAssignees[t.id]||[]).some(a=>a.id===filterMember))
    if(filterLabel)res=res.filter(t=>(taskLabels[t.id]||[]).some(l=>l.id===filterLabel))
    if(filterPriority)res=res.filter(t=>t.priority===filterPriority)
    return sortedTasks(res)
  }
  function sortedTasks(ts){
    const s=[...ts]
    if(sortBy==='priority'){const o={urgent:0,high:1,medium:2,low:3};s.sort((a,b)=>(o[a.priority]??9)-(o[b.priority]??9))}
    else if(sortBy==='due_date'){s.sort((a,b)=>{if(!a.due_date)return 1;if(!b.due_date)return -1;return new Date(a.due_date)-new Date(b.due_date)})}
    else if(sortBy==='name'){s.sort((a,b)=>a.title.localeCompare(b.title))}
    else{s.sort((a,b)=>(a.position??0)-(b.position??0))}
    return s
  }

  async function handleSaveProject(){
    setSaving(true)
    const uid=session?.user?.id
    if(projModal==='new'){
      const{data}=await supabase.from('pm_projects').insert({...projForm,user_id:uid}).select().single()
      if(data){
        const defaultCols=[{name:'Offen',color:'#94A3B8',position:0},{name:'In Arbeit',color:'#3b82f6',position:1},{name:'Review',color:'#f59e0b',position:2},{name:'Erledigt',color:'#22c55e',position:3}]
        for(const col of defaultCols)await supabase.from('pm_columns').insert({...col,project_id:data.id,user_id:uid})
        const defaultLabels=[{name:'Dringend',color:'#EB5A46'},{name:'Bug',color:'#EB5A46'},{name:'Feature',color:'#61BD4F'},{name:'Design',color:'#C377E0'},{name:'Backend',color:'#0079BF'},{name:'Frontend',color:'#00C2E0'}]
        for(const lbl of defaultLabels)await supabase.from('pm_labels').insert({...lbl,project_id:data.id})
        setActiveProj(data.id);showFlash('✅ Projekt erstellt!')
      }
    }else{
      await supabase.from('pm_projects').update(projForm).eq('id',projModal)
      setProjects(prev=>prev.map(p=>p.id===projModal?{...p,...projForm}:p))
      if(activeProj===projModal){}  // bleibt aktiv
      showFlash('✅ Projekt aktualisiert!')
    }
    setProjModal(null);setProjForm({name:'',description:'',color:'#0A66C2'});setSaving(false);loadProjects()
  }

  async function handleSaveCol(){
    setSaving(true)
    const uid=session?.user?.id
    if(colModal==='new')await supabase.from('pm_columns').insert({...colForm,project_id:activeProj,user_id:uid,position:columns.length})
    else await supabase.from('pm_columns').update(colForm).eq('id',colModal.id)
    setColModal(null);setColForm({name:'',color:'#0A66C2',wip_limit:''});setSaving(false);loadColumns();showFlash('✅ Spalte gespeichert')
  }
  async function handleDeleteCol(col){if(!window.confirm(`Spalte "${col.name}" löschen?`))return;await supabase.from('pm_columns').delete().eq('id',col.id);loadColumns();loadTasks();showFlash('Spalte gelöscht')}
  async function handleQuickAdd(){if(!quickTitle.trim())return;setSaving(true);await supabase.from('pm_tasks').insert({title:quickTitle.trim(),column_id:addTaskCol,project_id:activeProj,user_id:session?.user?.id,priority:'medium',position:tasks.filter(t=>t.column_id===addTaskCol).length});setQuickTitle('');setAddTaskCol(null);setSaving(false);loadTasks()}
  async function handleDrop(colId){
    if(!draggingTask){setDraggingTask(null);setDragOverCol(null);setDragOverTask(null);return}
    if(draggingTask.column_id===colId && dragOverTask && dragOverTask.id!==draggingTask.id){
      // Reorder innerhalb der Spalte
      const colTasks=tasks.filter(t=>t.column_id===colId).sort((a,b)=>(a.position??0)-(b.position??0))
      const fromIdx=colTasks.findIndex(t=>t.id===draggingTask.id)
      const toIdx=colTasks.findIndex(t=>t.id===dragOverTask.id)
      if(fromIdx!==-1&&toIdx!==-1){
        const reordered=[...colTasks]
        const [moved]=reordered.splice(fromIdx,1)
        reordered.splice(toIdx,0,moved)
        await Promise.all(reordered.map((t,i)=>supabase.from('pm_tasks').update({position:i}).eq('id',t.id)))
      }
      setDraggingTask(null);setDragOverCol(null);setDragOverTask(null);loadTasks();return
    }
    if(draggingTask.column_id===colId){setDraggingTask(null);setDragOverCol(null);setDragOverTask(null);return}
    await supabase.from('pm_tasks').update({column_id:colId}).eq('id',draggingTask.id)
    await supabase.from('pm_activity_log').insert({task_id:draggingTask.id,user_id:session?.user?.id,action:'moved',detail:'Task in neue Spalte verschoben'})
    setDraggingTask(null);setDragOverCol(null);setDragOverTask(null);loadTasks()
  }
  async function handleTaskDeleted(id){await supabase.from('pm_tasks').delete().eq('id',id);setTaskDetail(null);loadTasks();showFlash('Task gelöscht')}
  async function handleTaskSaved(){setTaskDetail(null);loadTasks();showFlash('✅ Gespeichert')}

  const hasFilters=filterMember||filterLabel||filterPriority||searchQuery
  const overdueTasks = tasks.filter(t=>t.due_date&&new Date(t.due_date)<new Date()&&t.column_id!==columns.find(c=>c.name==='Erledigt')?.id)
  const inp={padding:'9px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:13,fontFamily:'inherit',outline:'none',width:'100%',boxSizing:'border-box'}

  return(
    <div style={{minHeight:'100vh',background:'#F1F5F9'}}>
      {/* Flash */}
      {flash&&<div style={{position:'fixed',top:20,right:20,zIndex:2000,padding:'12px 20px',borderRadius:12,background:flash.type==='ok'?'#0A66C2':'#ef4444',color:'#fff',fontSize:13,fontWeight:700,boxShadow:'0 8px 24px rgba(0,0,0,0.15)'}}>{flash.msg}</div>}

      {/* Board Header */}
      <div style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'12px 24px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',flex:1}}>
          {projects.map(p=>(
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:0}}>
              <button onClick={()=>setActiveProj(p.id)} style={{padding:'6px 12px',borderRadius:activeProj===p.id?'8px 0 0 8px':8,border:activeProj===p.id?`2px solid ${p.color}`:'1.5px solid #E2E8F0',borderRight:activeProj===p.id?`1px solid ${p.color}66`:'none',background:activeProj===p.id?p.color+'18':'#fff',color:activeProj===p.id?p.color:'#64748B',fontSize:12,fontWeight:activeProj===p.id?800:500,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:p.color}}/>{p.name}
              </button>
              {activeProj===p.id&&(
                <button onClick={()=>{setProjModal(p.id);setProjForm({name:p.name,description:p.description||'',color:p.color})}}
                  title="Projekt bearbeiten"
                  style={{padding:'6px 8px',borderRadius:'0 8px 8px 0',border:`2px solid ${p.color}`,borderLeft:'none',background:p.color+'18',color:p.color,fontSize:11,cursor:'pointer',fontWeight:700}}>
                  ✏
                </button>
              )}
            </div>
          ))}
          <button onClick={()=>{setProjModal('new');setProjForm({name:'',description:'',color:'#0A66C2'})}} style={{padding:'6px 14px',borderRadius:8,border:'1.5px dashed #CBD5E1',background:'transparent',color:'#94A3B8',fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Projekt</button>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{display:'flex',borderRadius:8,border:'1.5px solid #E2E8F0',overflow:'hidden'}}>
            <button onClick={()=>setViewMode('board')} style={{padding:'6px 12px',border:'none',background:viewMode==='board'?'#0A66C2':'#fff',color:viewMode==='board'?'#fff':'#64748B',fontSize:12,fontWeight:700,cursor:'pointer'}}>⬜ Board</button>
            <button onClick={()=>setViewMode('list')} style={{padding:'6px 12px',border:'none',background:viewMode==='list'?'#0A66C2':'#fff',color:viewMode==='list'?'#fff':'#64748B',fontSize:12,fontWeight:700,cursor:'pointer'}}>☰ Liste</button>
          </div>
          <button onClick={()=>setShowLabelManager(true)} style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid #E2E8F0',background:'#fff',color:'#64748B',fontSize:12,fontWeight:600,cursor:'pointer'}}>🏷️ Labels</button>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #E2E8F0',fontSize:12,fontFamily:'inherit',color:'#64748B',background:'#fff'}}>
            <option value="position">Standard</option><option value="priority">Priorität</option><option value="due_date">Fälligkeit</option><option value="name">Name A→Z</option>
          </select>
          <button onClick={()=>{setColModal('new');setColForm({name:'',color:'#0A66C2',wip_limit:''})}} style={{padding:'6px 14px',borderRadius:8,border:'1.5px solid #0A66C2',background:'#EFF6FF',color:'#0A66C2',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Spalte</button>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{background:'#fff',borderBottom:'1px solid #F1F5F9',padding:'10px 24px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 Tasks suchen…" style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid #E2E8F0',fontSize:12,fontFamily:'inherit',width:200,outline:'none'}}/>
        <button onClick={()=>{
          const uid=session?.user?.id
          if(filterMember===uid){setFilterMember('')}else{setFilterMember(uid||'')}
        }} style={{padding:'6px 14px',borderRadius:8,border:'1.5px solid '+(filterMember===session?.user?.id?'#0A66C2':'#E2E8F0'),background:filterMember===session?.user?.id?'#EFF6FF':'#fff',color:filterMember===session?.user?.id?'#0A66C2':'#64748B',fontSize:12,fontWeight:filterMember===session?.user?.id?700:500,cursor:'pointer',whiteSpace:'nowrap'}}>
          👤 Meine Aufgaben
        </button>
        <select value={filterMember} onChange={e=>setFilterMember(e.target.value)} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #E2E8F0',fontSize:12,fontFamily:'inherit',color:filterMember?'#0A66C2':'#94A3B8',background:filterMember?'#EFF6FF':'#fff'}}>
          <option value="">👤 Alle Mitglieder</option>
          {allUsers.map(u=><option key={u.id} value={u.id}>{u.full_name||u.email}</option>)}
        </select>
        <select value={filterLabel} onChange={e=>setFilterLabel(e.target.value)} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #E2E8F0',fontSize:12,fontFamily:'inherit',color:filterLabel?'#0A66C2':'#94A3B8',background:filterLabel?'#EFF6FF':'#fff'}}>
          <option value="">🏷️ Alle Labels</option>
          {projectLabels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #E2E8F0',fontSize:12,fontFamily:'inherit',color:filterPriority?'#0A66C2':'#94A3B8',background:filterPriority?'#EFF6FF':'#fff'}}>
          <option value="">⬆ Alle Prioritäten</option><option value="urgent">🚨 Dringend</option><option value="high">↑ Hoch</option><option value="medium">→ Mittel</option><option value="low">↓ Niedrig</option>
        </select>
        {overdueTasks.length>0&&(
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:8,background:'#FEF2F2',border:'1px solid #FECACA',cursor:'pointer'}} onClick={()=>{setFilterPriority('');setFilterMember('');setFilterLabel('');setSearchQuery('');setSortBy('due_date')}}>
            <span style={{fontSize:12,color:'#ef4444',fontWeight:700}}>🔴 {overdueTasks.length} überfällig</span>
          </div>
        )}
        {hasFilters&&(
          <button onClick={()=>{setFilterMember('');setFilterLabel('');setFilterPriority('');setSearchQuery('')}} style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid #E2E8F0',background:'#F1F5F9',color:'#64748B',fontSize:12,fontWeight:600,cursor:'pointer'}}>✕ Filter zurücksetzen</button>
        )}
      </div>

      {/* Content */}
      {loading?(
        <div style={{textAlign:'center',padding:64,color:'#94A3B8'}}>Lade Board…</div>
      ):viewMode==='board'?(
        <div style={{overflowX:'auto',padding:'20px 24px'}}>
          <div style={{display:'flex',gap:12,alignItems:'flex-start',minWidth:'max-content'}}>
            {columns.map(col=>(
              <KanbanColumn key={col.id} col={col} tasks={getFilteredTasks(tasks.filter(t=>t.column_id===col.id))} draggingId={draggingTask?.id} dragOverColId={dragOverCol} onDragStart={t=>setDraggingTask(t)} onDragEnd={()=>{setDraggingTask(null);setDragOverCol(null)}} onDragOver={colId=>setDragOverCol(colId)} onDrop={handleDrop} onTaskOpen={setTaskDetail} onAddTask={colId=>{setAddTaskCol(colId);setQuickTitle('')}} onEditCol={col=>{setColModal(col);setColForm({name:col.name,color:col.color,wip_limit:col.wip_limit||''})}} checklistProgress={checklistProgress} taskAssignees={taskAssignees} taskLabels={taskLabels} onDragOverTask={t=>setDragOverTask(t)} dragOverTaskId={dragOverTask?.id}/>
            ))}
            <div style={{width:200,flexShrink:0,paddingTop:4}}>
              <button onClick={()=>{setColModal('new');setColForm({name:'',color:'#0A66C2',wip_limit:''})}} style={{width:'100%',padding:'10px',borderRadius:12,border:'2px dashed #CBD5E1',background:'transparent',color:'#94A3B8',fontSize:13,fontWeight:600,cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#0A66C2';e.currentTarget.style.color='#0A66C2'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.color='#94A3B8'}}>+ Neue Spalte</button>
            </div>
          </div>
        </div>
      ):(
        <div style={{padding:'20px 24px'}}>
          <ListView tasks={getFilteredTasks(tasks)} columns={columns} taskAssignees={taskAssignees} taskLabels={taskLabels} onOpen={setTaskDetail}/>
        </div>
      )}

      {/* Quick Add */}
      {addTaskCol&&(
        <Modal title={`+ Task — ${columns.find(c=>c.id===addTaskCol)?.name||''}`} onClose={()=>setAddTaskCol(null)} width={420}>
          <input value={quickTitle} onChange={e=>setQuickTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleQuickAdd()} placeholder="Task-Titel…" style={{...inp,marginBottom:14,fontSize:15}} autoFocus/>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <button onClick={()=>setAddTaskCol(null)} style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#fff',color:'#64748B',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
            <button onClick={handleQuickAdd} disabled={saving||!quickTitle.trim()} style={{padding:'9px 20px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!quickTitle.trim()?0.5:1}}>{saving?'…':'+ Erstellen'}</button>
          </div>
        </Modal>
      )}

      {/* Column Modal */}
      {colModal&&(
        <Modal title={colModal==='new'?'+ Neue Spalte':`Spalte: ${colModal.name}`} onClose={()=>setColModal(null)} width={400}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>NAME *</label><input value={colForm.name} onChange={e=>setColForm(p=>({...p,name:e.target.value}))} placeholder="Spalten-Name" style={inp} autoFocus/></div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:8}}>FARBE</label>
              <div style={{display:'flex',gap:8}}>{['#94A3B8','#3b82f6','#f59e0b','#22c55e','#ef4444','#8b5cf6','#ec4899','#0891B2'].map(c=><button key={c} onClick={()=>setColForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:8,background:c,border:colForm.color===c?'3px solid #0F172A':'2px solid transparent',cursor:'pointer'}}/>)}</div>
            </div>
            <div><label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>WIP-LIMIT (optional)</label><input type="number" value={colForm.wip_limit} onChange={e=>setColForm(p=>({...p,wip_limit:e.target.value}))} placeholder="Max. Tasks" style={inp} min={0}/></div>
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8}}>
              {colModal!=='new'&&<button onClick={()=>handleDeleteCol(colModal)} style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#ef4444',fontSize:13,fontWeight:700,cursor:'pointer'}}>🗑 Löschen</button>}
              <div style={{display:'flex',gap:8,marginLeft:'auto'}}>
                <button onClick={()=>setColModal(null)} style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#fff',color:'#64748B',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
                <button onClick={handleSaveCol} disabled={saving||!colForm.name.trim()} style={{padding:'9px 20px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!colForm.name.trim()?0.5:1}}>Speichern</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Project Modal */}
      {projModal&&(
        <Modal title={projModal==='new'?'+ Neues Projekt':'Projekt bearbeiten'} onClose={()=>setProjModal(null)} width={440}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>NAME *</label><input value={projForm.name} onChange={e=>setProjForm(p=>({...p,name:e.target.value}))} placeholder="Projektname" style={inp} autoFocus/></div>
            <div><label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:5}}>BESCHREIBUNG</label><textarea value={projForm.description} onChange={e=>setProjForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="Projektbeschreibung (optional)" style={{...inp,resize:'vertical'}}/></div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:8}}>FARBE</label>
              <div style={{display:'flex',gap:8}}>{['#0A66C2','#8B5CF6','#059669','#DC2626','#D97706','#0891B2','#374151','#ec4899'].map(c=><button key={c} onClick={()=>setProjForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:8,background:c,border:projForm.color===c?'3px solid #0F172A':'2px solid transparent',cursor:'pointer'}}/>)}</div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8}}>
              {projModal!=='new'&&(
                <button onClick={async()=>{
                  if(!window.confirm(`Projekt "${projForm.name}" und alle Tasks löschen?`))return
                  await supabase.from('pm_projects').delete().eq('id',projModal)
                  setProjModal(null);setProjects(prev=>{const r=prev.filter(p=>p.id!==projModal);if(r.length>0)setActiveProj(r[0].id);return r});showFlash('Projekt gelöscht')
                }} style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#ef4444',fontSize:13,fontWeight:700,cursor:'pointer'}}>🗑 Löschen</button>
              )}
              <div style={{display:'flex',gap:8,marginLeft:'auto'}}>
                <button onClick={()=>setProjModal(null)} style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#fff',color:'#64748B',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
                <button onClick={handleSaveProject} disabled={saving||!projForm.name.trim()} style={{padding:'9px 20px',borderRadius:10,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!projForm.name.trim()?0.5:1}}>{saving?'…':projModal==='new'?'+ Erstellen':'Speichern'}</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Task Detail */}
      {taskDetail&&(
        <TaskDetailModal task={taskDetail} columns={columns} onClose={()=>setTaskDetail(null)} onSaved={handleTaskSaved} onDeleted={handleTaskDeleted} session={session} allUsers={allUsers} initialAssignees={taskAssignees[taskDetail.id]||[]} taskLabels={taskLabels[taskDetail.id]||[]} projectLabels={projectLabels}
          onAssigneesChanged={(taskId,next)=>{
            if(taskId==='__reload_users__'){setAllUsers(next);return}
            setTaskAssignees(prev=>({...prev,[taskId]:next}))
          }}
          onLabelsChanged={(taskId,next)=>setTaskLabels(prev=>({...prev,[taskId]:next}))}
        />
      )}

      {/* Label Manager */}
      {showLabelManager&&activeProj&&(
        <LabelManagerModal projectId={activeProj} labels={projectLabels} onClose={()=>setShowLabelManager(false)} onSaved={()=>{loadProjectLabels();loadTasks()}}/>
      )}
    </div>
  )
}
