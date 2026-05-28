// src/pages/Leads.jsx
//
// Leads Page — komplette Restauration der Sales-Workflow-Features.
//
// Features:
// 1. Quick-Filter-Sidebar (Hot Leads, In Pipeline, Favoriten, Follow-up heute, Überfällig, Kein Follow-up)
// 2. Stage-Tabs (Alle/Lead/LQL/MQL/MQN/SQL als Underline-Tabs)
// 3. Owner-Picker-Popover (statt navigate auf Detail-Page)
// 4. Bulk-Selection + Bulk-Actions (Stage / Archive / Liste / Export)
// 5. Lead-Listen-Verwaltung + CSV Export/Import
// 6. Status/Tags/Owner/Score Popover-Filter (vom Vorgänger-Patch)
// 7. 3-Punkt-Menü pro Lead (vom Vorgänger-Patch)
// 8. Neuer-Lead-Modal (vom Vorgänger-Patch)
//
// Hängt vom Drop-In-Bundle (~/Downloads/leadesk-leads/) ab:
//   src/components/leads/LeadsList.jsx, LeadsBoard.jsx, LeadRow.jsx, …
//   src/hooks/useLeads.js
//   src/lib/leadStyleTokens.js
//
// LeadRow.jsx braucht eine 1-Zeile-Anpassung (handleOwnerAdd gibt e.currentTarget
// weiter) — Diff im PATCH-README.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  List, LayoutGrid, GanttChart, Plus, Search, Bell, Filter, Tag, User,
  ArrowDownUp, X, Check, Flame, Briefcase, Star, Clock, AlertTriangle,
  Inbox, Users as UsersIcon, FolderPlus, Folder, Download, Upload,
  CheckSquare, Square, Archive, Trash2, MoreHorizontal,
  Rows3, Rows2, FileUp, Puzzle, Pencil,
} from 'lucide-react';
import { EXTENSION_WEBSTORE_URL } from '../lib/leadeskExtension';
import { LeadsList } from '../components/leads/LeadsList';
import { LeadsBoard } from '../components/leads/LeadsBoard';
import { LeadViewsTabs } from '../components/leads/LeadViewsTabs';
import { InlineEditField } from '../components/leads/InlineEditField';
import { LeadStatusMiniPath } from '../components/leads/LeadStatusMiniPath';
import { BulkEditModal } from '../components/leads/BulkEditModal';
import { COLORS, RADIUS, STATUS_ORDER, STATUS_CONFIG } from '../lib/leadStyleTokens';
import { useLeads } from '../hooks/useLeads';
import { useLeadViews } from '../hooks/useLeadViews';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

// ─── Styles ──────────────────────────────────────────────────────────────
// Visual aligned mit Deals/Organisationen (siehe pages/Deals.jsx).
const PRIMARY = 'rgb(49,90,231)';

