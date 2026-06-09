// src/pages/Aufgaben.jsx
//
// Aufgaben-Hub: aggregiert Tasks aus allen Modulen (CRM, Content,
// Projekte, Deals, Lead-Follow-ups, SSI-Daily, LinkedIn, Stale-Leads).
//
// Refactor 2026-06-01:
//   - Vorher: nur lead_tasks (CRM-Tasks)
//   - Jetzt:  unified Hub über src/hooks/useAllTasks + src/lib/taskSources
//   - Quell-Filter (Multi-Toggle) orthogonal zu Status-Filter (Mir/Überfällig/Heute/…)
//   - Virtuelle Aufgaben (alles außer lead_tasks): kein Checkbox-Toggle,
//     "Öffnen →"-Pfeil zur Source-Page. Klick auf die Card navigiert direkt.
//   - SSI-Daily-Reminder: dismiss-Button (localStorage bis 0 Uhr).

import React, { useState, useMemo } from 'react'
import TaskSourceIcon from '../components/TaskSourceIcon'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'
import { useAllTasks } from '../hooks/useAllTasks'
import { TASK_SOURCES } from '../lib/taskSources'
import NewTaskModal from '../components/NewTaskModal'
import TaskEditModal from '../components/aufgaben/TaskEditModal'
import { supabase } from '../lib/supabase'

const PRIMARY = 'rgb(49,90,231)'

