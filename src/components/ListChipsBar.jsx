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

// Hell-Palette = freigegebenes Mockup (1:1). Dark-Overrides mappen auf die
// App-Theme-Tokens (src/index.css, [data-theme="dark"]), damit die Leiste in
// beiden Themes stimmt (die App ist durchgehend gethemt).
const CSS = `
.lcb-bar{
  --lcb-chip-bg:#fff; --lcb-chip-border:#e5e7eb; --lcb-chip-text:#334155;
  --lcb-hover-border:#cbd5e1; --lcb-hover-bg:#fcfdff;
  --lcb-count-bg:#f1f5f9; --lcb-count-text:#64748b;
  --lcb-active-bg:#eff6ff; --lcb-active-border:#bfdbfe; --lcb-active-text:#1e3a8a;
  --lcb-active-count-bg:#dbeafe; --lcb-active-count-text:#1d4ed8;
  --lcb-label:#64748b; --lcb-line:#e2e8f0;
  --lcb-teal:#0d9488; --lcb-teal-bg:#f0fdfa; --lcb-teal-border:#ccfbf1; --lcb-teal-on:#fff;
  --lcb-icon:#94a3b8; --lcb-icon-hover-bg:#f1f5f9; --lcb-icon-hover-text:#475569;
  --lcb-danger:#ef4444; --lcb-danger-bg:#fef2f2;
  --lcb-add-border:#cbd5e1; --lcb-add-text:#475569;
  --lcb-blue:#2563eb; --lcb-blue-bg:#eff6ff;
  --lcb-input-bg:#fff; --lcb-input-text:#0f172a;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px
}
:root[data-theme="dark"] .lcb-bar{
  --lcb-chip-bg:var(--surface); --lcb-chip-border:var(--border); --lcb-chip-text:var(--text-primary);
  --lcb-hover-border:var(--border-strong); --lcb-hover-bg:var(--surface-hover);
  --lcb-count-bg:var(--surface-muted); --lcb-count-text:var(--text-soft);
  --lcb-active-bg:var(--primary-soft); --lcb-active-border:var(--primary); --lcb-active-text:var(--text-primary);
  --lcb-active-count-bg:var(--primary-soft); --lcb-active-count-text:var(--primary);
  --lcb-label:var(--text-soft); --lcb-line:var(--border);
  --lcb-teal:var(--success); --lcb-teal-bg:rgba(111,230,168,.12); --lcb-teal-border:rgba(111,230,168,.28); --lcb-teal-on:#08312a;
  --lcb-icon:var(--text-soft); --lcb-icon-hover-bg:var(--surface-hover); --lcb-icon-hover-text:var(--text-primary);
  --lcb-danger:#fca5a5; --lcb-danger-bg:rgba(239,68,68,.16);
  --lcb-add-border:var(--border-strong); --lcb-add-text:var(--text-soft);
  --lcb-blue:var(--primary); --lcb-blue-bg:var(--primary-soft);
  --lcb-input-bg:var(--surface); --lcb-input-text:var(--text-primary);
}
.lcb-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--lcb-label);margin-right:2px;white-space:nowrap}

.lcb-chip{position:relative;display:inline-flex;align-items:center;gap:9px;background:var(--lcb-chip-bg);border:1px solid var(--lcb-chip-border);border-radius:11px;padding:8px 12px;font-size:14px;font-weight:600;color:var(--lcb-chip-text);transition:border-color .12s, background .12s}
.lcb-chip:hover{border-color:var(--lcb-hover-border);background:var(--lcb-hover-bg)}
.lcb-chip.lcb-active{background:var(--lcb-active-bg);border-color:var(--lcb-active-border);color:var(--lcb-active-text);box-shadow:0 0 0 1px var(--lcb-active-border) inset}
.lcb-name{white-space:nowrap;background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;display:inline-flex;align-items:center}
.lcb-count{font-size:12px;font-weight:700;color:var(--lcb-count-text);background:var(--lcb-count-bg);border-radius:999px;padding:1px 8px;font-variant-numeric:tabular-nums}
.lcb-chip.lcb-active .lcb-count{background:var(--lcb-active-count-bg);color:var(--lcb-active-count-text)}

.lcb-plain{cursor:pointer}

.lcb-shared{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--lcb-teal);background:var(--lcb-teal-bg);border:1px solid var(--lcb-teal-border);border-radius:999px;padding:1px 7px 1px 5px}

.lcb-actions{display:none;align-items:center;gap:6px;margin-left:2px;padding-left:8px;border-left:1px solid var(--lcb-line)}
.lcb-chip:hover .lcb-actions,.lcb-chip:focus-within .lcb-actions,.lcb-chip.lcb-active .lcb-actions{display:inline-flex}

.lcb-btn-share{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:var(--lcb-teal-on);background:var(--lcb-teal);border:none;border-radius:8px;padding:4px 9px;cursor:pointer}
.lcb-btn-share.lcb-is-shared{color:var(--lcb-teal);background:var(--lcb-teal-bg);border:1px solid var(--lcb-teal-border)}
.lcb-btn-share:disabled{opacity:.6;cursor:default}

.lcb-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid transparent;color:var(--lcb-icon);background:transparent;cursor:pointer}
.lcb-icon-btn:hover{background:var(--lcb-icon-hover-bg);color:var(--lcb-icon-hover-text)}
.lcb-icon-btn.lcb-danger:hover{background:var(--lcb-danger-bg);color:var(--lcb-danger)}

.lcb-add{display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--lcb-add-border);background:var(--lcb-chip-bg);border-radius:11px;padding:8px 13px;font-size:13.5px;font-weight:600;color:var(--lcb-add-text);cursor:pointer}
.lcb-add:hover{border-color:var(--lcb-blue);color:var(--lcb-blue);background:var(--lcb-blue-bg)}

.lcb-edit{display:inline-flex;align-items:center;gap:6px}
.lcb-input{padding:7px 11px;border-radius:9px;border:1.5px solid var(--lcb-blue);font-size:13.5px;background:var(--lcb-input-bg);color:var(--lcb-input-text);outline:none;width:150px}
.lcb-mini{background:none;border:none;padding:2px;cursor:pointer;display:inline-flex;align-items:center;color:var(--lcb-count-text)}
.lcb-mini.lcb-ok{color:var(--lcb-blue)}

/* Team-Freigabe-Popover */
.lcb-pop-wrap{position:relative;display:inline-flex}
.lcb-pop-backdrop{position:fixed;inset:0;z-index:40}
.lcb-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:50;min-width:250px;max-width:300px;background:var(--lcb-chip-bg);border:1px solid var(--lcb-chip-border);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.16);padding:12px;font-weight:500;text-align:left}
.lcb-pop-title{font-size:12px;font-weight:700;color:var(--lcb-chip-text);display:flex;align-items:center;gap:6px;margin-bottom:4px}
.lcb-pop-sub{font-size:11px;color:var(--lcb-count-text);margin-bottom:10px;line-height:1.5}
.lcb-pop-list{display:flex;flex-direction:column;gap:2px;max-height:220px;overflow-y:auto;margin:0 -4px}
.lcb-pop-row{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;color:var(--lcb-chip-text)}
.lcb-pop-row:hover{background:var(--lcb-hover-bg)}
.lcb-pop-row input{width:15px;height:15px;cursor:pointer;accent-color:var(--lcb-teal)}
.lcb-pop-empty{font-size:12px;color:var(--lcb-count-text);font-style:italic;padding:6px 4px}
.lcb-pop-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.lcb-pop-cancel{background:none;border:1px solid var(--lcb-chip-border);border-radius:8px;padding:5px 11px;font-size:12.5px;font-weight:600;color:var(--lcb-count-text);cursor:pointer}
.lcb-pop-save{background:var(--lcb-teal);border:none;border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:700;color:var(--lcb-teal-on);cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.lcb-pop-save:disabled{opacity:.6;cursor:default}
`

