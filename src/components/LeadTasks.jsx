import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PRIMARY = 'rgb(49,90,231)'

const PRIORITY_CFG = {
  low:    { label: 'Niedrig',  color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  normal: { label: 'Normal',   color: '#185FA5', bg: '#EFF6FF', border: '#BFDBFE' },
  high:   { label: 'Hoch',     color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
}

export default function LeadTasks({ leadId, teamId, session, members = [] }) {
  const [tasks,       setTasks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [flash,       setFlash]       = useState(null)
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: 'normal', assigned_to: ''
  })

  const uid = session?.user?.id
  const flash_ = (msg, type = 'ok') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3000) }

  useEffect(() => { if (leadId) load() }, [leadId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('lead_tasks')
      .select('*')
      .eq('lead_id', leadId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  function resetForm() {
    setForm({ title: '', description: '', due_date: '', priority: 'normal', assigned_to: '' })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(task) {
    setForm({
      title:       task.title || '',
      description: task.description || '',
      due_date:    task.due_date || '',
      priority:    task.priority || 'normal',
      assigned_to: task.assigned_to || '',
    })
    setEditId(task.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) { flash_('Titel eingeben', 'err'); return }
    setSaving(true)
    const payload = {
      lead_id:     leadId,
      team_id:     teamId || null,
      created_by:  uid,
      title:       form.title.trim(),
      description: form.description.trim() || null,
      due_date:    form.due_date || null,
      priority:    form.priority,
      assigned_to: form.assigned_to || null,
    }
    if (editId) {
      const { error } = await supabase.from('lead_tasks').update(payload).eq('id', editId)
      if (error) { flash_(error.message, 'err'); setSaving(false); return }
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...payload } : t))
      flash_('✓ Aufgabe aktualisiert')
    } else {
      const { data, error } = await supabase.from('lead_tasks').insert(payload).select().single()
      if (error) { flash_(error.message, 'err'); setSaving(false); return }
      setTasks(prev => [data, ...prev])
      flash_('✓ Aufgabe erstellt')
    }
    resetForm()
    setSaving(false)
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
          <button onClick={() => setShowForm(true)}
            style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                <option value="low">🟢 Niedrig</option>
                <option value="normal">🔵 Normal</option>
                <option value="high">🔴 Hoch</option>
              </select>
            </div>
          </div>

          {/* Zuweisung an Teammitglied */}
          {members.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Zuweisen an</div>
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={inp}>
                <option value="">— Nicht zugewiesen (ich)</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === uid ? '👤 Ich (selbst)' : (m.profile?.full_name || m.profile?.email || 'Mitglied')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={resetForm}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
              Abbrechen
            </button>
            <button onClick={save} disabled={saving}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saving ? '#E5E7EB' : PRIMARY, color: saving ? '#9CA3AF' : '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '⏳ …' : editId ? 'Speichern' : '+ Erstellen'}
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
            const assignee  = memberName(task.assigned_to)
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
                    {/* Priorität */}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: p.bg, color: p.color, border: '1px solid ' + p.border }}>
                      {p.label}
                    </span>

                    {/* Fälligkeit */}
                    {task.due_date && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: isOverdue ? '#FEF2F2' : isToday ? '#FFFBEB' : '#F3F4F6', color: isOverdue ? '#DC2626' : isToday ? '#D97706' : '#6B7280', border: '1px solid ' + (isOverdue ? '#FECACA' : isToday ? '#FDE68A' : '#E5E7EB') }}>
                        📅 {isOverdue ? '⚠ Überfällig · ' : isToday ? '⚡ Heute · ' : ''}{new Date(task.due_date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                      </span>
                    )}

                    {/* Zugewiesen */}
                    {assignee && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE' }}>
                        👤 {assignee}
                      </span>
                    )}
                  </div>
                </div>

                {/* Aktionen */}
                {isOwn && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => startEdit(task)}
                      style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Bearbeiten">✏</button>
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
