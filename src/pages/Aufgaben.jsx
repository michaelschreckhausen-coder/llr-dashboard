import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'rgb(49,90,231)'

const PRIORITY_CFG = {
  low:    { label: 'Niedrig', color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', dot: '#9CA3AF' },
  normal: { label: 'Normal',  color: '#185FA5', bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6' },
  high:   { label: 'Hoch',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
}

const FILTERS = [
  { id: 'all',      label: 'Alle offen' },
  { id: 'mine',     label: 'Mir zugewiesen' },
  { id: 'created',  label: 'Von mir erstellt' },
  { id: 'overdue',  label: '⚠ Überfällig' },
  { id: 'today',    label: '⚡ Heute fällig' },
  { id: 'done',     label: '✓ Erledigt' },
]

export default function Aufgaben({ session }) {
  const navigate = useNavigate()
  const { team, members, activeTeamId } = useTeam()
  const [tasks,    setTasks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [profiles, setProfiles] = useState({})

  const uid   = session?.user?.id
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { load() }, [activeTeamId])

  async function load() {
    setLoading(true)
    // Alle Aufgaben laden auf die ich Zugriff habe (via RLS)
    const { data } = await supabase
      .from('lead_tasks')
      .select('*, leads(id, first_name, last_name, name, company, avatar_url)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setTasks(data || [])

    // Profile für Avatare laden
    const uids = [...new Set((data || []).flatMap(t => [t.created_by, t.assigned_to]).filter(Boolean))]
    if (uids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id,full_name,email,avatar_url').in('id', uids)
      const map = {}
      ;(profs || []).forEach(p => { map[p.id] = p })
      setProfiles(map)
    }
    setLoading(false)
  }

  async function toggleDone(task) {
    const done = task.status !== 'done'
    await supabase.from('lead_tasks').update({
      status: done ? 'done' : 'open',
      completed_at: done ? new Date().toISOString() : null,
    }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: done ? 'done' : 'open' } : t))
  }

  async function deleteTask(id) {
    if (!window.confirm('Aufgabe wirklich löschen?')) return
    await supabase.from('lead_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // Filter anwenden
  const filtered = tasks.filter(t => {
    const matchSearch = !search || t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.leads?.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.leads?.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.leads?.company?.toLowerCase().includes(search.toLowerCase())

    if (!matchSearch) return false

    if (filter === 'all')     return t.status === 'open'
    if (filter === 'mine')    return t.status === 'open' && t.assigned_to === uid
    if (filter === 'created') return t.status === 'open' && t.created_by === uid
    if (filter === 'overdue') return t.status === 'open' && t.due_date && t.due_date < today
    if (filter === 'today')   return t.status === 'open' && t.due_date === today
    if (filter === 'done')    return t.status === 'done'
    return true
  })

  // Zähler für Filter-Badges
  const counts = {
    all:     tasks.filter(t => t.status === 'open').length,
    mine:    tasks.filter(t => t.status === 'open' && t.assigned_to === uid).length,
    created: tasks.filter(t => t.status === 'open' && t.created_by === uid).length,
    overdue: tasks.filter(t => t.status === 'open' && t.due_date && t.due_date < today).length,
    today:   tasks.filter(t => t.status === 'open' && t.due_date === today).length,
    done:    tasks.filter(t => t.status === 'done').length,
  }

  function userName(userId) {
    if (!userId) return null
    if (userId === uid) return 'Ich'
    const p = profiles[userId]
    return p?.full_name || p?.email?.split('@')[0] || 'Teammitglied'
  }

  function leadName(lead) {
    if (!lead) return '—'
    return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || '—'
  }

  function fmtDate(d) {
    if (!d) return null
    return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  // Nach Datum gruppieren
  const groups = []
  if (filter !== 'done') {
    const overdue  = filtered.filter(t => t.due_date && t.due_date < today)
    const todayT   = filtered.filter(t => t.due_date === today)
    const upcoming = filtered.filter(t => t.due_date && t.due_date > today)
    const noDue    = filtered.filter(t => !t.due_date)
    if (overdue.length)  groups.push({ label: '⚠ Überfällig', tasks: overdue,  accent: '#DC2626' })
    if (todayT.length)   groups.push({ label: '⚡ Heute',      tasks: todayT,   accent: '#D97706' })
    if (upcoming.length) groups.push({ label: '📅 Demnächst',  tasks: upcoming, accent: '#185FA5' })
    if (noDue.length)    groups.push({ label: '○ Kein Datum',  tasks: noDue,    accent: '#9CA3AF' })
  } else {
    groups.push({ label: 'Erledigt', tasks: filtered, accent: '#10B981' })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Aufgaben</h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {team ? `Team: ${team.name}` : 'Meine Aufgaben'} · {counts.all} offen{counts.overdue > 0 ? ` · ⚠ ${counts.overdue} überfällig` : ''}
          </div>
        </div>
      </div>

      {/* Filter + Suche */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: '6px 12px', borderRadius: 20, border: '1.5px solid',
                borderColor: filter === f.id ? PRIMARY : '#E5E7EB',
                background: filter === f.id ? PRIMARY : '#fff',
                color: filter === f.id ? '#fff' : '#374151',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}>
              {f.label}
              {counts[f.id] > 0 && (
                <span style={{ background: filter === f.id ? 'rgba(255,255,255,0.3)' : '#F3F4F6', color: filter === f.id ? '#fff' : '#6B7280', borderRadius: 99, padding: '0 6px', fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                  {counts[f.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Suche */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Aufgabe oder Lead suchen…"
            style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 13, outline: 'none', width: 220, background: '#fff' }}/>
        </div>
      </div>

      {/* Aufgaben-Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Lade Aufgaben…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            {filter === 'all' ? 'Keine offenen Aufgaben' : 'Keine Aufgaben in dieser Ansicht'}
          </div>
          <div style={{ fontSize: 13 }}>Erstelle Aufgaben direkt in einem Lead-Profil</div>
        </div>
      ) : (
        <div>
          {groups.map(group => (
            <div key={group.label} style={{ marginBottom: 28 }}>
              {/* Gruppen-Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 3, height: 16, borderRadius: 99, background: group.accent, flexShrink: 0 }}/>
                <div style={{ fontSize: 12, fontWeight: 700, color: group.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {group.label}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 99, padding: '1px 8px', fontWeight: 600 }}>
                  {group.tasks.length}
                </div>
              </div>

              {/* Task-Karten */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map(task => {
                  const p        = PRIORITY_CFG[task.priority] || PRIORITY_CFG.normal
                  const isOverdue = task.due_date && task.due_date < today && task.status === 'open'
                  const isToday   = task.due_date === today
                  const isDone    = task.status === 'done'
                  const assignee  = userName(task.assigned_to)
                  const creator   = userName(task.created_by)
                  const lead      = task.leads

                  return (
                    <div key={task.id}
                      style={{ background: '#fff', border: '1px solid ' + (isOverdue ? '#FECACA' : '#E4E7EC'), borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'box-shadow 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

                      {/* Checkbox */}
                      <button onClick={() => toggleDone(task)}
                        style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid ' + (isDone ? '#10B981' : isOverdue ? '#FCA5A5' : '#D1D5DB'), background: isDone ? '#10B981' : '#fff', cursor: 'pointer', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, transition: 'all 0.15s' }}>
                        {isDone ? '✓' : ''}
                      </button>

                      {/* Inhalt */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isDone ? '#9CA3AF' : '#111827', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3 }}>
                            {task.title}
                          </div>
                          {/* Lead-Link */}
                          {lead && (
                            <button onClick={() => navigate(`/leads/${lead.id}`)}
                              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, border: '1px solid #E4E7EC', background: '#F9FAFB', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.color = PRIMARY }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E7EC'; e.currentTarget.style.color = '#374151' }}>
                              {lead.avatar_url
                                ? <img src={lead.avatar_url} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} alt=""/>
                                : <div style={{ width: 16, height: 16, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 800 }}>{(lead.first_name?.[0] || '?').toUpperCase()}</div>}
                              {leadName(lead)}
                              {lead.company && <span style={{ color: '#9CA3AF', fontWeight: 400 }}>· {lead.company}</span>}
                            </button>
                          )}
                        </div>

                        {task.description && (
                          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, lineHeight: 1.5 }}>{task.description}</div>
                        )}

                        {/* Tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {/* Priorität */}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.bg, color: p.color, border: '1px solid ' + p.border }}>
                            {p.label}
                          </span>

                          {/* Fälligkeit */}
                          {task.due_date && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: isOverdue ? '#FEF2F2' : isToday ? '#FFFBEB' : '#F3F4F6', color: isOverdue ? '#DC2626' : isToday ? '#D97706' : '#6B7280', border: '1px solid ' + (isOverdue ? '#FECACA' : isToday ? '#FDE68A' : '#E5E7EB') }}>
                              {isOverdue ? '⚠ Überfällig · ' : isToday ? '⚡ Heute · ' : '📅 '}{fmtDate(task.due_date)}
                            </span>
                          )}

                          {/* Zugewiesen an */}
                          {task.assigned_to && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE' }}>
                              👤 {userName(task.assigned_to)}
                            </span>
                          )}

                          {/* Erstellt von (wenn nicht ich) */}
                          {task.created_by !== uid && (
                            <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 2 }}>
                              von {creator}
                            </span>
                          )}

                          {/* Erledigt am */}
                          {isDone && task.completed_at && (
                            <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>
                              ✓ {new Date(task.completed_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Löschen (nur eigene) */}
                      {task.created_by === uid && (
                        <button onClick={() => deleteTask(task.id)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#D1D5DB', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCA5A5'; e.currentTarget.style.color = '#DC2626' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#D1D5DB' }}
                          title="Löschen">
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
