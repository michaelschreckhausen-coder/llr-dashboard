// src/pages/Leads.jsx
//
// PATCH zum Drop-In-Bundle `~/Downloads/leadesk-leads/`.
// Ergänzt die im Original fehlenden Handler:
//   - Status / Tags / Owner / Score Popover-Filter (statt onClick-less Stub-Buttons)
//   - 3-Punkt-Menü pro Row (statt console.log-TODO)
//   - "+ Neuer Lead" als Modal (statt navigate auf nicht-existente /leads/new Route)
//   - Counter zeigt filteredLeads.length statt leads.length
//
// Drop-In ersetzbar gegen die alte Leads.jsx — keine neuen Imports außer
// inline Subcomponents (FilterPopover, ActionsMenu, NewLeadModal).

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  List, LayoutGrid, GanttChart, Plus, Search, Bell, Filter, Tag, User,
  ArrowDownUp, X, MoreVertical, Check,
} from 'lucide-react';
import { LeadsList } from '../components/leads/LeadsList';
import { LeadsBoard } from '../components/leads/LeadsBoard';
import { COLORS, RADIUS, STATUS_ORDER, STATUS_CONFIG } from '../lib/leadStyleTokens';
import { useLeads } from '../hooks/useLeads';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

// ─── Styles (aus dem Original übernommen) ────────────────────────────────
const pageStyle = { display:'flex', flexDirection:'column', minHeight:'100vh', background: COLORS.surfaceCanvas };
const topBarStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 28px', background: COLORS.surface, borderBottom:`0.5px solid ${COLORS.borderSubtle}` };
const titleStyle = { fontSize:22, fontWeight:500, margin:0, color: COLORS.textPrimary };
const countPillStyle = { background: COLORS.surfaceMuted, color: COLORS.textSecondary, fontSize:12, padding:'3px 10px', borderRadius:999, fontVariantNumeric:'tabular-nums' };
const searchWrapStyle = { position:'relative' };
const searchInputStyle = { width:220, height:34, paddingLeft:32, paddingRight:12, fontSize:13, border:`0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md, background: COLORS.surface, outline:'none' };
const searchIconStyle = { position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color: COLORS.textTertiary };
const iconBtnStyle = { width:34, height:34, border:`0.5px solid ${COLORS.borderSubtle}`, background: COLORS.surface, borderRadius: RADIUS.md, display:'flex', alignItems:'center', justifyContent:'center', color: COLORS.textSecondary, cursor:'pointer' };
const primaryBtnStyle = { height:34, padding:'0 14px', background: COLORS.primary, color: COLORS.primaryFg, border:'none', borderRadius: RADIUS.md, fontSize:13, fontWeight:500, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const filtersBarStyle = { padding:'20px 28px 16px', background: COLORS.surface, borderBottom:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', alignItems:'center', justifyContent:'space-between' };
const toggleGroupStyle = { display:'inline-flex', background: COLORS.surfaceMuted, borderRadius:999, padding:3 };
const toggleBtnStyle = { height:30, padding:'0 16px', fontSize:13, background:'transparent', border:'none', color: COLORS.textSecondary, display:'flex', alignItems:'center', gap:6, borderRadius:999, cursor:'pointer' };
const toggleBtnActiveStyle = { ...toggleBtnStyle, background: COLORS.surface, border:`0.5px solid ${COLORS.borderSubtle}`, color: COLORS.textPrimary };
const filterChipStyle = { height:30, padding:'0 12px', fontSize:12, border:`0.5px solid ${COLORS.borderSubtle}`, borderRadius:999, background: COLORS.surface, color: COLORS.textSecondary, display:'flex', alignItems:'center', gap:6, cursor:'pointer' };
const filterChipActiveStyle = { ...filterChipStyle, background: COLORS.primarySoft, color: COLORS.primarySoftFg, borderColor:'transparent' };
const contentStyle = { flex:1, padding:'20px 28px 28px', overflow:'auto' };

const VIEWS = [
  { id:'list',     label:'Liste',    Icon: List },
  { id:'board',    label:'Board',    Icon: LayoutGrid },
  { id:'timeline', label:'Timeline', Icon: GanttChart },
];

const SCORE_OPTIONS = [
  { id:'updated_desc', label:'Zuletzt geändert' },
  { id:'score_desc',   label:'Score (hoch → niedrig)' },
  { id:'score_asc',    label:'Score (niedrig → hoch)' },
  { id:'name_asc',     label:'Name (A → Z)' },
];

export default function Leads() {
  const navigate = useNavigate();
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const { leads, isLoading, updateLeadStatus, refetch } = useLeads();

  // ─── Filter-State ────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState(null);  // null | 'Lead' | 'LQL' | ...
  const [tagsFilter,   setTagsFilter]   = useState([]);    // string[]
  const [ownerFilter,  setOwnerFilter]  = useState(null);  // null | userId
  const [sortBy,       setSortBy]       = useState('updated_desc');

  // ─── Modal-State ─────────────────────────────────────────────────────
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [actionsMenu, setActionsMenu] = useState(null); // { leadId, anchorRect } | null

  // ─── Derived: alle Tags + alle Owner (für Dropdown-Options) ──────────
  const allTags = useMemo(() => {
    const s = new Set();
    leads.forEach(l => (l.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [leads]);

  const allOwners = useMemo(() => {
    const m = new Map();
    leads.forEach(l => (l.owners || []).forEach(o => {
      if (o.id && !m.has(o.id)) m.set(o.id, o);
    }));
    return Array.from(m.values());
  }, [leads]);

  // ─── Filter + Sort ───────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    let res = leads;

    if (search) {
      const q = search.toLowerCase();
      res = res.filter(l => {
        const name = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase();
        const company = (l.company || '').toLowerCase();
        return name.includes(q) || company.includes(q);
      });
    }

    if (statusFilter) {
      res = res.filter(l => l.status === statusFilter);
    }

    if (tagsFilter.length > 0) {
      res = res.filter(l => (l.tags || []).some(t => tagsFilter.includes(t)));
    }

    if (ownerFilter) {
      res = res.filter(l => (l.owners || []).some(o => o.id === ownerFilter));
    }

    if (sortBy === 'score_desc')   res = [...res].sort((a, b) => (b.score || 0) - (a.score || 0));
    if (sortBy === 'score_asc')    res = [...res].sort((a, b) => (a.score || 0) - (b.score || 0));
    if (sortBy === 'name_asc')     res = [...res].sort((a, b) =>
      `${a.first_name || ''} ${a.last_name || ''}`.localeCompare(`${b.first_name || ''} ${b.last_name || ''}`));
    // 'updated_desc' ist Server-Default — kein Re-Sort nötig

    return res;
  }, [leads, search, statusFilter, tagsFilter, ownerFilter, sortBy]);

  // ─── Handlers (stabil via useCallback) ───────────────────────────────
  const handleLeadClick = useCallback(id => navigate(`/leads/${id}`), [navigate]);

  const handleOwnerAdd = useCallback(leadId => {
    // TODO eigenes Owner-Picker-Popover — vorerst Lead-Detail-Page
    navigate(`/leads/${leadId}#owner`);
  }, [navigate]);

  const handleMenuClick = useCallback((leadId, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.();
    setActionsMenu({ leadId, anchorRect: rect });
  }, []);

  const handleStatusChange = useCallback((leadId, newStatus) => {
    updateLeadStatus(leadId, newStatus);
  }, [updateLeadStatus]);

  const activeStatusLabel = statusFilter
    ? `Status: ${STATUS_CONFIG[statusFilter]?.label || statusFilter}`
    : 'Status: Alle';

  const activeTagsLabel = tagsFilter.length === 0
    ? 'Tags'
    : tagsFilter.length === 1 ? `Tag: ${tagsFilter[0]}` : `Tags · ${tagsFilter.length}`;

  const activeOwnerLabel = (() => {
    if (!ownerFilter) return 'Owner';
    const o = allOwners.find(x => x.id === ownerFilter);
    return o ? `Owner: ${o.first_name || ''} ${o.last_name || ''}`.trim() : 'Owner';
  })();

  const activeSortLabel = (SCORE_OPTIONS.find(s => s.id === sortBy) || SCORE_OPTIONS[0]).label;

  return (
    <div style={pageStyle}>
      {/* Top Bar */}
      <div style={topBarStyle}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <h1 style={titleStyle}>Leads</h1>
          {/* FIX: filteredLeads.length statt leads.length */}
          <span style={countPillStyle}>{filteredLeads.length} Kontakte</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
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
          <button type="button" style={primaryBtnStyle} onClick={() => setNewLeadOpen(true)}>
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

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <FilterPopover
            label={activeStatusLabel}
            icon={<Filter size={14} />}
            isActive={!!statusFilter}
            onClear={statusFilter ? () => setStatusFilter(null) : undefined}
            renderContent={(close) => (
              <PopoverMenu
                options={[
                  { id:null, label:'Alle' },
                  ...STATUS_ORDER.map(s => ({ id:s, label:`${s} · ${STATUS_CONFIG[s]?.sublabel || ''}` })),
                ]}
                selectedId={statusFilter}
                onSelect={(id) => { setStatusFilter(id); close(); }}
              />
            )}
          />

          <FilterPopover
            label={activeTagsLabel}
            icon={<Tag size={14} />}
            isActive={tagsFilter.length > 0}
            onClear={tagsFilter.length > 0 ? () => setTagsFilter([]) : undefined}
            renderContent={() => (
              <PopoverMenu
                multi
                options={allTags.length === 0
                  ? [{ id:'__empty', label:'Keine Tags vorhanden', disabled:true }]
                  : allTags.map(t => ({ id:t, label:t }))}
                selectedIds={tagsFilter}
                onToggle={(id) => setTagsFilter(prev =>
                  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              />
            )}
          />

          <FilterPopover
            label={activeOwnerLabel}
            icon={<User size={14} />}
            isActive={!!ownerFilter}
            onClear={ownerFilter ? () => setOwnerFilter(null) : undefined}
            renderContent={(close) => (
              <PopoverMenu
                options={[
                  { id:null, label:'Alle' },
                  ...allOwners.map(o => ({
                    id:o.id,
                    label:`${o.first_name || ''} ${o.last_name || ''}`.trim() || '—',
                  })),
                ]}
                selectedId={ownerFilter}
                onSelect={(id) => { setOwnerFilter(id); close(); }}
              />
            )}
          />

          <FilterPopover
            label={activeSortLabel}
            icon={<ArrowDownUp size={14} />}
            isActive={sortBy !== 'updated_desc'}
            onClear={sortBy !== 'updated_desc' ? () => setSortBy('updated_desc') : undefined}
            renderContent={(close) => (
              <PopoverMenu
                options={SCORE_OPTIONS}
                selectedId={sortBy}
                onSelect={(id) => { setSortBy(id); close(); }}
              />
            )}
          />
        </div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {isLoading ? (
          <div style={{ color: COLORS.textTertiary, fontSize:14 }}>Lade Leads…</div>
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
          <div style={{ color: COLORS.textTertiary, fontSize:14 }}>
            Timeline-View kommt im nächsten Sprint.
          </div>
        )}
      </div>

      {/* Modals / Overlays */}
      {newLeadOpen && (
        <NewLeadModalWithTeam
          onClose={() => setNewLeadOpen(false)}
          onSaved={() => { setNewLeadOpen(false); refetch?.(); }}
        />
      )}

      {actionsMenu && (
        <ActionsMenu
          leadId={actionsMenu.leadId}
          anchorRect={actionsMenu.anchorRect}
          lead={leads.find(l => l.id === actionsMenu.leadId)}
          onClose={() => setActionsMenu(null)}
          onStatusChange={handleStatusChange}
          onOpenDetail={(id) => { setActionsMenu(null); handleLeadClick(id); }}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}

// ─── FilterPopover ───────────────────────────────────────────────────────
function FilterPopover({ label, icon, isActive, onClear, renderContent }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const rect = triggerRef.current?.getBoundingClientRect();
  const popoverStyle = {
    position:'fixed',
    top: rect ? rect.bottom + 6 : 0,
    left: rect ? Math.max(8, rect.right - 220) : 0,
    minWidth: 220,
    background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`,
    borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
    zIndex: 1000,
    padding: 4,
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        style={isActive ? filterChipActiveStyle : filterChipStyle}
        onClick={() => setOpen(o => !o)}
      >
        {icon}
        {label}
        {onClear && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ display:'inline-flex', marginLeft:2, cursor:'pointer' }}
            aria-label="Filter zurücksetzen"
          >
            <X size={12} />
          </span>
        )}
      </button>
      {open && (
        <div ref={popoverRef} style={popoverStyle}>
          {renderContent(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

// ─── PopoverMenu (Single- + Multi-Select) ────────────────────────────────
function PopoverMenu({ options, selectedId, selectedIds, onSelect, onToggle, multi }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', maxHeight:280, overflow:'auto' }}>
      {options.map(opt => {
        const selected = multi
          ? (selectedIds || []).includes(opt.id)
          : selectedId === opt.id;
        const disabled = opt.disabled;
        return (
          <button
            key={String(opt.id)}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              if (multi) onToggle?.(opt.id);
              else onSelect?.(opt.id);
            }}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'8px 10px', fontSize:13, textAlign:'left',
              background: selected ? COLORS.surfaceMuted : 'transparent',
              color: disabled ? COLORS.textTertiary : COLORS.textPrimary,
              border:'none', borderRadius: RADIUS.sm, cursor: disabled ? 'default' : 'pointer',
            }}
          >
            <span style={{ width:14, display:'inline-flex' }}>
              {selected && <Check size={14} />}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ActionsMenu (3-Punkt-Menü pro Row) ──────────────────────────────────
function ActionsMenu({ leadId, anchorRect, lead, onClose, onStatusChange, onOpenDetail, onRefresh }) {
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const style = {
    position:'fixed',
    top: anchorRect ? anchorRect.bottom + 4 : 0,
    left: anchorRect ? Math.max(8, anchorRect.right - 200) : 0,
    minWidth: 200,
    background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`,
    borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
    zIndex: 1000,
    padding: 4,
  };

  const itemStyle = {
    display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
    fontSize:13, textAlign:'left', background:'transparent', color: COLORS.textPrimary,
    border:'none', borderRadius: RADIUS.sm, cursor:'pointer', width:'100%',
  };

  const handleArchive = async () => {
    // Soft-delete via archived-flag — kein DELETE (Cowork-Hard-Rule)
    const { error } = await supabase.from('leads')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) console.error('Archive fehlgeschlagen:', error);
    onRefresh?.();
    onClose();
  };

  return (
    <div ref={ref} style={style}>
      <button type="button" style={itemStyle} onClick={() => onOpenDetail(leadId)}>
        Details öffnen
      </button>
      <div style={{ height:4 }} />
      <div style={{ padding:'4px 10px', fontSize:10, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.08em' }}>Status setzen</div>
      {STATUS_ORDER.map(s => (
        <button
          key={s}
          type="button"
          style={{
            ...itemStyle,
            background: lead?.status === s ? COLORS.surfaceMuted : 'transparent',
          }}
          onClick={() => { onStatusChange(leadId, s); onClose(); }}
        >
          <span style={{ width:14, display:'inline-flex' }}>
            {lead?.status === s && <Check size={14} />}
          </span>
          {s} · {STATUS_CONFIG[s]?.sublabel || ''}
        </button>
      ))}
      <div style={{ height:4, borderTop:`0.5px solid ${COLORS.borderSubtle}`, marginTop:4 }} />
      <button type="button" style={{ ...itemStyle, color:'#B91C1C' }} onClick={handleArchive}>
        Archivieren
      </button>
    </div>
  );
}

// ─── NewLeadModal ────────────────────────────────────────────────────────
// Wrapper: zieht activeTeamId + session — Pflicht für RLS-Sichtbarkeit.
function NewLeadModalWithTeam({ onClose, onSaved }) {
  const { activeTeamId } = useTeam() || {};
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data?.session?.user?.id || null);
    });
  }, []);
  return (
    <NewLeadModal
      onClose={onClose}
      onSaved={onSaved}
      activeTeamId={activeTeamId}
      userId={userId}
    />
  );
}

