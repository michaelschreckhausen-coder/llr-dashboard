// src/components/leads/TagManagerModal.jsx
//
// Zentrale Tag-Verwaltung: Tags anlegen, umbenennen, loeschen, Farbe zuweisen.
// Quelle ist lead_tag_registry (via useTagRegistry). Ausschliesslich Inline-Styles.

import { useState, useMemo } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { TAG_PALETTE_KEYS, paletteColor, tagColor } from '../../lib/tagColors';

const PRIMARY = 'var(--wl-primary, #0A6FB0)';

function Swatch({ colorKey, active, onClick }) {
  const c = paletteColor(colorKey);
  return (
    <button type="button" onClick={onClick} title={colorKey}
      style={{
        width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
        background: c.bg, border: `2px solid ${active ? c.fg : 'transparent'}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
      {active && <Check size={12} color={c.fg} />}
    </button>
  );
}

export function TagManagerModal({ onClose, tags = [], usedTags = [], isLoading, createTag, updateTag, deleteTag, onPurge }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_PALETTE_KEYS[0]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  // Registry-Tags + auf Leads vorhandene Tags (noch ohne Registry-Eintrag).
  // Letztere bekommen id=null/color=null (Auto-Farbe) — Farbe zuweisen legt
  // den Registry-Eintrag an.
  const rows = useMemo(() => {
    const known = new Set(tags.map(t => (t.name || '').toLowerCase()));
    const virtual = (usedTags || [])
      .filter(n => n && !known.has(n.toLowerCase()))
      .map(n => ({ id: null, name: n, color: null }));
    return [...tags, ...virtual].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [tags, usedTags]);

  const onCreate = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    const { error } = await createTag(newName, newColor);
    setBusy(false);
    if (error) { alert('Anlegen fehlgeschlagen: ' + error.message); return; }
    setNewName('');
  };

  const saveRename = async (id) => {
    const clean = editName.trim();
    setEditId(null);
    if (clean && tags.find(t => t.id === id)?.name !== clean) await updateTag(id, { name: clean });
  };

  const inputStyle = {
    flex: 1, height: 36, padding: '0 12px', fontSize: 13, fontFamily: 'inherit',
    border: '1px solid #E4E7EC', borderRadius: 8, outline: 'none',
    background: 'var(--surface)', color: 'var(--text-primary, #111827)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Tags verwalten</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#F3F4F6', cursor: 'pointer', color: '#6B7280' }}>×</button>
        </div>

        {/* Anlegen */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onCreate(); }}
              placeholder="Neuer Tag…" style={inputStyle} />
            <button type="button" onClick={onCreate} disabled={!newName.trim() || busy}
              style={{ height: 36, padding: '0 14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Anlegen
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {TAG_PALETTE_KEYS.map(k => (
              <Swatch key={k} colorKey={k} active={newColor === k} onClick={() => setNewColor(k)} />
            ))}
          </div>
        </div>

        {/* Liste */}
        <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1 }}>
          {isLoading && <div style={{ padding: 16, fontSize: 13, color: '#9CA3AF' }}>Lade…</div>}
          {!isLoading && rows.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: '#9CA3AF' }}>Noch keine Tags vorhanden.</div>
          )}
          {rows.map(t => {
            const c = t.color ? paletteColor(t.color) : tagColor(t.name);
            const isEditing = t.id && editId === t.id;
            const setColor = (k) => (t.id ? updateTag(t.id, { color: k }) : createTag(t.name, k));
            return (
              <div key={t.id || `used:${t.name}`} style={{ padding: '10px 8px', borderBottom: '1px solid #F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isEditing ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onBlur={() => saveRename(t.id)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditId(null); }}
                      style={{ ...inputStyle, height: 30, flex: 1 }} />
                  ) : t.id ? (
                    <button type="button" onClick={() => { setEditId(t.id); setEditName(t.name); }}
                      title="Klicken zum Umbenennen"
                      style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={{ background: c.bg, color: c.fg, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500 }}>
                        {t.name}
                      </span>
                    </button>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: c.bg, color: c.fg, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500 }}>
                        {t.name}
                      </span>
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>auf Leads · Farbe wählen legt an</span>
                    </div>
                  )}
                  <button type="button"
                    onClick={() => { if (confirm(`Tag "${t.name}" loeschen? Wird von allen Kontakten entfernt${t.id ? ' und aus der Registry geloescht' : ''}.`)) onPurge?.(t.name, t.id); }}
                    title="Tag loeschen (von allen Kontakten entfernen)"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {TAG_PALETTE_KEYS.map(k => (
                    <Swatch key={k} colorKey={k} active={t.color === k} onClick={() => setColor(k)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
