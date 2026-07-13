// src/components/leads/BulkEditModal.jsx
//
// Sprint C/2 · Bulk-Edit-Modal für die Leads-Page.
//
// Field-Picker + Value-Input + Confirm-Phase mit Lead-Count.
// 5 Field-Modi:
//   - Status (STATUS_ORDER-Dropdown)        → single update().in('id', ids)
//   - Source (text)                         → single update().in('id', ids)
//   - Next-Followup (date)                  → single update().in('id', ids)
//   - Tag hinzufügen (text + bestehende)    → Per-Lead-Loop (array_append, dedupe)
//   - Tag entfernen (text + bestehende)     → Per-Lead-Loop (filter-out)
//
// CLAUDE.md Top-Fallstrick #1 (ENUM-Bundle): kein Issue hier, da das Modal
// jeweils EIN Field updatet — nicht kombiniert.
//
// Tags non-destruktiv per Design: Tag-Add macht NIE einen Overwrite des
// gesamten tags-Arrays, sondern fügt nur einen einzelnen Tag pro Lead hinzu
// falls noch nicht da. Tag-Remove filtert den Tag aus, lässt den Rest.
//
// Props:
//   leadIds        — Array<uuid> der ausgewählten Leads
//   leads          — Array (full lead objects, für tag-suggest + tag-remove-list)
//   onApply(payload) — async, returns { error? }
//                     payload-Shape:
//                       { field: 'status'|'source'|'next_followup', value: any }
//                       { field: 'tags', mode: 'add'|'remove', tag: string }
//   onClose

import PillSelect from '../PillSelect'
import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { STATUS_ORDER, STATUS_CONFIG, COLORS } from '../../lib/leadStyleTokens';

const PRIMARY = '#0A6FB0';

const FIELDS = [
  { key: 'status',         label: 'Status setzen',         type: 'enum'   },
  { key: 'source',         label: 'Source setzen',         type: 'text'   },
  { key: 'next_followup',  label: 'Follow-up-Datum',       type: 'date'   },
  { key: 'tag_add',        label: 'Tag hinzufügen',        type: 'tag-add'},
  { key: 'tag_remove',     label: 'Tag entfernen',         type: 'tag-rm' },
];

// ─── Styles ──────────────────────────────────────────────────────────────
const backdropStyle = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 2000, padding: 16,
};
const cardStyle = {
  background: '#fff', borderRadius: 14, padding: '20px 22px',
  width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 16,
};
const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5,
};
const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 14,
  border: '1.5px solid #E4E7EC', borderRadius: 8, outline: 'none',
  boxSizing: 'border-box', marginBottom: 12,
};
const selectStyle = { ...inputStyle, appearance: 'none', cursor: 'pointer' };
const datalist = { /* native */ };
const inlineActionStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#9CA3AF', padding: 2, display: 'inline-flex', alignItems: 'center',
  borderRadius: 4,
};
const actionsRow = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 };
const btnGhost = {
  padding: '8px 14px', fontSize: 13, fontWeight: 600,
  background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8,
  cursor: 'pointer', font: 'inherit',
};
const btnPrimary = {
  padding: '8px 16px', fontSize: 13, fontWeight: 600,
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
  font: 'inherit',
};
const confirmBarStyle = {
  background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8,
  padding: '10px 12px', fontSize: 12, color: '#78350F',
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
};
const errBarStyle = {
  background: '#FEE2E2', color: '#7F1D1D',
  borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12,
};

