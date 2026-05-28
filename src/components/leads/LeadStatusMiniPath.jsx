// src/components/leads/LeadStatusMiniPath.jsx
//
// Sprint C · Kompakte read-only Variante des Path-Steppers für die Liste.
//
// 5 mini-Bars die die Status-Progression visualisieren — done/current/future.
// Read-only by design: Edit-Pfad bleibt auf der Detail-Page (Click auf Row
// öffnet eh die Detail-Seite, oder Status-Pill-Picker im Compact-Mode).
//
// Compact-Mode bekommt KEINEN Mini-Path (Single-Row-Layout zu eng, Status-Pill
// reicht). Comfortable-Mode bekommt den Mini-Path neben/statt der Status-Pill.
//
// Props:
//   status — eine der STATUS_ORDER-Konstanten
//   size — 'sm' (default) | 'md' für leicht größere Bars

import { STATUS_ORDER, STATUS_CONFIG } from '../../lib/leadStyleTokens';

const SIZES = {
  sm: { barW: 14, barH: 4, gap: 2 },
  md: { barW: 18, barH: 5, gap: 3 },
};

const COLOR_DONE   = '#9CA3AF';   // grau (done — vergangener Step)
const COLOR_FUTURE = '#E4E7EC';   // hellgrau (future — kommt noch)

export function LeadStatusMiniPath({ status, size = 'sm' }) {
  const dims = SIZES[size] || SIZES.sm;
  const currentIdx = STATUS_ORDER.indexOf(status);
  const cfg = STATUS_CONFIG[status];

  const wrapStyle = {
    display: 'inline-flex',
    gap: dims.gap,
    alignItems: 'center',
    flexShrink: 0,
  };
  const barStyle = {
    width: dims.barW,
    height: dims.barH,
    borderRadius: dims.barH / 2,
  };

  return (
    <div
      style={wrapStyle}
      title={cfg ? `${cfg.label} · ${cfg.sublabel}` : status}
      aria-label={`Stage: ${cfg?.label || status}`}
    >
      {STATUS_ORDER.map((s, idx) => {
        const sCfg = STATUS_CONFIG[s];
        let bg;
        if (idx < currentIdx)        bg = COLOR_DONE;
        else if (idx === currentIdx) bg = sCfg?.dot || COLOR_DONE;
        else                         bg = COLOR_FUTURE;
        return <span key={s} style={{ ...barStyle, background: bg }} aria-hidden="true" />;
      })}
    </div>
  );
}
