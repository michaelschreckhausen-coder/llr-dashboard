// src/components/leads/LeadRow.jsx
//
// PERFORMANCE-CRITICAL.
//
// Diese Component wird N-mal pro Render gemounted (N = sichtbare Leads).
// Daher:
//  - memo() mit Default-Shallow-Compare
//  - Alle statischen Styles als Module-Konstanten (eine Referenz, nicht eine pro Row)
//  - Handler bekommen lead.id als Argument, nicht curried im Parent
//  - react-window kompatibel via ROW_HEIGHT (siehe leadStyleTokens.js)
//
// Wichtig für Parent:
//   const handleClick = useCallback((id) => navigate(`/leads/${id}`), [navigate]);
//   <LeadRow lead={lead} onClick={handleClick} ... />
//
// Niemals: <LeadRow onClick={() => navigate(`/leads/${lead.id}`)} />
// — das wäre eine neue Funktion pro Render und killt die memo-Optimierung.

import { memo, useCallback } from 'react';
import { MoreVertical, Plus, Clock, Target } from 'lucide-react';
import { LeadAvatar } from './LeadAvatar';
import { LeadStatusPill } from './LeadStatusPill';
import { COLORS, RADIUS, ROW_HEIGHT, ROW_HEIGHTS } from '../../lib/leadStyleTokens';
import {
  getDisplayName,
  getSubtitle,
  formatRelativeDate,
  isUrgent,
} from '../../lib/leadHelpers';

// ─── Static styles ───────────────────────────────────────────────────────
// Diese werden EINMAL gebaut und für alle Rows wiederverwendet.
// Zwei Varianten — comfortable (Default, 68px) und compact (44px).
// Beide Style-Objekte sind Module-Konstanten → memo-freundlich.

const rowStyleBase = {
  display: 'flex',
  alignItems: 'center',
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  background: COLORS.surface,
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const rowStyleComfortable = {
  ...rowStyleBase,
  gap: 12,
  padding: '14px 16px',
  height: ROW_HEIGHTS.comfortable,
};

const rowStyleCompact = {
  ...rowStyleBase,
  gap: 10,
  padding: '8px 14px',
  height: ROW_HEIGHTS.compact,
};

// Backward-Compat-Re-Export für externe Konsumenten die den alten Style importieren.
const rowStyle = rowStyleComfortable;

const contentStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const nameRowStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  minWidth: 0,
};

const nameStyle = {
  fontSize: 14,
  fontWeight: 500,
  color: COLORS.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const subtitleStyle = {
  fontSize: 12,
  color: COLORS.textTertiary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 1,
};

const metaRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const tagStyle = {
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};

const rightStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexShrink: 0,
};

const scoreWrapStyle = { textAlign: 'right' };
const scoreLabelStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  lineHeight: 1,
  marginBottom: 4,
};
const scoreValueStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.textPrimary,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
};
const scoreValueDimStyle = { ...scoreValueStyle, color: COLORS.textTertiary };

const datePillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  padding: '3px 10px',
  borderRadius: 999,
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
};

const datePillUrgentStyle = {
  ...datePillStyle,
  background: '#FAEEDA',
  color: '#854F0B',
};

const ownerStackStyle = { display: 'flex' };

