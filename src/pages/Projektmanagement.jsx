import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PRIORITY = {
  low:    { label:'Niedrig',  color:'#22c55e', bg:'#F0FDF4', border:'#86EFAC', icon:'↓' },
  medium: { label:'Mittel',   color:'#f59e0b', bg:'#FFFBEB', border:'#FDE68A', icon:'→' },
  high:   { label:'Hoch',     color:'#ef4444', bg:'#FEF2F2', border:'#FCA5A5', icon:'↑' },
  urgent: { label:'Dringend', color:'#7c3aed', bg:'#F5F3FF', border:'#DDD6FE', icon:'⚡' },
}
const COVER_COLORS = ['#ef4444','#f97316','#f59e0b','#22c55e','#0a66c2','#8b5cf6','#ec4899','#0891b2','#64748b','']
const COL_COLORS   = ['#64748B','#0A66C2','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#0891B2']
const PROJ_COLORS  = ['#0A66C2','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#0891B2','#F97316']

function relDate(iso) {
  if (!iso) return null
  const d = new Date(iso), now = new Date(); now.setHours(0,0,0,0)
  const diff = Math.floor((d-now)/86400000)
  if (diff<-1)  return {text:`${Math.abs(diff)}d überfällig`,color:'#ef4444',bg:'#FEF2F2'}
  if (diff===-1)return {text:'Gestern',color:'#ef4444',bg:'#FEF2F2'}
  if (diff===0) return {text:'Heute',color:'#f59e0b',bg:'#FFFBEB'}
  if (diff===1) return {text:'Morgen',color:'#16a34a',bg:'#F0FDF4'}
  return {text:d.toLocaleDateString('de-DE',{day:'2-digit',month:'short'}),color:'#64748B',bg:'#F1F5F9'}
}

const inp = {width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:14,fontFamily:'Inter,sans-serif',outline:'none',boxSizing:'border-box',background:'#fff'}
const lbl = {display:'block',fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}

function Modal({title,onClose,children,width=500}) {
  useEffect(()=>{const fn=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[])
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:16,boxShadow:'0 24px 64px rgba(15,23,42,0.18)',width,maxWidth:'100%',maxHeight:'92vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        {title&&<div style={{padding:'14px 20px',borderBottom:'1px solid #E2E8F0',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'#fff',zIndex:1,borderRadius:'16px 16px 0 0'}}>
          <div style={{fontWeight:800,fontSize:15,color:'#0F172A'}}>{title}</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#94A3B8',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
        </div>}
        {children}
      </div>
    </div>
  )
}

