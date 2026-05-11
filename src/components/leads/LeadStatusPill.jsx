// src/components/leads/LeadStatusPill.jsx
import { memo, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { STATUS_CONFIG } from '../../lib/leadStyleTokens';

const baseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  padding: '3px 10px',
  borderRadius: 999,
  fontWeight: 500,
  cursor: 'default',
  border: 'none',
  whiteSpace: 'nowrap',
};

const interactiveStyle = {
  ...baseStyle,
  cursor: 'pointer',
};

const dotStyle = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
};

function LeadStatusPillBase({
  status,
  showDot = false,
  showSublabel = false,
  onClick,
}) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Lead;

  const style = useMemo(
    () => ({
      ...(onClick ? interactiveStyle : baseStyle),
      background: cfg.pillBg,
      color: cfg.pillFg,
    }),
    [cfg, onClick]
  );

  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      disabled={!onClick}
    >
      {showDot && (
        <span style={{ ...dotStyle, background: cfg.dot }} aria-hidden="true" />
      )}
      <span>
        {cfg.label}
        {showSublabel && (
          <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 400 }}>
            · {cfg.sublabel}
          </span>
        )}
      </span>
      {onClick && <ChevronDown size={14} aria-hidden="true" />}
    </button>
  );
}

export const LeadStatusPill = memo(LeadStatusPillBase);
LeadStatusPill.displayName = 'LeadStatusPill';
