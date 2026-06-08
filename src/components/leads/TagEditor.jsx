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

import { useState, useMemo } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { COLORS, RADIUS } from '../../lib/leadStyleTokens';
import { tagColor, getRegistryTagNames } from '../../lib/tagColors';

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
const dropdownStyle = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  minWidth: 160,
  maxHeight: 220,
  overflowY: 'auto',
  background: COLORS.surface,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  borderRadius: RADIUS.md,
  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
  zIndex: 1200,
  padding: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const dropdownItemStyle = {
  display: 'flex',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: RADIUS.sm,
  textAlign: 'left',
};

export function TagEditor({ tags = [], onSave, disabled = false, suggestions = [] }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const safeTags = Array.isArray(tags) ? tags : [];

  // Auswahl-Vorschläge: übergebene + bereits angelegte Registry-Tags, ohne die
  // schon gesetzten, gefiltert nach Eingabe.
  const available = useMemo(() => {
    const pool = Array.from(new Set([...(suggestions || []), ...getRegistryTagNames()]));
    const q = draft.trim().toLowerCase();
    const has = (n) => safeTags.some(t => t.toLowerCase() === n.toLowerCase());
    return pool
      .filter(n => n && !has(n))
      .filter(n => !q || n.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, draft, safeTags]);

  const addTag = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) { setDraft(''); return; }
    if (safeTags.some(t => t.toLowerCase() === trimmed.toLowerCase())) { setDraft(''); return; }
    setBusy(true);
    await onSave([...safeTags, trimmed]);
    setDraft('');
    setBusy(false);
  };

  const finishAdd = async () => {
    setAdding(false);
    await addTag(draft);
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
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finishAdd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
              if (e.key === 'Escape') { setDraft(''); setAdding(false); }
            }}
            placeholder="Tag wählen oder neu…"
            style={inputStyle}
            disabled={busy}
          />
          {available.length > 0 && (
            <div style={dropdownStyle}>
              {available.map((n) => {
                const c = tagColor(n);
                return (
                  <button
                    key={n}
                    type="button"
                    // onMouseDown + preventDefault, damit der Input-Blur (finishAdd)
                    // nicht vor dem Klick feuert.
                    onMouseDown={(e) => { e.preventDefault(); addTag(n); }}
                    style={dropdownItemStyle}
                  >
                    <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500 }}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}
        </span>
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
