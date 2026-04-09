import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── Farben ───────────────────────────────────────────────────────────────────
const PRIORITY = {
  low:    { label:'Niedrig',  color:'#22c55e', bg:'#F0FDF4', border:'#86EFAC' },
  medium: { label:'Mittel',   color:'#f59e0b', bg:'#FFFBEB', border:'#FDE68A' },
  high:   { label:'Hoch',     color:'#ef4444', bg:'#FEF2F2', border:'#FCA5A5' },
  urgent: { label:'Dringend', color:'#7c3aed', bg:'#F5F3FF', border:'#DDD6FE' },
}

const COL_COLORS = ['#0A66C2','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#0891B2','#64748B']
const PROJECT_COLORS = ['#0A66C2','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#0891B2','#F97316']

function relDate(iso) {
  if (!iso) return null
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((d - now) / 86400000)
  if (diff < -1)  return { text: `${Math.abs(diff)}d überfällig`, overdue: true }
  if (diff === -1) return { text: 'Gestern überfällig', overdue: true }
  if (diff === 0)  return { text: 'Heute', overdue: false }
  if (diff === 1)  return { text: 'Morgen', overdue: false }
  return { text: d.toLocaleDateString('de-DE',{day:'2-digit',month:'short'}), overdue: false }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'#0F172A' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:20, lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' }
const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onOpen, onDragStart, onDragEnd, isDragging }) {
  const pr = PRIORITY[task.priority] || PRIORITY.medium
  const due = relDate(task.due_date)
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed='move'; onDragStart(task) }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      style={{
        background:'#fff', borderRadius:12, border:'1px solid #E5E7EB',
        padding:'12px 14px', marginBottom:8, cursor:'pointer',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
        opacity: isDragging ? 0.5 : 1,
        transition:'box-shadow 0.15s, opacity 0.15s',
        userSelect:'none',
      }}
      onMouseEnter={e => { if(!isDragging) e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div style={{ fontWeight:600, fontSize:13, color:'#0F172A', lineHeight:1.45, marginBottom:8 }}>{task.title}</div>
      {task.description && (
        <div style={{ fontSize:11, color:'#94A3B8', marginBottom:8, lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {task.description}
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:pr.bg, color:pr.color, border:'1px solid '+pr.border }}>
          {pr.label}
        </span>
        {task.tags?.map((t,i) => (
          <span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE' }}>{t}</span>
        ))}
        {due && (
          <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:99, background:due.overdue?'#FEF2F2':'#F0FDF4', color:due.overdue?'#EF4444':'#16A34A', marginLeft:'auto' }}>
            📅 {due.text}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({ col, tasks, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop, onTaskOpen, onAddTask, onEditColumn, onDeleteColumn }) {
  const isOver = dragOver === col.id
  return (
    <div style={{ width:280, minWidth:280, flexShrink:0 }}>
      {/* Header */}
      <div style={{ background: col.color+'18', border:'1px solid '+col.color+'33', borderRadius:12, padding:'10px 14px', marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:col.color, flexShrink:0 }}/>
            <span style={{ fontWeight:800, fontSize:13, color:'#0F172A' }}>{col.name}</span>
            <span style={{ fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.8)', color:col.color, border:'1px solid '+col.color+'44', borderRadius:99, padding:'1px 8px' }}>{tasks.length}</span>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={() => onEditColumn(col)} title="Umbenennen"
              style={{ width:24, height:24, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:'#94A3B8', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.06)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>✏️</button>
            <button onClick={() => onAddTask(col.id)} title="Task hinzufügen"
              style={{ width:24, height:24, borderRadius:6, border:'none', background:col.color, cursor:'pointer', color:'#fff', fontSize:16, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
          </div>
        </div>
      </div>
      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
        onDrop={e => { e.preventDefault(); onDrop(col.id) }}
        style={{
          minHeight:120, borderRadius:12, padding:'4px 0',
          background: isOver ? col.color+'12' : 'transparent',
          border: isOver ? '2px dashed '+col.color : '2px dashed transparent',
          transition:'all 0.15s',
        }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={onTaskOpen}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={dragging?.id === task.id}
          />
        ))}
        {tasks.length === 0 && !isOver && (
          <div style={{ textAlign:'center', color:'#CBD5E1', fontSize:12, padding:'24px 0', fontStyle:'italic' }}>
            Noch keine Tasks
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Projektmanagement({ session }) {
  const [projects,    setProjects]    = useState([])
  const [activeProj,  setActiveProj]  = useState(null)
  const [columns,     setColumns]     = useState([])
  const [tasks,       setTasks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [dragging,    setDragging]    = useState(null)
  const [dragOver,    setDragOver]    = useState(null)

  // Modals
  const [taskModal,   setTaskModal]   = useState(null)   // null | 'new' | task-object
  const [colModal,    setColModal]    = useState(null)   // null | 'new' | col-object
  const [projModal,   setProjModal]   = useState(null)   // null | 'new'
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState(null)

  // Forms
  const emptyTask = { title:'', description:'', priority:'medium', due_date:'', tags:'' }
  const [taskForm,    setTaskForm]    = useState(emptyTask)
  const [taskColId,   setTaskColId]   = useState(null)
  const [colForm,     setColForm]     = useState({ name:'', color:'#0A66C2' })
  const [projForm,    setProjForm]    = useState({ name:'', description:'', color:'#0A66C2' })

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (activeProj) { loadColumns(); loadTasks() } }, [activeProj])

  function showFlash(msg, type='ok') { setFlash({msg,type}); setTimeout(()=>setFlash(null),3000) }

  async function loadProjects() {
    setLoading(true)
    const { data } = await supabase.from('pm_projects').select('*').order('created_at')
    setProjects(data||[])
    if (data?.length > 0 && !activeProj) setActiveProj(data[0].id)
    else setLoading(false)
  }

  async function loadColumns() {
    const { data } = await supabase.from('pm_columns').select('*').eq('project_id', activeProj).order('position')
    setColumns(data||[])
    setLoading(false)
  }

  async function loadTasks() {
    const { data } = await supabase.from('pm_tasks').select('*').eq('project_id', activeProj).order('position')
    setTasks(data||[])
  }

  // ── Projekt anlegen
  async function handleSaveProject() {
    if (!projForm.name.trim()) return
    setSaving(true)
    const uid = session?.user?.id
    const { data, error } = await supabase.from('pm_projects').insert({
      user_id: uid, name: projForm.name.trim(),
      description: projForm.description.trim(), color: projForm.color
    }).select().single()
    if (error) { showFlash(error.message,'err'); setSaving(false); return }
    // Standard-Spalten anlegen
    const defCols = [
      { name:'Offen', color:'#64748B', position:0 },
      { name:'In Arbeit', color:'#0A66C2', position:1 },
      { name:'Review', color:'#F59E0B', position:2 },
      { name:'Erledigt', color:'#22C55E', position:3 },
    ]
    await supabase.from('pm_columns').insert(defCols.map(c => ({ ...c, project_id: data.id, user_id: uid })))
    setSaving(false)
    setProjModal(null)
    setProjForm({ name:'', description:'', color:'#0A66C2' })
    await loadProjects()
    setActiveProj(data.id)
    showFlash('✅ Projekt angelegt!')
  }

  // ── Spalte anlegen/umbenennen
  async function handleSaveColumn() {
    if (!colForm.name.trim()) return
    setSaving(true)
    const uid = session?.user?.id
    if (colModal === 'new') {
      const pos = columns.length
      await supabase.from('pm_columns').insert({ project_id: activeProj, user_id: uid, name: colForm.name.trim(), color: colForm.color, position: pos })
    } else {
      await supabase.from('pm_columns').update({ name: colForm.name.trim(), color: colForm.color }).eq('id', colModal.id)
    }
    setSaving(false)
    setColModal(null)
    setColForm({ name:'', color:'#0A66C2' })
    loadColumns()
  }

  async function handleDeleteColumn(col) {
    if (!confirm(`Spalte "${col.name}" und alle Tasks darin löschen?`)) return
    await supabase.from('pm_columns').delete().eq('id', col.id)
    loadColumns(); loadTasks()
  }

  // ── Task anlegen/bearbeiten
  async function handleSaveTask() {
    if (!taskForm.title.trim()) return
    setSaving(true)
    const uid = session?.user?.id
    const tags = taskForm.tags ? taskForm.tags.split(',').map(t=>t.trim()).filter(Boolean) : []
    const payload = {
      title: taskForm.title.trim(), description: taskForm.description.trim(),
      priority: taskForm.priority, due_date: taskForm.due_date || null, tags,
    }
    if (taskModal === 'new') {
      const pos = tasks.filter(t => t.column_id === taskColId).length
      await supabase.from('pm_tasks').insert({ ...payload, column_id: taskColId, project_id: activeProj, user_id: uid, position: pos })
    } else {
      await supabase.from('pm_tasks').update(payload).eq('id', taskModal.id)
    }
    setSaving(false)
    setTaskModal(null)
    setTaskForm(emptyTask)
    loadTasks()
  }

  async function handleDeleteTask(taskId) {
    await supabase.from('pm_tasks').delete().eq('id', taskId)
    setTaskModal(null)
    loadTasks()
  }

  // ── Drag & Drop
  function handleDragStart(task) { setDragging(task) }
  function handleDragEnd()       { setDragging(null); setDragOver(null) }
  function handleDragOver(colId) { setDragOver(colId) }
  async function handleDrop(colId) {
    if (!dragging || dragging.column_id === colId) { setDragging(null); setDragOver(null); return }
    const pos = tasks.filter(t => t.column_id === colId).length
    await supabase.from('pm_tasks').update({ column_id: colId, position: pos }).eq('id', dragging.id)
    setDragging(null); setDragOver(null)
    loadTasks()
  }

  const proj = projects.find(p => p.id === activeProj)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)', overflow:'hidden' }}>

      {/* Flash */}
      {flash && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:2000, padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600,
          background: flash.type==='err'?'#FEF2F2':'#F0FDF4', color: flash.type==='err'?'#991B1B':'#065F46',
          border:'1px solid '+(flash.type==='err'?'#FCA5A5':'#A7F3D0'), boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
          {flash.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 0 16px', borderBottom:'1px solid #E2E8F0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0F172A', margin:0, letterSpacing:'-0.025em' }}>Projektmanagement</h1>
          {/* Projekt-Tabs */}
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {projects.map(p => (
              <button key={p.id} onClick={() => setActiveProj(p.id)}
                style={{ padding:'5px 14px', borderRadius:99, fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
                  background: activeProj===p.id ? p.color : '#F1F5F9',
                  color: activeProj===p.id ? '#fff' : '#64748B' }}>
                {p.name}
              </button>
            ))}
            <button onClick={() => setProjModal('new')}
              style={{ padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:700, cursor:'pointer', border:'2px dashed #CBD5E1', background:'transparent', color:'#94A3B8' }}>
              + Projekt
            </button>
          </div>
        </div>
        {/* Aktionen */}
        <div style={{ display:'flex', gap:8 }}>
          {activeProj && (
            <button onClick={() => { setColModal('new'); setColForm({ name:'', color:'#0A66C2' }) }}
              style={{ padding:'7px 16px', borderRadius:10, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Spalte
            </button>
          )}
        </div>
      </div>

      {/* ── Board ── */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', fontSize:14 }}>
          ⏳ Lade Board…
        </div>
      ) : projects.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
          <div style={{ fontSize:56 }}>📋</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#0F172A' }}>Kein Projekt vorhanden</div>
          <div style={{ fontSize:14, color:'#64748B' }}>Erstelle dein erstes Projekt um loszulegen.</div>
          <button onClick={() => setProjModal('new')}
            style={{ padding:'10px 24px', borderRadius:10, background:'#0A66C2', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            + Erstes Projekt erstellen
          </button>
        </div>
      ) : (
        <div style={{ flex:1, overflowX:'auto', overflowY:'hidden', paddingTop:16 }}>
          <div style={{ display:'flex', gap:16, height:'100%', alignItems:'flex-start', paddingBottom:16 }}>
            {columns.map(col => (
              <KanbanColumn
                key={col.id}
                col={col}
                tasks={tasks.filter(t => t.column_id === col.id).sort((a,b) => a.position - b.position)}
                dragging={dragging}
                dragOver={dragOver}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onTaskOpen={t => { setTaskModal(t); setTaskForm({ title:t.title, description:t.description||'', priority:t.priority, due_date:t.due_date||'', tags:(t.tags||[]).join(', ') }) }}
                onAddTask={colId => { setTaskColId(colId); setTaskModal('new'); setTaskForm(emptyTask) }}
                onEditColumn={col => { setColModal(col); setColForm({ name:col.name, color:col.color }) }}
                onDeleteColumn={handleDeleteColumn}
              />
            ))}
            {/* Spalte hinzufügen */}
            {columns.length === 0 && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width:280, height:200, border:'2px dashed #E2E8F0', borderRadius:14, color:'#94A3B8', gap:8, cursor:'pointer' }}
                onClick={() => { setColModal('new'); setColForm({ name:'', color:'#0A66C2' }) }}>
                <span style={{ fontSize:28 }}>+</span>
                <span style={{ fontSize:13 }}>Erste Spalte anlegen</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Projekt ── */}
      {projModal && (
        <Modal title="📁 Neues Projekt" onClose={() => setProjModal(null)}>
          <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={lbl}>Projektname *</label>
              <input style={inp} value={projForm.name} onChange={e=>setProjForm(f=>({...f,name:e.target.value}))} placeholder="Mein Projekt" autoFocus onKeyDown={e=>e.key==='Enter'&&handleSaveProject()}/>
            </div>
            <div>
              <label style={lbl}>Beschreibung</label>
              <textarea style={{...inp,resize:'vertical',minHeight:60}} value={projForm.description} onChange={e=>setProjForm(f=>({...f,description:e.target.value}))} placeholder="Optional…"/>
            </div>
            <div>
              <label style={lbl}>Farbe</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {PROJECT_COLORS.map(c => (
                  <button key={c} onClick={() => setProjForm(f=>({...f,color:c}))}
                    style={{ width:28, height:28, borderRadius:'50%', background:c, border: projForm.color===c?'3px solid #0F172A':'2px solid transparent', cursor:'pointer' }}/>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding:'10px 20px 18px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
            <button onClick={() => setProjModal(null)} style={{ padding:'8px 18px', borderRadius:99, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={handleSaveProject} disabled={saving||!projForm.name.trim()} style={{ padding:'8px 20px', borderRadius:99, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving||!projForm.name.trim()?0.5:1 }}>
              {saving ? '⏳' : '✅ Projekt erstellen'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Spalte ── */}
      {colModal && (
        <Modal title={colModal==='new' ? '+ Neue Spalte' : '✏️ Spalte bearbeiten'} onClose={() => setColModal(null)} width={400}>
          <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input style={inp} value={colForm.name} onChange={e=>setColForm(f=>({...f,name:e.target.value}))} placeholder="z.B. In Review" autoFocus onKeyDown={e=>e.key==='Enter'&&handleSaveColumn()}/>
            </div>
            <div>
              <label style={lbl}>Farbe</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {COL_COLORS.map(c => (
                  <button key={c} onClick={() => setColForm(f=>({...f,color:c}))}
                    style={{ width:28, height:28, borderRadius:'50%', background:c, border: colForm.color===c?'3px solid #0F172A':'2px solid transparent', cursor:'pointer' }}/>
                ))}
              </div>
            </div>
            {colModal !== 'new' && (
              <button onClick={() => { handleDeleteColumn(colModal); setColModal(null) }}
                style={{ padding:'7px', borderRadius:9, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                🗑 Spalte löschen
              </button>
            )}
          </div>
          <div style={{ padding:'10px 20px 18px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
            <button onClick={() => setColModal(null)} style={{ padding:'8px 18px', borderRadius:99, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={handleSaveColumn} disabled={saving||!colForm.name.trim()} style={{ padding:'8px 20px', borderRadius:99, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving||!colForm.name.trim()?0.5:1 }}>
              {saving ? '⏳' : '✅ Speichern'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Task ── */}
      {taskModal && (
        <Modal title={taskModal==='new' ? '+ Neuer Task' : '✏️ Task bearbeiten'} onClose={() => setTaskModal(null)} width={520}>
          <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={lbl}>Titel *</label>
              <input style={inp} value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="Was soll erledigt werden?" autoFocus/>
            </div>
            <div>
              <label style={lbl}>Beschreibung</label>
              <textarea style={{...inp,resize:'vertical',minHeight:80}} value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} placeholder="Details, Links, Notizen…"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={lbl}>Priorität</label>
                <select style={{...inp}} value={taskForm.priority} onChange={e=>setTaskForm(f=>({...f,priority:e.target.value}))}>
                  {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Fälligkeitsdatum</label>
                <input type="date" style={inp} value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))}/>
              </div>
            </div>
            <div>
              <label style={lbl}>Tags (kommagetrennt)</label>
              <input style={inp} value={taskForm.tags} onChange={e=>setTaskForm(f=>({...f,tags:e.target.value}))} placeholder="z.B. Design, Frontend, Dringend"/>
            </div>
          </div>
          <div style={{ padding:'10px 20px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F1F5F9' }}>
            {taskModal !== 'new' ? (
              <button onClick={() => { if(confirm('Task löschen?')) handleDeleteTask(taskModal.id) }}
                style={{ padding:'7px 16px', borderRadius:99, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                🗑 Löschen
              </button>
            ) : <div/>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setTaskModal(null)} style={{ padding:'8px 18px', borderRadius:99, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button onClick={handleSaveTask} disabled={saving||!taskForm.title.trim()} style={{ padding:'8px 20px', borderRadius:99, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving||!taskForm.title.trim()?0.5:1 }}>
                {saving ? '⏳' : taskModal==='new' ? '✅ Task erstellen' : '✅ Speichern'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