export default function ListChipsBar({
  lists,
  membersByList,
  countsByList,
  rows,
  listFilter,
  setListFilter,
  allowSharing = false,
  sharesByList,      // Map<list_id, [{ team_id, team_name }]> — nur bei allowSharing
  allTeams,          // [{ id, name }] — Teams des Users (Checkbox-Optionen)
  onSetShares,       // async (listId, teamIds[]) => { data | error }
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
  const [shareForId, setShareForId] = useState(null)   // welche Liste hat den Team-Picker offen
  const [draftTeams, setDraftTeams] = useState([])      // angehakte team_ids im Picker
  const [savingShare, setSavingShare] = useState(false)

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

  // ─── Team-Freigabe-Popover ─────────────────────────────────────────────────
  const sharesOf = (id) => (sharesByList && sharesByList.get(id)) || []
  const openShare = (l) => { setDraftTeams(sharesOf(l.id).map(s => s.team_id)); setShareForId(l.id) }
  const closeShare = () => { setShareForId(null); setSavingShare(false) }
  const toggleDraft = (tid) => setDraftTeams(prev => prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid])
  const saveShare = async (l) => {
    setSavingShare(true)
    const r = await onSetShares(l.id, draftTeams)
    setSavingShare(false)
    if (r?.error) { msg('Freigabe fehlgeschlagen: ' + r.error.message); return }
    const n = (r?.data || []).length
    closeShare()
    msg(n === 0 ? `„${l.name}" ist nicht mehr geteilt.` : `„${l.name}" mit ${n} Team${n > 1 ? 's' : ''} geteilt.`)
  }

  // Rein präsentativ: die Aufrufstelle liefert die bereits gefilterten Listen
  // (develop: brand_voice-Sicht · main: nach l.kind/listKind pro Tab).
  const visible = lists

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
        // Die Chip-Zahl sagt „so viele sind hier sichtbar", nicht „so viele hat die Liste".
        // Der Titel legt alle drei Zahlen offen, damit die Differenz zur Zielgruppen-Zahl
        // in der Automatisierung nicht raetselhaft bleibt. Ohne Zaehler kein erfundener Text.
        const st = countsByList?.get(l.id)
        const chipTitle = st
          ? `${st.mitglieder} in der Liste · ${st.fuerKampagnen} für Kampagnen · ${st.aussortiert} aussortiert`
          : undefined

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
        const shares = allowSharing ? sharesOf(l.id) : []
        const shared = shares.length > 0
        const shareNames = shares.map(s => s.team_name || '—').join(', ')
        const popOpen = shareForId === l.id
        return (
          <span key={l.id} className={'lcb-chip' + (active ? ' lcb-active' : '')} title={chipTitle}>
            <button className="lcb-name" onClick={() => setListFilter(l.id)}>{l.name}</button>
            <span className="lcb-count">{cnt}</span>

            {allowSharing && shared && (
              <span className="lcb-shared"
                title={`Freigegeben für ${shares.length === 1 ? 'das Team' : shares.length + ' Teams'}: ${shareNames}`}>
                <Users size={12} /> {shares.length === 1 ? `Geteilt: ${shares[0].team_name || 'Team'}` : `Geteilt: ${shares.length} Teams`}
              </span>
            )}

            <span className="lcb-actions">
              {allowSharing && (
                <span className="lcb-pop-wrap">
                  <button
                    className={'lcb-btn-share' + (shared ? ' lcb-is-shared' : '')}
                    onClick={() => (popOpen ? closeShare() : openShare(l))}
                    aria-haspopup="dialog" aria-expanded={popOpen}
                    title={shared ? 'Freigabe verwalten' : 'Mit Teams teilen'}
                    aria-label={shared ? 'Freigabe verwalten' : 'Mit Teams teilen'}>
                    <Users size={13} /> {shared ? 'Freigabe' : 'Teilen'}
                  </button>
                  {popOpen && (
                    <>
                      <div className="lcb-pop-backdrop" onClick={closeShare} />
                      <div className="lcb-pop" role="dialog" aria-label="Mit Teams teilen"
                        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeShare() } }}>
                        <div className="lcb-pop-title"><Users size={13} /> Mit Teams teilen</div>
                        <div className="lcb-pop-sub">Ausgewählte Teams sehen „{l.name}" und können die Kontakte ins CRM übernehmen. Umbenennen/Löschen bleibt bei dir.</div>
                        {(!allTeams || allTeams.length === 0) ? (
                          <div className="lcb-pop-empty">Du bist in keinem Team.</div>
                        ) : (
                          <div className="lcb-pop-list">
                            {allTeams.map((t, i) => (
                              <label key={t.id} className="lcb-pop-row">
                                <input type="checkbox" checked={draftTeams.includes(t.id)} autoFocus={i === 0}
                                  onChange={() => toggleDraft(t.id)} />
                                <span>{t.name || t.id.slice(0, 8)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="lcb-pop-foot">
                          <button className="lcb-pop-cancel" onClick={closeShare}>Abbrechen</button>
                          <button className="lcb-pop-save" onClick={() => saveShare(l)} disabled={savingShare}>
                            {savingShare ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Speichern
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </span>
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
            style={{ background: 'var(--lcb-blue)', color: '#fff' }}>
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
