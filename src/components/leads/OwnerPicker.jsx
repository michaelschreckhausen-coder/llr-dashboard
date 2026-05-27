// src/components/leads/OwnerPicker.jsx
//
// Modal zur Owner-Auswahl. Listet alle aktiven Team-Members + „Niemand"-Option.
// Click setzt owner_id (uuid oder null).
//
// members kommt aus useTeam() — Shape: { user_id, role, profile: { full_name, email, avatar_url } }

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { LeadAvatar } from './LeadAvatar';
import { COLORS, RADIUS } from '../../lib/leadStyleTokens';

const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle = {
  background: COLORS.surface, borderRadius: 16,
  boxShadow: '0 24px 64px rgba(15,23,42,0.18)',
  width: 420, maxWidth: '95vw', maxHeight: '80vh',
  display: 'flex', flexDirection: 'column',
};
const headerStyle = {
  padding: '16px 20px', borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const searchWrapStyle = {
  padding: '12px 16px', borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
};
const searchInputStyle = {
  width: '100%', height: 32, padding: '0 10px 0 32px',
  border: `0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md,
  background: COLORS.surface, fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};
const listStyle = { flex: 1, overflowY: 'auto', padding: '8px 0' };
const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '8px 20px', cursor: 'pointer', fontSize: 13,
};
const itemHoverStyle = { background: COLORS.surfaceMuted };
const itemSelectedStyle = { background: COLORS.primarySoft, color: COLORS.primarySoftFg };
const closeBtnStyle = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: COLORS.textTertiary, padding: 4, lineHeight: 0,
};

function splitFullName(full) {
  const tokens = (full || '').trim().split(/\s+/).filter(Boolean);
  return { first: tokens[0] || '', last: tokens.slice(1).join(' ') };
}

function Item({ children, onClick, selected }) {
  const [hover, setHover] = useState(false);
  const style = {
    ...itemStyle,
    ...(hover ? itemHoverStyle : null),
    ...(selected ? itemSelectedStyle : null),
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {children}
    </div>
  );
}

export function OwnerPicker({ open, currentOwnerId, members = [], onClose, onPick }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) => {
      const name = (m.profile?.full_name || '').toLowerCase();
      const email = (m.profile?.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [members, q]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Owner zuweisen</div>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div style={searchWrapStyle}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              color={COLORS.textTertiary}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen…"
              style={searchInputStyle}
            />
          </div>
        </div>
        <div style={listStyle}>
          <Item onClick={() => onPick(null)} selected={!currentOwnerId}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `1.5px dashed ${COLORS.borderHover}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: COLORS.textTertiary, fontSize: 11,
            }}>—</div>
            <span style={{ color: COLORS.textSecondary }}>Niemand</span>
          </Item>
          {filtered.length === 0 && q && (
            <div style={{ padding: '16px 20px', fontSize: 12, color: COLORS.textTertiary }}>
              Keine Treffer für „{q}"
            </div>
          )}
          {filtered.map((m) => {
            const { first, last } = splitFullName(m.profile?.full_name);
            const label = m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8);
            return (
              <Item
                key={m.user_id}
                onClick={() => onPick(m.user_id)}
                selected={m.user_id === currentOwnerId}
              >
                <LeadAvatar firstName={first} lastName={last} imageUrl={m.profile?.avatar_url} size="md" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{label}</span>
                  {m.profile?.email && m.profile.full_name && (
                    <span style={{ fontSize: 11, color: COLORS.textTertiary }}>
                      {m.profile.email}
                    </span>
                  )}
                </div>
                {m.role && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 10,
                    color: COLORS.textTertiary, textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {m.role}
                  </span>
                )}
              </Item>
            );
          })}
        </div>
      </div>
    </div>
  );
}