function TaskCard({task,onOpen,onDragStart,onDragEnd,draggingId,checklistProgress}) {
  const pr=PRIORITY[task.priority]||PRIORITY.medium
  const due=relDate(task.due_date)
  const isDragging=draggingId===task.id
  const prog=checklistProgress[task.id]
  return (
    <div draggable onDragStart={e=>{e.dataTransfer.effectAllowed='move';onDragStart(task)}} onDragEnd={onDragEnd} onClick={()=>onOpen(task)}
      style={{background:'#fff',borderRadius:10,border:'1px solid #E5E7EB',marginBottom:8,cursor:'pointer',overflow:'hidden',
        boxShadow:isDragging?'0 12px 32px rgba(0,0,0,0.2)':'0 1px 3px rgba(0,0,0,0.07)',
        opacity:isDragging?0.4:1,transition:'all 0.12s',userSelect:'none'}}
      onMouseEnter={e=>{if(!isDragging){e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-1px)'}}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.07)';e.currentTarget.style.transform='none'}}>
      {task.cover_color&&<div style={{height:6,background:task.cover_color}}/>}
      <div style={{padding:'10px 12px'}}>
        {task.tags?.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>
          {task.tags.map((t,i)=><span key={i} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'#EFF6FF',color:'#1D4ED8'}}>{t}</span>)}
        </div>}
        <div style={{fontWeight:600,fontSize:13,color:'#0F172A',lineHeight:1.45,marginBottom:8}}>{task.title}</div>
        <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
          <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:pr.bg,color:pr.color,border:'1px solid '+pr.border}}>{pr.icon} {pr.label}</span>
          {due&&<span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,background:due.bg,color:due.color}}>📅 {due.text}</span>}
          {task.assignee_name&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#F5F3FF',color:'#6D28D9'}}>👤 {task.assignee_name}</span>}
          {task.estimated_hours&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#F0FDF4',color:'#166534'}}>⏱ {task.estimated_hours}h</span>}
        </div>
        {prog&&prog.total>0&&<div style={{marginTop:8}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#94A3B8',marginBottom:3}}>
            <span>✅ Checkliste</span><span>{prog.done}/{prog.total}</span>
          </div>
          <div style={{height:4,background:'#E5E7EB',borderRadius:99,overflow:'hidden'}}>
            <div style={{height:'100%',width:(prog.done/prog.total*100)+'%',background:prog.done===prog.total?'#22c55e':'#0A66C2',borderRadius:99,transition:'width 0.3s'}}/>
          </div>
        </div>}
      </div>
    </div>
  )
}

function KanbanColumn({col,tasks,draggingId,dragOverColId,onDragStart,onDragEnd,onDragOver,onDrop,onTaskOpen,onAddTask,onEditCol,checklistProgress}) {
  const isOver=dragOverColId===col.id
  const overWip=col.wip_limit&&tasks.length>=col.wip_limit
  return (
    <div style={{width:272,minWidth:272,flexShrink:0,display:'flex',flexDirection:'column',maxHeight:'100%'}}>
      <div style={{background:col.color+'1A',border:'1px solid '+col.color+'33',borderRadius:12,padding:'9px 12px',marginBottom:8,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <div style={{width:9,height:9,borderRadius:'50%',background:col.color}}/>
            <span style={{fontWeight:800,fontSize:13,color:'#0F172A'}}>{col.name}</span>
            <span style={{fontSize:11,fontWeight:700,background:'rgba(255,255,255,0.9)',color:overWip?'#ef4444':col.color,border:'1px solid '+(overWip?'#fca5a5':col.color+'44'),borderRadius:99,padding:'1px 7px'}}>
              {tasks.length}{col.wip_limit?'/'+col.wip_limit:''}
            </span>
          </div>
          <div style={{display:'flex',gap:3}}>
            <button onClick={()=>onEditCol(col)} title="Bearbeiten"
              style={{width:22,height:22,borderRadius:6,border:'none',background:'transparent',cursor:'pointer',color:'#94A3B8',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.08)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>⋯</button>
            <button onClick={()=>onAddTask(col.id)} style={{width:22,height:22,borderRadius:6,border:'none',background:col.color,cursor:'pointer',color:'#fff',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
          </div>
        </div>
        {overWip&&<div style={{fontSize:10,color:'#ef4444',fontWeight:600,marginTop:4}}>⚠️ WIP-Limit erreicht</div>}
      </div>
      <div onDragOver={e=>{e.preventDefault();onDragOver(col.id)}} onDrop={e=>{e.preventDefault();onDrop(col.id)}}
        style={{flex:1,overflowY:'auto',padding:'2px 0',borderRadius:10,minHeight:80,
          background:isOver?col.color+'0D':'transparent',border:isOver?'2px dashed '+col.color+'88':'2px dashed transparent',transition:'all 0.12s'}}>
        {tasks.map(t=><TaskCard key={t.id} task={t} onOpen={onTaskOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} draggingId={draggingId} checklistProgress={checklistProgress}/>)}
        {tasks.length===0&&!isOver&&<div style={{textAlign:'center',color:'#CBD5E1',fontSize:12,padding:'20px 0',fontStyle:'italic'}}>Leer</div>}
      </div>
      <button onClick={()=>onAddTask(col.id)} style={{marginTop:6,width:'100%',padding:'7px',borderRadius:9,border:'1.5px dashed #CBD5E1',background:'transparent',cursor:'pointer',fontSize:12,color:'#94A3B8',fontWeight:600,flexShrink:0}}
        onMouseEnter={e=>{e.currentTarget.style.background='#F8FAFC';e.currentTarget.style.color='#475569'}}
        onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#94A3B8'}}>
        + Task hinzufügen
      </button>
    </div>
  )
}

function TaskDetailModal({task,columns,onClose,onSaved,onDeleted,session}) {
  const [form,setForm]=useState({title:task.title,description:task.description||'',priority:task.priority,due_date:task.due_date||'',tags:(task.tags||[]).join(', '),cover_color:task.cover_color||'',estimated_hours:task.estimated_hours||'',assignee_name:task.assignee_name||'',column_id:task.column_id})
  const [checklist,setChecklist]=useState([])
  const [comments,setComments]=useState([])
  const [attachments,setAttachments]=useState([])
  const [newCheck,setNewCheck]=useState('')
  const [newComment,setNewComment]=useState('')
  const [saving,setSaving]=useState(false)
  const [tab,setTab]=useState('detail')
  const [uploading,setUploading]=useState(false)
  const fileRef=useRef()

  useEffect(()=>{loadChecklist();loadComments();loadAttachments()},[])

  async function loadChecklist(){const{data}=await supabase.from('pm_checklist_items').select('*').eq('task_id',task.id).order('position');setChecklist(data||[])}
  async function loadComments(){const{data}=await supabase.from('pm_comments').select('*').eq('task_id',task.id).order('created_at');setComments(data||[])}
  async function loadAttachments(){const{data}=await supabase.from('pm_attachments').select('*').eq('task_id',task.id).order('created_at',{ascending:false});setAttachments(data||[])}

  async function save(){
    setSaving(true)
    const tags=form.tags?form.tags.split(',').map(t=>t.trim()).filter(Boolean):[]
    await supabase.from('pm_tasks').update({title:form.title.trim(),description:form.description.trim(),priority:form.priority,due_date:form.due_date||null,tags,cover_color:form.cover_color||null,estimated_hours:form.estimated_hours||null,assignee_name:form.assignee_name.trim()||null,column_id:form.column_id,updated_at:new Date().toISOString()}).eq('id',task.id)
    setSaving(false);onSaved()
  }

  async function addCheckItem(){if(!newCheck.trim())return;await supabase.from('pm_checklist_items').insert({task_id:task.id,user_id:session?.user?.id,title:newCheck.trim(),position:checklist.length});setNewCheck('');loadChecklist()}
  async function toggleCheck(item){await supabase.from('pm_checklist_items').update({done:!item.done}).eq('id',item.id);loadChecklist()}
  async function deleteCheck(id){await supabase.from('pm_checklist_items').delete().eq('id',id);loadChecklist()}
  async function addComment(){if(!newComment.trim())return;await supabase.from('pm_comments').insert({task_id:task.id,user_id:session?.user?.id,content:newComment.trim()});setNewComment('');loadComments()}
  async function deleteComment(id){await supabase.from('pm_comments').delete().eq('id',id);loadComments()}

  async function uploadFile(e){
    const file=e.target.files?.[0];if(!file)return;setUploading(true)
    const path=`${session?.user?.id}/${task.id}/${Date.now()}_${file.name}`
    const{error}=await supabase.storage.from('pm-attachments').upload(path,file)
    if(error){setUploading(false);return}
    const{data:{publicUrl}}=supabase.storage.from('pm-attachments').getPublicUrl(path)
    await supabase.from('pm_attachments').insert({task_id:task.id,user_id:session?.user?.id,name:file.name,url:publicUrl,size:file.size,mime_type:file.type})
    setUploading(false);loadAttachments()
  }

  async function deleteAttachment(att){await supabase.from('pm_attachments').delete().eq('id',att.id);loadAttachments()}

  const done=checklist.filter(c=>c.done).length,total=checklist.length
  const TABS=[{id:'detail',label:'📋 Details'},{id:'checklist',label:`✅ Checkliste${total>0?' ('+done+'/'+total+')':''}`},{id:'comments',label:`💬 Kommentare${comments.length>0?' ('+comments.length+')':''}`},{id:'attachments',label:`📎 Anhänge${attachments.length>0?' ('+attachments.length+')':''}`}]

  return (
    <Modal title={null} onClose={onClose} width={580}>
      {form.cover_color&&<div style={{height:8,background:form.cover_color,borderRadius:'16px 16px 0 0'}}/>}
      <div style={{padding:'14px 20px 0',borderBottom:'1px solid #E2E8F0',position:'sticky',top:0,background:'#fff',zIndex:1}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
          <textarea value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
            style={{...inp,fontWeight:700,fontSize:16,resize:'none',border:'none',padding:0,background:'transparent',lineHeight:1.4,flex:1,marginRight:12}} rows={2}/>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#94A3B8',fontSize:22,flexShrink:0}}>×</button>
        </div>
        <div style={{display:'flex',gap:2,overflowX:'auto'}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:'6px 12px',borderRadius:'8px 8px 0 0',border:'none',fontSize:12,fontWeight:tab===t.id?700:400,cursor:'pointer',whiteSpace:'nowrap',background:tab===t.id?'#F8FAFC':'transparent',color:tab===t.id?'#0A66C2':'#64748B',borderBottom:tab===t.id?'2px solid #0A66C2':'2px solid transparent'}}>
            {t.label}
          </button>)}
        </div>
      </div>
      <div style={{padding:'16px 20px',minHeight:260}}>
        {tab==='detail'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={lbl}>Beschreibung</label><textarea style={{...inp,resize:'vertical',minHeight:70}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Details, Links…"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={lbl}>Priorität</label>
              <select style={inp} value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>
                {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Fälligkeitsdatum</label><input type="date" style={inp} value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}/></div>
            <div><label style={lbl}>Zugewiesen an</label><input style={inp} value={form.assignee_name} onChange={e=>setForm(f=>({...f,assignee_name:e.target.value}))} placeholder="Name…"/></div>
            <div><label style={lbl}>Geschätzte Stunden</label><input type="number" style={inp} value={form.estimated_hours} onChange={e=>setForm(f=>({...f,estimated_hours:e.target.value}))} placeholder="z.B. 2.5" step="0.5" min="0"/></div>
          </div>
          <div><label style={lbl}>Spalte verschieben</label>
            <select style={inp} value={form.column_id} onChange={e=>setForm(f=>({...f,column_id:e.target.value}))}>
              {columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Tags (kommagetrennt)</label><input style={inp} value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="Design, Bug, Feature…"/></div>
          <div><label style={lbl}>Cover-Farbe</label>
            <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
              {COVER_COLORS.map(c=><button key={c||'none'} onClick={()=>setForm(f=>({...f,cover_color:c}))}
                style={{width:26,height:26,borderRadius:6,background:c||'#F1F5F9',border:form.cover_color===c?'3px solid #0F172A':'2px solid #E2E8F0',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>
                {!c&&'✕'}
              </button>)}
            </div>
          </div>
        </div>}

        {tab==='checklist'&&<div>
          {total>0&&<div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#64748B',marginBottom:5}}><span>Fortschritt</span><span>{done}/{total} ({Math.round(done/total*100)}%)</span></div>
            <div style={{height:6,background:'#E5E7EB',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:(done/total*100)+'%',background:done===total?'#22c55e':'#0A66C2',transition:'width 0.3s',borderRadius:99}}/></div>
          </div>}
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
            {checklist.length===0&&<div style={{color:'#CBD5E1',fontSize:13,textAlign:'center',padding:'16px 0'}}>Noch keine Einträge</div>}
            {checklist.map(item=><div key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,background:item.done?'#F0FDF4':'#F8FAFC',border:'1px solid '+(item.done?'#A7F3D0':'#E5E7EB')}}>
              <input type="checkbox" checked={item.done} onChange={()=>toggleCheck(item)} style={{width:16,height:16,cursor:'pointer',accentColor:'#0A66C2'}}/>
              <span style={{flex:1,fontSize:13,color:item.done?'#64748B':'#0F172A',textDecoration:item.done?'line-through':'none'}}>{item.title}</span>
              <button onClick={()=>deleteCheck(item.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:16}}
                onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
            </div>)}
          </div>
          <div style={{display:'flex',gap:8}}>
            <input style={{...inp,flex:1}} value={newCheck} onChange={e=>setNewCheck(e.target.value)} placeholder="Neues Item…" onKeyDown={e=>e.key==='Enter'&&addCheckItem()}/>
            <button onClick={addCheckItem} style={{padding:'9px 16px',borderRadius:9,background:'#0A66C2',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer'}}>+</button>
          </div>
        </div>}

        {tab==='comments'&&<div>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
            {comments.length===0&&<div style={{color:'#CBD5E1',fontSize:13,textAlign:'center',padding:'16px 0'}}>Noch keine Kommentare</div>}
            {comments.map(c=><div key={c.id} style={{background:'#F8FAFC',borderRadius:10,padding:'10px 12px',border:'1px solid #E5E7EB'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:'#0A66C2'}}>💬 Kommentar</span>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:11,color:'#94A3B8'}}>{new Date(c.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  <button onClick={()=>deleteComment(c.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:14}}
                    onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
                </div>
              </div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{c.content}</div>
            </div>)}
          </div>
          <textarea style={{...inp,resize:'vertical',minHeight:70}} value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Kommentar schreiben… (Strg+Enter zum Senden)" onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&addComment()}/>
          <button onClick={addComment} disabled={!newComment.trim()} style={{marginTop:8,padding:'8px 18px',borderRadius:9,background:'#0A66C2',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!newComment.trim()?0.5:1}}>💬 Senden</button>
        </div>}

        {tab==='attachments'&&<div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
            {attachments.length===0&&<div style={{color:'#CBD5E1',fontSize:13,textAlign:'center',padding:'16px 0'}}>Noch keine Anhänge</div>}
            {attachments.map(a=><div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:'#F8FAFC',border:'1px solid #E5E7EB'}}>
              <span style={{fontSize:22}}>{a.mime_type?.startsWith('image/')?'🖼️':a.mime_type?.includes('pdf')?'📄':a.mime_type?.includes('excel')||a.mime_type?.includes('spreadsheet')?'📊':'📎'}</span>
              <div style={{flex:1,minWidth:0}}>
                <a href={a.url} target="_blank" rel="noreferrer" style={{fontSize:13,fontWeight:600,color:'#0A66C2',textDecoration:'none',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</a>
                {a.size&&<span style={{fontSize:11,color:'#94A3B8'}}>{(a.size/1024).toFixed(0)} KB · {new Date(a.created_at).toLocaleDateString('de-DE')}</span>}
              </div>
              <button onClick={()=>deleteAttachment(a)} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',fontSize:16}}
                onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>×</button>
            </div>)}
          </div>
          <input type="file" ref={fileRef} style={{display:'none'}} onChange={uploadFile} multiple/>
          <button onClick={()=>fileRef.current?.click()} disabled={uploading}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'2px dashed #CBD5E1',background:'#F8FAFC',color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>
            {uploading?'⏳ Hochladen…':'📎 Datei hochladen (Bilder, PDF, Excel, Word…)'}
          </button>
        </div>}
      </div>
      <div style={{padding:'10px 20px 16px',borderTop:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',bottom:0,background:'#fff'}}>
        <button onClick={()=>{if(confirm('Task löschen?'))onDeleted(task.id)}} style={{padding:'7px 14px',borderRadius:99,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#EF4444',fontSize:12,fontWeight:700,cursor:'pointer'}}>🗑 Löschen</button>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:99,border:'1px solid #E2E8F0',background:'transparent',color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>Schließen</button>
          <button onClick={save} disabled={saving} style={{padding:'8px 20px',borderRadius:99,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.6:1}}>{saving?'⏳':'✅ Speichern'}</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Projektmanagement({session}) {
  const [projects,setProjects]=useState([])
  const [activeProj,setActiveProj]=useState(null)
  const [columns,setColumns]=useState([])
  const [tasks,setTasks]=useState([])
  const [loading,setLoading]=useState(true)
  const [checklistProgress,setChecklistProgress]=useState({})
  const [draggingTask,setDraggingTask]=useState(null)
  const [dragOverCol,setDragOverCol]=useState(null)
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

  useEffect(()=>{loadProjects()},[])
  useEffect(()=>{if(activeProj){loadColumns();loadTasks()}},[activeProj])

  function showFlash(msg,type='ok'){setFlash({msg,type});setTimeout(()=>setFlash(null),3000)}

  async function loadProjects(){
    setLoading(true)
    const{data}=await supabase.from('pm_projects').select('*').order('created_at')
    setProjects(data||[])
    if(data?.length>0&&!activeProj)setActiveProj(data[0].id)
    else if(!data?.length)setLoading(false)
  }
  async function loadColumns(){const{data}=await supabase.from('pm_columns').select('*').eq('project_id',activeProj).order('position');setColumns(data||[]);setLoading(false)}
  async function loadTasks(){
    const{data}=await supabase.from('pm_tasks').select('*').eq('project_id',activeProj).order('position')
    setTasks(data||[])
    if(data?.length){
      const ids=data.map(t=>t.id)
      const{data:items}=await supabase.from('pm_checklist_items').select('task_id,done').in('task_id',ids)
      const prog={}
      items?.forEach(i=>{if(!prog[i.task_id])prog[i.task_id]={done:0,total:0};prog[i.task_id].total++;if(i.done)prog[i.task_id].done++})
      setChecklistProgress(prog)
    }
  }

  function sortedTasks(colTasks){
    return [...colTasks].sort((a,b)=>{
      if(sortBy==='position')return a.position-b.position
      if(sortBy==='priority'){const o={urgent:0,high:1,medium:2,low:3};return(o[a.priority]||2)-(o[b.priority]||2)}
      if(sortBy==='due_date')return(a.due_date||'9999')<(b.due_date||'9999')?-1:1
      if(sortBy==='title')return(a.title||'').localeCompare(b.title||'')
      return 0
    })
  }

  async function handleSaveProject(){
    if(!projForm.name.trim())return;setSaving(true)
    const uid=session?.user?.id
    const{data,error}=await supabase.from('pm_projects').insert({user_id:uid,name:projForm.name.trim(),description:projForm.description.trim(),color:projForm.color}).select().single()
    if(error){showFlash(error.message,'err');setSaving(false);return}
    await supabase.from('pm_columns').insert([{name:'Offen',color:'#64748B',position:0},{name:'In Arbeit',color:'#0A66C2',position:1},{name:'Review',color:'#F59E0B',position:2},{name:'Erledigt',color:'#22C55E',position:3}].map(c=>({...c,project_id:data.id,user_id:uid})))
    setSaving(false);setProjModal(null);setProjForm({name:'',description:'',color:'#0A66C2'})
    await loadProjects();setActiveProj(data.id);showFlash('✅ Projekt erstellt!')
  }

  async function handleSaveCol(){
    if(!colForm.name.trim())return;setSaving(true)
    const uid=session?.user?.id
    if(!colModal||colModal==='new'){await supabase.from('pm_columns').insert({project_id:activeProj,user_id:uid,name:colForm.name.trim(),color:colForm.color,position:columns.length,wip_limit:colForm.wip_limit||null})}
    else{await supabase.from('pm_columns').update({name:colForm.name.trim(),color:colForm.color,wip_limit:colForm.wip_limit||null}).eq('id',colModal.id)}
    setSaving(false);setColModal(null);loadColumns();showFlash('Spalte gespeichert')
  }

  async function handleDeleteCol(col){
    if(!confirm(`Spalte "${col.name}" löschen?`))return
    await supabase.from('pm_columns').delete().eq('id',col.id)
    setColModal(null);loadColumns();loadTasks()
  }

  async function handleQuickAdd(){
    if(!quickTitle.trim()||!addTaskCol)return;setSaving(true)
    const pos=tasks.filter(t=>t.column_id===addTaskCol).length
    await supabase.from('pm_tasks').insert({title:quickTitle.trim(),column_id:addTaskCol,project_id:activeProj,user_id:session?.user?.id,priority:'medium',position:pos})
    setQuickTitle('');setAddTaskCol(null);setSaving(false);loadTasks()
  }

  async function handleDrop(colId){
    if(!draggingTask)return
    if(draggingTask.column_id!==colId){const pos=tasks.filter(t=>t.column_id===colId).length;await supabase.from('pm_tasks').update({column_id:colId,position:pos}).eq('id',draggingTask.id);loadTasks()}
    setDraggingTask(null);setDragOverCol(null)
  }

  async function handleTaskDeleted(id){await supabase.from('pm_tasks').delete().eq('id',id);setTaskDetail(null);loadTasks();showFlash('Task gelöscht')}
  async function handleTaskSaved(){setTaskDetail(null);loadTasks();showFlash('✅ Gespeichert')}

  const proj=projects.find(p=>p.id===activeProj)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 56px)',overflow:'hidden'}}>
      {/* Flash */}
      {flash&&<div style={{position:'fixed',top:16,right:16,zIndex:2000,padding:'10px 18px',borderRadius:10,fontSize:13,fontWeight:600,background:flash.type==='err'?'#FEF2F2':'#F0FDF4',color:flash.type==='err'?'#991B1B':'#065F46',border:'1px solid '+(flash.type==='err'?'#FCA5A5':'#A7F3D0'),boxShadow:'0 4px 16px rgba(0,0,0,0.12)',pointerEvents:'none'}}>{flash.msg}</div>}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingBottom:14,borderBottom:'1px solid #E2E8F0',flexShrink:0,gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {proj&&<div style={{width:10,height:10,borderRadius:'50%',background:proj.color}}/>}
          <h1 style={{fontSize:20,fontWeight:800,color:'#0F172A',margin:0}}>{proj?proj.name:'Projektmanagement'}</h1>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {projects.map(p=><button key={p.id} onClick={()=>setActiveProj(p.id)}
              style={{padding:'4px 12px',borderRadius:99,fontSize:12,fontWeight:700,cursor:'pointer',border:'1.5px solid '+(activeProj===p.id?p.color:'#E2E8F0'),background:activeProj===p.id?p.color:'transparent',color:activeProj===p.id?'#fff':'#64748B'}}>
              {p.name}
            </button>)}
            <button onClick={()=>setProjModal('new')} style={{padding:'4px 10px',borderRadius:99,fontSize:12,fontWeight:700,cursor:'pointer',border:'1.5px dashed #CBD5E1',background:'transparent',color:'#94A3B8'}}>+ Projekt</button>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:4,background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:9,padding:'4px 8px'}}>
            <span style={{fontSize:11,color:'#64748B',fontWeight:600,marginRight:4}}>Sortieren:</span>
            {[['position','Standard'],['priority','Priorität'],['due_date','Fälligkeit'],['title','Name']].map(([v,l])=>(
              <button key={v} onClick={()=>setSortBy(v)} style={{padding:'3px 8px',borderRadius:6,border:'none',fontSize:11,fontWeight:sortBy===v?700:400,cursor:'pointer',background:sortBy===v?'#0A66C2':'transparent',color:sortBy===v?'#fff':'#64748B'}}>{l}</button>
            ))}
          </div>
          {activeProj&&<button onClick={()=>{setColModal('new');setColForm({name:'',color:'#0A66C2',wip_limit:''})}} style={{padding:'6px 14px',borderRadius:9,border:'1px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Spalte</button>}
        </div>
      </div>

      {/* Board */}
      {loading?(
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8'}}>⏳ Lade Board…</div>
      ):projects.length===0?(
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
          <div style={{fontSize:56}}>📋</div>
          <div style={{fontSize:20,fontWeight:800,color:'#0F172A'}}>Kein Projekt</div>
          <button onClick={()=>setProjModal('new')} style={{padding:'10px 24px',borderRadius:10,background:'#0A66C2',color:'#fff',border:'none',fontSize:14,fontWeight:700,cursor:'pointer'}}>+ Projekt erstellen</button>
        </div>
      ):(
        <div style={{flex:1,overflowX:'auto',overflowY:'hidden',paddingTop:14}}>
          <div style={{display:'flex',gap:14,minHeight:'100%',alignItems:'flex-start',paddingBottom:16}}>
            {columns.map(col=><KanbanColumn key={col.id} col={col}
              tasks={sortedTasks(tasks.filter(t=>t.column_id===col.id))}
              draggingId={draggingTask?.id} dragOverColId={dragOverCol}
              onDragStart={setDraggingTask} onDragEnd={()=>{setDraggingTask(null);setDragOverCol(null)}}
              onDragOver={setDragOverCol} onDrop={handleDrop}
              onTaskOpen={setTaskDetail}
              onAddTask={colId=>{setAddTaskCol(colId);setQuickTitle('')}}
              onEditCol={col=>{setColModal(col);setColForm({name:col.name,color:col.color,wip_limit:col.wip_limit||''})}}
              checklistProgress={checklistProgress}/>)}
            <div style={{width:244,flexShrink:0}}>
              <button onClick={()=>{setColModal('new');setColForm({name:'',color:'#0A66C2',wip_limit:''})}}
                style={{width:'100%',padding:'12px',borderRadius:12,border:'2px dashed #E2E8F0',background:'rgba(255,255,255,0.5)',cursor:'pointer',fontSize:13,color:'#94A3B8',fontWeight:600}}
                onMouseEnter={e=>{e.currentTarget.style.background='#F8FAFC';e.currentTarget.style.borderColor='#CBD5E1'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.5)';e.currentTarget.style.borderColor='#E2E8F0'}}>
                + Neue Spalte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Task */}
      {addTaskCol!==null&&<Modal title="⚡ Task erstellen" onClose={()=>setAddTaskCol(null)} width={400}>
        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
          <input style={inp} value={quickTitle} onChange={e=>setQuickTitle(e.target.value)} placeholder="Task-Titel…" autoFocus onKeyDown={e=>e.key==='Enter'&&handleQuickAdd()}/>
          <div style={{fontSize:12,color:'#94A3B8'}}>Tipp: Danach kannst du Details, Checkliste & Anhänge hinzufügen.</div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',justifyContent:'flex-end',gap:10}}>
          <button onClick={()=>setAddTaskCol(null)} style={{padding:'8px 18px',borderRadius:99,border:'1px solid #E2E8F0',background:'transparent',color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={handleQuickAdd} disabled={!quickTitle.trim()} style={{padding:'8px 18px',borderRadius:99,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!quickTitle.trim()?0.5:1}}>✅ Erstellen</button>
        </div>
      </Modal>}

      {/* Task Detail */}
      {taskDetail&&<TaskDetailModal task={taskDetail} columns={columns} onClose={()=>setTaskDetail(null)} onSaved={handleTaskSaved} onDeleted={handleTaskDeleted} session={session}/>}

      {/* Spalten Modal */}
      {colModal!==null&&<Modal title={colModal==='new'?'+ Neue Spalte':'✏️ Spalte bearbeiten'} onClose={()=>setColModal(null)} width={380}>
        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={lbl}>Name *</label><input style={inp} value={colForm.name} onChange={e=>setColForm(f=>({...f,name:e.target.value}))} placeholder="z.B. In Review" autoFocus onKeyDown={e=>e.key==='Enter'&&handleSaveCol()}/></div>
          <div><label style={lbl}>WIP-Limit (max. Tasks, optional)</label><input type="number" style={inp} value={colForm.wip_limit} onChange={e=>setColForm(f=>({...f,wip_limit:e.target.value}))} placeholder="Kein Limit" min="1"/></div>
          <div><label style={lbl}>Farbe</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {COL_COLORS.map(c=><button key={c} onClick={()=>setColForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,border:colForm.color===c?'3px solid #0F172A':'2px solid transparent',cursor:'pointer'}}/>)}
            </div>
          </div>
          {colModal!=='new'&&<button onClick={()=>handleDeleteCol(colModal)} style={{padding:'7px',borderRadius:9,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#EF4444',fontSize:12,fontWeight:700,cursor:'pointer'}}>🗑 Spalte löschen</button>}
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',justifyContent:'flex-end',gap:10,borderTop:'1px solid #F1F5F9'}}>
          <button onClick={()=>setColModal(null)} style={{padding:'8px 18px',borderRadius:99,border:'1px solid #E2E8F0',background:'transparent',color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={handleSaveCol} disabled={saving||!colForm.name.trim()} style={{padding:'8px 20px',borderRadius:99,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving||!colForm.name.trim()?0.5:1}}>{saving?'⏳':'✅ Speichern'}</button>
        </div>
      </Modal>}

      {/* Projekt Modal */}
      {projModal&&<Modal title="📁 Neues Projekt" onClose={()=>setProjModal(null)}>
        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={lbl}>Projektname *</label><input style={inp} value={projForm.name} onChange={e=>setProjForm(f=>({...f,name:e.target.value}))} placeholder="Mein Projekt" autoFocus onKeyDown={e=>e.key==='Enter'&&handleSaveProject()}/></div>
          <div><label style={lbl}>Beschreibung</label><textarea style={{...inp,resize:'vertical',minHeight:60}} value={projForm.description} onChange={e=>setProjForm(f=>({...f,description:e.target.value}))} placeholder="Optional…"/></div>
          <div><label style={lbl}>Farbe</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PROJ_COLORS.map(c=><button key={c} onClick={()=>setProjForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,border:projForm.color===c?'3px solid #0F172A':'2px solid transparent',cursor:'pointer'}}/>)}
            </div>
          </div>
          <div style={{background:'#EFF6FF',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#1D4ED8'}}>✨ Standard-Spalten: Offen, In Arbeit, Review, Erledigt</div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',justifyContent:'flex-end',gap:10,borderTop:'1px solid #F1F5F9'}}>
          <button onClick={()=>setProjModal(null)} style={{padding:'8px 18px',borderRadius:99,border:'1px solid #E2E8F0',background:'transparent',color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={handleSaveProject} disabled={saving||!projForm.name.trim()} style={{padding:'8px 20px',borderRadius:99,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving||!projForm.name.trim()?0.5:1}}>{saving?'⏳':'✅ Erstellen'}</button>
        </div>
      </Modal>}
    </div>
  )
}