export function BulkEditModal({ leadIds, leads, onApply, onClose }) {
  const [fieldKey, setFieldKey] = useState('status');
  const [scalarValue, setScalarValue] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const firstFocusRef = useRef(null);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, busy]);

  useEffect(() => { firstFocusRef.current?.focus(); }, []);

  const fieldDef = FIELDS.find(f => f.key === fieldKey);
  const count = leadIds.length;

  // ─── Derived: alle existierenden Tags + Sources über die Selected-Leads ──
  // Für Datalist-Suggestion + tag-remove-Vorschläge.
  const selectedLeads = useMemo(
    () => (leads || []).filter(l => leadIds.includes(l.id)),
    [leads, leadIds]
  );
  const tagsInSelected = useMemo(() => {
    const s = new Set();
    selectedLeads.forEach(l => (l.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [selectedLeads]);
  const sourcesInSelected = useMemo(() => {
    const s = new Set();
    selectedLeads.forEach(l => l.source && s.add(l.source));
    return Array.from(s).sort();
  }, [selectedLeads]);

  // Reset value beim Field-Wechsel
  const handleFieldChange = (e) => {
    setFieldKey(e.target.value);
    setScalarValue('');
    setTagInput('');
    setErr(null);
  };

  // ─── Submit ────────────────────────────────────────────────────────────
  const canSubmit = (() => {
    if (busy) return false;
    if (fieldDef.type === 'tag-add' || fieldDef.type === 'tag-rm') {
      return tagInput.trim().length > 0;
    }
    if (fieldDef.type === 'date') {
      return true; // leerer date = NULL (clear field) — bewusst erlaubt
    }
    if (fieldDef.type === 'text') {
      return true; // leerer text = NULL — bewusst erlaubt
    }
    if (fieldDef.type === 'enum') {
      return STATUS_ORDER.includes(scalarValue);
    }
    return false;
  })();

  const buildPayload = () => {
    if (fieldDef.type === 'enum')   return { field: 'status',        value: scalarValue };
    if (fieldDef.type === 'text')   return { field: 'source',        value: scalarValue.trim() || null };
    if (fieldDef.type === 'date')   return { field: 'next_followup', value: scalarValue || null };
    if (fieldDef.type === 'tag-add')return { field: 'tags', mode: 'add',    tag: tagInput.trim() };
    if (fieldDef.type === 'tag-rm') return { field: 'tags', mode: 'remove', tag: tagInput.trim() };
    return null;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await onApply(buildPayload());
      if (result && result.error) {
        setErr(result.error.message || 'Speichern fehlgeschlagen');
        setBusy(false);
        return;
      }
      // onApply schließt das Modal selbst über onClose
    } catch (ex) {
      setErr(ex?.message || 'Unerwarteter Fehler');
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={busy ? undefined : onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
            {count} Lead{count === 1 ? '' : 's'} bearbeiten
          </h3>
          <button type="button" style={inlineActionStyle} onClick={onClose}
            disabled={busy} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <div style={confirmBarStyle}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>
            Änderung gilt für <strong>{count}</strong> ausgewählte Lead{count === 1 ? '' : 's'}.
            Aktion ist nicht ungeschehen machbar.
          </span>
        </div>

        {err && <div style={errBarStyle}>{err}</div>}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle} htmlFor="bulk-field">Feld</label>
          <PillSelect value={fieldKey} onChange={__lkv => (handleFieldChange)({ target: { value: __lkv } })} neutral disabled={busy} options={[...FIELDS.map((f) => ({ value: f.key, label: f.label }))]} buttonStyle={{ minWidth: 140 }} />

          {fieldDef.type === 'enum' && (
            <>
              <label style={labelStyle} htmlFor="bulk-status">Neuer Status</label>
              <PillSelect value={scalarValue} onChange={__lkv => setScalarValue(__lkv)} neutral disabled={busy} options={[{ value: '', label: `— wählen —` }, ...STATUS_ORDER.map((s) => { const cfg = STATUS_CONFIG[s]; return ({ value: s, label: `${s} · ${cfg?.sublabel || ''}` }); })]} buttonStyle={{ minWidth: 140 }} />
            </>
          )}

          {fieldDef.type === 'text' && (
            <>
              <label style={labelStyle} htmlFor="bulk-source">
                Neuer Source-Wert <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(leer = entfernen)</span>
              </label>
              <input id="bulk-source" type="text" style={inputStyle}
                value={scalarValue} onChange={(e) => setScalarValue(e.target.value)}
                placeholder="z.B. webinar-2026-q2"
                list="source-suggestions" disabled={busy} maxLength={100} />
              {sourcesInSelected.length > 0 && (
                <datalist id="source-suggestions">
                  {sourcesInSelected.map(s => <option key={s} value={s} />)}
                </datalist>
              )}
            </>
          )}

          {fieldDef.type === 'date' && (
            <>
              <label style={labelStyle} htmlFor="bulk-date">
                Neues Followup-Datum <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(leer = entfernen)</span>
              </label>
              <input id="bulk-date" type="date" style={inputStyle}
                value={scalarValue} onChange={(e) => setScalarValue(e.target.value)}
                disabled={busy} />
            </>
          )}

          {fieldDef.type === 'tag-add' && (
            <>
              <label style={labelStyle} htmlFor="bulk-tag-add">Tag der hinzugefügt wird</label>
              <input id="bulk-tag-add" type="text" style={inputStyle}
                value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                placeholder="z.B. priority"
                list="tag-suggestions-add" disabled={busy} maxLength={40} />
              {tagsInSelected.length > 0 && (
                <datalist id="tag-suggestions-add">
                  {tagsInSelected.map(t => <option key={t} value={t} />)}
                </datalist>
              )}
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: -8, marginBottom: 12 }}>
                Wird zu allen Selected hinzugefügt, falls noch nicht vorhanden. Bestehende Tags bleiben.
              </div>
            </>
          )}

          {fieldDef.type === 'tag-rm' && (
            <>
              <label style={labelStyle} htmlFor="bulk-tag-rm">Tag der entfernt wird</label>
              <input id="bulk-tag-rm" type="text" style={inputStyle}
                value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                placeholder="z.B. cold"
                list="tag-suggestions-rm" disabled={busy} maxLength={40} />
              {tagsInSelected.length > 0 && (
                <datalist id="tag-suggestions-rm">
                  {tagsInSelected.map(t => <option key={t} value={t} />)}
                </datalist>
              )}
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: -8, marginBottom: 12 }}>
                Wird aus allen Selected entfernt, falls vorhanden. Andere Tags bleiben unberührt.
              </div>
            </>
          )}

          <div style={actionsRow}>
            <button type="button" style={btnGhost} onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" style={btnPrimary} disabled={!canSubmit}>
              <Save size={13} /> {busy ? 'Speichere…' : `Auf ${count} Lead${count === 1 ? '' : 's'} anwenden`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
