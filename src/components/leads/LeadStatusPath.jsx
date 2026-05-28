// src/components/leads/LeadStatusPath.jsx
//
// Sprint C · Salesforce-Style Pipeline-Stepper für die LeadDetail-Page.
//
// Render-Reihenfolge (Hero → Path → Tabs) folgt dem Salesforce-Pattern:
//   - Highlights-Panel (Avatar + Name + Quick-Actions) — oben
//   - Path-Component (Lead → LQL → MQL → MQN → SQL als Chevrons) — hier
//   - Tab-Bar (Übersicht / Aktivitäten / Notizen / ...) — darunter
//
// UX-Modell:
//   - 3 visuelle States pro Step: done (links vom aktuellen), current (aktueller),
//     future (rechts). Done hat Check-Icon, Current ist vollfarbig im Status-Color,
//     Future ist ausgegraut.
//   - Click auf einen anderen Step → Confirm-Bar erscheint unter dem Path,
//     mit Stage-Label + Sublabel und Bestätigen/Abbrechen-Buttons.
//   - Click auf Current = no-op (kein Confirm-Bar).
//   - Forward UND Backward sind erlaubt — Backward weil Re-Qualifikation
//     legitim ist (z.B. SQL → MQL bei Cold-Phase), Forward weil sequentielle
//     Skip-Restriktionen ohne Business-Rule unrealistisch sind.
//   - Tooltip via title-attr zeigt Label + Sublabel.
//
// Props:
//   currentStatus — eine der STATUS_ORDER-Konstanten
//   onChange(newStatus) — async, Caller propagiert auf DB
//   disabled — read-only-Mode (für Permissions o.ä.)

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { STATUS_ORDER, STATUS_CONFIG, COLORS } from '../../lib/leadStyleTokens';

const PRIMARY = 'rgb(49,90,231)';

// ─── Chevron-Geometrie via clip-path ─────────────────────────────────────
// Steps 2..5 haben den Einschnitt links (Pfeil zeigt rein), Step 1 ist
// flach-links abgeschnitten.
const baseChevron = {
  flex: 1,
  minWidth: 0,
  padding: '11px 22px 11px 28px',
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'center',
  position: 'relative',
  clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)',
  cursor: 'pointer',
  transition: 'background 0.2s, color 0.2s, transform 0.1s',
  userSelect: 'none',
  font: 'inherit',
  border: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
};
const firstChevron = {
  ...baseChevron,
  padding: '11px 22px 11px 18px',
  clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)',
};
const lastChevron = {
  ...baseChevron,
  padding: '11px 18px 11px 28px',
  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)',
};

const wrapStyle = {
  display: 'flex',
  gap: 2,
  padding: '14px 28px 4px',
  background: COLORS.surface,
};

const confirmBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 28px 14px',
  background: COLORS.surface,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  fontSize: 12,
  color: COLORS.textSecondary,
};

const confirmBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  background: PRIMARY,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  font: 'inherit',
};

const cancelBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  background: '#fff',
  color: COLORS.textSecondary,
  border: '1px solid #E4E7EC',
  borderRadius: 6,
  cursor: 'pointer',
  font: 'inherit',
};

export function LeadStatusPath({ currentStatus, onChange, disabled = false }) {
  const [pendingStatus, setPendingStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  const handleStepClick = (status) => {
    if (disabled || busy) return;
    if (status === currentStatus) return;
    setPendingStatus(status);
  };

  const handleConfirm = async () => {
    if (!pendingStatus || !onChange || busy) return;
    setBusy(true);
    try {
      await onChange(pendingStatus);
      setPendingStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (busy) return;
    setPendingStatus(null);
  };

  return (
    <>
      <div style={wrapStyle} role="navigation" aria-label="Status-Pipeline">
        {STATUS_ORDER.map((status, idx) => {
          const cfg = STATUS_CONFIG[status];
          const isFirst = idx === 0;
          const isLast = idx === STATUS_ORDER.length - 1;

          let state;
          if (idx < currentIdx) state = 'done';
          else if (idx === currentIdx) state = 'current';
          else state = 'future';

          const isPending = pendingStatus === status;

          // Visual-State-Farben
          let bg, fg;
          if (state === 'done')         { bg = '#D1FAE5'; fg = '#065F46'; }
          else if (state === 'current') { bg = cfg.dot;   fg = '#ffffff'; }
          else                          { bg = '#F3F4F6'; fg = '#9CA3AF'; }

          // Pending-Override (User hat Click gemacht, wartet auf Confirm)
          if (isPending) { bg = cfg.pillBg; fg = cfg.pillFg; }

          const baseStyle = isFirst ? firstChevron : (isLast ? lastChevron : baseChevron);

          return (
            <button
              key={status}
              type="button"
              style={{
                ...baseStyle,
                background: bg,
                color: fg,
                boxShadow: isPending ? `inset 0 0 0 2px ${PRIMARY}` : 'none',
                opacity: disabled ? 0.6 : 1,
              }}
              onClick={() => handleStepClick(status)}
              title={`${cfg.label} · ${cfg.sublabel}`}
              disabled={disabled || status === currentStatus}
              aria-pressed={state === 'current'}
              aria-label={`Stage ${cfg.label}, ${cfg.sublabel}${state === 'current' ? ' (aktuell)' : ''}`}
            >
              {state === 'done' && <Check size={12} aria-hidden="true" />}
              {cfg.label}
            </button>
          );
        })}
      </div>

      {pendingStatus && (
        <div style={confirmBarStyle}>
          <span>
            Stage auf <strong style={{ color: COLORS.textPrimary }}>{STATUS_CONFIG[pendingStatus]?.label}</strong>
            {' '}({STATUS_CONFIG[pendingStatus]?.sublabel}) setzen?
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button type="button" style={cancelBtnStyle} onClick={handleCancel} disabled={busy}>
              <X size={13} /> Abbrechen
            </button>
            <button type="button" style={confirmBtnStyle} onClick={handleConfirm} disabled={busy}>
              <Check size={13} /> {busy ? 'Speichere…' : 'Bestätigen'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
