// src/components/leads/TagEditor.jsx
//
// Tag-CRUD-Component für leads.tags (text[]).
//
// - Tags werden als Pills mit X-Remove gerendert.
// - „+Tag"-Pill schaltet auf Input. Enter / Blur fügt Tag hinzu (dedup, trim).
// - Escape verwirft.
// - Duplikate werden stillschweigend gefressen.
//
// onSave wird mit dem vollständigen neuen Array aufgerufen.

import { useState } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { COLORS, RADIUS } from '../../lib/leadStyleTokens';
import { tagColor } from '../../lib/tagColors';

const wrapStyle = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' };
const tagStyle = {
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
  fontSize: 11,
  padding: '3px 4px 3px 10px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};
const addTagStyle = {
  ...tagStyle,
  color: COLORS.textTertiary,
  cursor: 'pointer',
  padding: '3px 10px',
};
const removeBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: COLORS.textTertiary,
  padding: 0,
  width: 16,
  height: 16,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
};
const inputStyle = {
  height: 22,
  padding: '0 10px',
  fontSize: 11,
  border: `1px solid ${COLORS.primary}`,
  borderRadius: 999,
  background: COLORS.surface,
  outline: 'none',
  color: COLORS.textPrimary,
  fontFamily: 'inherit',
  minWidth: 80,
};

export function TagEditor({ tags = [], onSave, disabled = false }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const safeTags = Array.isArray(tags) ? tags : [];

  const finishAdd = async () => {
    const trimmed = draft.trim();
    setAdding(false);
    if (!trimmed) { setDraft(''); return; }
    if (safeTags.includes(trimmed)) { setDraft(''); return; }
    setBusy(true);
    await onSave([...safeTags, trimmed]);
    setDraft('');
    setBusy(false);
  };

  const remove = async (tag) => {
    if (busy) return;
    setBusy(true);
    await onSave(safeTags.filter((t) => t !== tag));
    setBusy(false);
  };

  return (
    <div style={wrapStyle}>
      {safeTags.map((tag) => {
        const c = tagColor(tag);
        return (
          <span key={tag} style={{ ...tagStyle, background: c.bg, color: c.fg }}>
            <Tag size={12} />
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(tag)}
                style={{ ...removeBtnStyle, color: c.fg }}
                aria-label={`Tag "${tag}" entfernen`}
                title="Entfernen"
                disabled={busy}
              >
                <X size={10} />
              </button>
            )}
          </span>
        );
      })}
      {!disabled && (adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finishAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { setDraft(''); setAdding(false); }
          }}
          placeholder="Tag…"
          style={inputStyle}
          disabled={busy}
        />
      ) : (
        <span
          style={addTagStyle}
          onClick={() => setAdding(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') setAdding(true); }}
        >
          <Plus size={12} /> Tag
        </span>
      ))}
    </div>
  );
}
