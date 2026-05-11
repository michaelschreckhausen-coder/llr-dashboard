// src/components/leads/LeadsBoard.jsx
//
// Kanban-Container: 5 Spalten (Lead/LQL/MQL/MQN/SQL), horizontal scroll.
//
// Drag-and-Drop ist als Scaffold drin (HTML5 native), aber bewusst minimal:
// onDragStart/onDragOver/onDrop. Wenn ihr später dnd-kit oder
// react-beautiful-dnd einbaut, ersetzt das hier — die Lead-Cards bleiben gleich.

import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { LeadCard } from './LeadCard';
import { COLORS, RADIUS, STATUS_ORDER, STATUS_CONFIG } from '../../lib/leadStyleTokens';

const boardScrollStyle = {
  display: 'flex',
  gap: 14,
  overflowX: 'auto',
  paddingBottom: 12,
};

const columnStyle = {
  width: 240,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
};

const columnHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 4px 12px',
};

const columnTitleStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const dotStyle = {
  width: 9,
  height: 9,
  borderRadius: '50%',
};

const titleStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.textPrimary,
};

const countStyle = {
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
  fontSize: 11,
  padding: '1px 7px',
  borderRadius: 999,
  fontVariantNumeric: 'tabular-nums',
};

const countHotStyle = {
  ...countStyle,
  background: '#EAF3DE',
  color: '#3B6D11',
  fontWeight: 500,
};

const addColBtnStyle = {
  border: 'none',
  background: 'transparent',
  color: COLORS.textTertiary,
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};

const columnBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  flex: 1,
  minHeight: 100,
};

const columnBodyDragOverStyle = {
  ...columnBodyStyle,
  background: 'rgba(83, 74, 183, 0.04)',
  borderRadius: RADIUS.md,
  outline: `1.5px dashed ${COLORS.primary}`,
  outlineOffset: -2,
};

const dropZoneStyle = {
  border: `1.5px dashed ${COLORS.borderSubtle}`,
  borderRadius: RADIUS.md,
  padding: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: 12,
  color: COLORS.textTertiary,
  cursor: 'pointer',
  background: 'transparent',
  width: '100%',
};

export function LeadsBoard({ leads, profilesById, onLeadClick, onLeadStatusChange }) {
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const handleClick = useCallback(
    (id, lead) => onLeadClick?.(id, lead),
    [onLeadClick]
  );

  // Gruppierung memoizen
  const groups = useMemo(() => {
    const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]));
    for (const lead of leads) {
      const key = STATUS_ORDER.includes(lead.status) ? lead.status : 'Lead';
      map[key].push(lead);
    }
    return map;
  }, [leads]);

  const handleDragStart = useCallback((e, leadId) => {
    e.dataTransfer.setData('text/lead-id', leadId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  const handleDrop = useCallback(
    (e, status) => {
      e.preventDefault();
      const leadId = e.dataTransfer.getData('text/lead-id');
      setDragOverStatus(null);
      if (leadId && onLeadStatusChange) {
        onLeadStatusChange(leadId, status);
      }
    },
    [onLeadStatusChange]
  );

  return (
    <div style={boardScrollStyle}>
      {STATUS_ORDER.map((status) => {
        const cfg = STATUS_CONFIG[status];
        const items = groups[status];
        const isDragOver = dragOverStatus === status;
        const isSqlWithHits = status === 'SQL' && items.length > 0;

        return (
          <div key={status} style={columnStyle}>
            <div style={columnHeaderStyle}>
              <div style={columnTitleStyle}>
                <span style={{ ...dotStyle, background: cfg.dot }} />
                <span style={titleStyle}>{cfg.label}</span>
                <span style={isSqlWithHits ? countHotStyle : countStyle}>
                  {items.length}
                </span>
              </div>
              <button type="button" style={addColBtnStyle} aria-label="Lead in dieser Spalte erstellen">
                <Plus size={16} />
              </button>
            </div>

            <div
              style={isDragOver ? columnBodyDragOverStyle : columnBodyStyle}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {items.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                >
                  <LeadCard
                    lead={lead}
                    owner={profilesById?.get(lead.owner_id) ?? null}
                    onClick={handleClick}
                  />
                </div>
              ))}

              <button type="button" style={dropZoneStyle}>
                <Plus size={14} />
                Lead hinzufügen
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
