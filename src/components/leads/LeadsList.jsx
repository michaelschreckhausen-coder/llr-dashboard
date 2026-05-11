// src/components/leads/LeadsList.jsx
//
// Container für die Listen-Ansicht.
//
// Zwei Modi:
//   - "grouped": Leads nach Status gruppiert, Karten pro Gruppe (default)
//   - "flat":    eine flache Liste mit react-window FixedSizeList,
//                wird automatisch aktiviert ab 100+ Leads
//
// Virtualization-Hinweis:
//   ROW_HEIGHT = 68px (siehe leadStyleTokens.js).
//   Wenn du das Row-Layout änderst, ROW_HEIGHT mitziehen.

import { useCallback, useMemo } from 'react';
import { FixedSizeList } from 'react-window';
import { ChevronDown } from 'lucide-react';
import { LeadRow } from './LeadRow';
import { COLORS, RADIUS, STATUS_ORDER, STATUS_CONFIG, ROW_HEIGHT } from '../../lib/leadStyleTokens';

const VIRTUALIZE_THRESHOLD = 100;

const groupHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
};

const groupDotStyle = {
  width: 9,
  height: 9,
  borderRadius: '50%',
  flexShrink: 0,
};

const groupLabelStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.textPrimary,
};

const groupSublabelStyle = {
  fontSize: 13,
  color: COLORS.textTertiary,
  fontWeight: 400,
};

const groupCountStyle = {
  fontSize: 12,
  color: COLORS.textTertiary,
  fontVariantNumeric: 'tabular-nums',
};

const groupCardStyle = {
  background: COLORS.surface,
  borderRadius: RADIUS.lg,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  overflow: 'hidden',
};

const groupWrapStyle = { marginBottom: 24 };

// Row-Renderer für react-window. data = { leads, profilesById, handlers }.
// Wichtig: keine inline-Funktionen hier, sonst sinnlos memo-isiert.
function VirtualRow({ index, style, data }) {
  const lead = data.leads[index];
  const owner = data.profilesById?.get(lead.owner_id) ?? null;
  return (
    <div style={style}>
      <LeadRow
        lead={lead}
        owner={owner}
        onClick={data.onClick}
        onOwnerAdd={data.onOwnerAdd}
        onMenuClick={data.onMenuClick}
      />
    </div>
  );
}

export function LeadsList({
  leads,
  profilesById,
  onLeadClick,
  onOwnerAdd,
  onMenuClick,
  grouped = true,
  height = 600,
}) {
  // useCallback für die drei Handler — stabile Referenzen → LeadRow memo greift.
  const handleClick = useCallback(
    (id, lead) => onLeadClick?.(id, lead),
    [onLeadClick]
  );
  const handleOwnerAdd = useCallback((id) => onOwnerAdd?.(id), [onOwnerAdd]);
  const handleMenu = useCallback(
    (id, anchor) => onMenuClick?.(id, anchor),
    [onMenuClick]
  );

  // Gruppierung memoizen — re-compute nur wenn sich leads ändert.
  const grouped_map = useMemo(() => {
    if (!grouped) return null;
    const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]));
    for (const lead of leads) {
      const key = STATUS_ORDER.includes(lead.status) ? lead.status : 'Lead';
      map[key].push(lead);
    }
    return map;
  }, [leads, grouped]);

  // Flacher virtualisierter Mode (große Listen)
  if (!grouped || leads.length >= VIRTUALIZE_THRESHOLD) {
    const itemData = { leads, profilesById, onClick: handleClick, onOwnerAdd: handleOwnerAdd, onMenuClick: handleMenu };
    return (
      <div style={{ ...groupCardStyle, height }}>
        <FixedSizeList
          height={height}
          width="100%"
          itemCount={leads.length}
          itemSize={ROW_HEIGHT}
          itemData={itemData}
          itemKey={(index, data) => data.leads[index].id}
        >
          {VirtualRow}
        </FixedSizeList>
      </div>
    );
  }

  // Gruppierter Mode — von SQL absteigend zu Lead (urgent-first)
  return (
    <div>
      {[...STATUS_ORDER].reverse().map((status) => {
        const items = grouped_map[status];
        if (!items || items.length === 0) return null;
        const cfg = STATUS_CONFIG[status];

        return (
          <div key={status} style={groupWrapStyle}>
            <div style={groupHeaderStyle}>
              <span style={{ ...groupDotStyle, background: cfg.dot }} />
              <span style={groupLabelStyle}>
                {cfg.label}
                <span style={groupSublabelStyle}> · {cfg.sublabel}</span>
              </span>
              <span style={groupCountStyle}>{items.length}</span>
              <ChevronDown
                size={14}
                color={COLORS.textTertiary}
                style={{ marginLeft: 'auto' }}
              />
            </div>

            <div style={groupCardStyle}>
              {items.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  owner={profilesById?.get(lead.owner_id) ?? null}
                  onClick={handleClick}
                  onOwnerAdd={handleOwnerAdd}
                  onMenuClick={handleMenu}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
