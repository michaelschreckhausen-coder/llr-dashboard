// src/components/delivery/TimeEntryQuickAdd.jsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const MAX_BACKDATING_DAYS = 14

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function parseDurationToSeconds(input) {
  if (!input) return null
  const s = String(input).trim().replace(',', '.')
  if (!s) return null
  if (/^\d+:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number)
    if (m >= 60) return null
    return h * 3600 + m * 60
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Math.round(parseFloat(s) * 3600)
  }
  if (/^\d+m(in)?$/.test(s)) {
    return parseInt(s, 10) * 60
  }
  return null
}

export default function TimeEntryQuickAdd({
  open,
  onClose,
  onCreated,
  defaultProjectId = null,
  defaultTaskId = null,
}) {
  const { activeTeamId } = useTeam()

  const [mode, setMode] = useState('duration')
  const [date, setDate] = useState(todayISO())
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [taskId, setTaskId] = useState(defaultTaskId || '')
  const [activityTypeId, setActivityTypeId] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [description, setDescription] = useState('')
  const [isBillable, setIsBillable] = useState(true)

  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setMode('duration')
    setDate(todayISO())
    setProjectId(defaultProjectId || '')
    setTaskId(defaultTaskId || '')
    setActivityTypeId('')
    setDurationInput('')
    setStartTime('09:00')
    setEndTime('10:00')
    setDescription('')
    setIsBillable(true)
    setError(null)
  }, [open, defaultProjectId, defaultTaskId])

  useEffect(() => {
    if (!open || !activeTeamId) return
    let cancel = false
    ;(async () => {
      const [p, a] = await Promise.all([
        supabase.from('pm_projects').select('id, name').eq('team_id', activeTeamId).order('name'),
        supabase.from('pm_activity_types').select('id, name, color').eq('team_id', activeTeamId).eq('is_archived', false).order('sort_order'),
      ])
      if (cancel) return
      setProjects(p.data || [])
      setActivityTypes(a.data || [])
    })()
    return () => { cancel = true }
  }, [open, activeTeamId])

  useEffect(() => {
    if (!projectId) { setTasks([]); return }
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('pm_tasks')
        .select('id, title')
        .eq('project_id', projectId)
        .order('title')
      if (!cancel) setTasks(data || [])
    })()
    return () => { cancel = true }
  }, [projectId])

  const isDateValid = useMemo(() => {
    if (!date) return false
    const picked = new Date(date + 'T00:00:00')
    const earliest = new Date()
    earliest.setDate(earliest.getDate() - MAX_BACKDATING_DAYS)
    earliest.setHours(0, 0, 0, 0)
    const latest = new Date()
    latest.setHours(23, 59, 59, 999)
    return picked >= earliest && picked <= latest
  }, [date])

  const handleSubmit = async () => {
    setError(null)
    if (!projectId) { setError('Projekt wählen'); return }
    if (!isDateValid) { setError(`Datum maximal ${MAX_BACKDATING_DAYS} Tage rückwirkend, nicht in der Zukunft.`); return }

    let startedAt, endedAt
    if (mode === 'duration') {
      const seconds = parseDurationToSeconds(durationInput)
      if (!seconds || seconds < 60) {
        setError('Dauer ungültig (Beispiele: 1.5, 1:30, 90m)')
        return
      }
      startedAt = new Date(date + 'T09:00:00')
      endedAt = new Date(startedAt.getTime() + seconds * 1000)
    } else {
      if (!startTime || !endTime) { setError('Start- und Endzeit angeben'); return }
      startedAt = new Date(date + 'T' + startTime + ':00')
      endedAt = new Date(date + 'T' + endTime + ':00')
      if (endedAt <= startedAt) { setError('Endzeit muss nach Startzeit liegen'); return }
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Nicht eingeloggt')

      const { data, error: err } = await supabase
        .from('pm_time_entries')
        .insert({
          team_id: activeTeamId,
          user_id: user.id,
          project_id: projectId,
          task_id: taskId || null,
          activity_type_id: activityTypeId || null,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          description: description || null,
          is_billable: isBillable,
        })
        .select()
        .single()

      if (err) throw err
      if (onCreated) onCreated(data)
      onClose && onClose()
    } catch (err) {
      setError(err.message || 'Speichern fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white', borderRadius: 8, padding: 24,
          width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>
          Zeit nachtragen
        </h2>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, padding: 4, backgroundColor: '#f3f4f6', borderRadius: 6 }}>
          {[
            { key: 'duration', label: 'Dauer' },
            { key: 'range', label: 'Zeitraum' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMode(opt.key)}
              style={{
                flex: 1, padding: '6px 12px', border: 'none', borderRadius: 4,
                backgroundColor: mode === opt.key ? 'white' : 'transparent',
                color: mode === opt.key ? 'rgb(17,24,39)' : 'rgb(107,114,128)',
                fontWeight: mode === opt.key ? 600 : 400,
                cursor: 'pointer',
                boxShadow: mode === opt.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <Field label="Datum">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </Field>

        {mode === 'duration' ? (
          <Field label="Dauer" hint="z.B. 1.5  oder  1:30  oder  90m">
            <input
              type="text"
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              placeholder="1:30"
              style={inputStyle}
              autoFocus
            />
          </Field>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Start" style={{ flex: 1 }}>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Ende" style={{ flex: 1 }}>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        )}

        <Field label="Projekt">
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId('') }} style={inputStyle}>
            <option value="">— wählen —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Task (optional)">
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={inputStyle} disabled={!projectId}>
            <option value="">— ohne Task —</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>

        <Field label="Tätigkeit (optional)">
          <select value={activityTypeId} onChange={(e) => setActivityTypeId(e.target.value)} style={inputStyle}>
            <option value="">— keine —</option>
            {activityTypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>

        <Field label="Beschreibung (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />
          <span style={{ fontSize: 14 }}>Abrechenbar</span>
        </label>

        {error && (
          <div style={{ padding: 10, marginBottom: 12, backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid rgb(209,213,219)', borderRadius: 6, cursor: 'pointer' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '8px 16px', backgroundColor: 'var(--wl-primary, rgb(49,90,231))', color: 'white',
              border: 'none', borderRadius: 6, fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid rgb(209,213,219)', borderRadius: 4,
  boxSizing: 'border-box', backgroundColor: 'white',
}

function Field({ label, hint, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...(style || {}) }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'rgb(55,65,81)' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'rgb(107,114,128)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}