const ownerEmptyStyle = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  border: `1.5px dashed ${COLORS.borderHover}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: COLORS.textTertiary,
  background: 'transparent',
  cursor: 'pointer',
};

const menuBtnStyle = {
  width: 28,
  height: 28,
  border: 'none',
  background: 'transparent',
  borderRadius: RADIUS.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: COLORS.textTertiary,
  cursor: 'pointer',
};

// ─── Component ───────────────────────────────────────────────────────────

function LeadRowBase({
  lead,
  owner,
  onClick,
  onOwnerAdd,
  onMenuClick,
  showStatusPill = true,
  density = 'comfortable',
}) {
  const isCompact = density === 'compact';
  const activeRowStyle = isCompact ? rowStyleCompact : rowStyleComfortable;
  // Diese useCallbacks sind hier NICHT für Performance (DOM-Handler werden
  // ohnehin neu zugewiesen) — sie halten nur den JSX kompakt.
  const handleRowClick = useCallback(() => {
    onClick?.(lead.id, lead);
  }, [onClick, lead]);

  const handleOwnerAdd = useCallback(
    (e) => {
      e.stopPropagation();
      onOwnerAdd?.(lead.id);
    },
    [onOwnerAdd, lead.id]
  );

  const handleMenu = useCallback(
    (e) => {
      e.stopPropagation();
      onMenuClick?.(lead.id, e.currentTarget);
    },
    [onMenuClick, lead.id]
  );

  const name = getDisplayName(lead);
  const subtitle = getSubtitle(lead);
  const tags = lead.tags || [];
  const urgent = isUrgent(lead.next_followup);

  return (
    <div
      style={activeRowStyle}
      onClick={handleRowClick}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
    >
      <LeadAvatar
        firstName={lead.first_name}
        lastName={lead.last_name}
        name={name}
        size={isCompact ? 'sm' : 'md'}
      />

      {isCompact ? (
        // Compact: alles in einer Zeile, kein zweizeiliges Meta-Block
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...nameStyle, flexShrink: 0 }}>{name}</span>
          {subtitle && <span style={{ ...subtitleStyle, flex: 1 }}>· {subtitle}</span>}
          {showStatusPill && <LeadStatusPill status={lead.status} />}
          {tags.length > 0 && (
            <span style={tagStyle}>{tags.length === 1 ? tags[0] : `${tags.length} Tags`}</span>
          )}
        </div>
      ) : (
        <div style={contentStyle}>
          <div style={nameRowStyle}>
            <span style={nameStyle}>{name}</span>
            {subtitle && <span style={subtitleStyle}>· {subtitle}</span>}
          </div>

          <div style={metaRowStyle}>
            {showStatusPill && <LeadStatusPill status={lead.status} />}
            {tags.slice(0, 2).map((tag) => (
              <span key={tag} style={tagStyle}>
                {tag}
              </span>
            ))}
            {tags.length > 2 && (
              <span style={tagStyle}>+{tags.length - 2}</span>
            )}
          </div>
        </div>
      )}

      <div style={rightStyle}>
        {!isCompact && (
          <div style={scoreWrapStyle}>
            <div style={scoreLabelStyle}>
              <Target size={11} style={{ verticalAlign: -1, marginRight: 2 }} />
              Score
            </div>
            <div style={lead.lead_score >= 50 ? scoreValueStyle : scoreValueDimStyle}>
              {lead.lead_score ?? '—'}
            </div>
          </div>
        )}
        {isCompact && (
          <span style={{ ...scoreValueStyle, color: lead.lead_score >= 50 ? COLORS.textPrimary : COLORS.textTertiary, minWidth: 24, textAlign: 'right' }}>
            {lead.lead_score ?? '—'}
          </span>
        )}

        <span style={urgent ? datePillUrgentStyle : datePillStyle}>
          <Clock size={12} aria-hidden="true" />
          {formatRelativeDate(lead.next_followup)}
        </span>

        <div style={ownerStackStyle}>
          {!owner ? (
            <button
              type="button"
              style={ownerEmptyStyle}
              onClick={handleOwnerAdd}
              aria-label="Owner hinzufügen"
            >
              <Plus size={12} />
            </button>
          ) : (
            <LeadAvatar
              firstName={owner.first_name}
              lastName={owner.last_name}
              imageUrl={owner.avatar_url}
              size="sm"
              ring
            />
          )}
        </div>

        <button
          type="button"
          style={menuBtnStyle}
          onClick={handleMenu}
          aria-label="Aktionen"
        >
          <MoreVertical size={16} />
        </button>
      </div>
    </div>
  );
}

// Default-Shallow-Compare reicht: lead-Objekt-Identität ändert sich
// nur wenn der Parent ein neues bekommt (Supabase-Update, Optimistic Edit).
export const LeadRow = memo(LeadRowBase);
LeadRow.displayName = 'LeadRow';
