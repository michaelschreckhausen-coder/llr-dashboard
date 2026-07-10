import React, { useState, useEffect } from 'react'
import { Briefcase, Calendar, CheckCircle2, FileText, Pencil, Phone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import MultiAssigneePicker from './leads/MultiAssigneePicker'

const PRIMARY = '#0A6FB0'

const PRIORITY_CFG = {
  low:    { label: 'Niedrig',  color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  normal: { label: 'Normal',   color: '#185FA5', bg: '#EFF6FF', border: '#BFDBFE' },
  high:   { label: 'Hoch',     color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
}

// Aufgaben-Typen (Spalte lead_tasks.task_type). 'aufgabe' = Default/Fallback.
const TASK_TYPES = [
  { value: 'termin',   label: 'Termin',             icon: <Calendar size={16} strokeWidth={1.75}/> },
  { value: 'telefonat',label: 'Telefonat',          icon: <Phone size={16} strokeWidth={1.75}/> },
  { value: 'email',    label: 'E-Mail',             icon: '✉️' },
  { value: 'linkedin', label: 'LinkedIn-Nachricht', icon: <Briefcase size={16} strokeWidth={1.75}/> },
  { value: 'notiz',    label: 'Notiz / Follow-up',  icon: <FileText size={16} strokeWidth={1.75}/> },
  { value: 'aufgabe',  label: 'Aufgabe / Sonstiges',icon: <CheckCircle2 size={16} strokeWidth={1.75}/> },
]
const TASK_TYPE_CFG = Object.fromEntries(TASK_TYPES.map(t => [t.value, t]))

export default function LeadTasks({ leadId, teamId, session, members = [] }) {
  const [tasks,       setTasks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [flash,       setFlash]       = useState(null)
  // Multi-Assignee (seit 2026-06-02): assigned_to_ids ist Single-Source.
  // assigned_to bleibt nicht im Form-State — wird beim Save als Mirror gesetzt.
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: 'normal', task_type: 'aufgabe', assigned_to_ids: []
  })

  const uid = session?.user?.id
  const flash_ = (msg, type = 'ok') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3000) }

  useEffect(() => { if (leadId) load() }, [leadId])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('lead_tasks')
      .select('*, lead_task_assignees(user_id)')
      .eq('lead_id', leadId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    // Nur Aufgaben des aktiven Teams
    if (teamId) q = q.eq('team_id', teamId)
    else q = q.is('team_id', null)
    const { data } = await q
    // assigned_to_ids als denormalisiertes Array auf jedem Task
    setTasks((data || []).map(t => ({
      ...t,
      assigned_to_ids: (t.lead_task_assignees || []).map(r => r.user_id).filter(Boolean),
    })))
    setLoading(false)
  }

  function resetForm() {
    setForm({ title: '', description: '', due_date: '', priority: 'normal', task_type: 'aufgabe', assigned_to_ids: [] })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(task) {
    setForm({
      title:           task.title || '',
      description:     task.description || '',
      due_date:        task.due_date || '',
      priority:        task.priority || 'normal',
      task_type:       task.task_type || 'aufgabe',
      assigned_to_ids: Array.isArray(task.assigned_to_ids) ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : []),
    })
    setEditId(task.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) { flash_('Titel eingeben', 'err'); return }
    setSaving(true)
    const assigneeIds = (form.assigned_to_ids || []).filter(Boolean)
    const payload = {
      lead_id:     leadId,
      team_id:     teamId || null,
      created_by:  uid,
      title:       form.title.trim(),
      description: form.description.trim() || null,
      due_date:    form.due_date || null,
      priority:    form.priority,
      task_type:   form.task_type || 'aufgabe',
      // Legacy-Mirror = erster Assignee, NULL bei 0
      assigned_to: assigneeIds[0] || null,
    }
    if (editId) {
      const { error } = await supabase.from('lead_tasks').update(payload).eq('id', editId)
      if (error) { flash_(error.message, 'err'); setSaving(false); return }
      // Junction-Diff applien
      await syncAssignees(editId, assigneeIds)
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...payload, assigned_to_ids: assigneeIds } : t))
      flash_('Aufgabe aktualisiert')
    } else {
      const { data, error } = await supabase.from('lead_tasks').insert(payload).select().single()
      if (error) { flash_(error.message, 'err'); setSaving(false); return }
      // Junction-Inserts
      if (assigneeIds.length > 0) {
        const rows = assigneeIds.map(userId => ({ task_id: data.id, user_id: userId, assigned_by: uid }))
        const { error: assignErr } = await supabase.from('lead_task_assignees').insert(rows)
        if (assignErr) {
          flash_('Aufgabe angelegt, aber Zuweisung fehlgeschlagen: ' + assignErr.message, 'err')
        }
      }
      setTasks(prev => [{ ...data, assigned_to_ids: assigneeIds }, ...prev])
      flash_('Aufgabe erstellt')
    }
    resetForm()
    setSaving(false)
  }

  // Junction-Diff fuer einen existierenden Task: ermittelt was rein und was raus muss.
  async function syncAssignees(taskId, nextIds) {
    const prev = tasks.find(t => t.id === taskId)
    const prevIds = Array.isArray(prev?.assigned_to_ids) ? prev.assigned_to_ids : []
    const toAdd    = nextIds.filter(id => !prevIds.includes(id))
    const toRemove = prevIds.filter(id => !nextIds.includes(id))
    if (toRemove.length > 0) {
      await supabase.from('lead_task_assignees').delete()
        .eq('task_id', taskId).in('user_id', toRemove)
    }
    if (toAdd.length > 0) {
      const rows = toAdd.map(userId => ({ task_id: taskId, user_id: userId, assigned_by: uid }))
      await supabase.from('lead_task_assignees').insert(rows)
    }
  }

  async function toggleDone(task) {
    const done = task.status !== 'done'
    const { error } = await supabase.from('lead_tasks').update({
      status: done ? 'done' : 'open',
      completed_at: done ? new Date().toISOString() : null,
    }).eq('id', task.id)
    if (!error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null } : t))
  }

  async function deleteTask(id) {
    await supabase.from('lead_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // Mitglieder-Name aus ID
  function memberName(userId) {
    if (!userId) return null
    if (userId === uid) return 'Ich'
    const m = members.find(m => m.user_id === userId)
    return m?.profile?.full_name || m?.profile?.email?.split('@')[0] || 'Teammitglied'
  }

  const today = new Date().toISOString().split('T')[0]
  const overdue = (t) => t.due_date && t.due_date < today && t.status === 'open'
  const dueToday = (t) => t.due_date === today && t.status === 'open'

  const open = tasks.filter(t => t.status === 'open')
  const done = tasks.filter(t => t.status === 'done')

  const inp = { width: '100%', padding: '8px 10px', border: '1.5px solid #E4E7EC', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'Inter,sans-serif' }

  return (
    <div>
      {/* Flash */}
      {flash && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: flash.type === 'err' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'err' ? '#991B1B' : '#065F46', border: '1px solid ' + (flash.type === 'err' ? '#FECACA' : '#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
          Aufgaben
          {open.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, background: PRIMARY, color: '#fff', borderRadius: 99, padding: '1px 7px', fontWeight: 700 }}>{open.length}</span>}
        </div>
        {!showForm && (
          <button className="lk-btn lk-btn-primary" onClick={() => setShowForm(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            + Neue Aufgabe
          </button>
        )}
      </div>

      {/* Formular */}
      {showForm && (
        <div style={{ background: '#F8FAFC', border: '1.5px solid ' + PRIMARY, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {editId ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
          </div>

          {/* Titel */}
          <div style={{ marginBottom: 10 }}>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Aufgabe beschreiben…" style={{ ...inp, fontWeight: 600 }}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && save()} autoFocus/>
          </div>

          {/* Beschreibung */}
          <div style={{ marginBottom: 10 }}>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optionale Beschreibung…" rows={2}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}/>
          </div>

          {/* Aufgaben-Typ */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Art der Aufgabe</div>
            <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))} style={inp}>
              {TASK_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>

          {/* Datum + Priorität + Zuweisung */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Fälligkeitsdatum</div>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                min={today} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Priorität</div>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                <option value="low">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="high">Hoch</option>
              </select>
            </div>
          </div>

          {/* Multi-Assignee-Picker (seit 2026-06-02) */}
          {members.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Verantwortliche</div>
              <MultiAssigneePicker
                value={form.assigned_to_ids}
                onChange={(ids) => setForm(f => ({ ...f, assigned_to_ids: ids }))}
                members={members}
                uid={uid}
                disabled={saving}
              />
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="lk-btn lk-btn-ghost" onClick={resetForm}
              >
              Abbrechen
            </button>
            <button className="lk-btn lk-btn-primary" onClick={save} disabled={saving}
              >
              {saving ? '…' : editId ? 'Speichern' : '+ Erstellen'}
            </button>
          </div>
        </div>
      )}

      {/* Aufgaben-Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#CBD5E1', fontSize: 13 }}>Lädt…</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#CBD5E1' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Keine Aufgaben für diesen Lead</div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#E2E8F0' }}>Klicke "+ Neue Aufgabe" um eine zu erstellen</div>
        </div>
      ) : (
        <div>
          {/* Offene Aufgaben */}
          {open.map(task => {
            const p = PRIORITY_CFG[task.priority] || PRIORITY_CFG.normal
            const isOverdue = overdue(task)
            const isToday   = dueToday(task)
            const assigneeIds = Array.isArray(task.assigned_to_ids) ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : [])
            const isOwn     = task.created_by === uid

            return (
              <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                {/* Checkbox */}
                <button onClick={() => toggleDone(task)}
                  style={{ width: 20, height: 20, borderRadius: 6, border: '2px solid ' + (isOverdue ? '#FCA5A5' : '#D1D5DB'), background: '#fff', cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F0FDF4'; e.currentTarget.style.borderColor = '#10B981' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = isOverdue ? '#FCA5A5' : '#D1D5DB' }}>
                </button>

                {/* Inhalt */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 3 }}>{task.title}</div>
                  {task.description && <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4, lineHeight: 1.4 }}>{task.description}</div>}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {/* Typ */}
                    {(() => { const tt = TASK_TYPE_CFG[task.task_type] || TASK_TYPE_CFG.aufgabe; return (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                        {tt.icon} {tt.label}
                      </span>
                    ); })()}

                    {/* Priorität */}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: p.bg, color: p.color, border: '1px solid ' + p.border }}>
                      {p.label}
                    </span>

                    {/* Fälligkeit */}
                    {task.due_date && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: isOverdue ? '#FEF2F2' : isToday ? '#FFFBEB' : '#F3F4F6', color: isOverdue ? '#DC2626' : isToday ? '#D97706' : '#6B7280', border: '1px solid ' + (isOverdue ? '#FECACA' : isToday ? '#FDE68A' : '#E5E7EB') }}>
                        📅 {isOverdue ? 'Überfällig · ' : isToday ? 'Heute · ' : ''}{new Date(task.due_date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                      </span>
                    )}

                    {/* Zugewiesene (Multi) */}
                    {assigneeIds.length === 1 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE' }}>
                        👤 {memberName(assigneeIds[0])}
                      </span>
                    )}
                    {assigneeIds.length > 1 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE' }}>
                        👥 {assigneeIds.length} Verantwortliche
                      </span>
                    )}
                  </div>
                </div>

                {/* Aktionen */}
                {isOwn && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="lk-btn lk-btn-ghost" onClick={() => startEdit(task)}
                      style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Bearbeiten"><Pencil size={14} strokeWidth={1.75}/></button>
                    <button onClick={() => deleteTask(task.id)}
                      style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #FECACA', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Löschen">×</button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Erledigte Aufgaben (zusammengeklappt) */}
          {done.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', cursor: 'pointer', padding: '6px 0', userSelect: 'none' }}>
                ✓ {done.length} erledigt
              </summary>
              {done.map(task => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F9FAFB', opacity: 0.6 }}>
                  <button onClick={() => toggleDone(task)}
                    style={{ width: 20, height: 20, borderRadius: 6, border: '2px solid #10B981', background: '#10B981', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}>✓</button>
                  <div style={{ flex: 1, fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>{task.title}</div>
                  {task.created_by === uid && (
                    <button onClick={() => deleteTask(task.id)}
                      style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#CBD5E1' }}>×</button>
                  )}
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  )
}