const PRIORITY_CFG = {
  low:    { label: 'Niedrig', color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  normal: { label: 'Normal',  color: '#185FA5', bg: '#EFF6FF', border: '#BFDBFE' },
  high:   { label: 'Hoch',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
}

const STATUS_FILTERS = [
  { id: 'all',      label: 'Alle offen' },
  { id: 'mine',     label: 'Mir zugewiesen' },
  { id: 'created',  label: 'Von mir erstellt' },
  { id: 'overdue',  label: 'Überfällig' },
  { id: 'today',    label: 'Heute fällig' },
  { id: 'done',     label: 'Erledigt' },
]

const ALL_SOURCE_KEYS = Object.keys(TASK_SOURCES)

export default function Aufgaben({ session }) {
  const navigate = useNavigate()
  const { team, members, activeTeamId } = useTeam()

  const { tasks, loading, refetch, toggleLeadTask, deleteLeadTask, dismissSsi } = useAllTasks({ session })

  const [statusFilter, setStatusFilter] = useState('all')
  const [activeSources, setActiveSources] = useState(new Set(ALL_SOURCE_KEYS))
  const [search, setSearch] = useState('')
  const [profiles, setProfiles] = useState({})
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)  // 2026-06-01 universelles Edit-Pop-up

  const uid = session?.user?.id
  const today = new Date().toISOString().split('T')[0]

  // Profile-Avatare laden — alle Assignees (multi) + created_by uids
  React.useEffect(() => {
    const uids = [...new Set(
      tasks.flatMap(t => [
        t.created_by,
        t.assigned_to,
        ...(Array.isArray(t.assigned_to_ids) ? t.assigned_to_ids : []),
      ]).filter(Boolean)
    )]
    const missing = uids.filter(id => !profiles[id])
    if (missing.length === 0) return
    supabase.from('profiles')
      .select('id,full_name,email,avatar_url')
      .in('id', missing)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setProfiles(prev => ({
            ...prev,
            ...Object.fromEntries(data.map(p => [p.id, p])),
          }))
        }
      })
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filter anwenden ────────────────────────────────────────────────────
  // "Mir zugewiesen" checkt sowohl Legacy single (andere Sources) als auch
  // Multi-Assignee (lead_task).
  const isAssignedToMe = (t) => {
    if (Array.isArray(t.assigned_to_ids) && t.assigned_to_ids.includes(uid)) return true
    return t.assigned_to === uid
  }
  const filtered = useMemo(() => {
    const lc = search.toLowerCase()
    return tasks.filter(t => {
      if (!activeSources.has(t.source)) return false

      if (lc) {
        const hay = [
          t.title,
          t.description,
          t.related?.leadName,
          t.related?.leadCompany,
          t.related?.projectName,
          t.related?.dealTitle,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(lc)) return false
      }

      if (statusFilter === 'all')     return t.status === 'open'
      if (statusFilter === 'mine')    return t.status === 'open' && isAssignedToMe(t)
      if (statusFilter === 'created') return t.status === 'open' && t.created_by === uid
      if (statusFilter === 'overdue') return t.status === 'open' && t.due_date && t.due_date < today
      if (statusFilter === 'today')   return t.status === 'open' && t.due_date === today
      if (statusFilter === 'done')    return t.status === 'done'
      return true
    })
  }, [tasks, statusFilter, search, activeSources, uid, today])

  // Status-Filter-Counts (auf VOR Source-Filter, sonst springen Zahlen)
  const counts = useMemo(() => {
    const visible = tasks.filter(t => activeSources.has(t.source))
    return {
      all:     visible.filter(t => t.status === 'open').length,
      mine:    visible.filter(t => t.status === 'open' && isAssignedToMe(t)).length,
      created: visible.filter(t => t.status === 'open' && t.created_by === uid).length,
      overdue: visible.filter(t => t.status === 'open' && t.due_date && t.due_date < today).length,
      today:   visible.filter(t => t.status === 'open' && t.due_date === today).length,
      done:    visible.filter(t => t.status === 'done').length,
    }
  }, [tasks, activeSources, uid, today])

  // Source-Filter-Counts (auf VOR Status-Filter)
  const sourceCounts = useMemo(() => {
    const map = {}
    for (const key of ALL_SOURCE_KEYS) {
      map[key] = tasks.filter(t => t.source === key && t.status === 'open').length
    }
    return map
  }, [tasks])

  function userName(userId) {
    if (!userId) return null
    if (userId === uid) return 'Ich'
    const p = profiles[userId]
    return p?.full_name || p?.email?.split('@')[0] || 'Teammitglied'
  }

  function fmtDate(d) {
    if (!d) return null
    return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  function toggleSource(key) {
    setActiveSources(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      if (next.size === 0) return new Set(ALL_SOURCE_KEYS) // Niemals leer — fallback all
      return next
    })
  }

  function selectAllSources() { setActiveSources(new Set(ALL_SOURCE_KEYS)) }

  // ─── Gruppierung nach Datum ─────────────────────────────────────────────
  const groups = useMemo(() => {
    const out = []
    if (statusFilter !== 'done') {
      const overdue  = filtered.filter(t => t.due_date && t.due_date < today)
      const todayT   = filtered.filter(t => t.due_date === today)
      const upcoming = filtered.filter(t => t.due_date && t.due_date > today)
      const noDue    = filtered.filter(t => !t.due_date)
      if (overdue.length)  out.push({ label: 'Überfällig', tasks: overdue,  accent: '#DC2626' })
      if (todayT.length)   out.push({ label: 'Heute',      tasks: todayT,   accent: '#D97706' })
      if (upcoming.length) out.push({ label: 'Demnächst',  tasks: upcoming, accent: '#185FA5' })
      if (noDue.length)    out.push({ label: '○ Kein Datum',  tasks: noDue,    accent: '#9CA3AF' })
    } else {
      out.push({ label: 'Erledigt', tasks: filtered, accent: '#10B981' })
    }
    return out
  }, [filtered, statusFilter, today])

  return (
    <div style={{ width: '100%', margin: '0 auto', paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Aufgaben</h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {team ? `Team: ${team.name}` : 'Meine Aufgaben'} · {counts.all} offen{counts.overdue > 0 ? ` · ⚠ ${counts.overdue} überfällig` : ''}
          </div>
        </div>
        <button type="button" onClick={() => setNewTaskOpen(true)}
          style={{
            padding: '9px 18px', background: 'var(--wl-primary, ' + PRIMARY + ')', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
          + Neue Aufgabe
        </button>
      </div>

      {/* Quell-Filter (Toggle pro Source) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
          Quellen:
        </span>
        {ALL_SOURCE_KEYS.map(key => {
          const cfg = TASK_SOURCES[key]
          const isActive = activeSources.has(key)
          const c = sourceCounts[key] || 0
          return (
            <button key={key} onClick={() => toggleSource(key)}
              style={{
                padding: '4px 10px', borderRadius: 99,
                border: '1.5px solid ' + (isActive ? cfg.color : '#E5E7EB'),
                background: isActive ? cfg.bg : '#fff',
                color: isActive ? cfg.color : '#9CA3AF',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                opacity: isActive ? 1 : 0.6,
                transition: 'all 0.15s',
              }}>
              <TaskSourceIcon name={cfg.iconName} size={12} />
              {cfg.label}
              {c > 0 && (
                <span style={{ background: isActive ? cfg.color : '#F3F4F6', color: isActive ? '#fff' : '#9CA3AF', borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>
                  {c}
                </span>
              )}
            </button>
          )
        })}
        {activeSources.size < ALL_SOURCE_KEYS.length && (
          <button onClick={selectAllSources}
            style={{ marginLeft: 6, padding: '4px 10px', borderRadius: 99, border: '1.5px dashed #D1D5DB', background: 'transparent', color: '#6B7280', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Alle anzeigen
          </button>
        )}
      </div>

      {/* Status-Filter + Suche */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '6px 12px', borderRadius: 20, border: '1.5px solid',
                borderColor: statusFilter === f.id ? PRIMARY : '#E5E7EB',
                background: statusFilter === f.id ? PRIMARY : '#fff',
                color: statusFilter === f.id ? '#fff' : '#374151',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}>
              {f.label}
              {counts[f.id] > 0 && (
                <span style={{ background: statusFilter === f.id ? 'rgba(255,255,255,0.3)' : '#F3F4F6', color: statusFilter === f.id ? '#fff' : '#6B7280', borderRadius: 99, padding: '0 6px', fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                  {counts[f.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 14 }}><Search size={14} strokeWidth={1.75}/></span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Aufgabe, Kontakt, Projekt…"
            style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 13, outline: 'none', width: 240, background: 'var(--surface)' }}/>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Lade Aufgaben…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            {statusFilter === 'all' ? 'Keine offenen Aufgaben' : 'Keine Aufgaben in dieser Ansicht'}
          </div>
          <div style={{ fontSize: 13 }}>Erstelle eine neue Aufgabe oder erweitere die Quellen-Filter</div>
        </div>
      ) : (
        <div>
          {groups.map(group => (
            <div key={group.label} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 3, height: 16, borderRadius: 99, background: group.accent, flexShrink: 0 }}/>
                <div style={{ fontSize: 12, fontWeight: 700, color: group.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {group.label}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 99, padding: '1px 8px', fontWeight: 600 }}>
                  {group.tasks.length}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map(task => {
                  const cfg     = TASK_SOURCES[task.source]
                  const pri     = PRIORITY_CFG[task.priority] || PRIORITY_CFG.normal
                  const isOverdue = task.due_date && task.due_date < today && task.status === 'open'
                  const isToday   = task.due_date === today
                  const isDone    = task.status === 'done'
                  const isVirtual = task.isVirtual

                  return (
                    <div key={task.id}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid ' + (isOverdue ? '#FECACA' : '#E4E7EC'),
                        borderRadius: 12, padding: '12px 16px',
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        transition: 'box-shadow 0.15s',
                        cursor: 'pointer',
                      }}
                      onClick={() => setEditingTask(task)}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

                      {/* Checkbox (nur echte lead_tasks) / Source-Icon (virtuell) */}
                      {!isVirtual ? (
                        <button onClick={(e) => { e.stopPropagation(); toggleLeadTask(task.rawId, task.status) }}
                          style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid ' + (isDone ? '#10B981' : isOverdue ? '#FCA5A5' : '#D1D5DB'), background: isDone ? '#10B981' : '#fff', cursor: 'pointer', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, transition: 'all 0.15s' }}>
                          {isDone ? '✓' : ''}
                        </button>
                      ) : (
                        <div style={{ width: 22, height: 22, borderRadius: 7, border: '1.5px solid ' + cfg.border, background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, marginTop: 1 }}>
                          <TaskSourceIcon name={cfg.iconName}/>
                        </div>
                      )}

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Source-Badge + Title-Row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              <TaskSourceIcon name={cfg.iconName}/> {cfg.label}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: isDone ? '#9CA3AF' : '#111827', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3 }}>
                              {task.title}
                            </span>
                          </div>

                          {/* Lead-Link (rechts) */}
                          {task.related?.leadId && task.related?.leadName && (
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/leads/${task.related.leadId}`) }}
                              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, border: '1px solid #E4E7EC', background: '#F9FAFB', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.color = PRIMARY }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E7EC'; e.currentTarget.style.color = '#374151' }}>
                              {task.related.leadAvatar
                                ? <img src={task.related.leadAvatar} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} alt=""/>
                                : <div style={{ width: 16, height: 16, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 800 }}>{(task.related.leadName?.[0] || '?').toUpperCase()}</div>}
                              {task.related.leadName}
                              {task.related.leadCompany && <span style={{ color: '#9CA3AF', fontWeight: 400 }}>· {task.related.leadCompany}</span>}
                            </button>
                          )}
                        </div>

                        {task.description && (
                          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, lineHeight: 1.5 }}>{task.description}</div>
                        )}

                        {/* Meta-Tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pri.bg, color: pri.color, border: '1px solid ' + pri.border }}>
                            {pri.label}
                          </span>

                          {task.due_date && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: isOverdue ? '#FEF2F2' : isToday ? '#FFFBEB' : '#F3F4F6', color: isOverdue ? '#DC2626' : isToday ? '#D97706' : '#6B7280', border: '1px solid ' + (isOverdue ? '#FECACA' : isToday ? '#FDE68A' : '#E5E7EB') }}>
                              {isOverdue ? 'Überfällig · ' : isToday ? 'Heute · ' : ''}{fmtDate(task.due_date)}
                            </span>
                          )}

                          {/* Multi-Assignee Avatar-Stack (nur lead_task). Andere Sources nutzen
                              weiterhin Single-Badge via task.assigned_to. */}
                          {Array.isArray(task.assigned_to_ids) && task.assigned_to_ids.length > 0 && task.source === 'lead_task' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE', fontSize: 10, fontWeight: 600 }}>
                              <span style={{ display: 'inline-flex' }}>
                                {task.assigned_to_ids.slice(0, 3).map((aid, idx) => {
                                  const p = profiles[aid];
                                  return p?.avatar_url ? (
                                    <img key={aid} src={p.avatar_url} alt=""
                                      style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #fff', marginLeft: idx === 0 ? 0 : -4 }} />
                                  ) : (
                                    <span key={aid} style={{ width: 14, height: 14, borderRadius: '50%', background: '#185FA5', color: '#fff', fontSize: 8, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff', marginLeft: idx === 0 ? 0 : -4 }}>
                                      {(userName(aid)?.[0] || '?').toUpperCase()}
                                    </span>
                                  );
                                })}
                              </span>
                              <span>
                                {task.assigned_to_ids.length === 1
                                  ? userName(task.assigned_to_ids[0])
                                  : `${task.assigned_to_ids.length} Verantwortliche`}
                              </span>
                            </span>
                          ) : task.assigned_to && !isVirtual ? (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE' }}>
                              👤 {userName(task.assigned_to)}
                            </span>
                          ) : null}

                          {task.created_by && task.created_by !== uid && !isVirtual && (
                            <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 2 }}>
                              von {userName(task.created_by)}
                            </span>
                          )}

                          {isDone && task.completed_at && (
                            <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>
                              ✓ {new Date(task.completed_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                            </span>
                          )}

                          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, marginLeft: 'auto' }}>
                            Details ›
                          </span>
                        </div>
                      </div>

                      {/* Actions: SSI-Dismiss + Lead-Task-Delete */}
                      {task.source === 'ssi_daily' && (
                        <button onClick={(e) => { e.stopPropagation(); dismissSsi() }}
                          title="Für heute ausblenden"
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E7EB', background: 'var(--surface)', cursor: 'pointer', fontSize: 12, color: '#9CA3AF', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCA5A5'; e.currentTarget.style.color = '#DC2626' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#9CA3AF' }}>
                          ×
                        </button>
                      )}
                      {!isVirtual && task.created_by === uid && (
                        <button onClick={(e) => { e.stopPropagation(); if (window.confirm('Aufgabe wirklich löschen?')) deleteLeadTask(task.rawId) }}
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E7EB', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, color: '#D1D5DB', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
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

      {newTaskOpen && (
        <NewTaskModal
          activeTeamId={activeTeamId}
          uid={uid}
          members={members}
          onClose={() => setNewTaskOpen(false)}
          onSaved={() => { refetch() }}
        />
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          members={members}
          uid={uid}
          onClose={() => setEditingTask(null)}
          onSaved={() => { refetch() }}
          onDeleted={() => { refetch() }}
        />
      )}
    </div>
  )
}
