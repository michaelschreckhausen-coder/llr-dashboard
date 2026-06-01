// src/components/aufgaben/TaskEditModal.jsx
//
// Universelles Edit-Pop-up für Tasks im Aufgaben-Hub.
//
// Pro Source (via getCapabilities) wird entschieden, welche Felder
// editierbar sind, welche read-only und welche Mutation beim Save läuft.
// Synthetische Quellen (ssi_daily, linkedin_unanswered) zeigen nur einen
// Info-Hinweis + Source-Link statt eines Forms.
//
// Props:
//   task        — der normalized Task aus taskSources
//   members     — Team-Mitglieder-Array (id, full_name/email/avatar_url)
//   uid         — current user-id
//   onClose     — () → void
//   onSaved     — () → void  (refetch trigger)
//   onDeleted   — () → void  (refetch trigger; nur lead_task)

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TASK_SOURCES } from '../../lib/taskSources'
import { getCapabilities } from '../../lib/taskSourceCapabilities'

const PRIMARY = 'rgb(49,90,231)'

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Hoch' },
]

export default function TaskEditModal({ task, members = [], uid, onClose, onSaved, onDeleted }) {
  const navigate = useNavigate()
  const cfg = TASK_SOURCES[task.source]
  const caps = getCapabilities(task.source)

  // Initial form-state aus Task-Daten
  const [title, setTitle]             = useState(task.title || '')
  const [description, setDescription] = useState(task.description || '')
  const [assignedTo, setAssignedTo]   = useState(task.assigned_to || '')
  const [dueDate, setDueDate]         = useState(task.due_date || '')
  const [priority, setPriority]       = useState(task.priority || 'normal')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)

  // Escape schließt
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Member-Map für Display. members hat Struktur { user_id, profile: {...} }
  // (siehe NewTaskModal.jsx Z16 + 203-206).
  const memberMap = useMemo(() => {
    const m = {}
    ;(members || []).forEach(p => { m[p.user_id || p.id] = p })
    return m
  }, [members])

  const editable = caps?.editable || {}
  const isSynthetic = caps?.isSynthetic
  const descriptionLabel = caps?.descriptionLabel || 'Beschreibung'
  const dueDateLabel     = caps?.dueDateLabel     || 'Fälligkeit'
  const sourceLinkUrl    = caps?.sourceLink ? caps.sourceLink(task) : null
  const sourceLinkLabel  = caps?.sourceLinkLabel || 'Quelle öffnen'

  async function handleSave() {
    if (!caps?.save) { onClose(); return }
    setSaving(true); setError(null)
    try {
      const patch = {}
      if (editable.title)       patch.title       = title.trim()
      if (editable.description) patch.description = description.trim() || null
      if (editable.assigned_to) patch.assigned_to = assignedTo || null
      if (editable.due_date)    patch.due_date    = dueDate || null
      if (editable.priority)    patch.priority    = priority
      await caps.save(task, patch)
      onSaved?.()
      onClose()
    } catch (e) {
      console.warn('[TaskEditModal] save failed:', e.message || e)
      setError(e?.message || 'Speichern fehlgeschlagen')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!caps?.delete) return
    if (!window.confirm('Aufgabe wirklich löschen?')) return
    setSaving(true); setError(null)
    try {
      await caps.delete(task)
      onDeleted?.()
      onClose()
    } catch (e) {
      console.warn('[TaskEditModal] delete failed:', e.message || e)
      setError(e?.message || 'Löschen fehlgeschlagen')
      setSaving(false)
    }
  }

  function memberLabel(m) {
    if (!m) return 'Unbekannt'
    const p = m.profile || m
    return p.full_name
      || `${p.first_name || ''} ${p.last_name || ''}`.trim()
      || p.email?.split('@')[0]
      || 'Teammitglied'
  }

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '60px 16px', overflowY: 'auto',
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 14, maxWidth: 560, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}>

        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {cfg.icon} {cfg.label}
          </span>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Synthetic Hint */}
          {(isSynthetic || caps?.syntheticHint) && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>
              💡 {caps?.syntheticHint || 'Diese Aufgabe wird aus einer anderen Quelle generiert und kann hier nicht direkt editiert werden.'}
            </div>
          )}

          {/* Lead-Kontext (wenn vorhanden) */}
          {task.related?.leadName && (
            <div style={{ fontSize: 12, color: '#6B7280' }}>
              Kontakt: <strong style={{ color: '#111827' }}>{task.related.leadName}</strong>
              {task.related.leadCompany && <span> · {task.related.leadCompany}</span>}
            </div>
          )}

          {/* Title */}
          {editable.title ? (
            <Field label="Titel">
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Was soll erledigt werden?"
                style={inputStyle}/>
            </Field>
          ) : !isSynthetic ? (
            <Field label="Titel">
              <div style={readonlyStyle}>{task.title}</div>
            </Field>
          ) : null}

          {/* Description */}
          {editable.description ? (
            <Field label={descriptionLabel}>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Notiz, Kontext, nächste Schritte…"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}/>
            </Field>
          ) : task.description && !isSynthetic ? (
            <Field label={descriptionLabel}>
              <div style={readonlyStyle}>{task.description}</div>
            </Field>
          ) : null}

          {/* Assigned-To */}
          {editable.assigned_to ? (
            <Field label="Zugewiesen an">
              <select value={assignedTo || ''} onChange={e => setAssignedTo(e.target.value)}
                style={inputStyle}>
                <option value="">— Niemand zugewiesen —</option>
                {(members || []).map(m => {
                  const mid = m.user_id || m.id
                  return <option key={mid} value={mid}>{memberLabel(m)}{mid === uid ? ' (Ich)' : ''}</option>
                })}
              </select>
            </Field>
          ) : caps?.assignedToHint ? (
            <Field label="Zugewiesen an">
              <div style={{ ...readonlyStyle, fontStyle: 'italic', color: '#9CA3AF' }}>
                {caps.assignedToHint}
              </div>
            </Field>
          ) : null}

          {/* Due-Date + Priority (Row) */}
          {(editable.due_date || editable.priority) && (
            <div style={{ display: 'grid', gridTemplateColumns: editable.priority ? '1fr 1fr' : '1fr', gap: 12 }}>
              {editable.due_date && (
                <Field label={dueDateLabel}>
                  <input type="date" value={dueDate ? dueDate.split('T')[0] : ''}
                    onChange={e => setDueDate(e.target.value)}
                    style={inputStyle}/>
                </Field>
              )}
              {editable.priority && (
                <Field label="Priorität">
                  <select value={priority} onChange={e => setPriority(e.target.value)}
                    style={inputStyle}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}

          {/* Source-Link */}
          {sourceLinkUrl && (
            <button onClick={() => { onClose(); navigate(sourceLinkUrl) }}
              style={{
                marginTop: 2, padding: '9px 14px', borderRadius: 10,
                border: '1px solid #E5E7EB', background: '#F9FAFB',
                color: '#374151', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textAlign: 'center',
              }}>
              {sourceLinkLabel} →
            </button>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', gap: 10, background: '#FAFAFA' }}>
          <div>
            {caps?.canDelete && (
              <button onClick={handleDelete} disabled={saving}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: '1px solid #FECACA',
                  background: '#fff', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                }}>
                🗑 Löschen
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 10, border: '1px solid #E5E7EB',
                background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              }}>
              Abbrechen
            </button>
            {!isSynthetic && caps?.save && (
              <button onClick={handleSave} disabled={saving}
                style={{
                  padding: '8px 18px', borderRadius: 10, border: 'none',
                  background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                }}>
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1.5px solid #E4E7EC',
  borderRadius: 10,
  fontSize: 13,
  outline: 'none',
  background: 'var(--surface)',
  color: 'var(--text-primary, #111827)',
  boxSizing: 'border-box',
}

const readonlyStyle = {
  padding: '8px 12px',
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  fontSize: 13,
  background: '#FAFAFA',
  color: '#374151',
  lineHeight: 1.5,
}
