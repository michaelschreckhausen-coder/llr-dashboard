// src/components/leads/InlineEditField.jsx
//
// Wiederverwendbares Inline-Edit-Field.
//
// Display-Mode: Hover zeigt Pencil-Icon, Click switcht auf Input.
// Edit-Mode: Enter / Blur speichert, Escape verwirft.
// Multiline: zusätzliches `multiline`-Prop schaltet auf <textarea>.
//
// onSave wird mit dem rohen String aufgerufen (oder Number bei type='number',
// oder ISO-String '' bei type='date' wenn leer). Caller ist verantwortlich
// fürs Coercion in DB-Form.
//
// Usage:
//   <InlineEditField value={lead.email} onSave={(v) => updateLead({ email: v || null })} />
//   <InlineEditField value={lead.lead_score} type="number"
//     onSave={(v) => updateLead({ lead_score: v === '' ? null : parseInt(v, 10) })} />
//   <InlineEditField value={lead.notes} multiline placeholder="Notiz hinzufügen…"
//     onSave={(v) => updateLead({ notes: v || null })} />

import { useState, useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { COLORS, RADIUS } from '../../lib/leadStyleTokens';

const displayStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'text',
  padding: '2px 4px',
  margin: '-2px -4px',
  borderRadius: RADIUS.sm,
  minHeight: 20,
};
const displayHoverStyle = {
  ...displayStyle,
  background: COLORS.surfaceMuted,
};
const pencilStyle = { opacity: 0.4, flexShrink: 0 };
const inputStyle = {
  height: 28,
  padding: '0 8px',
  fontSize: 13,
  border: `1px solid ${COLORS.primary}`,
  borderRadius: RADIUS.sm,
  background: COLORS.surface,
  outline: 'none',
  color: COLORS.textPrimary,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const textareaStyle = {
  ...inputStyle,
  height: 'auto',
  padding: '8px',
  resize: 'vertical',
  minHeight: 60,
  fontFamily: 'inherit',
};
const emptyStyle = { color: COLORS.textTertiary, fontStyle: 'italic' };

function formatDisplay(value, type) {
  if (value == null || value === '') return null;
  if (type === 'date') {
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleDateString('de-DE');
    } catch {
      return value;
    }
  }
  if (type === 'number') return String(value);
  return value;
}

function inputValueFor(value, type) {
  if (value == null) return '';
  if (type === 'date') {
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      // YYYY-MM-DD für <input type="date">
      return d.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }
  return String(value);
}

export function InlineEditField({
  value,
  onSave,
  type = 'text',
  placeholder = '—',
  multiline = false,
  displayFormatter,
  emptyLabel,
  style: customStyle,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => inputValueFor(value, type));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const hovering = useRef(false);
  const [hoverState, setHoverState] = useState(false);

  // Sync wenn extern geändert und wir nicht gerade editieren
  useEffect(() => {
    if (!editing) setDraft(inputValueFor(value, type));
  }, [value, editing, type]);

  const startEdit = () => {
    setDraft(inputValueFor(value, type));
    setErr(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(inputValueFor(value, type));
    setErr(null);
    setEditing(false);
  };

  const save = async () => {
    if (busy) return;
    const trimmed = typeof draft === 'string' ? draft.trim() : draft;
    const currentInput = inputValueFor(value, type);
    if (trimmed === currentInput) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const result = await onSave(trimmed);
      if (result && result.error) {
        setErr(result.error.message || 'Speichern fehlgeschlagen');
        setBusy(false);
        return;
      }
      setBusy(false);
      setEditing(false);
    } catch (e) {
      setErr(e?.message || 'Speichern fehlgeschlagen');
      setBusy(false);
    }
  };

  if (editing) {
    const commonProps = {
      autoFocus: true,
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      onBlur: save,
      onKeyDown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          e.target.blur();
        }
      },
      disabled: busy,
      placeholder,
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        {multiline ? (
          <textarea {...commonProps} style={{ ...textareaStyle, ...customStyle }} rows={3} />
        ) : (
          <input {...commonProps} type={type} style={{ ...inputStyle, ...customStyle }} />
        )}
        {err && <div style={{ fontSize: 11, color: '#B91C1C' }}>{err}</div>}
      </div>
    );
  }

  const display = displayFormatter ? displayFormatter(value) : formatDisplay(value, type);
  const isEmpty = display == null || display === '';
  const label = isEmpty ? (emptyLabel || placeholder) : display;

  return (
    <span
      onClick={startEdit}
      onMouseEnter={() => { hovering.current = true; setHoverState(true); }}
      onMouseLeave={() => { hovering.current = false; setHoverState(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter') startEdit(); }}
      role="button"
      tabIndex={0}
      style={hoverState ? { ...displayHoverStyle, ...customStyle } : { ...displayStyle, ...customStyle }}
      title="Klicken zum Bearbeiten"
    >
      <span style={isEmpty ? emptyStyle : undefined}>{label}</span>
      {hoverState && <Pencil size={11} style={pencilStyle} />}
    </span>
  );
}
