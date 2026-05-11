// src/pages/Leads.jsx
//
// Top-Level-Page für /leads.
// Drei Views: Liste / Board / Timeline.
//
// Diese Datei ist der dünnste Layer — Daten kommen via useLeads-Hook,
// Subcomponents übernehmen das Rendering, Page macht nur:
//   - View-State (list/board/timeline)
//   - Filter-State
//   - Navigation auf Detail-Page
//   - Optimistic Status-Update bei Drag-Drop im Board

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, LayoutGrid, GanttChart, Plus, Search, Bell, Filter, Tag, User, ArrowDownUp } from 'lucide-react';
import { LeadsList } from '../components/leads/LeadsList';
import { LeadsBoard } from '../components/leads/LeadsBoard';
import { COLORS, RADIUS } from '../lib/leadStyleTokens';
import { useLeads } from '../hooks/useLeads';

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  background: COLORS.surfaceCanvas,
};

const topBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '18px 28px',
  background: COLORS.surface,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
};

const titleStyle = {
  fontSize: 22,
  fontWeight: 500,
  margin: 0,
  color: COLORS.textPrimary,
};

const countPillStyle = {
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
  fontSize: 12,
  padding: '3px 10px',
  borderRadius: 999,
  fontVariantNumeric: 'tabular-nums',
};

const searchWrapStyle = { position: 'relative' };

const searchInputStyle = {
  width: 220,
  height: 34,
  paddingLeft: 32,
  paddingRight: 12,
  fontSize: 13,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  borderRadius: RADIUS.md,
  background: COLORS.surface,
  outline: 'none',
};

const searchIconStyle = {
  position: 'absolute',
  left: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  color: COLORS.textTertiary,
};

const iconBtnStyle = {
  width: 34,
  height: 34,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  background: COLORS.surface,
  borderRadius: RADIUS.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: COLORS.textSecondary,
  cursor: 'pointer',
};

const primaryBtnStyle = {
  height: 34,
  padding: '0 14px',
  background: COLORS.primary,
  color: COLORS.primaryFg,
  border: 'none',
  borderRadius: RADIUS.md,
  fontSize: 13,
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

const filtersBarStyle = {
  padding: '20px 28px 16px',
  background: COLORS.surface,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const toggleGroupStyle = {
  display: 'inline-flex',
  background: COLORS.surfaceMuted,
  borderRadius: 999,
  padding: 3,
};

const toggleBtnStyle = {
  height: 30,
  padding: '0 16px',
  fontSize: 13,
  background: 'transparent',
  border: 'none',
  color: COLORS.textSecondary,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  cursor: 'pointer',
};

const toggleBtnActiveStyle = {
  ...toggleBtnStyle,
  background: COLORS.surface,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  color: COLORS.textPrimary,
};

const filterChipStyle = {
  height: 30,
  padding: '0 12px',
  fontSize: 12,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  borderRadius: 999,
  background: COLORS.surface,
  color: COLORS.textSecondary,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

const contentStyle = {
  flex: 1,
  padding: '20px 28px 28px',
  overflow: 'auto',
};

const VIEWS = [
  { id: 'list', label: 'Liste', Icon: List },
  { id: 'board', label: 'Board', Icon: LayoutGrid },
  { id: 'timeline', label: 'Timeline', Icon: GanttChart },
];

export default function Leads() {
  const navigate = useNavigate();
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const { leads, isLoading, updateLeadStatus } = useLeads();

  // Filter — clientseitig für jetzt; server-side ab N > 500.
  const filteredLeads = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) => {
      const name = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase();
      const company = (l.company || '').toLowerCase();
      return name.includes(q) || company.includes(q);
    });
  }, [leads, search]);

  // Handler: stabil dank useCallback, sodass LeadRow.memo greift.
  const handleLeadClick = useCallback(
    (id) => navigate(`/leads/${id}`),
    [navigate]
  );

  const handleNewLead = useCallback(() => navigate('/leads/new'), [navigate]);

  const handleOwnerAdd = useCallback((leadId) => {
    // TODO: Open owner-picker popover
    // For now: noop — the UI shows the empty slot, parent decides what happens
    console.log('Owner-Picker für', leadId);
  }, []);

  const handleMenuClick = useCallback((leadId, anchorEl) => {
    // TODO: Open context menu
    console.log('Menu für', leadId, 'anchored at', anchorEl);
  }, []);

  const handleStatusChange = useCallback(
    (leadId, newStatus) => {
      // Optimistic update via hook
      updateLeadStatus(leadId, newStatus);
    },
    [updateLeadStatus]
  );

  return (
    <div style={pageStyle}>
      {/* Top Bar */}
      <div style={topBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1 style={titleStyle}>Leads</h1>
          <span style={countPillStyle}>{leads.length} Kontakte</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={searchWrapStyle}>
            <Search size={16} style={searchIconStyle} />
            <input
              type="text"
              style={searchInputStyle}
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" style={iconBtnStyle} aria-label="Benachrichtigungen">
            <Bell size={16} />
          </button>
          <button type="button" style={primaryBtnStyle} onClick={handleNewLead}>
            <Plus size={16} />
            Neuer Lead
          </button>
        </div>
      </div>

      {/* View toggle + Filters */}
      <div style={filtersBarStyle}>
        <div style={toggleGroupStyle}>
          {VIEWS.map((v) => {
            const Icon = v.Icon;
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                style={isActive ? toggleBtnActiveStyle : toggleBtnStyle}
                onClick={() => setView(v.id)}
              >
                <Icon size={15} />
                {v.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={filterChipStyle}>
            <Filter size={14} />
            Status: Alle
          </button>
          <button type="button" style={filterChipStyle}>
            <Tag size={14} />
            Tags
          </button>
          <button type="button" style={filterChipStyle}>
            <User size={14} />
            Owner
          </button>
          <button type="button" style={filterChipStyle}>
            <ArrowDownUp size={14} />
            Score
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {isLoading ? (
          <div style={{ color: COLORS.textTertiary, fontSize: 14 }}>Lade Leads…</div>
        ) : view === 'list' ? (
          <LeadsList
            leads={filteredLeads}
            onLeadClick={handleLeadClick}
            onOwnerAdd={handleOwnerAdd}
            onMenuClick={handleMenuClick}
          />
        ) : view === 'board' ? (
          <LeadsBoard
            leads={filteredLeads}
            onLeadClick={handleLeadClick}
            onLeadStatusChange={handleStatusChange}
          />
        ) : (
          <div style={{ color: COLORS.textTertiary, fontSize: 14 }}>
            Timeline-View kommt im nächsten Sprint.
          </div>
        )}
      </div>
    </div>
  );
}
