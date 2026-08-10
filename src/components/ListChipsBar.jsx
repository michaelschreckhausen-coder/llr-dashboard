import React, { useState } from 'react'
import { Users, Pencil, Trash2, Plus, Check, X, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ListChipsBar — professionelle „Nach Liste"-Filterleiste (Chips).
//
// Ein Chip = Name + dezentes Anzahl-Badge. Aktionen (Teilen/Umbenennen/Löschen)
// erscheinen erst beim Hover, Fokus (:focus-within, Tastatur) ODER auf dem
// aktiven Chip (Touch: aktiv = Aktionen dauerhaft sichtbar). Bereits geteilte
// Listen tragen ein dauerhaftes „Geteilt"-Badge.
//
// allowSharing=true  → Kontakte/Prospects-Tab: Teilen-Button + „Geteilt"-Badge.
// allowSharing=false → Verbindungen-Tab: nur Umbenennen/Löschen (kein Teilen).
//
// Präsentations-Refactor der bisherigen Inline-Leiste aus LinkedInInbox.jsx —
// ALLE Funktionen bleiben identisch (Filter, Teilen, Umbenennen, Löschen,
// Neue Liste, Counts, Aktiv-State). Callbacks kommen als Props vom Parent.
// ─────────────────────────────────────────────────────────────────────────────

const CSS = `
.lcb-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.lcb-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin-right:2px;white-space:nowrap}

.lcb-chip{position:relative;display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid #e5e7eb;border-radius:11px;padding:8px 12px;font-size:14px;font-weight:600;color:#334155;transition:border-color .12s, background .12s}
.lcb-chip:hover{border-color:#cbd5e1;background:#fcfdff}
.lcb-chip.lcb-active{background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a;box-shadow:0 0 0 1px #bfdbfe inset}
.lcb-name{white-space:nowrap;background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;display:inline-flex;align-items:center}
.lcb-count{font-size:12px;font-weight:700;color:#64748b;background:#f1f5f9;border-radius:999px;padding:1px 8px;font-variant-numeric:tabular-nums}
.lcb-chip.lcb-active .lcb-count{background:#dbeafe;color:#1d4ed8}

.lcb-plain{cursor:pointer}

.lcb-shared{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#0d9488;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:999px;padding:1px 7px 1px 5px}

.lcb-actions{display:none;align-items:center;gap:6px;margin-left:2px;padding-left:8px;border-left:1px solid #e2e8f0}
.lcb-chip:hover .lcb-actions,.lcb-chip:focus-within .lcb-actions,.lcb-chip.lcb-active .lcb-actions{display:inline-flex}

.lcb-btn-share{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:#fff;background:#0d9488;border:none;border-radius:8px;padding:4px 9px;cursor:pointer}
.lcb-btn-share.lcb-is-shared{color:#0d9488;background:#f0fdfa;border:1px solid #ccfbf1}
.lcb-btn-share:disabled{opacity:.6;cursor:default}

.lcb-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid transparent;color:#94a3b8;background:transparent;cursor:pointer}
.lcb-icon-btn:hover{background:#f1f5f9;color:#475569}
.lcb-icon-btn.lcb-danger:hover{background:#fef2f2;color:#ef4444}

.lcb-add{display:inline-flex;align-items:center;gap:6px;border:1px dashed #cbd5e1;background:#fff;border-radius:11px;padding:8px 13px;font-size:13.5px;font-weight:600;color:#475569;cursor:pointer}
.lcb-add:hover{border-color:#2563eb;color:#2563eb;background:#eff6ff}

.lcb-edit{display:inline-flex;align-items:center;gap:6px}
.lcb-input{padding:7px 11px;border-radius:9px;border:1.5px solid #2563eb;font-size:13.5px;background:#fff;color:#0f172a;outline:none;width:150px}
.lcb-mini{background:none;border:none;padding:2px;cursor:pointer;display:inline-flex;align-items:center;color:#64748b}
.lcb-mini.lcb-ok{color:#2563eb}
`

export default function ListChipsBar({
  lists,
  membersByList,
  rows,
  activeBrandVoiceId,
  listFilter,
  setListFilter,
  allowSharing = false,
  toggleShareList,
  renameList,
  createOrReuseList,
  onRequestDelete,
  onMessage,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const msg = (text) => onMessage && onMessage({ text })

  const startRename = (l) => { setEditingId(l.id); setEditName(l.name || '') }
  const saveRename = async () => {
    const l = lists.find(x => x.id === editingId)
    const name = editName.trim()
    if (!l) { setEditingId(null); return }
    if (!name || name === l.name) { setEditingId(null); return }
    const dupe = lists.find(x => x.id !== l.id && (x.name || '').trim().toLowerCase() === name.toLowerCase())
    if (dupe) { msg(`Es gibt bereits eine Liste „${dupe.name}".`); return }
    const { error } = await renameList(l.id, name)
    if (error) { msg('Umbenennen fehlgeschlagen: ' + error.message); return }
    setEditingId(null)
    msg(`Liste umbenannt in „${name}".`)
  }

  const createStandalone = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const { data, error, reused } = await createOrReuseList(name, '#30A0D0')
    setCreating(false)
    if (error) { msg('Liste anlegen fehlgeschlagen: ' + error.message); return }
    setShowNew(false); setNewName('')
    msg(reused ? `Liste „${data.name}" existiert bereits.` : `Liste „${data.name}" angelegt.`)
  }

  const toggleShare = async (l) => {
    const r = await toggleShareList(l.id, !l.is_shared)
    if (r?.error) msg('Teilen fehlgeschlagen: ' + r.error.message)
  }

  const visible = lists.filter(l => !l.brand_voice_id || l.brand_voice_id === activeBrandVoiceId || l.is_shared)

  return (
    <div className="lcb-bar">
      <style>{CSS}</style>
      <span className="lcb-label">Nach Liste</span>

      {/* „Alle" — schlichter Chip ohne Anzahl/Aktionen */}
      <span className={'lcb-chip lcb-plain' + (listFilter === 'all' ? ' lcb-active' : '')}
        onClick={() => setListFilter('all')} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setListFilter('all') } }}>
        <span className="lcb-name">Alle</span>
      </span>

      {visible.map(l => {
        const set = membersByList.get(l.id)
        const cnt = set ? rows.reduce((n, r) => n + (set.has(r.id) ? 1 : 0), 0) : 0

        if (editingId === l.id) {
          return (
            <span key={l.id} className="lcb-edit">
              <input autoFocus className="lcb-input" value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingId(null) }} />
              <button onClick={saveRename} title="Speichern" className="lcb-mini lcb-ok"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} title="Abbrechen" className="lcb-mini"><X size={16} /></button>
            </span>
          )
        }

        const active = listFilter === l.id
        const shared = !!l.is_shared
        return (
          <span key={l.id} className={'lcb-chip' + (active ? ' lcb-active' : '')}>
            <button className="lcb-name" onClick={() => setListFilter(l.id)}>{l.name}</button>
            <span className="lcb-count">{cnt}</span>

            {allowSharing && shared && (
              <span className="lcb-shared" title="Für das Team freigegeben">
                <Users size={12} /> Geteilt
              </span>
            )}

            <span className="lcb-actions">
              {allowSharing && (
                <button
                  className={'lcb-btn-share' + (shared ? ' lcb-is-shared' : '')}
                  onClick={() => toggleShare(l)}
                  title={shared ? 'Freigabe verwalten — Klick: nur diese Marke' : 'Im Team teilen'}
                  aria-label={shared ? 'Freigabe verwalten' : 'Im Team teilen'}>
                  <Users size={13} /> {shared ? 'Freigabe' : 'Teilen'}
                </button>
              )}
              <button className="lcb-icon-btn" onClick={() => startRename(l)} title="Umbenennen" aria-label="Umbenennen">
                <Pencil size={15} />
              </button>
              <button className="lcb-icon-btn lcb-danger" onClick={() => onRequestDelete(l)} title="Löschen" aria-label="Löschen">
                <Trash2 size={15} />
              </button>
            </span>
          </span>
        )
      })}

      {!showNew ? (
        <button className="lcb-add" onClick={() => setShowNew(true)} title="Neue Liste anlegen">
          <Plus size={15} /> Neue Liste
        </button>
      ) : (
        <span className="lcb-edit">
          <input autoFocus className="lcb-input" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createStandalone(); if (e.key === 'Escape') { setShowNew(false); setNewName('') } }}
            placeholder="Listenname" disabled={creating} />
          <button className="lcb-btn-share" onClick={createStandalone} disabled={creating || !newName.trim()}
            style={{ background: '#2563eb' }}>
            {creating ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Anlegen
          </button>
          <button onClick={() => { setShowNew(false); setNewName('') }} title="Abbrechen" className="lcb-icon-btn">
            <X size={15} />
          </button>
        </span>
      )}
    </div>
  )
}
