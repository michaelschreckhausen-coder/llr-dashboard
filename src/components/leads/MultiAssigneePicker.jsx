// src/components/leads/MultiAssigneePicker.jsx
//
// Multi-Assignee-Picker fuer lead_tasks (seit 2026-06-02).
// Avatar-Chips mit Remove-X + Add-Dropdown.
//
// Props:
//   value:      string[]  — UUIDs der aktuell zugewiesenen User
//   onChange:   (string[]) => void
//   members:    Array<{ user_id, profile: { full_name, email, avatar_url, ... } }>
//   uid:        current user-id (fuer "Ich"-Label)
//   disabled:   boolean
//
// Render:
//   [Chip: Avatar+Name×] [Chip: ...] [+ Dropdown]
//   "Niemand zugewiesen" wenn value leer
//
// Verhalten:
//   - Add: Dropdown listet members die noch NICHT in value sind
//   - Remove: × auf jedem Chip
//   - Disabled-Mode: Chips read-only, kein Add/Remove

import React, { useState, useRef, useEffect } from 'react';

const PRIMARY = '#0A6FB0';

export default function MultiAssigneePicker({ value = [], onChange, members = [], uid, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Outside-Click schliesst Dropdown
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Member-Lookup
  const memberById = {};
  (members || []).forEach(m => {
    const mid = m.user_id || m.id;
    if (mid) memberById[mid] = m;
  });

  const selectedSet = new Set(value);
  const available = (members || []).filter(m => {
    const mid = m.user_id || m.id;
    return mid && !selectedSet.has(mid);
  });

  function memberLabel(m) {
    if (!m) return 'Unbekannt';
    const p = m.profile || m;
    return p.full_name
      || `${p.first_name || ''} ${p.last_name || ''}`.trim()
      || p.email?.split('@')[0]
      || 'Teammitglied';
  }

  function memberAvatar(m) {
    const p = m?.profile || m;
    if (p?.avatar_url) {
      return <img src={p.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />;
    }
    const letter = (memberLabel(m)[0] || '?').toUpperCase();
    return (
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: PRIMARY, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {letter}
      </div>
    );
  }

  function addMember(mid) {
    onChange?.([...value, mid]);
    setOpen(false);
  }

  function removeMember(mid) {
    onChange?.(value.filter(v => v !== mid));
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        padding: '6px 8px', border: '1.5px solid #E4E7EC', borderRadius: 10,
        background: disabled ? '#FAFAFA' : 'var(--surface)', minHeight: 36,
      }}>
        {value.length === 0 && (
          <span style={{ fontSize: 12, color: '#9CA3AF', padding: '2px 4px' }}>
            Niemand zugewiesen
          </span>
        )}

        {value.map(mid => {
          const m = memberById[mid];
          return (
            <span key={mid} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 4px 3px 6px', borderRadius: 99,
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              fontSize: 12, color: '#185FA5', fontWeight: 600,
            }}>
              {memberAvatar(m)}
              <span>{memberLabel(m)}{mid === uid ? ' (Ich)' : ''}</span>
              {!disabled && (
                <button type="button" onClick={() => removeMember(mid)}
                  aria-label="Entfernen"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#185FA5', fontSize: 14, lineHeight: 1, padding: '0 4px',
                  }}>
                  ×
                </button>
              )}
            </span>
          );
        })}

        {!disabled && available.length > 0 && (
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{
              padding: '4px 10px', borderRadius: 99,
              border: '1.5px dashed #D1D5DB', background: 'transparent',
              color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            + Person
          </button>
        )}
      </div>

      {open && available.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', zIndex: 50,
          maxHeight: 240, overflowY: 'auto', padding: 4,
        }}>
          {available.map(m => {
            const mid = m.user_id || m.id;
            return (
              <button key={mid} type="button" onClick={() => addMember(mid)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 10px', borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  fontSize: 13, color: '#374151',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {memberAvatar(m)}
                <span>{memberLabel(m)}{mid === uid ? ' (Ich)' : ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
