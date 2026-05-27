// src/components/leads/LeadViewsTabs.jsx
//
// Sprint B · Tab-Leiste für Saved Views ("Ansichten") oberhalb der
// Filter-Chip-Zeile auf /leads.
//
// UX-Modell (HubSpot-nah):
//   - Tabs zeigen alle Views (eigene + team-shared) sortiert nach sort_order/created_at
//   - Click auf Tab → applyView(view) im Parent + setActiveView(view.id)
//   - Wenn aktuelle Filter != saved filter (dirty), zeigt der aktive Tab einen
//     kleinen "•"-Indikator + ein zusätzliches "Speichern"-Button
//   - "+ Ansicht"-Button öffnet SaveViewModal mit current filter snapshot
//   - Active-Tab hat einen Pencil + X-Button rechts (Rename / Delete)
//
// Props:
//   views               — Array<{id, name, filter_json, is_shared, user_id, team_id}>
//   activeViewId        — uuid | null
//   isDirty             — boolean (Filter-State weicht von gespeicherter View ab)
//   currentUserId       — uuid (eigene Views sind editier-/löschbar)
//   currentFilterJson   — Object  (snapshot vom Parent für Save-Modal)
//   onApply(view)       — Tab-Click
//   onSave(payload)     — createView via Hook
//   onUpdate(id, patch) — updateView
//   onDelete(id)        — deleteView
//   onSetActive(id)     — setActiveView (persist in user_preferences)

import { useState, useEffect, useRef } from 'react';
import { Plus, X, Pencil, Save, Eye, Users } from 'lucide-react';

const PRIMARY = 'rgb(49,90,231)';

// ─── Styles ──────────────────────────────────────────────────────────────
const wrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  borderBottom: '1px solid #E4E7EC',
  marginBottom: 12,
  overflowX: 'auto',
};
const tabStyle = {
  padding: '8px 14px',
  fontSize: 13,
  color: '#6B7280',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
  marginBottom: -1, // border-bottom overlap mit container-border
  font: 'inherit',
};
const tabActiveStyle = {
  ...tabStyle,
  color: PRIMARY,
  borderBottomColor: PRIMARY,
  fontWeight: 600,
};
const dirtyDotStyle = {
  width: 6, height: 6, borderRadius: '50%', background: '#F59E0B',
  marginLeft: 2, flexShrink: 0,
};
const sharedIconStyle = { color: '#059669', opacity: 0.7 };
const addBtnStyle = {
  padding: '6px 10px',
  fontSize: 12,
  color: PRIMARY,
  background: 'transparent',
  border: '1px dashed #C7D2FE',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontWeight: 600,
  marginLeft: 'auto',
  marginBottom: 4,
  flexShrink: 0,
  font: 'inherit',
};
const inlineActionStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#9CA3AF', padding: 2, display: 'inline-flex', alignItems: 'center',
  borderRadius: 4,
};
const saveDirtyBtnStyle = {
  padding: '4px 8px',
  fontSize: 11,
  color: '#92400E',
  background: '#FEF3C7',
  border: '1px solid #FDE68A',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 6,
  font: 'inherit',
};