const pageOuterStyle = { background: 'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' };
const pageStyle = { width:'100%', margin:'0 auto', display:'flex', flexDirection:'column' };
const headerRowStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 };
const titleStyle = { fontSize:22, fontWeight:800, margin:0, color:'#111827' };
const subtitleStyle = { fontSize:13, color:'#6B7280', marginTop:4 };
const searchWrapStyle = { position:'relative' };
const searchInputStyle = { width:200, padding:'7px 12px 7px 32px', fontSize:13, border:'1.5px solid #E4E7EC', borderRadius:10, background:'var(--surface)', outline:'none' };
const searchIconStyle = { position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' };
const iconBtnStyle = { width:34, height:34, border:'1.5px solid #E4E7EC', background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280', cursor:'pointer' };
const primaryBtnStyle = { padding:'9px 18px', background: PRIMARY, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const ghostBtnStyle = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const kpisRowStyle = { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 };
const filtersBarStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:16 };
const toolGroupStyle = { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' };
const toggleGroupStyle = { display:'inline-flex', background:'#F3F4F6', borderRadius:10, padding:3 };
const toggleBtnStyle = { height:30, padding:'0 14px', fontSize:13, background:'transparent', border:'none', color:'#6B7280', display:'flex', alignItems:'center', gap:6, borderRadius:8, cursor:'pointer', fontWeight:600 };
const toggleBtnActiveStyle = { ...toggleBtnStyle, background:'var(--surface)', color:'#111827', boxShadow:'0 1px 2px rgba(0,0,0,0.05)' };
const filterChipStyle = { padding:'7px 12px', fontSize:12, border:'1.5px solid #E4E7EC', borderRadius:20, background:'var(--surface)', color:'#374151', display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer', fontWeight:600 };
const filterChipActiveStyle = { ...filterChipStyle, background: PRIMARY, color:'#fff', borderColor: PRIMARY };
const contentStyle = { display:'flex', flexDirection:'column', gap:0 };
const dividerStyle = { width:1, height:20, background:'#E4E7EC', margin:'0 4px' };

const VIEWS = [
  { id:'list',     label:'Liste',    Icon: List },
  { id:'board',    label:'Board',    Icon: LayoutGrid },
  { id:'timeline', label:'Timeline', Icon: GanttChart },
];

const SORT_OPTIONS = [
  { id:'updated_desc', label:'Zuletzt geändert' },
  { id:'score_desc',   label:'Score (hoch → niedrig)' },
  { id:'score_asc',    label:'Score (niedrig → hoch)' },
  { id:'name_asc',     label:'Name (A → Z)' },
];

// Helper für Datumsvergleich (start-of-day)
function isToday(date) {
  if (!date) return false;
  const d = new Date(date);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}
function isOverdue(date) {
  if (!date) return false;
  return new Date(date) < new Date();
}

// QUICK-FILTERS — Predicate + Counter
const QUICK_FILTERS = [
  { id:'all',            label:'Alle',              Icon: Inbox,          predicate: () => true,                                                                color:'#64748B' },
  { id:'hot',            label:'Hot Leads',         Icon: Flame,          predicate: l => (l.score || 0) >= 70,                                                color:'#DC2626' },
  { id:'pipeline',       label:'In Pipeline',       Icon: Briefcase,      predicate: l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage),    color:'#185FA5' },
  { id:'favorite',       label:'Favoriten',         Icon: Star,           predicate: l => !!l.is_favorite,                                                      color:'#D97706' },
  { id:'followup_today', label:'Follow-up heute',   Icon: Clock,          predicate: l => isToday(l.next_followup),                                            color:'#185FA5' },
  { id:'overdue',        label:'Überfällig',        Icon: AlertTriangle,  predicate: l => l.next_followup && isOverdue(l.next_followup),                       color:'#DC2626' },
  { id:'no_followup',    label:'Kein Follow-up',    Icon: Clock,          predicate: l => !l.next_followup,                                                     color:'#64748B' },
  { id:'team',           label:'Team-Leads',        Icon: UsersIcon,      predicate: l => l.is_shared === true,                                                color:'#059669' },
];

// CSV-Helpers (export)
function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function leadsToCsv(leads) {
  const headers = ['ID','Vorname','Nachname','E-Mail','Telefon','Unternehmen','Position','Status','Stage','Score','LinkedIn','Location','Tags','Next Followup','Created','Updated'];
  const rows = leads.map(l => [
    l.id, l.first_name, l.last_name, l.email, l.phone, l.company, l.job_title,
    l.status, l.deal_stage, l.score, l.linkedin_url, l.location,
    (l.tags || []).join('; '), l.next_followup, l.created_at, l.updated_at,
  ]);
  return [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n');
}
function downloadFile(name, content, mime='text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Main Component ──────────────────────────────────────────────────────
// ─── Helper: filter_json-Equality für Saved-Views Dirty-Check ───────────
function filterJsonEqual(a, b) {
  const A = a || {}, B = b || {};
  if ((A.quickFilter ?? 'all')      !== (B.quickFilter ?? 'all'))      return false;
  if ((A.stageTab    ?? null)       !== (B.stageTab    ?? null))       return false;
  if ((A.listFilter  ?? null)       !== (B.listFilter  ?? null))       return false;
  if ((A.ownerFilter ?? null)       !== (B.ownerFilter ?? null))       return false;
  if ((A.sortBy      ?? 'updated_desc') !== (B.sortBy ?? 'updated_desc')) return false;
  if ((A.search      ?? '')         !== (B.search      ?? ''))         return false;
  const ta = [...(A.tagsFilter || [])].sort();
  const tb = [...(B.tagsFilter || [])].sort();
  if (ta.length !== tb.length) return false;
  return ta.every((x, i) => x === tb[i]);
}

export default function Leads() {
  const navigate = useNavigate();
  const { activeTeamId } = useTeam() || {};
  const { leads, isLoading, updateLeadStatus, updateLead, refetch } = useLeads();
  const {
    views: leadViews,
    activeViewId,
    currentUserId,
    isLoading: viewsLoading,
    createView,
    updateView,
    deleteView,
    setActiveView,
  } = useLeadViews({ activeTeamId });

  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');

  // Density (Sprint A · 2026-05-27) — Compact/Comfortable. Persistiert in localStorage.
  const [density, setDensity] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' && window.localStorage?.getItem('leadesk_leads_density');
      return stored === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });
  useEffect(() => {
    try {
      window.localStorage?.setItem('leadesk_leads_density', density);
    } catch {
      /* ignore quota / disabled-storage errors */
    }
  }, [density]);

  // Filter-State
  const [quickFilter, setQuickFilter] = useState('all');
  const [stageTab,    setStageTab]    = useState(null);   // null | 'Lead' | 'LQL' | ...
  const [listFilter,  setListFilter]  = useState(null);   // null | listId
  const [tagsFilter,  setTagsFilter]  = useState([]);
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [sortBy,      setSortBy]      = useState('updated_desc');

  // Bulk-State
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Modals/Overlays
  const [newLeadOpen,   setNewLeadOpen]   = useState(false);
  const [newListOpen,   setNewListOpen]   = useState(false);
  const [importOpen,    setImportOpen]    = useState(false);
  const [actionsMenu,   setActionsMenu]   = useState(null); // { leadId, anchorRect }
  const [ownerPicker,   setOwnerPicker]   = useState(null); // { leadIds: [...], anchorRect }
  const [bulkStagePicker, setBulkStagePicker] = useState(null);
  const [bulkListPicker,  setBulkListPicker]  = useState(null);
  const [bulkEditOpen,    setBulkEditOpen]    = useState(false);

  // ─── Lists fetch ────────────────────────────────────────────────────
  const [lists, setLists] = useState([]);
  const [listMembers, setListMembers] = useState({});  // { listId: Set<leadId> }

  useEffect(() => {
    if (!activeTeamId) { setLists([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('lead_lists')
        .select('id, name, color, lead_list_members(lead_id)')
        .eq('team_id', activeTeamId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) { console.warn('[Leads] lead_lists fetch:', error.message); setLists([]); return; }
      setLists(data || []);
      const map = {};
      (data || []).forEach(l => {
        map[l.id] = new Set((l.lead_list_members || []).map(m => m.lead_id));
      });
      setListMembers(map);
    })();
    return () => { cancelled = true; };
  }, [activeTeamId]);

  // ─── Team-Members für Owner-Picker ──────────────────────────────────
  const [teamMembers, setTeamMembers] = useState([]);
  useEffect(() => {
    if (!activeTeamId) { setTeamMembers([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('team_members')
        .select('user_id, role, profile:profiles(id, first_name, last_name, avatar_url)')
        .eq('team_id', activeTeamId);
      if (cancelled) return;
      setTeamMembers(((data || []).map(m => m.profile).filter(Boolean)));
    })();
    return () => { cancelled = true; };
  }, [activeTeamId]);

  // ─── Derived: alle Tags + alle Owner (für Dropdown-Options) ─────────
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

  // ─── Filter-Pipeline ────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    let res = leads;

    if (search) {
      const q = search.toLowerCase();
      res = res.filter(l => {
        const name = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase();
        const company = (l.company || '').toLowerCase();
        const email = (l.email || '').toLowerCase();
        const phone = (l.phone || '').toLowerCase();
        const jobTitle = (l.job_title || '').toLowerCase();
        const linkedin = (l.linkedin_url || '').toLowerCase();
        const location = (l.location || '').toLowerCase();
        const tagsStr = (l.tags || []).join(' ').toLowerCase();
        return name.includes(q)
          || company.includes(q)
          || email.includes(q)
          || phone.includes(q)
          || jobTitle.includes(q)
          || linkedin.includes(q)
          || location.includes(q)
          || tagsStr.includes(q);
      });
    }

    if (quickFilter && quickFilter !== 'all') {
      const def = QUICK_FILTERS.find(q => q.id === quickFilter);
      if (def) res = res.filter(def.predicate);
    }

    if (stageTab) {
      res = res.filter(l => l.status === stageTab);
    }

    if (listFilter && listMembers[listFilter]) {
      const memberSet = listMembers[listFilter];
      res = res.filter(l => memberSet.has(l.id));
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
    return res;
  }, [leads, search, quickFilter, stageTab, listFilter, listMembers, tagsFilter, ownerFilter, sortBy]);

  // ─── Saved Views: current snapshot + dirty-detection ───────────────
  const currentFilterJson = useMemo(() => ({
    quickFilter, stageTab, listFilter, tagsFilter, ownerFilter, sortBy, search,
  }), [quickFilter, stageTab, listFilter, tagsFilter, ownerFilter, sortBy, search]);

  const activeView = useMemo(
    () => (leadViews || []).find(v => v.id === activeViewId) || null,
    [leadViews, activeViewId]
  );
  const isDirty = activeView ? !filterJsonEqual(activeView.filter_json, currentFilterJson) : false;

  // Apply einer gespeicherten View → setzt alle 7 Filter aus filter_json
  const applyView = useCallback((view) => {
    const f = view?.filter_json || {};
    setQuickFilter(f.quickFilter ?? 'all');
    setStageTab(f.stageTab ?? null);
    setListFilter(f.listFilter ?? null);
    setTagsFilter(Array.isArray(f.tagsFilter) ? f.tagsFilter : []);
    setOwnerFilter(f.ownerFilter ?? null);
    setSortBy(f.sortBy ?? 'updated_desc');
    setSearch(f.search ?? '');
  }, []);

  // Initial-Mount: aus user_preferences geladene aktive View einmalig applyen.
  // Sonst rendert die Page beim Reload mit clean-Filtern obwohl Tab visuell
  // als active markiert ist. Idempotent via Ref — danach respektiert es
  // User-Edits am Filter-State.
  const initialViewApplyRef = useRef(false);
  useEffect(() => {
    if (initialViewApplyRef.current) return;
    if (viewsLoading) return;
    if (!leadViews || leadViews.length === 0) return;
    if (activeViewId) {
      const active = leadViews.find(v => v.id === activeViewId);
      if (active) applyView(active);
    }
    initialViewApplyRef.current = true;
  }, [leadViews, activeViewId, viewsLoading, applyView]);

  // Counts pro Quick-Filter (auf gesamtem leads-Array, nicht gefiltert)
  const quickCounts = useMemo(() => {
    const out = {};
    QUICK_FILTERS.forEach(qf => {
      out[qf.id] = leads.filter(qf.predicate).length;
    });
    return out;
  }, [leads]);

  // Counts pro Stage
  // Counts pro Stage — auf leads (Pool) statt filteredLeads gemappt.
  // Behebt den Race wo Stage-Filter-Button "Stage: Alle · 0" zeigt während
  // Subtitle korrekt "84 von 84 sichtbar" sagt (entdeckt 2026-05-27 beim
  // Sprint-A-Smoke auf Staging). Plus semantisch intuitiver: Counts spiegeln
  // den Gesamt-Pool pro Stage, unabhängig vom aktuellen Filter (HubSpot/
  // Salesforce-Pattern). Konsistent mit quickCounts oben, die schon [leads]
  // als deps haben.
  const stageCounts = useMemo(() => {
    const out = { __all: leads.length };
    STATUS_ORDER.forEach(s => {
      out[s] = leads.filter(l => l.status === s).length;
    });
    return out;
  }, [leads]);

  // Selected-Set sanity: nur IDs aus filteredLeads behalten
  useEffect(() => {
    setSelectedIds(prev => {
      const visible = new Set(filteredLeads.map(l => l.id));
      const next = new Set();
      prev.forEach(id => { if (visible.has(id)) next.add(id); });
      return next;
    });
  }, [filteredLeads]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleLeadClick = useCallback(id => navigate(`/leads/${id}`), [navigate]);

  const handleOwnerAdd = useCallback((leadId, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.();
    setOwnerPicker({ leadIds: [leadId], anchorRect: rect });
  }, []);

  const handleMenuClick = useCallback((leadId, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.();
    setActionsMenu({ leadId, anchorRect: rect });
  }, []);

  const handleStatusChange = useCallback((leadId, newStatus) => {
    updateLeadStatus(leadId, newStatus);
  }, [updateLeadStatus]);

  const toggleSelected = useCallback((leadId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredLeads.map(l => l.id)));
  }, [filteredLeads]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Bulk-Actions
  const bulkSetStage = async (newStatus) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { console.error('Bulk stage failed:', error); return; }
    refetch?.();
    clearSelection();
    setBulkStagePicker(null);
  };
  const bulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Leads archivieren? (Lassen sich später wiederherstellen.)`)) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('leads')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { console.error('Bulk archive failed:', error); return; }
    refetch?.();
    clearSelection();
  };
  const bulkAddToList = async (listId) => {
    if (selectedIds.size === 0 || !listId) return;
    const ids = Array.from(selectedIds);
    const rows = ids.map(leadId => ({ list_id: listId, lead_id: leadId }));
    // upsert-Pattern: bei doppelten Zuordnungen einfach skippen
    const { error } = await supabase.from('lead_list_members')
      .upsert(rows, { onConflict: 'list_id,lead_id', ignoreDuplicates: true });
    if (error) { console.error('Bulk add-to-list failed:', error); return; }
    setBulkListPicker(null);
    clearSelection();
    // Reload list-memberships
    const { data } = await supabase
      .from('lead_lists')
      .select('id, lead_list_members(lead_id)')
      .eq('team_id', activeTeamId);
    const map = {};
    (data || []).forEach(l => { map[l.id] = new Set((l.lead_list_members || []).map(m => m.lead_id)); });
    setListMembers(map);
  };
  const bulkExportCsv = () => {
    if (selectedIds.size === 0) return;
    const subset = leads.filter(l => selectedIds.has(l.id));
    downloadFile(`leads-export-${new Date().toISOString().slice(0,10)}.csv`, leadsToCsv(subset));
  };

  // Sprint C/2 · Generic Bulk-Edit Apply-Handler
  // payload kommt aus BulkEditModal in einer von zwei Formen:
  //   { field: 'status'|'source'|'next_followup', value: any }   → single update
  //   { field: 'tags', mode: 'add'|'remove', tag: string }       → per-Lead-Loop
  const bulkEditApply = useCallback(async (payload) => {
    if (selectedIds.size === 0) return { error: new Error('Keine Auswahl') };
    const ids = Array.from(selectedIds);

    // ── Scalar-Path (status/source/next_followup) ───────────────────────
    if (payload.field === 'status' || payload.field === 'source' || payload.field === 'next_followup') {
      // CLAUDE.md Top-Fallstrick #1 — EIN Field per Update, NIE bundeln.
      // Wir updaten exakt eine Spalte plus updated_at.
      const update = { [payload.field]: payload.value, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('leads').update(update).in('id', ids);
      if (error) return { error };
      refetch?.();
      clearSelection();
      setBulkEditOpen(false);
      return {};
    }

    // ── Tags-Path (per-Lead-Loop für non-destructive add/remove) ────────
    if (payload.field === 'tags') {
      const tag = payload.tag?.trim();
      if (!tag) return { error: new Error('Tag fehlt') };

      // Snapshot der aktuellen tags der selected Leads
      const selectedLeads = leads.filter(l => ids.includes(l.id));

      const updates = selectedLeads.map(lead => {
        const current = Array.isArray(lead.tags) ? lead.tags : [];
        let next;
        if (payload.mode === 'add') {
          if (current.includes(tag)) return null;       // schon da, skip
          next = [...current, tag];
        } else if (payload.mode === 'remove') {
          if (!current.includes(tag)) return null;      // nicht da, skip
          next = current.filter(t => t !== tag);
        } else {
          return null;
        }
        return { id: lead.id, tags: next };
      }).filter(Boolean);

      if (updates.length === 0) {
        // Niemand affected — nichts zu tun. Trotzdem Erfolg.
        clearSelection();
        setBulkEditOpen(false);
        return {};
      }

      // Promise.all für parallelen Update — bei <100 Leads akzeptabel.
      // Pro Update: tags + updated_at, kein anderer Field-Bundle.
      const results = await Promise.all(updates.map(u =>
        supabase.from('leads')
          .update({ tags: u.tags, updated_at: new Date().toISOString() })
          .eq('id', u.id)
      ));
      const firstError = results.find(r => r.error)?.error;
      if (firstError) return { error: firstError };

      refetch?.();
      clearSelection();
      setBulkEditOpen(false);
      return {};
    }

    return { error: new Error(`Unbekanntes Field: ${payload.field}`) };
  }, [selectedIds, leads, refetch, clearSelection]);
  const exportAllFiltered = () => {
    downloadFile(`leads-export-${new Date().toISOString().slice(0,10)}.csv`, leadsToCsv(filteredLeads));
  };
  const bulkAssignOwner = async (userId) => {
    if (selectedIds.size === 0 || !userId) return;
    const ids = Array.from(selectedIds);
    const rows = ids.map(leadId => ({ lead_id: leadId, user_id: userId, role: 'owner' }));
    const { error } = await supabase.from('lead_owners')
      .upsert(rows, { onConflict: 'lead_id,user_id', ignoreDuplicates: true });
    if (error) { console.error('Bulk owner failed:', error); return; }
    refetch?.();
    setOwnerPicker(null);
    clearSelection();
  };

  // Single-lead owner assignment
  const assignOwner = async (leadIds, userId) => {
    if (!leadIds || leadIds.length === 0 || !userId) return;
    const rows = leadIds.map(leadId => ({ lead_id: leadId, user_id: userId, role: 'owner' }));
    const { error } = await supabase.from('lead_owners')
      .upsert(rows, { onConflict: 'lead_id,user_id', ignoreDuplicates: true });
    if (error) { console.error('Owner assign failed:', error); return; }
    refetch?.();
    setOwnerPicker(null);
  };

  // ─── Labels für Filter-Pills ────────────────────────────────────────
  const activeTagsLabel = tagsFilter.length === 0 ? 'Tags'
    : tagsFilter.length === 1 ? `Tag: ${tagsFilter[0]}` : `Tags · ${tagsFilter.length}`;
  const activeOwnerLabel = (() => {
    if (!ownerFilter) return 'Owner';
    const o = allOwners.find(x => x.id === ownerFilter);
    return o ? `Owner: ${o.first_name || ''} ${o.last_name || ''}`.trim() : 'Owner';
  })();
  const activeSortLabel = (SORT_OPTIONS.find(s => s.id === sortBy) || SORT_OPTIONS[0]).label;

  // ─── Render ─────────────────────────────────────────────────────────
  const allVisibleSelected = filteredLeads.length > 0 && selectedIds.size === filteredLeads.length;

  // KPI-Berechnungen (für die 4 Cards oben)
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toDateString();
  const hotCount = leads.filter(l => (l.score || 0) >= 70).length;
  const followupTodayCount = leads.filter(l => l.next_followup && new Date(l.next_followup).toDateString() === todayStr).length;
  const overdueCount = leads.filter(l => l.next_followup && new Date(l.next_followup) < today).length;
  // KPI-Cards sind klickbar — setzen den passenden Quick-Filter.
  // Klick auf eine bereits aktive Card setzt den Filter zurück (Toggle).
  const setQuickFilterAndResetStage = (qfId) => {
    setQuickFilter(qfId);
    setStageTab(null);
    setListFilter(null);
  };
  const kpis = [
    { label:'Gesamt Leads',    value: leads.length,        color: PRIMARY,    bg:'rgba(49,90,231,0.06)', qf:'all' },
    { label:'Hot Leads',       value: hotCount,            color:'#DC2626',   bg:'#FEF2F2',              qf:'hot' },
    { label:'Follow-up heute', value: followupTodayCount,  color:'#7C3AED',   bg:'#F5F3FF',              qf:'followup_today' },
    { label:'Überfällig',      value: overdueCount,        color:'#D97706',   bg:'#FFFBEB',              qf:'overdue' },
  ];

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        {/* Header */}
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Leads</h1>
            <div style={subtitleStyle}>
              {filteredLeads.length} von {leads.length} sichtbar
              {quickFilter && quickFilter !== 'all' && ` · ${QUICK_FILTERS.find(q => q.id === quickFilter)?.label}`}
              {stageTab && ` · ${stageTab}`}
              {listFilter && lists.find(l => l.id === listFilter) && ` · Liste: ${lists.find(l => l.id === listFilter).name}`}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={searchWrapStyle}>
              <Search size={14} style={searchIconStyle} />
              <input type="text" style={{ ...searchInputStyle, width: 240 }}
                placeholder="Name, E-Mail, Firma, Tags…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button type="button" style={iconBtnStyle} aria-label="Benachrichtigungen">
              <Bell size={16} />
            </button>
            <button type="button" style={primaryBtnStyle} onClick={() => setNewLeadOpen(true)}>
              <Plus size={16} /> Neuer Lead
            </button>
          </div>
        </div>

        {/* KPI-Zeile — jede Card setzt den passenden Quick-Filter */}
        <div style={kpisRowStyle}>
          {kpis.map(k => {
            const isActive = quickFilter === k.qf && k.qf !== 'all';
            const isAllActive = k.qf === 'all' && quickFilter === 'all' && !stageTab && !listFilter;
            const highlight = isActive || isAllActive;
            return (
              <button key={k.label} type="button"
                onClick={() => setQuickFilterAndResetStage(k.qf)}
                style={{
                  background: k.bg, borderRadius:14, padding:'14px 18px',
                  border: `1px solid ${highlight ? k.color : k.color + '22'}`,
                  boxShadow: highlight ? `0 0 0 3px ${k.color}1a` : 'none',
                  textAlign:'left', cursor:'pointer', transition:'box-shadow 0.15s, border-color 0.15s',
                  font:'inherit',
                }}
                aria-pressed={highlight}
                title={k.qf === 'all' ? 'Alle Filter zurücksetzen' : `Filter: ${k.label}`}
              >
                <div style={{ fontSize:10, fontWeight:700, color: k.color, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color: k.color, fontVariantNumeric:'tabular-nums' }}>{k.value}</div>
              </button>
            );
          })}
        </div>

        {/* Saved Views ("Ansichten") als Tab-Leiste — Sprint B */}
        <LeadViewsTabs
          views={leadViews}
          activeViewId={activeViewId}
          isDirty={isDirty}
          currentUserId={currentUserId}
          currentFilterJson={currentFilterJson}
          activeTeamId={activeTeamId}
          onApply={applyView}
          onSave={createView}
          onUpdate={updateView}
          onDelete={deleteView}
          onSetActive={setActiveView}
        />

        {/* Tools + View-Toggle + Filters */}
        <div style={filtersBarStyle}>
          <div style={toolGroupStyle}>
            <div style={toggleGroupStyle}>
              {VIEWS.map((v) => {
                const Icon = v.Icon;
                const isActive = view === v.id;
                return (
                  <button key={v.id} type="button"
                    style={isActive ? toggleBtnActiveStyle : toggleBtnStyle}
                    onClick={() => setView(v.id)}>
                    <Icon size={15} /> {v.label}
                  </button>
                );
              })}
            </div>

            {/* Density-Toggle (Compact / Comfortable) — nur sinnvoll in der Listen-View */}
            {view === 'list' && (
              <div style={toggleGroupStyle}>
                <button type="button"
                  style={density === 'comfortable' ? toggleBtnActiveStyle : toggleBtnStyle}
                  onClick={() => setDensity('comfortable')}
                  title="Komfortabel · große Rows mit Details">
                  <Rows2 size={14} />
                </button>
                <button type="button"
                  style={density === 'compact' ? toggleBtnActiveStyle : toggleBtnStyle}
                  onClick={() => setDensity('compact')}
                  title="Kompakt · mehr Leads pro Seite">
                  <Rows3 size={14} />
                </button>
              </div>
            )}

            <div style={dividerStyle} />

            {/* Stage-Filter (Alle/Lead/LQL/MQL/MQN/SQL) */}
            <FilterPopover
              label={(() => {
                if (!stageTab) return `Stage: Alle · ${stageCounts.__all || 0}`;
                return `Stage: ${stageTab}`;
              })()}
              icon={<span style={{ width:8, height:8, borderRadius:'50%', background: stageTab ? (STATUS_CONFIG[stageTab]?.dot || '#64748B') : '#94A3B8', display:'inline-block' }} />}
              isActive={!!stageTab}
              onClear={stageTab ? () => setStageTab(null) : undefined}
              renderContent={(close) => (
                <div style={{ display:'flex', flexDirection:'column', minWidth: 240, maxHeight: 320, overflow:'auto' }}>
                  <button type="button"
                    onClick={() => { setStageTab(null); close(); }}
                    style={{
                      display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                      background: stageTab === null ? COLORS.surfaceMuted : 'transparent',
                      color: COLORS.textPrimary, border:'none',
                      borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
                      fontSize:13,
                    }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:'#94A3B8' }} />
                    <span style={{ flex:1 }}>Alle</span>
                    <span style={{ fontSize:11, color: COLORS.textTertiary, fontVariantNumeric:'tabular-nums' }}>
                      {stageCounts.__all || 0}
                    </span>
                  </button>
                  {STATUS_ORDER.map(s => {
                    const active = stageTab === s;
                    const cfg = STATUS_CONFIG[s];
                    return (
                      <button key={s} type="button"
                        onClick={() => { setStageTab(s); close(); }}
                        style={{
                          display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                          background: active ? COLORS.surfaceMuted : 'transparent',
                          color: COLORS.textPrimary, border:'none',
                          borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
                          fontSize:13,
                        }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background: cfg?.dot || '#64748B' }} />
                        <span style={{ flex:1 }}>{s} · {cfg?.sublabel || ''}</span>
                        <span style={{ fontSize:11, color: COLORS.textTertiary, fontVariantNumeric:'tabular-nums' }}>
                          {stageCounts[s] || 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />

            {/* Schnellfilter (vordefinierte Quick-Predicates).
                "Ansichten" heißen jetzt die User-Saved-Views — siehe LeadViewsTabs oberhalb. */}
            <FilterPopover
              label={(() => {
                const qf = QUICK_FILTERS.find(q => q.id === quickFilter);
                if (!qf || quickFilter === 'all') return 'Schnellfilter';
                return `Schnellfilter: ${qf.label}`;
              })()}
              icon={<Inbox size={14} />}
              isActive={!!quickFilter && quickFilter !== 'all'}
              onClear={quickFilter && quickFilter !== 'all' ? () => setQuickFilter('all') : undefined}
              renderContent={(close) => (
                <div style={{ display:'flex', flexDirection:'column', maxHeight: 360, overflow:'auto', minWidth: 240 }}>
                  {QUICK_FILTERS.map(qf => {
                    const Icon = qf.Icon;
                    const active = quickFilter === qf.id;
                    return (
                      <button key={qf.id} type="button"
                        onClick={() => { setQuickFilter(qf.id); setStageTab(null); setListFilter(null); close(); }}
                        style={{
                          display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                          background: active ? COLORS.surfaceMuted : 'transparent',
                          color: COLORS.textPrimary, border:'none',
                          borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
                          fontSize:13,
                        }}>
                        <Icon size={14} color={qf.color} />
                        <span style={{ flex:1 }}>{qf.label}</span>
                        <span style={{ fontSize:11, color: COLORS.textTertiary, fontVariantNumeric:'tabular-nums' }}>
                          {quickCounts[qf.id] || 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />

            {/* Listen */}
            <FilterPopover
              label={(() => {
                if (!listFilter) return 'Listen';
                const lst = lists.find(l => l.id === listFilter);
                return lst ? `Liste: ${lst.name}` : 'Listen';
              })()}
              icon={<Folder size={14} />}
              isActive={!!listFilter}
              onClear={listFilter ? () => setListFilter(null) : undefined}
              renderContent={(close) => (
                <div style={{ display:'flex', flexDirection:'column', minWidth: 240, maxHeight: 360, overflow:'auto' }}>
                  <button type="button"
                    onClick={() => { setNewListOpen(true); close(); }}
                    style={{
                      display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                      background:'transparent', color: COLORS.primary, border:'none',
                      borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
                      fontSize:13, fontWeight: 500,
                      borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
                      marginBottom: 4,
                    }}>
                    <FolderPlus size={14} />
                    <span>Neue Liste anlegen</span>
                  </button>
                  {lists.length === 0 && (
                    <div style={{ padding:'8px 10px', fontSize:12, color: COLORS.textTertiary, fontStyle:'italic' }}>
                      Noch keine Listen
                    </div>
                  )}
                  {lists.map(lst => {
                    const active = listFilter === lst.id;
                    const memberCount = listMembers[lst.id]?.size || 0;
                    return (
                      <button key={lst.id} type="button"
                        onClick={() => {
                          setListFilter(active ? null : lst.id);
                          setQuickFilter('all'); setStageTab(null);
                          close();
                        }}
                        style={{
                          display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                          background: active ? COLORS.surfaceMuted : 'transparent',
                          color: COLORS.textPrimary, border:'none',
                          borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
                          fontSize:13,
                        }}>
                        <Folder size={14} color={lst.color || '#64748B'} />
                        <span style={{ flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {lst.name}
                        </span>
                        <span style={{ fontSize:11, color: COLORS.textTertiary, fontVariantNumeric:'tabular-nums' }}>
                          {memberCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />

            <div style={dividerStyle} />

            <button type="button" style={filterChipStyle} onClick={exportAllFiltered} title="CSV exportieren">
              <Download size={14} /> Export
            </button>
            <button type="button" style={filterChipStyle} onClick={() => setImportOpen(true)} title="CSV importieren">
              <Upload size={14} /> Import
            </button>
          </div>

          <div style={toolGroupStyle}>
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
                  options={SORT_OPTIONS}
                  selectedId={sortBy}
                  onSelect={(id) => { setSortBy(id); close(); }}
                />
              )}
            />
            <button type="button"
              onClick={allVisibleSelected ? clearSelection : selectAll}
              style={ghostBtnStyle}
              aria-label="Alles auswählen"
              title={allVisibleSelected ? 'Auswahl aufheben' : 'Alles auswählen'}
            >
              {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allVisibleSelected ? 'Auswahl aufheben' : 'Alles auswählen'}
            </button>
          </div>
        </div>

        {/* Bulk-Bar (conditional) */}
        {selectedIds.size > 0 && (
          <BulkBar
            count={selectedIds.size}
            onEdit={() => setBulkEditOpen(true)}
            onStage={(e) => setBulkStagePicker({ anchorRect: e.currentTarget.getBoundingClientRect() })}
            onOwner={(e) => setOwnerPicker({ leadIds: Array.from(selectedIds), anchorRect: e.currentTarget.getBoundingClientRect() })}
            onList={(e) => setBulkListPicker({ anchorRect: e.currentTarget.getBoundingClientRect() })}
            onArchive={bulkArchive}
            onExport={bulkExportCsv}
            onClear={clearSelection}
          />
        )}

        {/* Content */}
        <div style={contentStyle}>
          {isLoading ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>⏳ Lade Leads…</div>
          ) : leads.length === 0 ? (
            // Onboarding-Empty-State — 3 Pfade (CSV-Import / Chrome-Extension / Manuell anlegen)
            <EmptyStateOnboarding
              onImport={() => setImportOpen(true)}
              onCreate={() => setNewLeadOpen(true)}
            />
          ) : filteredLeads.length === 0 ? (
            // Gefilterter Empty-State — Reset-CTA
            <div style={{ textAlign:'center', padding:'48px 0', color:'#6B7280', fontSize:14 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
              <div style={{ fontWeight:600, marginBottom:4, color:'#111827' }}>Keine Leads passen zum aktuellen Filter</div>
              <div style={{ fontSize:13, marginBottom:16 }}>
                {leads.length} Lead{leads.length === 1 ? '' : 's'} insgesamt — derzeit ausgeblendet.
              </div>
              <button type="button" style={ghostBtnStyle}
                onClick={() => { setSearch(''); setQuickFilter('all'); setStageTab(null); setListFilter(null); setTagsFilter([]); setOwnerFilter(null); }}>
                <X size={14} /> Filter zurücksetzen
              </button>
            </div>
          ) : view === 'list' ? (
            <SelectableLeadsList
              leads={filteredLeads}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onLeadClick={handleLeadClick}
              onOwnerAdd={handleOwnerAdd}
              onMenuClick={handleMenuClick}
              density={density}
              onUpdate={updateLead}
            />
          ) : view === 'board' ? (
            <LeadsBoard
              leads={filteredLeads}
              onLeadClick={handleLeadClick}
              onLeadStatusChange={handleStatusChange}
            />
          ) : (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>
              Timeline-View kommt im nächsten Sprint.
            </div>
          )}
        </div>
      </div>

      {/* ─── Modals + Overlays ─────────────────────────────────────── */}
      {newLeadOpen && (
        <NewLeadModalWithTeam onClose={() => setNewLeadOpen(false)}
          onSaved={() => { setNewLeadOpen(false); refetch?.(); }} />
      )}
      {newListOpen && (
        <NewListModal
          activeTeamId={activeTeamId}
          onClose={() => setNewListOpen(false)}
          onSaved={async () => {
            setNewListOpen(false);
            // Refetch lists
            const { data } = await supabase
              .from('lead_lists')
              .select('id, name, color, lead_list_members(lead_id)')
              .eq('team_id', activeTeamId)
              .order('created_at', { ascending: true });
            setLists(data || []);
            const map = {};
            (data || []).forEach(l => { map[l.id] = new Set((l.lead_list_members || []).map(m => m.lead_id)); });
            setListMembers(map);
          }}
        />
      )}
      {importOpen && (
        <ImportCsvModal
          activeTeamId={activeTeamId}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); refetch?.(); }}
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
      {ownerPicker && (
        <OwnerPickerPopover
          anchorRect={ownerPicker.anchorRect}
          teamMembers={teamMembers}
          onPick={(userId) => assignOwner(ownerPicker.leadIds, userId)}
          onClose={() => setOwnerPicker(null)}
        />
      )}
      {bulkStagePicker && (
        <StagePickerPopover
          anchorRect={bulkStagePicker.anchorRect}
          onPick={bulkSetStage}
          onClose={() => setBulkStagePicker(null)}
        />
      )}
      {bulkListPicker && (
        <ListPickerPopover
          anchorRect={bulkListPicker.anchorRect}
          lists={lists}
          onPick={bulkAddToList}
          onClose={() => setBulkListPicker(null)}
        />
      )}
      {bulkEditOpen && (
        <BulkEditModal
          leadIds={Array.from(selectedIds)}
          leads={leads}
          onApply={bulkEditApply}
          onClose={() => setBulkEditOpen(false)}
        />
      )}
    </div>
  );
}

// ─── EmptyStateOnboarding ────────────────────────────────────────────────
// 3-Card-Layout für neue Accounts ohne Leads.
// Inspiriert vom HubSpot-Onboarding-Pattern (CSV / Tool-Integration / Manuell).
// Chrome-Extension-Card nutzt EXTENSION_WEBSTORE_URL aus src/lib/leadeskExtension.js.
function EmptyStateOnboarding({ onImport, onCreate }) {
  const wrap = {
    background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`,
    borderRadius: 14,
    padding: '40px 32px',
  };
  const headStyle = { textAlign: 'center', marginBottom: 28 };
  const titleStyle = { fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: 0 };
  const subStyle = { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 };
  const card = {
    background: '#fff',
    border: '1.5px solid #E4E7EC',
    borderRadius: 12,
    padding: 18,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    font: 'inherit',
  };
  const iconWrap = (bg, fg) => ({
    width: 38, height: 38, borderRadius: 9, background: bg, color: fg,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  });
  const cardTitle = { fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, margin: 0 };
  const cardDesc = { fontSize: 12, color: COLORS.textTertiary, margin: '4px 0 0', lineHeight: 1.5 };

  const openExtension = () => {
    if (typeof window !== 'undefined') window.open(EXTENSION_WEBSTORE_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={wrap}>
      <div style={headStyle}>
        <h2 style={titleStyle}>Noch keine Leads</h2>
        <div style={subStyle}>Wähle einen Weg um loszulegen — du kannst später jederzeit weitere ergänzen.</div>
      </div>
      <div style={gridStyle}>
        <button type="button" style={card}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = PRIMARY; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E4E7EC'; }}
          onClick={onImport}>
          <div style={iconWrap('#EEF2FF', PRIMARY)}><FileUp size={20} /></div>
          <h3 style={cardTitle}>CSV importieren</h3>
          <p style={cardDesc}>Excel-Export, LinkedIn-Sales-Navigator-Liste oder anderer CRM — mit Spalten-Mapping in einem Wizard.</p>
        </button>
        <button type="button" style={card}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = PRIMARY; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E4E7EC'; }}
          onClick={openExtension}>
          <div style={iconWrap('#FFF1ED', '#EA580C')}><Puzzle size={20} /></div>
          <h3 style={cardTitle}>LinkedIn-Extension</h3>
          <p style={cardDesc}>Browser-Extension installieren und LinkedIn-Profile direkt aus dem LinkedIn-Tab als Lead anlegen.</p>
        </button>
        <button type="button" style={card}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = PRIMARY; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E4E7EC'; }}
          onClick={onCreate}>
          <div style={iconWrap('#ECFDF5', '#059669')}><Plus size={20} /></div>
          <h3 style={cardTitle}>Manuell anlegen</h3>
          <p style={cardDesc}>Schnellformular mit Name, Firma, E-Mail. Ideal für einen ersten Lead zum Testen der Workflows.</p>
        </button>
      </div>
    </div>
  );
}

// ─── BulkBar ─────────────────────────────────────────────────────────────
function BulkBar({ count, onStage, onOwner, onList, onArchive, onExport, onEdit, onClear }) {
  const barStyle = {
    padding:'10px 28px', background: COLORS.primarySoft, color: COLORS.primarySoftFg,
    display:'flex', alignItems:'center', gap:12, borderBottom:`0.5px solid ${COLORS.borderSubtle}`,
  };
  const actionBtn = {
    height:30, padding:'0 12px', fontSize:13, background: COLORS.surface,
    color: COLORS.textPrimary, border:`0.5px solid ${COLORS.borderSubtle}`,
    borderRadius: RADIUS.md, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6,
  };
  return (
    <div style={barStyle}>
      <strong style={{ fontVariantNumeric:'tabular-nums' }}>{count} ausgewählt</strong>
      <div style={{ flex:1 }} />
      {/* Sprint C/2 · Generic Bulk-Edit für status/source/followup/tags */}
      <button type="button" style={actionBtn} onClick={onEdit}><Pencil size={14} /> Bearbeiten…</button>
      <button type="button" style={actionBtn} onClick={onStage}>Stage ändern</button>
      <button type="button" style={actionBtn} onClick={onOwner}>Owner setzen</button>
      <button type="button" style={actionBtn} onClick={onList}>In Liste</button>
      <button type="button" style={actionBtn} onClick={onExport}><Download size={14} /> Export</button>
      <button type="button" style={{ ...actionBtn, color:'#B91C1C' }} onClick={onArchive}>
        <Archive size={14} /> Archivieren
      </button>
      <button type="button" onClick={onClear}
        style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.primarySoftFg, padding:4 }}
        aria-label="Auswahl aufheben">
        <X size={16} />
      </button>
    </div>
  );
}

// ─── SelectableLeadsList — Wrapper um LeadsList mit Checkbox-Spalte ─────
// Statt LeadsList ändern: wir wrappen die Standard-Komponente und blenden
// links eine Checkbox-Spalte ein.
function SelectableLeadsList({ leads, selectedIds, onToggleSelect, onLeadClick, onOwnerAdd, onMenuClick, onUpdate, density = 'comfortable' }) {
  // Group leads by status für visuelle Sektionen (analog zu LeadsList default)
  const groups = useMemo(() => {
    const out = STATUS_ORDER.map(s => ({
      status: s,
      label: STATUS_CONFIG[s]?.label || s,
      sublabel: STATUS_CONFIG[s]?.sublabel || '',
      dot: STATUS_CONFIG[s]?.dot || '#64748B',
      items: leads.filter(l => l.status === s),
    }));
    const unknown = leads.filter(l => !STATUS_ORDER.includes(l.status));
    if (unknown.length > 0) out.push({ status:'__unknown', label:'Ohne Status', sublabel:'', dot:'#64748B', items: unknown });
    return out.filter(g => g.items.length > 0);
  }, [leads]);

  // Wir importieren LeadRow nicht direkt (würde Drop-In-Vertrag brechen),
  // sondern verlassen uns auf onClick-Handler vom LeadsList.
  // Statt LeadsList nehmen wir aber eine eigene mini-Render-Logik
  // mit der Checkbox-Spalte.

  return (
    <div>
      {groups.map(group => (
        <div key={group.status} style={{ marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 4px 10px' }}>
            <span style={{ width:10, height:10, borderRadius:'50%', background: group.dot }} />
            <strong style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{group.status}</strong>
            <span style={{ fontSize:11, color:'#9CA3AF' }}>· {group.sublabel}</span>
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'#F3F4F6', color:'#6B7280', marginLeft: 'auto' }}>
              {group.items.length}
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap: density === 'compact' ? 4 : 8 }}>
            {group.items.map(lead => (
              <SelectableLeadRow
                key={lead.id}
                lead={lead}
                selected={selectedIds.has(lead.id)}
                onToggle={() => onToggleSelect(lead.id)}
                onLeadClick={onLeadClick}
                onOwnerAdd={onOwnerAdd}
                onMenuClick={onMenuClick}
                onUpdate={onUpdate}
                density={density}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectableLeadRow({ lead, selected, onToggle, onLeadClick, onOwnerAdd, onMenuClick, onUpdate, density = 'comfortable' }) {
  const isCompact = density === 'compact';
  // Inline-Edit-Handler — wenn kein onUpdate-Prop, kein Inline-Edit, sondern read-only.
  const handleUpdate = (field, value) =>
    onUpdate ? onUpdate(lead.id, { [field]: value }) : { error: new Error('Read-only') };
  const rowStyle = {
    display:'flex', alignItems:'center',
    gap: isCompact ? 10 : 14,
    padding: isCompact ? '6px 14px' : '14px 16px',
    background:'var(--surface)',
    border:`1.5px solid ${selected ? PRIMARY : '#E4E7EC'}`,
    borderRadius: isCompact ? 8 : 13,
    cursor:'pointer',
    transition:'border-color 0.15s',
    marginBottom: 0,
  };
  const avatarSize = isCompact ? 26 : 36;
  const avatarStyle = {
    width: avatarSize, height: avatarSize, borderRadius:'50%', background:'#F3F4F6',
    color:'#374151', fontSize: isCompact ? 11 : 13, fontWeight:700,
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    flexShrink:0,
  };
  const initials = `${(lead.first_name || '?')[0]}${(lead.last_name || '')[0] || ''}`.toUpperCase();
  const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—';
  const subtitle = [lead.job_title, lead.company].filter(Boolean).join(' · ');
  const cfg = STATUS_CONFIG[lead.status];
  return (
    <div style={rowStyle} onClick={(e) => {
      if (e.target.closest('[data-no-row-click]')) return;
      onLeadClick(lead.id, lead);
    }}>
      <div data-no-row-click onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{ cursor:'pointer', display:'flex' }}>
        {selected ? <CheckSquare size={18} color={COLORS.primary} /> : <Square size={18} color={COLORS.textTertiary} />}
      </div>
      <div style={avatarStyle}>{initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        {isCompact ? (
          // Kompakt: alles in einer Zeile — Name · Sub · Status · Tags-Count
          // Inline-Edit bewusst NICHT in compact (Single-Row mit ellipsis-overflow).
          // Für Inline-Edit: User auf Comfortable switchen.
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
            <strong style={{ fontSize:13, color: COLORS.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0 }}>{fullName}</strong>
            {subtitle && (
              <span style={{ fontSize:11, color: COLORS.textTertiary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>
                · {subtitle}
              </span>
            )}
            {cfg && (
              <span style={{
                fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:999,
                background: cfg.pillBg, color: cfg.pillFg, flexShrink:0,
              }}>{lead.status}</span>
            )}
            {(lead.tags || []).length > 0 && (
              <span style={{ fontSize:10, padding:'1px 7px', borderRadius:999, background: COLORS.surfaceMuted, color: COLORS.textSecondary, flexShrink:0 }}>
                {(lead.tags || []).length === 1 ? lead.tags[0] : `${lead.tags.length} Tags`}
              </span>
            )}
          </div>
        ) : (
          // Comfortable: zweizeilig + Inline-Edit auf job_title/company (Subtitle).
          <>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, minWidth:0 }}>
              <strong style={{ fontSize:14, color: COLORS.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0 }}>{fullName}</strong>
              {onUpdate ? (
                <span data-no-row-click
                  onClick={(e) => e.stopPropagation()}
                  style={{ display:'inline-flex', alignItems:'baseline', gap:6, fontSize:12, color: COLORS.textTertiary, minWidth:0, overflow:'hidden' }}>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <InlineEditField
                    value={lead.job_title}
                    placeholder="Position"
                    emptyLabel="+ Position"
                    onSave={(v) => handleUpdate('job_title', (v && v.trim()) || null)}
                    style={{ fontSize:12, color: COLORS.textTertiary }}
                  />
                  <span style={{ opacity: 0.5 }}>·</span>
                  <InlineEditField
                    value={lead.company}
                    placeholder="Firma"
                    emptyLabel="+ Firma"
                    onSave={(v) => handleUpdate('company', (v && v.trim()) || null)}
                    style={{ fontSize:12, color: COLORS.textTertiary }}
                  />
                </span>
              ) : subtitle ? (
                <span style={{ fontSize:12, color: COLORS.textTertiary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  · {subtitle}
                </span>
              ) : null}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
              {/* Sprint C · Mini-Path-Stepper ersetzt im Comfortable-Mode die
                  Status-Pill (visuell stärker, zeigt Progression statt nur
                  aktuellen Stage). Compact-Mode behält die Pill. */}
              <LeadStatusMiniPath status={lead.status} />
              {cfg && (
                <span style={{
                  fontSize:10, fontWeight:600, color: cfg.pillFg, letterSpacing:'0.02em',
                }}>{lead.status}</span>
              )}
              {(lead.tags || []).slice(0, 3).map(t => (
                <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background: COLORS.surfaceMuted, color: COLORS.textSecondary }}>{t}</span>
              ))}
              {(lead.tags || []).length > 3 && (
                <span style={{ fontSize:10, color: COLORS.textTertiary }}>+{(lead.tags || []).length - 3}</span>
              )}
            </div>
          </>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: isCompact ? 8 : 12 }}>
        {isCompact ? (
          // Compact: Score read-only (pre-existing-Bug-Fix: lead.score → lead.lead_score)
          <strong style={{ fontSize:13, color: COLORS.textPrimary, fontVariantNumeric:'tabular-nums', minWidth:24, textAlign:'right' }}>
            {lead.lead_score ?? 0}
          </strong>
        ) : (
          // Comfortable: Score inline-editierbar (pre-existing-Bug-Fix: lead.score → lead.lead_score)
          <div data-no-row-click onClick={(e) => e.stopPropagation()}
            style={{ textAlign:'right', minWidth:55 }}>
            <div style={{ fontSize:10, color: COLORS.textTertiary }}>Score</div>
            {onUpdate ? (
              <InlineEditField
                value={lead.lead_score}
                type="number"
                placeholder="0"
                emptyLabel="—"
                onSave={(v) => handleUpdate('lead_score', (v === '' || v == null) ? null : Math.max(0, Math.min(100, parseInt(v, 10) || 0)))}
                style={{ fontSize:14, color: COLORS.textPrimary, fontVariantNumeric:'tabular-nums', fontWeight:700 }}
              />
            ) : (
              <strong style={{ fontSize:14, color: COLORS.textPrimary, fontVariantNumeric:'tabular-nums' }}>
                {lead.lead_score ?? 0}
              </strong>
            )}
          </div>
        )}
        <div data-no-row-click
          onClick={(e) => { e.stopPropagation(); onOwnerAdd(lead.id, e.currentTarget); }}
          style={{
            width:28, height:28, borderRadius:'50%',
            border:`1px dashed ${COLORS.borderHover}`, color: COLORS.textTertiary,
            display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
          }} title="Owner zuweisen">
          <Plus size={14} />
        </div>
        <button data-no-row-click type="button"
          onClick={(e) => { e.stopPropagation(); onMenuClick(lead.id, e.currentTarget); }}
          style={{
            width:28, height:28, borderRadius: RADIUS.sm, border:'none', background:'transparent',
            color: COLORS.textTertiary, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center',
          }} aria-label="Aktionen">
          <MoreHorizontal size={16} />
        </button>
      </div>
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
        {icon}{label}
        {onClear && (
          <span
            role="button" tabIndex={-1}
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

// ─── PopoverMenu ─────────────────────────────────────────────────────────
function PopoverMenu({ options, selectedId, selectedIds, onSelect, onToggle, multi }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', maxHeight:280, overflow:'auto' }}>
      {options.map(opt => {
        const selected = multi ? (selectedIds || []).includes(opt.id) : selectedId === opt.id;
        const disabled = opt.disabled;
        return (
          <button key={String(opt.id)} type="button" disabled={disabled}
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

// ─── ActionsMenu (3-Punkt) ───────────────────────────────────────────────
function ActionsMenu({ leadId, anchorRect, lead, onClose, onStatusChange, onOpenDetail, onRefresh }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
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
    minWidth: 200, background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 1000, padding: 4,
  };
  const itemStyle = {
    display:'flex', alignItems:'center', gap:8, padding:'8px 10px', fontSize:13,
    textAlign:'left', background:'transparent', color: COLORS.textPrimary,
    border:'none', borderRadius: RADIUS.sm, cursor:'pointer', width:'100%',
  };
  const handleArchive = async () => {
    const { error } = await supabase.from('leads')
      .update({ archived: true, updated_at: new Date().toISOString() }).eq('id', leadId);
    if (error) console.error('Archive failed:', error);
    onRefresh?.(); onClose();
  };
  return (
    <div ref={ref} style={style}>
      <button type="button" style={itemStyle} onClick={() => onOpenDetail(leadId)}>Details öffnen</button>
      <div style={{ height:4 }} />
      <div style={{ padding:'4px 10px', fontSize:10, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.08em' }}>Status setzen</div>
      {STATUS_ORDER.map(s => (
        <button key={s} type="button"
          style={{ ...itemStyle, background: lead?.status === s ? COLORS.surfaceMuted : 'transparent' }}
          onClick={() => { onStatusChange(leadId, s); onClose(); }}>
          <span style={{ width:14, display:'inline-flex' }}>{lead?.status === s && <Check size={14} />}</span>
          {s} · {STATUS_CONFIG[s]?.sublabel || ''}
        </button>
      ))}
      <div style={{ height:4, borderTop:`0.5px solid ${COLORS.borderSubtle}`, marginTop:4 }} />
      <button type="button" style={{ ...itemStyle, color:'#B91C1C' }} onClick={handleArchive}>
        <Archive size={14} /> Archivieren
      </button>
    </div>
  );
}

// ─── OwnerPicker-Popover ─────────────────────────────────────────────────
function OwnerPickerPopover({ anchorRect, teamMembers, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
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
    left: anchorRect ? Math.max(8, anchorRect.left - 100) : 0,
    minWidth: 260, background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 1000, padding: 4,
  };
  return (
    <div ref={ref} style={style}>
      <div style={{ padding:'8px 10px', fontSize:10, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        Owner zuweisen
      </div>
      {teamMembers.length === 0 && (
        <div style={{ padding:'8px 10px', fontSize:13, color: COLORS.textTertiary }}>
          Keine Team-Mitglieder
        </div>
      )}
      {teamMembers.map(m => (
        <button key={m.id} type="button"
          onClick={() => onPick(m.id)}
          style={{
            width:'100%', display:'flex', alignItems:'center', gap:9,
            padding:'8px 10px', background:'transparent', border:'none',
            borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
          }}>
          <div style={{
            width:24, height:24, borderRadius:'50%', background: COLORS.surfaceMuted,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize:10, fontWeight:600, color: COLORS.textPrimary,
          }}>
            {(m.first_name || '?')[0]}{(m.last_name || '')[0] || ''}
          </div>
          <span style={{ fontSize:13, color: COLORS.textPrimary }}>
            {`${m.first_name || ''} ${m.last_name || ''}`.trim() || '—'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── StagePicker-Popover ─────────────────────────────────────────────────
function StagePickerPopover({ anchorRect, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
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
    left: anchorRect ? Math.max(8, anchorRect.left) : 0,
    minWidth: 220, background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 1000, padding: 4,
  };
  return (
    <div ref={ref} style={style}>
      <div style={{ padding:'8px 10px', fontSize:10, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        Stage setzen für Auswahl
      </div>
      {STATUS_ORDER.map(s => (
        <button key={s} type="button"
          onClick={() => onPick(s)}
          style={{
            width:'100%', display:'flex', alignItems:'center', gap:9,
            padding:'8px 10px', background:'transparent', border:'none',
            borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
          }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: STATUS_CONFIG[s]?.dot || '#64748B' }} />
          <span style={{ fontSize:13, color: COLORS.textPrimary }}>
            {s} · {STATUS_CONFIG[s]?.sublabel || ''}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── ListPicker-Popover ──────────────────────────────────────────────────
function ListPickerPopover({ anchorRect, lists, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
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
    left: anchorRect ? Math.max(8, anchorRect.left) : 0,
    minWidth: 220, background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 1000, padding: 4,
  };
  return (
    <div ref={ref} style={style}>
      <div style={{ padding:'8px 10px', fontSize:10, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        Zu Liste hinzufügen
      </div>
      {lists.length === 0 && (
        <div style={{ padding:'8px 10px', fontSize:13, color: COLORS.textTertiary }}>
          Noch keine Listen — erst eine anlegen
        </div>
      )}
      {lists.map(lst => (
        <button key={lst.id} type="button"
          onClick={() => onPick(lst.id)}
          style={{
            width:'100%', display:'flex', alignItems:'center', gap:9,
            padding:'8px 10px', background:'transparent', border:'none',
            borderRadius: RADIUS.sm, cursor:'pointer', textAlign:'left',
          }}>
          <Folder size={14} color={lst.color || '#64748B'} />
          <span style={{ fontSize:13, color: COLORS.textPrimary, flex:1 }}>{lst.name}</span>
        </button>
      ))}
    </div>
  );
}

// ─── NewLeadModal (mit Team) ─────────────────────────────────────────────
function NewLeadModalWithTeam({ onClose, onSaved }) {
  const { activeTeamId } = useTeam() || {};
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data?.session?.user?.id || null));
  }, []);
  return <NewLeadModal onClose={onClose} onSaved={onSaved} activeTeamId={activeTeamId} userId={userId} />;
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
      first_name: first, last_name: last,
      name: [first, last].filter(Boolean).join(' ') || null,
      email: (form.email || '').trim() || null,
      company: (form.company || '').trim() || null,
      job_title: (form.job_title || '').trim() || null,
      linkedin_url: (form.linkedin_url || '').trim() || null,
      status: form.status || 'Lead', user_id: userId,
      ...(activeTeamId ? { team_id: activeTeamId } : {}),
    };
    const { error } = await supabase.from('leads').insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved?.();
  };
  return (
    <ModalShell title="Neuer Lead" onClose={onClose} footer={
      <>
        <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" style={primaryBtnStyle} onClick={submit} disabled={busy}>
          {busy ? 'Speichere…' : 'Lead anlegen'}
        </button>
      </>
    }>
      <Row2>
        <Field label="Vorname"><Input value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} autoFocus /></Field>
        <Field label="Nachname"><Input value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} /></Field>
      </Row2>
      <Field label="E-Mail"><Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></Field>
      <Row2>
        <Field label="Unternehmen"><Input value={form.company || ''} onChange={e => set('company', e.target.value)} /></Field>
        <Field label="Position"><Input value={form.job_title || ''} onChange={e => set('job_title', e.target.value)} /></Field>
      </Row2>
      <Field label="LinkedIn-URL"><Input value={form.linkedin_url || ''} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
      <Field label="Status">
        <select style={inputBaseStyle} value={form.status} onChange={e => set('status', e.target.value)}>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{s} · {STATUS_CONFIG[s]?.sublabel || ''}</option>
          ))}
        </select>
      </Field>
      {err && <div style={{ color:'#B91C1C', fontSize:12 }}>{err}</div>}
    </ModalShell>
  );
}

// ─── NewListModal ────────────────────────────────────────────────────────
const LIST_COLORS = ['#185FA5', '#DC2626', '#D97706', '#059669', '#7C3AED', '#0EA5E9'];
function NewListModal({ activeTeamId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(LIST_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (!name.trim()) { setErr('Name erforderlich.'); return; }
    if (!activeTeamId) { setErr('Kein aktives Team.'); return; }
    setBusy(true); setErr(null);
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    const { error } = await supabase.from('lead_lists').insert({
      name: name.trim(), color, team_id: activeTeamId, user_id: userId,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved?.();
  };
  return (
    <ModalShell title="Neue Liste" onClose={onClose} footer={
      <>
        <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" style={primaryBtnStyle} onClick={submit} disabled={busy}>
          {busy ? 'Speichere…' : 'Anlegen'}
        </button>
      </>
    }>
      <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="z.B. Q2-Kampagne" /></Field>
      <Field label="Farbe">
        <div style={{ display:'flex', gap:8 }}>
          {LIST_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{
                width:28, height:28, borderRadius:'50%', background:c, border:'none', cursor:'pointer',
                outline: color === c ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                outlineOffset: 2,
              }} aria-label={c} />
          ))}
        </div>
      </Field>
      {err && <div style={{ color:'#B91C1C', fontSize:12 }}>{err}</div>}
    </ModalShell>
  );
}

// ─── ImportCsvModal ──────────────────────────────────────────────────────
function ImportCsvModal({ activeTeamId, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { headers, rows, mapping }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [stats, setStats] = useState(null);

  const handleFile = async (f) => {
    setErr(null); setFile(f);
    const text = await f.text();
    const parsed = parseCsv(text);
    if (!parsed.headers.length) { setErr('CSV ist leer oder kann nicht gelesen werden.'); return; }
    // Mapping vorschlagen
    const guess = (h) => {
      const k = h.toLowerCase().trim();
      if (/(first|vorname)/.test(k)) return 'first_name';
      if (/(last|nachname|surname)/.test(k)) return 'last_name';
      if (/e-?mail/.test(k)) return 'email';
      if (/phone|tel/.test(k)) return 'phone';
      if (/company|firma|unternehmen|account/.test(k)) return 'company';
      if (/position|title|rolle/.test(k)) return 'job_title';
      if (/linkedin/.test(k)) return 'linkedin_url';
      if (/status/.test(k)) return 'status';
      if (/score/.test(k)) return 'score';
      if (/location|ort|stadt/.test(k)) return 'location';
      if (/tag/.test(k)) return 'tags';
      return '';
    };
    const mapping = {};
    parsed.headers.forEach(h => { const g = guess(h); if (g) mapping[h] = g; });
    setPreview({ ...parsed, mapping });
  };

  const submit = async () => {
    if (!preview || !activeTeamId) return;
    setBusy(true); setErr(null);
    const { data: sessRes } = await supabase.auth.getSession();
    const userId = sessRes?.session?.user?.id;
    if (!userId) { setBusy(false); setErr('Kein angemeldeter Nutzer.'); return; }
    const rows = preview.rows.map(r => {
      const obj = { user_id: userId, team_id: activeTeamId, status: 'Lead' };
      preview.headers.forEach((h, i) => {
        const target = preview.mapping[h];
        if (!target) return;
        const val = r[i];
        if (target === 'score') obj[target] = parseInt(val, 10) || 0;
        else if (target === 'tags') obj[target] = val ? val.split(/[;|]/).map(s => s.trim()).filter(Boolean) : [];
        else obj[target] = val || null;
      });
      const first = (obj.first_name || '').trim();
      const last  = (obj.last_name || '').trim();
      obj.name = [first, last].filter(Boolean).join(' ') || null;
      return obj;
    });
    // Batch in 50er chunks
    let inserted = 0; let failed = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error } = await supabase.from('leads').insert(chunk);
      if (error) { failed += chunk.length; console.error('Import chunk failed:', error.message); }
      else inserted += chunk.length;
    }
    setBusy(false);
    setStats({ inserted, failed });
    if (failed === 0) {
      setTimeout(() => { onImported?.(); }, 800);
    }
  };

  const FIELDS = [
    { id:'', label:'— ignorieren —' },
    { id:'first_name', label:'Vorname' },
    { id:'last_name',  label:'Nachname' },
    { id:'email', label:'E-Mail' },
    { id:'phone', label:'Telefon' },
    { id:'company', label:'Unternehmen' },
    { id:'job_title', label:'Position' },
    { id:'linkedin_url', label:'LinkedIn-URL' },
    { id:'location', label:'Ort' },
    { id:'status', label:'Status' },
    { id:'score', label:'Score' },
    { id:'tags', label:'Tags (; oder | getrennt)' },
  ];

  return (
    <ModalShell title="CSV importieren" onClose={onClose} width={620} footer={
      <>
        <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" style={primaryBtnStyle} onClick={submit} disabled={busy || !preview}>
          {busy ? 'Importiere…' : preview ? `${preview.rows.length} Leads importieren` : 'Datei wählen'}
        </button>
      </>
    }>
      <Field label="CSV-Datei">
        <input type="file" accept=".csv,text/csv"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          style={{ fontSize: 13 }} />
      </Field>
      {preview && (
        <>
          <div style={{ fontSize:12, color: COLORS.textSecondary, padding:'4px 0' }}>
            {preview.rows.length} Datenzeilen erkannt. Spalten zuordnen:
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {preview.headers.map(h => (
              <div key={h} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <span style={{ fontSize:11, color: COLORS.textTertiary }}>{h}</span>
                <select
                  style={inputBaseStyle}
                  value={preview.mapping[h] || ''}
                  onChange={e => setPreview(p => ({ ...p, mapping: { ...p.mapping, [h]: e.target.value } }))}
                >
                  {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
      {err && <div style={{ color:'#B91C1C', fontSize:12 }}>{err}</div>}
      {stats && (
        <div style={{ padding:'8px 10px', background: stats.failed > 0 ? '#FEF3C7' : '#D1FAE5', borderRadius: RADIUS.md, fontSize:13 }}>
          {stats.inserted} erfolgreich importiert{stats.failed > 0 ? `, ${stats.failed} fehlgeschlagen` : ''}.
        </div>
      )}
    </ModalShell>
  );
}

// CSV-Parser — RFC4180 light. Behandelt Quotes, embedded commas, newlines.
function parseCsv(text) {
  // Normalize line endings
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = []; let cur = ''; let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  // Erste nicht-leere Row als Header
  const nonEmpty = rows.filter(r => r.some(c => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = nonEmpty;
  return { headers: headers.map(h => h.trim()), rows: dataRows };
}

// ─── Modal-Primitives ────────────────────────────────────────────────────
const inputBaseStyle = {
  height:36, padding:'0 10px', fontSize:13, border:`0.5px solid ${COLORS.borderSubtle}`,
  borderRadius: RADIUS.md, background: COLORS.surface, outline:'none', color: COLORS.textPrimary,
  width:'100%', boxSizing:'border-box',
};
function ModalShell({ title, onClose, children, footer, width = 480 }) {
  const overlay = { position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
  const modal = { background: COLORS.surface, borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' };
  const header = { padding:'18px 22px', borderBottom:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', justifyContent:'space-between', alignItems:'center' };
  const body = { padding:'18px 22px', display:'grid', gap:12 };
  const footerSt = { padding:'14px 22px', borderTop:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', justifyContent:'flex-end', gap:8 };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize:16, fontWeight:600, color: COLORS.textPrimary }}>{title}</div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary }} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div style={body}>{children}</div>
        {footer && <div style={footerSt}>{footer}</div>}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ display:'grid', gap:6 }}>
      <span style={{ fontSize:11, fontWeight:600, color: COLORS.textSecondary, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {label}
      </span>
      {children}
    </div>
  );
}
function Row2({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>{children}</div>;
}
function Input(props) {
  return <input {...props} style={{ ...inputBaseStyle, ...(props.style || {}) }} />;
}
