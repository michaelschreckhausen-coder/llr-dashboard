// src/components/leads/StatusPicker.jsx
//
// Popover für die 5 leads.status-Werte (Lead/LQL/MQL/MQN/SQL).
// Rendert als kleines Floating-Panel — nicht als Vollbild-Modal, weil
// es im Header-Kontext direkt unter der Status-Pill aufpoppen soll.
//
// Caller positioniert via Wrapper-Element (position: relative).
//
// CLAUDE.md Top-Fallstrick #1: status separat updaten, nie mit anderen
// Feldern bundlen — Caller-Verantwortung.

import { useEffect, useRef } from 'react';
import { LeadStatusPill } from './LeadStatusPill';
import { STATUS_ORDER } from '../../lib/leadStyleTokens';
import { COLORS, RADIUS } from '../../lib/leadStyleTokens';

const panelStyle = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 50,
  background: COLORS.surface,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  borderRadius: RADIUS.md,
  boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
  padding: 6,
  minWidth: 200,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const optionStyle = {
  padding: '6px 8px',
  borderRadius: RADIUS.sm,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
};

export function StatusPicker({ open, current, onClose, onPick }) {
  const ref = useRef(null);

  // Outside-Click schließt
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    // Mit Verzögerung, damit der öffnende Click nicht direkt wieder schließt
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} style={panelStyle} role="menu">
      {STATUS_ORDER.map((status) => {
        const isCurrent = status === current;
        return (
          <button
            key={status}
            type="button"
            role="menuitem"
            style={{
              ...optionStyle,
              ...(isCurrent ? { background: COLORS.surfaceMuted } : null),
            }}
            onMouseEnter={(e) => {
              if (!isCurrent) e.currentTarget.style.background = COLORS.surfaceMuted;
            }}
            onMouseLeave={(e) => {
              if (!isCurrent) e.currentTarget.style.background = 'transparent';
            }}
            onClick={() => onPick(status)}
          >
            <LeadStatusPill status={status} showDot showSublabel />
          </button>
        );
      })}
    </div>
  );
}
