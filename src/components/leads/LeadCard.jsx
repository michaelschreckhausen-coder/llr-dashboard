// src/components/leads/LeadCard.jsx
//
// Kanban-Card-Version eines Leads. Schlanker als LeadRow:
// - Vertikales Layout
// - Nur 1 Tag + Score + 1 Owner-Avatar
// - "Hot-Lead-Premium" Variante wenn next_action_at urgent ODER deal_value vorhanden
//
// Genau wie LeadRow: memo + statische Styles + Handler aus Parent.

import { memo, useCallback } from 'react';
import { Target, Calendar, Star } from 'lucide-react';
import { LeadAvatar } from './LeadAvatar';
import { COLORS, RADIUS } from '../../lib/leadStyleTokens';
import { getDisplayName, formatRelativeDate, isUrgent } from '../../lib/leadHelpers';
import { tagColor } from '../../lib/tagColors';

const cardStyle = {
  background: COLORS.surface,
  borderRadius: RADIUS.md,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  padding: 12,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const nameWrapStyle = { flex: 1, minWidth: 0 };

const nameStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.3,
};

const companyStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.3,
};

const tagsRowStyle = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};

const tagStyle = {
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
  fontSize: 10,
  padding: '2px 7px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};

const urgentPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#FAEEDA',
  color: '#854F0B',
  fontSize: 10,
  padding: '3px 8px',
  borderRadius: RADIUS.sm,
  alignSelf: 'flex-start',
};

const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const scoreStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontVariantNumeric: 'tabular-nums',
};

const scoreHotStyle = {
  ...scoreStyle,
  color: '#3B6D11',
  fontWeight: 500,
};

function LeadCardBase({ lead, owner, onClick, onToggleFavorite }) {
  const handleClick = useCallback(() => {
    onClick?.(lead.id, lead);
  }, [onClick, lead]);

  const name = getDisplayName(lead);
  const urgent = isUrgent(lead.next_followup);
  const isHot = lead.status === 'SQL' && lead.lead_score >= 80;

  // Tag-Auswahl: erst real tags, dann optional deal_value als Pseudo-Tag.
  const tagsToShow = [];
  if (lead.tags && lead.tags.length > 0) tagsToShow.push(lead.tags[0]);
  if (isHot && lead.deal_value) {
    tagsToShow.push(`${(lead.deal_value / 1000).toFixed(0)}k €`);
  }

  return (
    <div
      style={cardStyle}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div style={headerStyle}>
        <LeadAvatar
          firstName={lead.first_name}
          lastName={lead.last_name}
          name={name}
          size="sm"
        />
        <div style={nameWrapStyle}>
          <div style={nameStyle}>{name}</div>
          {lead.company && <div style={companyStyle}>{lead.company}</div>}
        </div>
        {onToggleFavorite && (
          <span
            role="button"
            tabIndex={0}
            title={lead.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(lead.id, !lead.is_favorite); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleFavorite(lead.id, !lead.is_favorite); } }}
            style={{ display: 'flex', flexShrink: 0, cursor: 'pointer' }}
          >
            <Star size={15} color={lead.is_favorite ? '#D97706' : '#CBD5E1'} fill={lead.is_favorite ? '#D97706' : 'none'} />
          </span>
        )}
      </div>

      {tagsToShow.length > 0 && (
        <div style={tagsRowStyle}>
          {tagsToShow.map((tag, i) => {
            const tc = tagColor(tag);
            return (
              <span key={`${tag}-${i}`} style={{ ...tagStyle, background: tc.bg, color: tc.fg }}>{tag}</span>
            );
          })}
        </div>
      )}

      {urgent && lead.next_followup && (
        <div style={urgentPillStyle}>
          <Calendar size={12} aria-hidden="true" />
          {formatRelativeDate(lead.next_followup)}
        </div>
      )}

      <div style={footerStyle}>
        <span style={isHot ? scoreHotStyle : scoreStyle}>
          <Target size={12} />
          {lead.lead_score ?? '—'}
        </span>
        <div style={{ display: 'flex' }}>
          {owner && (
            <LeadAvatar
              firstName={owner.first_name}
              lastName={owner.last_name}
              imageUrl={owner.avatar_url}
              size="xs"
              ring
            />
          )}
        </div>
      </div>
    </div>
  );
}

export const LeadCard = memo(LeadCardBase);
LeadCard.displayName = 'LeadCard';