function NewLeadModal({ onClose, onSaved, activeTeamId, userId }) {
  const [form, setForm] = useState({ status:'Lead' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!userId) { setErr('Session noch nicht geladen — kurz warten.'); return; }
    setBusy(true); setErr(null);
    const first = (form.first_name || '').trim() || null;
    const last  = (form.last_name  || '').trim() || null;
    const payload = {
      first_name: first,
      last_name:  last,
      name: [first, last].filter(Boolean).join(' ') || null,
      email:      (form.email || '').trim() || null,
      company:    (form.company || '').trim() || null,
      position:   (form.position || '').trim() || null,
      linkedin_url: (form.linkedin_url || '').trim() || null,
      status:     form.status || 'Lead',
      user_id:    userId,
      ...(activeTeamId ? { team_id: activeTeamId } : {}),
    };
    const { error } = await supabase.from('leads').insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved?.();
  };

  const overlay = { position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
  const modal = { background: COLORS.surface, borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width:480, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' };
  const header = { padding:'18px 22px', borderBottom:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', justifyContent:'space-between', alignItems:'center' };
  const body = { padding:'18px 22px', display:'grid', gap:12 };
  const label = { fontSize:11, fontWeight:600, color: COLORS.textSecondary, textTransform:'uppercase', letterSpacing:'0.08em' };
  const input = { height:36, padding:'0 10px', fontSize:13, border:`0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md, background: COLORS.surface, outline:'none', color: COLORS.textPrimary };
  const footer = { padding:'14px 22px', borderTop:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', justifyContent:'flex-end', gap:8 };
  const ghostBtn = { ...primaryBtnStyle, background:'transparent', color: COLORS.textSecondary, border:`0.5px solid ${COLORS.borderSubtle}` };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize:16, fontWeight:600, color: COLORS.textPrimary }}>Neuer Lead</div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary }} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div style={body}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ display:'grid', gap:6 }}>
              <span style={label}>Vorname</span>
              <input style={input} value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} autoFocus />
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <span style={label}>Nachname</span>
              <input style={input} value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} />
            </div>
          </div>
          <div style={{ display:'grid', gap:6 }}>
            <span style={label}>E-Mail</span>
            <input style={input} type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ display:'grid', gap:6 }}>
              <span style={label}>Unternehmen</span>
              <input style={input} value={form.company || ''} onChange={e => set('company', e.target.value)} />
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <span style={label}>Position</span>
              <input style={input} value={form.position || ''} onChange={e => set('position', e.target.value)} />
            </div>
          </div>
          <div style={{ display:'grid', gap:6 }}>
            <span style={label}>LinkedIn-URL</span>
            <input style={input} value={form.linkedin_url || ''} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" />
          </div>
          <div style={{ display:'grid', gap:6 }}>
            <span style={label}>Status</span>
            <select style={input} value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUS_ORDER.map(s => (
                <option key={s} value={s}>{s} · {STATUS_CONFIG[s]?.sublabel || ''}</option>
              ))}
            </select>
          </div>
          {err && <div style={{ color:'#B91C1C', fontSize:12 }}>{err}</div>}
        </div>
        <div style={footer}>
          <button type="button" style={ghostBtn} onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="button" style={primaryBtnStyle} onClick={submit} disabled={busy}>
            {busy ? 'Speichere…' : 'Lead anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