// ─── Main Component ──────────────────────────────────────────────────────
export function LeadViewsTabs({
  views,
  activeViewId,
  isDirty,
  currentUserId,
  currentFilterJson,
  activeTeamId,
  onApply,
  onSave,
  onUpdate,
  onDelete,
  onSetActive,
}) {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [renameView, setRenameView] = useState(null); // view-Object für Rename-Modal

  if (!views) return null;

  const handleTabClick = (view) => {
    onApply?.(view);
    onSetActive?.(view.id);
  };

  const handleSaveCurrent = () => setSaveModalOpen(true);

  const handleUpdateActiveFilter = () => {
    const activeView = views.find(v => v.id === activeViewId);
    if (!activeView) return;
    onUpdate?.(activeView.id, { filter_json: currentFilterJson });
  };

  const handleDelete = (view) => {
    const ok = window.confirm(`Ansicht "${view.name}" wirklich löschen?`);
    if (!ok) return;
    onDelete?.(view.id);
  };

  return (
    <>
      <div style={wrapStyle}>
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          const isOwn = view.user_id === currentUserId;
          return (
            <div key={view.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button type="button"
                style={isActive ? tabActiveStyle : tabStyle}
                onClick={() => handleTabClick(view)}
                title={view.is_shared ? `${view.name} · geteilt mit Team` : view.name}
              >
                {view.is_shared && <Users size={11} style={sharedIconStyle} />}
                {view.name}
                {isActive && isDirty && <span style={dirtyDotStyle} title="Filter wurde geändert — noch nicht gespeichert" />}
              </button>
              {isActive && isOwn && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 6 }}>
                  {isDirty && (
                    <button type="button" style={saveDirtyBtnStyle}
                      onClick={handleUpdateActiveFilter}
                      title="Aktuelle Filter in dieser Ansicht speichern">
                      <Save size={11} /> Aktualisieren
                    </button>
                  )}
                  <button type="button" style={inlineActionStyle}
                    onClick={() => setRenameView(view)}
                    title="Umbenennen">
                    <Pencil size={12} />
                  </button>
                  <button type="button" style={inlineActionStyle}
                    onClick={() => handleDelete(view)}
                    title="Löschen">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" style={addBtnStyle} onClick={handleSaveCurrent}>
          <Plus size={12} /> Ansicht
        </button>
      </div>

      {saveModalOpen && (
        <SaveViewModal
          onClose={() => setSaveModalOpen(false)}
          onSave={async ({ name, is_shared }) => {
            const { data, error } = await onSave({
              name,
              filter_json: currentFilterJson,
              is_shared,
              team_id: is_shared ? activeTeamId : null,
            });
            if (!error && data) {
              onSetActive?.(data.id);
            }
            setSaveModalOpen(false);
          }}
          canShare={!!activeTeamId}
        />
      )}

      {renameView && (
        <RenameViewModal
          view={renameView}
          onClose={() => setRenameView(null)}
          onSave={async ({ name, is_shared }) => {
            const patch = { name };
            // is_shared-Toggle ist nur erlaubt für eigene Views (RLS prüft sowieso)
            if (typeof is_shared === 'boolean' && is_shared !== renameView.is_shared) {
              patch.is_shared = is_shared;
              patch.team_id = is_shared ? (activeTeamId || null) : null;
            }
            await onUpdate?.(renameView.id, patch);
            setRenameView(null);
          }}
          canShare={!!activeTeamId}
        />
      )}
    </>
  );
}

// ─── SaveViewModal — neue Ansicht aus aktuellen Filtern erstellen ────────
function SaveViewModal({ onClose, onSave, canShare }) {
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) return;
    await onSave({ name: name.trim(), is_shared: isShared && canShare });
  };

  return (
    <ModalShell title="Neue Ansicht speichern" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label style={modalLabelStyle}>Name</label>
        <input ref={inputRef} type="text" value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Meine Hot-Leads Q4"
          style={modalInputStyle}
          maxLength={60} />

        <label style={{ ...modalCheckboxRowStyle, opacity: canShare ? 1 : 0.5 }}>
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)}
            disabled={!canShare} />
          <Users size={14} />
          <span>Mit Team teilen</span>
          {!canShare && <span style={modalHintStyle}>(kein Team aktiv)</span>}
        </label>

        <div style={modalActionsStyle}>
          <button type="button" style={modalBtnGhostStyle} onClick={onClose}>Abbrechen</button>
          <button type="submit" style={modalBtnPrimaryStyle} disabled={!name.trim()}>
            <Save size={13} /> Speichern
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── RenameViewModal — Umbenennen + Sharing-Toggle für eigene Views ──────
function RenameViewModal({ view, onClose, onSave, canShare }) {
  const [name, setName] = useState(view.name || '');
  const [isShared, setIsShared] = useState(!!view.is_shared);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) return;
    await onSave({ name: name.trim(), is_shared: isShared && canShare });
  };

  return (
    <ModalShell title="Ansicht bearbeiten" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label style={modalLabelStyle}>Name</label>
        <input ref={inputRef} type="text" value={name}
          onChange={(e) => setName(e.target.value)}
          style={modalInputStyle} maxLength={60} />

        <label style={{ ...modalCheckboxRowStyle, opacity: canShare ? 1 : 0.5 }}>
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)}
            disabled={!canShare} />
          <Users size={14} />
          <span>Mit Team teilen</span>
          {!canShare && <span style={modalHintStyle}>(kein Team aktiv)</span>}
        </label>

        <div style={modalActionsStyle}>
          <button type="button" style={modalBtnGhostStyle} onClick={onClose}>Abbrechen</button>
          <button type="submit" style={modalBtnPrimaryStyle} disabled={!name.trim()}>Speichern</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal-Shell + Shared-Styles ─────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h3>
          <button type="button" style={inlineActionStyle} onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const modalBackdropStyle = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 2000, padding: 16,
};
const modalCardStyle = {
  background: '#fff', borderRadius: 14, padding: '20px 22px',
  width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const modalHeaderStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 16,
};
const modalLabelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151',
  marginBottom: 4,
};
const modalInputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 14,
  border: '1.5px solid #E4E7EC', borderRadius: 8, outline: 'none',
  boxSizing: 'border-box', marginBottom: 14,
};
const modalCheckboxRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  color: '#374151', marginBottom: 18, cursor: 'pointer',
};
const modalHintStyle = { fontSize: 11, color: '#9CA3AF', marginLeft: 4 };
const modalActionsStyle = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const modalBtnGhostStyle = {
  padding: '8px 14px', fontSize: 13, fontWeight: 600,
  background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8,
  cursor: 'pointer', font: 'inherit',
};
const modalBtnPrimaryStyle = {
  padding: '8px 16px', fontSize: 13, fontWeight: 600,
  background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
  font: 'inherit',
};
