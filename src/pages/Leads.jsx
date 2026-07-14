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

import PillSelect from '../components/PillSelect'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  List, LayoutGrid, Plus, Search, Bell, Filter, Tag, User,
  ArrowDownUp, X, Check, Flame, Briefcase, Star, Clock, AlertTriangle,
  Inbox, Users as UsersIcon, FolderPlus, Folder, Download, Upload,
  CheckSquare, Square, Archive, Trash2, MoreHorizontal,
  Rows3, Rows2, FileUp, Puzzle, Pencil, ChevronUp, ChevronDown,
  Loader2,
} from 'lucide-react';
import { IcLinkedin } from '../components/leads/IcLinkedin';
import { EXTENSION_WEBSTORE_URL } from '../lib/leadeskExtension';
import { LeadsList } from '../components/leads/LeadsList';
import { LeadsBoard } from '../components/leads/LeadsBoard';
import { LeadViewsTabs } from '../components/leads/LeadViewsTabs';
import { InlineEditField } from '../components/leads/InlineEditField';
import { TagEditor } from '../components/leads/TagEditor';
import { LeadStatusMiniPath } from '../components/leads/LeadStatusMiniPath';
import { BulkEditModal } from '../components/leads/BulkEditModal';
import OrganizationPicker from '../components/OrganizationPicker';
import PageHeader from '../components/PageHeader';
import { tagColor } from '../lib/tagColors';
import { useTagRegistry } from '../hooks/useTagRegistry';
import { useResponsive } from '../hooks/useResponsive';
import { TagManagerModal } from '../components/leads/TagManagerModal';
import { COLORS, RADIUS, STATUS_ORDER, STATUS_CONFIG } from '../lib/leadStyleTokens';
import { useLeads } from '../hooks/useLeads';
import { useLeadViews } from '../hooks/useLeadViews';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

// ─── Styles ──────────────────────────────────────────────────────────────
// Visual aligned mit Deals/Organisationen (siehe pages/Deals.jsx).
const PRIMARY = '#0A6FB0';

const pageOuterStyle = { background: 'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 16px 60px' };
const pageStyle = { width:'100%', maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column' };

// ── Reports-Stil Diagramm-Komponenten (gespiegelt aus Vernetzungen.jsx) ──
const RC = { surface:'var(--surface, #fff)', border:'#E4E7EC', text1:'var(--text-strong, #111827)', text2:'#374151', text3:'#6B7280' };
const fmtNum = new Intl.NumberFormat('de-DE');

function Panel({ title, action, children }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:16, padding:'18px 20px', marginBottom:16, boxShadow:'var(--shadow-card)' }}>
      {title && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:RC.text1, margin:0 }}>{title}</h3>{action}
        </div>
      )}
      {children}
    </div>
  );
}

function BarRow({ label, count, total, color=PRIMARY }) {
  const pct = total > 0 ? Math.round((count/total)*100) : 0;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <span style={{ fontSize:13, color:RC.text2, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:12, color:RC.text3, fontVariantNumeric:'tabular-nums' }}><strong style={{ color:RC.text1 }}>{fmtNum.format(count)}</strong>{total>0 && <> · {pct}%</>}</span>
      </div>
      <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, transition:'width 0.3s' }}/>
      </div>
    </div>
  );
}

function EmptyBars({ text }) {
  return <div style={{ fontSize:12, color:RC.text3, padding:'8px 0' }}>{text}</div>;
}

// Handgezeichneter Hinweis-Pfeil + Schreibschrift-Label (gespiegelt aus ContentStudio.jsx)
const scriptHintStyle = { fontFamily:'Inter, sans-serif', fontSize:13, fontWeight:600, color:'var(--wl-primary, #0A6FB0)', whiteSpace:'nowrap', lineHeight:1 };
function CurvedArrow() {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" fill="none" style={{ color:'var(--wl-primary, #0A6FB0)', flexShrink:0 }} aria-hidden="true">
      <path d="M3 5 C 14 3, 25 7, 30 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M23 14.5 L 31 15 L 27 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
const headerRowStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 };
const titleStyle = { fontSize:22, fontWeight:800, margin:0, color:'#111827' };
const subtitleStyle = { fontSize:13, color:'#6B7280', marginTop:4 };
const searchWrapStyle = { position:'relative' };
const searchInputStyle = { width:200, padding:'7px 12px 7px 32px', fontSize:13, border:'1.5px solid #E4E7EC', borderRadius:10, background:'var(--surface)', outline:'none' };
const searchIconStyle = { position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' };
const iconBtnStyle = { width:34, height:34, border:'1.5px solid #E4E7EC', background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280', cursor:'pointer' };
const primaryBtnStyle = { padding:'9px 18px', background: 'var(--primary)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const ghostBtnStyle = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const kpisRowStyle = { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 };
const filtersBarStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:16 };
const toolGroupStyle = { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' };
const toggleGroupStyle = { display:'inline-flex', background:'#F3F4F6', borderRadius:10, padding:3 };
const toggleBtnStyle = { height:30, padding:'0 14px', fontSize:13, background:'transparent', border:'none', color:'#6B7280', display:'flex', alignItems:'center', gap:6, borderRadius:8, cursor:'pointer', fontWeight:600 };
const toggleBtnActiveStyle = { ...toggleBtnStyle, background:'var(--surface)', color:'#111827', boxShadow:'0 1px 2px rgba(0,0,0,0.05)' };
const filterChipStyle = { padding:'7px 12px', fontSize:12, border:'1.5px solid #E4E7EC', borderRadius:20, background:'var(--surface)', color:'#374151', display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer', fontWeight:600 };
const filterChipActiveStyle = { ...filterChipStyle, background: 'var(--primary)', color:'#fff', borderColor: PRIMARY };
const contentStyle = { display:'flex', flexDirection:'column', gap:0 };
const dividerStyle = { width:1, height:20, background:'#E4E7EC', margin:'0 4px' };

const VIEWS = [
  { id:'list',     label:'Liste',    Icon: List },
  { id:'board',    label:'Board',    Icon: LayoutGrid },
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
  { id:'hot',            label:'Hot Kontakte',      Icon: Flame,          predicate: l => (l.lead_score || 0) >= 70,                                           color:'#DC2626' },
  { id:'pipeline',       label:'In Pipeline',       Icon: Briefcase,      predicate: l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage),    color:'#185FA5' },
  { id:'favorite',       label:'Favoriten',         Icon: Star,           predicate: l => !!l.is_favorite,                                                      color:'#D97706' },
  { id:'followup_today', label:'Follow-up heute',   Icon: Clock,          predicate: l => isToday(l.next_followup),                                            color:'#185FA5' },
  { id:'overdue',        label:'Überfällig',        Icon: AlertTriangle,  predicate: l => l.next_followup && isOverdue(l.next_followup),                       color:'#DC2626' },
  { id:'no_followup',    label:'Kein Follow-up',    Icon: Clock,          predicate: l => !l.next_followup,                                                     color:'#64748B' },
  { id:'team',           label:'Team-Kontakte',     Icon: UsersIcon,      predicate: l => l.is_shared === true,                                                color:'#059669' },
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
    l.status, l.deal_stage, l.lead_score, l.linkedin_url, l.location,
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
  const { isMobile } = useResponsive();
  const { activeTeamId } = useTeam() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = searchParams.get('archived') === '1';
  const { leads, isLoading, updateLeadStatus, refetch } = useLeads({ showArchived });
  // Tag-Registry: füllt den Farb-Cache (tagColor) + CRUD für den TagManager.
  const tagRegistry = useTagRegistry();
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

  // Pagination (Listen-View) — 25/50/100 pro Seite. pageSize persistiert in localStorage.
  const [pageSize, setPageSize] = useState(() => {
    try {
      const v = parseInt(window.localStorage?.getItem('leadesk_leads_pagesize'), 10);
      return [25, 50, 100].includes(v) ? v : 50;
    } catch { return 50; }
  });
  const [page, setPage] = useState(1);
  const changePageSize = (n) => {
    setPageSize(n);
    setPage(1);
    try { window.localStorage?.setItem('leadesk_leads_pagesize', String(n)); } catch { /* ignore */ }
  };

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
  const [tagPicker,     setTagPicker]     = useState(null); // { leadId, anchorRect }
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [bulkStagePicker, setBulkStagePicker] = useState(null);
  const [bulkListPicker,  setBulkListPicker]  = useState(null);
  const [bulkEditOpen,    setBulkEditOpen]    = useState(false);
  // F6 Bulk-Anreicherung
  const [enrichBusy,     setEnrichBusy]     = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(null); // { done, total }
  const [enrichResult,   setEnrichResult]   = useState(null); // { done, capped, rateLimited, skipped:[{name,reason}], failed:[{name,reason}] }
  const [enrichConfirm,  setEnrichConfirm]  = useState(null); // { candidates:[{id,name}], skipped, capped } — In-App-Bestätigung vor dem Feuern
  // Dashboard-Block (KPIs + Grafiken) ein-/ausblendbar — persistiert in localStorage
  const [showDash, setShowDash] = useState(() => { try { return localStorage.getItem('leadesk_leads_dashboard') !== '0'; } catch { return true; } });
  const toggleDash = () => setShowDash(v => { const n = !v; try { localStorage.setItem('leadesk_leads_dashboard', n ? '1' : '0'); } catch {} return n; });

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
  // 2-step Query (PostgREST-Embed `profile:profiles(...)` schlägt auf Hetzner
  // silent fehl — kein FK zwischen team_members.user_id und profiles. Pattern
  // analog useReportsData / useProfiles, siehe CLAUDE.md.
  const [teamMembers, setTeamMembers] = useState([]);
  useEffect(() => {
    if (!activeTeamId) { setTeamMembers([]); return; }
    let cancelled = false;
    (async () => {
      const { data: tmRows, error: tmErr } = await supabase
        .from('team_members')
        .select('user_id, role')
        .eq('team_id', activeTeamId);
      if (cancelled) return;
      if (tmErr) {
        console.warn('[Leads] team_members fetch error:', tmErr.message);
        setTeamMembers([]);
        return;
      }
      const userIds = [...new Set((tmRows || []).map(m => m.user_id).filter(Boolean))];
      if (userIds.length === 0) { setTeamMembers([]); return; }
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      if (cancelled) return;
      if (pErr) {
        console.warn('[Leads] team-member-profiles fetch error:', pErr.message);
        setTeamMembers([]);
        return;
      }
      // Profil-Shape kompatibel mit OwnerPicker:
      // expected { id, first_name, last_name, avatar_url }.
      // Hetzner-profiles hat nur full_name → into first_name/last_name splitten.
      const mapped = (profiles || []).map(p => {
        const parts = (p.full_name || '').trim().split(/\s+/);
        return {
          id: p.id,
          first_name: parts[0] || '',
          last_name: parts.slice(1).join(' ') || '',
          full_name: p.full_name || null,
          avatar_url: p.avatar_url || null,
        };
      });
      setTeamMembers(mapped);
    })();
    return () => { cancelled = true; };
  }, [activeTeamId]);

  // ─── Derived: alle Tags + alle Owner (für Dropdown-Options) ─────────
  const allTags = useMemo(() => {
    const s = new Set();
    leads.forEach(l => (l.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [leads]);

  // Owner-Filter-Quelle: aktive Team-Members (statt aggregiert aus
  // lead.owners[] — das alte M2M-Feld ist nicht im LEADS_SELECT und seit
  // dem Owner-Refactor auf leads.owner_id obsolet).
  const allOwners = useMemo(() => teamMembers, [teamMembers]);
  // Owner-Lookup für die Row-Anzeige (Kürzel statt "+", wenn owner_id gesetzt).
  const ownerById = useMemo(() => {
    const m = new Map();
    (teamMembers || []).forEach(o => m.set(o.id, o));
    return m;
  }, [teamMembers]);

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
      // owner_id ist seit dem Single-Owner-Refactor die kanonische Spalte;
      // das alte M2M-Array lead.owners[] ist obsolet.
      res = res.filter(l => l.owner_id === ownerFilter);
    }

    if (sortBy === 'score_desc')   res = [...res].sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
    if (sortBy === 'score_asc')    res = [...res].sort((a, b) => (a.lead_score || 0) - (b.lead_score || 0));
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

  // Pagination: zurück auf Seite 1, wenn sich Filter/Suche/Sortierung ändern.
  useEffect(() => {
    setPage(1);
  }, [search, quickFilter, stageTab, listFilter, tagsFilter, ownerFilter, sortBy, showArchived]);

  // ─── Handlers ───────────────────────────────────────────────────────
  // Click navigiert direkt auf die Detail-Page (Drawer entfernt).
  const handleLeadClick = useCallback(id => navigate(`/leads/${id}`), [navigate]);

  const handleOwnerAdd = useCallback((leadId, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.();
    setOwnerPicker({ leadIds: [leadId], anchorRect: rect });
  }, []);

  const handleMenuClick = useCallback((leadId, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.();
    setActionsMenu({ leadId, anchorRect: rect });
  }, []);

  const handleTagAdd = useCallback((leadId, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.();
    setTagPicker({ leadId, anchorRect: rect });
  }, []);

  // Tags (text[]) — single-lead, .eq() + Bundle ist safe (kein Enum/CHECK,
  // Top-Fallstrick #1 betrifft nur .in()-Bulk). Popover bleibt offen, refetch
  // liefert die frischen tags zurück in die TagEditor-Pills.
  const applyTags = async (leadId, nextTags) => {
    if (!leadId) return;
    const { error } = await supabase.from('leads')
      .update({ tags: Array.isArray(nextTags) ? nextTags : [], updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) { console.warn('[Leads] applyTags failed:', error.message); return; }
    refetch?.();
  };

  // Favorit-Toggle direkt aus der Liste (analog zum Stern auf der Detail-Page).
  // is_favorite ist boolean → single .eq()-Update mit updated_at ist safe
  // (Fallstrick #1 betrifft nur .in()-Bulk auf constrained Feldern).
  const toggleFavorite = async (leadId, next) => {
    if (!leadId) return;
    const { error } = await supabase.from('leads')
      .update({ is_favorite: next, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) { console.warn('[Leads] toggleFavorite failed:', error.message); return; }
    refetch?.();
  };

  // Tag überall löschen: aus allen Kontakten entfernen + ggf. Registry-Eintrag.
  const purgeTag = async (name, registryId) => {
    if (!name) return;
    const now = new Date().toISOString();
    const affected = leads.filter(l => Array.isArray(l.tags) && l.tags.includes(name));
    await Promise.all(affected.map(l =>
      supabase.from('leads')
        .update({ tags: l.tags.filter(t => t !== name), updated_at: now })
        .eq('id', l.id)
    ));
    if (registryId) await tagRegistry.deleteTag(registryId);
    refetch?.();
  };

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
    if (!confirm(`${selectedIds.size} Kontakte archivieren? (Lassen sich später wiederherstellen.)`)) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('leads')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { console.error('Bulk archive failed:', error); return; }
    refetch?.();
    clearSelection();
  };
  // Hard-Delete (Einzel + Bulk) via delete_leads-RPC. deleteModal steuert Confirm + Ergebnis.
  const [deleteModal, setDeleteModal] = useState(null); // { ids: uuid[] }
  const openDeleteSingle = useCallback((leadId) => setDeleteModal({ ids: [leadId] }), []);
  const openDeleteBulk = useCallback(() => {
    if (selectedIds.size === 0) return;
    setDeleteModal({ ids: Array.from(selectedIds) });
  }, [selectedIds]);
  const handleDeleteDone = useCallback((rows) => {
    // Gelöschte aus der Auswahl entfernen; blockierte (offener Deal) markiert lassen.
    const blockedIds = (rows || []).filter(r => r.status === 'blocked_open_deal').map(r => r.lead_id);
    setSelectedIds(new Set(blockedIds));
    refetch?.();
  }, [refetch]);
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

  // F6 · Bulk-Anreicherung — sequenziell (NICHT parallel) gegen unipile-enrich.
  // Nur Leads MIT linkedin_url, Dedup gegen bereits angereicherte (enriched_at),
  // Cap 25/Durchlauf, ~400ms Pause gegen Rate-Limit, Abbruch bei 429.
  const ENRICH_CAP = 25;
  // Prepare: Filter VOR dem Deckel, Skip-Gründe erfassen, dann In-App-Bestätigung
  // (statt window.confirm -> blockiert die Browser-Automation nicht).
  const bulkEnrich = useCallback(() => {
    if (selectedIds.size === 0 || enrichBusy) return;
    const selected = leads.filter(l => selectedIds.has(l.id));
    const leadName = (l) => l.name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Kontakt';

    const skipped = [];
    let candidates = [];
    for (const l of selected) {
      if (!l.linkedin_url) { skipped.push({ name: leadName(l), reason: 'keine LinkedIn-URL' }); continue; }
      if (l.enriched_at)   { skipped.push({ name: leadName(l), reason: 'bereits angereichert' }); continue; }
      candidates.push({ id: l.id, name: leadName(l) });
    }
    if (candidates.length === 0) {
      setEnrichResult({ done: 0, capped: 0, rateLimited: false, skipped, failed: [] });
      return;
    }
    let capped = 0;
    if (candidates.length > ENRICH_CAP) {  // Deckel NACH dem Filter
      capped = candidates.length - ENRICH_CAP;
      candidates = candidates.slice(0, ENRICH_CAP);
    }
    setEnrichConfirm({ candidates, skipped, capped });
  }, [selectedIds, leads, enrichBusy]);

  // Execute: sequenziell mit größerer Pause + einmaligem 429-Backoff-Retry.
  const runBulkEnrich = useCallback(async ({ candidates, skipped, capped }) => {
    setEnrichConfirm(null);
    setEnrichResult(null);
    setEnrichBusy(true);
    setEnrichProgress({ done: 0, total: candidates.length });
    const PAUSE_MS = 1000;    // größere Pause — LinkedIn limitiert Profilabrufe hart
    const BACKOFF_MS = 4000;  // einmaliger 429-Backoff-Retry vor Abbruch
    let done = 0, rateLimited = false;
    const failed = [];
    for (const l of candidates) {
      let attempt = 0, ok = false, reason = 'Fehler';
      while (attempt < 2 && !ok) {
        const { data, error } = await supabase.functions.invoke('unipile-enrich', { body: { lead_id: l.id } });
        if (error) {  // Fallstrick #12
          const status = error.context?.status;
          let body = null; try { body = await error.context?.json?.(); } catch { /* egal */ }
          if (status === 429 || body?.rate_limited) {
            if (attempt === 0) { await new Promise(r => setTimeout(r, BACKOFF_MS)); attempt++; continue; }
            rateLimited = true; reason = 'Rate-Limit'; break;
          }
          reason = body?.error
            || (status === 409 ? 'kein aktiver Unipile-Account'
              : status === 400 ? 'kein LinkedIn-Identifier ableitbar'
              : status === 403 ? 'Automatisierung-Addon nicht aktiv'
              : (error.message || 'Fehler'));
          break;
        }
        if (data?.error) { reason = data.error; break; }
        ok = true;
      }
      if (ok) done++;
      else failed.push({ name: l.name, reason });
      setEnrichProgress({ done: done + failed.length, total: candidates.length });
      if (rateLimited) break;
      await new Promise(r => setTimeout(r, PAUSE_MS));
    }
    setEnrichBusy(false);
    setEnrichProgress(null);
    await refetch?.();
    setEnrichResult({ done, capped, rateLimited, skipped, failed });
  }, [refetch]);

  // Sprint C/2 · Generic Bulk-Edit Apply-Handler
  // payload kommt aus BulkEditModal in einer von zwei Formen:
  //   { field: 'status'|'source'|'next_followup', value: any }   → per-Lead-Loop
  //   { field: 'tags', mode: 'add'|'remove', tag: string }       → per-Lead-Loop
  //
  // Per-Lead-Loop (statt bulk-.in()) für alle Pfade, weil .in() + CHECK-
  // constraint-Felder (insbesondere status) silent-failt (siehe Smoke C/2,
  // 2026-05-28). Latenz für N≤100 via Promise.all akzeptabel.
  const bulkEditApply = useCallback(async (payload) => {
    if (selectedIds.size === 0) return { error: new Error('Keine Auswahl') };
    const ids = Array.from(selectedIds);

    // ── Scalar-Path (status/source/next_followup) ───────────────────────
    if (payload.field === 'status' || payload.field === 'source' || payload.field === 'next_followup') {
      // Pro Lead ein separates UPDATE — vermeidet Top-Fallstrick #1 (silent
      // fail bei status/CHECK + .in() + bundle). status separat, andere
      // Felder mit updated_at gebundelt safe-via-.eq().
      const nowISO = new Date().toISOString();
      const results = await Promise.all(ids.map(id => {
        if (payload.field === 'status') {
          // status STRICT separat — kein updated_at-Bundle damit
          // Top-Fallstrick #1 garantiert nicht greift
          return supabase.from('leads')
            .update({ status: payload.value })
            .eq('id', id)
            .then(async (r) => {
              if (r.error) return r;
              // updated_at danach in einem zweiten, ENUM-freien Update
              return supabase.from('leads').update({ updated_at: nowISO }).eq('id', id);
            });
        }
        // source / next_followup: text/date, kein CHECK-constraint — bundle ok
        return supabase.from('leads')
          .update({ [payload.field]: payload.value, updated_at: nowISO })
          .eq('id', id);
      }));
      const firstError = results.find(r => r.error)?.error;
      if (firstError) return { error: firstError };
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
    // Single-Owner-Pattern (siehe assignOwner) — leads.owner_id direkt setzen.
    const { error } = await supabase.from('leads')
      .update({ owner_id: userId, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { console.warn('[Leads] bulkAssignOwner failed:', error.message); return; }
    refetch?.();
    setOwnerPicker(null);
    clearSelection();
  };

  // Single-lead owner assignment
  const assignOwner = async (leadIds, userId) => {
    if (!leadIds || leadIds.length === 0 || !userId) return;
    // Single-Owner-Pattern: direkt leads.owner_id setzen (analog Drawer-
    // Picker via useLead.updateLead). Vorheriges lead_owners-M2M-Upsert
    // war obsolet — die Tabelle wird vom Render-Layer nicht mehr gelesen.
    const { error } = await supabase.from('leads')
      .update({ owner_id: userId, updated_at: new Date().toISOString() })
      .in('id', leadIds);
    if (error) { console.warn('[Leads] assignOwner failed:', error.message); return; }
    refetch?.();
    setOwnerPicker(null);
    clearSelection?.();
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
  const hotCount = leads.filter(l => (l.lead_score || 0) >= 70).length;
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
    { label:'Gesamt Kontakte', value: leads.length,        color: PRIMARY,    bg:'rgba(10,111,176,0.06)', qf:'all',            Icon: UsersIcon },
    { label:'Hot Kontakte',    value: hotCount,            color:'#DC2626',   bg:'#FEF2F2',              qf:'hot',            Icon: Flame },
    { label:'Follow-up heute', value: followupTodayCount,  color:'#003060',   bg:'#F5F3FF',              qf:'followup_today', Icon: Clock },
    { label:'Überfällig',      value: overdueCount,        color:'#D97706',   bg:'#FFFBEB',              qf:'overdue',        Icon: AlertTriangle },
  ];

  // ── Diagramm-Daten (Reports-Stil) — Verteilungen über den Lead-Pool ──
  // Stage-Verteilung (CRM-Status, in definierter Reihenfolge)
  const stageDist = STATUS_ORDER
    .map(s => ({ label: `${s}${STATUS_CONFIG[s]?.sublabel ? ' · ' + STATUS_CONFIG[s].sublabel : ''}`, count: stageCounts[s] || 0, color: STATUS_CONFIG[s]?.dot || '#64748B' }))
    .filter(s => s.count > 0);
  // Quellen-Verteilung (Top-Quellen nach Anzahl)
  const sourceDist = Object.entries(
    leads.reduce((acc, l) => { const k = (l.source || '').trim() || 'Unbekannt'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
  ).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 7);
  // Score-Verteilung (Hot ≥70 / Warm 40–69 / Cold <40)
  const scoreDist = [
    { label:'Hot · ≥ 70',   count: leads.filter(l => (l.lead_score || 0) >= 70).length,                          color:'#DC2626' },
    { label:'Warm · 40–69', count: leads.filter(l => (l.lead_score || 0) >= 40 && (l.lead_score || 0) < 70).length, color:'#D97706' },
    { label:'Cold · < 40',  count: leads.filter(l => (l.lead_score || 0) < 40).length,                           color:'#185FA5' },
  ].filter(s => s.count > 0);

  // Pagination (nur Listen-View) — Page-Slice über die gefilterte/sortierte Liste.
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const pageStartIdx = (pageClamped - 1) * pageSize;
  const pagedLeads = view === 'list'
    ? filteredLeads.slice(pageStartIdx, pageStartIdx + pageSize)
    : filteredLeads;
  const showPagination = view === 'list' && filteredLeads.length > 25;

  const subtitleText = [
    `${filteredLeads.length} von ${leads.length} sichtbar`,
    quickFilter && quickFilter !== 'all' ? QUICK_FILTERS.find(q => q.id === quickFilter)?.label : null,
    stageTab || null,
    listFilter && lists.find(l => l.id === listFilter) ? `Liste: ${lists.find(l => l.id === listFilter).name}` : null,
  ].filter(Boolean).join(' · ');

  const headerAction = (
    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>
      <div style={{ display:'inline-flex', alignItems:'center', gap:7, pointerEvents:'none' }} aria-hidden="true">
        <span style={scriptHintStyle}>Auf und zuklappen</span>
        <CurvedArrow/>
      </div>
      <button type="button" onClick={toggleDash}
        title={showDash ? 'Dashboard ausblenden' : 'Dashboard einblenden'}
        className="lk-btn lk-btn-ghost" style={{ height:34 }}>
        {showDash ? <ChevronUp size={15}/> : <ChevronDown size={15}/>} Dashboard
      </button>
      <div style={searchWrapStyle}>
        <Search size={14} style={searchIconStyle} />
        <input type="text" style={{ ...searchInputStyle, width: 240 }}
          placeholder="Name, E-Mail, Firma, Tags…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <button type="button" style={iconBtnStyle} aria-label="Benachrichtigungen">
        <Bell size={16} />
      </button>
      <button type="button" className="lk-btn lk-btn-cta" onClick={() => setNewLeadOpen(true)}>
        <Plus size={16} /> Neuer Kontakt
      </button>
    </div>
  );

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="CRM · Kontakte"
          title="Kontakte"
          subtitle={subtitleText}
          action={headerAction}
        />

        {showDash && (<>
        {/* KPI-Karten (Reports-Stil) — jede Card setzt den passenden Quick-Filter */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:16 }}>
          {kpis.map(k => {
            const isActive = quickFilter === k.qf && k.qf !== 'all';
            const isAllActive = k.qf === 'all' && quickFilter === 'all' && !stageTab && !listFilter;
            const highlight = isActive || isAllActive;
            const Icon = k.Icon;
            return (
              <button key={k.label} type="button"
                onClick={() => setQuickFilterAndResetStage(k.qf)}
                style={{
                  background: RC.surface, borderRadius:16, padding:'14px 16px',
                  border: `1px solid ${highlight ? k.color : RC.border}`,
                  boxShadow: highlight ? `0 0 0 3px ${k.color}1a` : 'var(--shadow-card)',
                  textAlign:'left', cursor:'pointer', transition:'box-shadow 0.15s, border-color 0.15s',
                  font:'inherit', display:'flex', flexDirection:'column', gap:4,
                }}
                aria-pressed={highlight}
                title={k.qf === 'all' ? 'Alle Filter zurücksetzen' : `Filter: ${k.label}`}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, fontWeight:700, color: k.color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</span>
                  {Icon && <Icon size={14} color={k.color} />}
                </div>
                <div style={{ fontSize:22, fontWeight:800, color: RC.text1, fontVariantNumeric:'tabular-nums' }}>{k.value}</div>
              </button>
            );
          })}
        </div>

        {/* Diagramme (Reports-Stil) — Stage breit + Score daneben, Quellen darunter */}
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:14 }}>
          <Panel title="Verteilung nach Stage">
            {stageDist.length > 0
              ? stageDist.map(s => <BarRow key={s.label} label={s.label} count={s.count} total={leads.length} color={s.color}/>)
              : <EmptyBars text="Noch keine Kontakte mit Stage."/>}
          </Panel>
          <Panel title="Score-Verteilung">
            {scoreDist.length > 0
              ? scoreDist.map(s => <BarRow key={s.label} label={s.label} count={s.count} total={leads.length} color={s.color}/>)
              : <EmptyBars text="Noch keine Score-Daten."/>}
          </Panel>
        </div>
        <Panel title="Verteilung nach Quelle">
          {sourceDist.length > 0
            ? sourceDist.map(s => <BarRow key={s.label} label={s.label} count={s.count} total={leads.length} color="#0C447C"/>)
            : <EmptyBars text="Keine Quellen erfasst."/>}
        </Panel>
        </>)}

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
                  title="Kompakt · mehr Kontakte pro Seite">
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
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (showArchived) next.delete('archived'); else next.set('archived', '1');
                setSearchParams(next, { replace: true });
              }}
              style={showArchived ? filterChipActiveStyle : filterChipStyle}
              title={showArchived ? 'Aktive Kontakte zeigen' : 'Archivierte Kontakte zeigen'}
            >
              <Archive size={14} /> {showArchived ? 'Archivierte (an)' : 'Archivierte'}
            </button>
          </div>

          <div style={toolGroupStyle}>
            <FilterPopover
              label={activeTagsLabel}
              icon={<Tag size={14} />}
              isActive={tagsFilter.length > 0}
              onClear={tagsFilter.length > 0 ? () => setTagsFilter([]) : undefined}
              renderContent={(close) => (
                <div>
                  <PopoverMenu
                    multi
                    options={allTags.length === 0
                      ? [{ id:'__empty', label:'Keine Tags vorhanden', disabled:true }]
                      : allTags.map(t => { const c = tagColor(t); return { id:t, label:t, pill:{ bg:c.bg, fg:c.fg } }; })}
                    selectedIds={tagsFilter}
                    onToggle={(id) => setTagsFilter(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                  />
                  <button type="button"
                    onClick={() => { setTagManagerOpen(true); close?.(); }}
                    style={{
                      display:'flex', alignItems:'center', gap:6, width:'100%',
                      marginTop:4, padding:'8px 10px', fontSize:12.5, fontWeight:500,
                      color: COLORS.primary, background:'transparent', cursor:'pointer',
                      border:'none', borderTop:`1px solid ${COLORS.borderSubtle}`, borderRadius:0,
                    }}>
                    <Tag size={13} /> Tags verwalten & Farben…
                  </button>
                </div>
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
              className="lk-btn lk-btn-ghost"
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
            onDelete={openDeleteBulk}
            onExport={bulkExportCsv}
            onClear={clearSelection}
            onEnrich={bulkEnrich}
            enrichBusy={enrichBusy}
            enrichProgress={enrichProgress}
          />
        )}

        {/* F6 · Inline-Ergebnis der Bulk-Anreicherung (ersetzt den blockierenden alert) */}
        {enrichResult && (
          <div style={{ margin:'0 0 12px', padding:'12px 16px', borderRadius:10, border:`0.5px solid ${COLORS.borderSubtle}`, background: COLORS.surface, fontSize:13, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <IcLinkedin size={16} />
              <strong>Anreicherung abgeschlossen</strong>
              <span style={{ color:'#15803D' }}>{enrichResult.done} angereichert</span>
              {enrichResult.skipped.length > 0 && <span style={{ color: COLORS.textTertiary }}>· {enrichResult.skipped.length} übersprungen</span>}
              {enrichResult.failed.length > 0 && <span style={{ color:'#B91C1C' }}>· {enrichResult.failed.length} fehlgeschlagen</span>}
              <div style={{ flex:1 }} />
              <button type="button" onClick={() => setEnrichResult(null)} style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary, padding:2 }} aria-label="Schließen"><X size={16} /></button>
            </div>
            {enrichResult.rateLimited && (
              <div style={{ color:'#B45309', background:'#FFFBEB', border:'0.5px solid #FDE68A', borderRadius:8, padding:'6px 10px' }}>
                LinkedIn-Rate-Limit erreicht — Durchlauf gestoppt. Rest bitte später erneut anreichern.
              </div>
            )}
            {enrichResult.capped > 0 && (
              <div style={{ color: COLORS.textTertiary }}>{enrichResult.capped} weitere über dem Deckel ({ENRICH_CAP}/Durchlauf) — erneut auswählen für den nächsten Durchlauf.</div>
            )}
            {enrichResult.failed.length > 0 && (
              <div>
                <div style={{ fontWeight:600, marginBottom:2 }}>Fehlgeschlagen:</div>
                {enrichResult.failed.slice(0, 12).map((f, i) => (
                  <div key={i} style={{ color: COLORS.textSecondary }}>· {f.name} — {f.reason}</div>
                ))}
                {enrichResult.failed.length > 12 && <div style={{ color: COLORS.textTertiary }}>… und {enrichResult.failed.length - 12} weitere</div>}
              </div>
            )}
            {enrichResult.skipped.length > 0 && (() => {
              const noUrl = enrichResult.skipped.filter(s => s.reason === 'keine LinkedIn-URL').length;
              const already = enrichResult.skipped.filter(s => s.reason === 'bereits angereichert').length;
              return <div style={{ color: COLORS.textTertiary }}>Übersprungen: {noUrl} ohne LinkedIn-URL, {already} bereits angereichert.</div>;
            })()}
          </div>
        )}

        {/* F6 · In-App-Bestätigung vor der Bulk-Anreicherung (ersetzt window.confirm — automatisierbar) */}
        {enrichConfirm && (
          <div onClick={() => setEnrichConfirm(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: COLORS.surface, borderRadius:12, padding:'20px 22px', width:'min(420px, 92vw)', boxShadow:'0 8px 30px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <IcLinkedin size={18} />
                <strong style={{ fontSize:15 }}>Kontakte anreichern</strong>
              </div>
              <div style={{ fontSize:13, color: COLORS.textSecondary, lineHeight:1.5 }}>
                <strong>{enrichConfirm.candidates.length}</strong> Kontakt(e) werden mit LinkedIn-Daten angereichert.
                {enrichConfirm.skipped.length > 0 && <> {enrichConfirm.skipped.length} übersprungen (ohne URL / bereits angereichert).</>}
                {enrichConfirm.capped > 0 && <> {enrichConfirm.capped} weitere über dem Deckel ({ENRICH_CAP}/Durchlauf).</>}
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                <button type="button" onClick={() => setEnrichConfirm(null)} className="lk-btn lk-btn-ghost">Abbrechen</button>
                <button type="button" onClick={() => runBulkEnrich(enrichConfirm)} className="lk-btn lk-btn-cta">
                  <IcLinkedin size={14} /> Anreichern
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div style={contentStyle}>
          {isLoading ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>Lade Kontakte…</div>
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
              <div style={{ fontWeight:600, marginBottom:4, color:'#111827' }}>Keine Kontakte passen zum aktuellen Filter</div>
              <div style={{ fontSize:13, marginBottom:16 }}>
                {leads.length} Kontakt{leads.length === 1 ? '' : 'e'} insgesamt — derzeit ausgeblendet.
              </div>
              <button type="button" className="lk-btn lk-btn-ghost"
                onClick={() => { setSearch(''); setQuickFilter('all'); setStageTab(null); setListFilter(null); setTagsFilter([]); setOwnerFilter(null); }}>
                <X size={14} /> Filter zurücksetzen
              </button>
            </div>
          ) : view === 'list' ? (
            <>
              <SelectableLeadsList
                leads={pagedLeads}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelected}
                onMarqueeSelect={setSelectedIds}
                onLeadClick={handleLeadClick}
                onOwnerAdd={handleOwnerAdd}
                onTagAdd={handleTagAdd}
                onMenuClick={handleMenuClick}
                onToggleFavorite={toggleFavorite}
                ownerById={ownerById}
                density={density}
                /* onUpdate bewusst weggelassen (2026-05-29): Lead-Karten sind
                   read-only, Bearbeiten nur in Detail-Page + Drawer. Die
                   SelectableLeadRow-Branches haben read-only-Fallbacks.
                   onToggleFavorite ist eine gezielte Ausnahme (nur is_favorite). */
              />
              {showPagination && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginTop:18, paddingTop:14, borderTop:`1px solid ${COLORS.borderSubtle}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:12, color: COLORS.textTertiary }}>Pro Seite:</span>
                    {[25, 50, 100].map(n => (
                      <button key={n} type="button" onClick={() => changePageSize(n)}
                        style={{
                          padding:'5px 11px', borderRadius:8, fontSize:12, fontWeight: pageSize===n ? 700 : 500,
                          cursor:'pointer',
                          border:`1.5px solid ${pageSize===n ? PRIMARY : '#E4E7EC'}`,
                          background: pageSize===n ? 'var(--primary)' : 'var(--surface)',
                          color: pageSize===n ? '#fff' : COLORS.textSecondary,
                        }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:12, color: COLORS.textTertiary, fontVariantNumeric:'tabular-nums' }}>
                      {pageStartIdx + 1}–{Math.min(pageStartIdx + pageSize, filteredLeads.length)} von {filteredLeads.length}
                    </span>
                    <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageClamped <= 1}
                      className="lk-btn lk-btn-ghost" style={{ padding:'6px 12px', opacity: pageClamped <= 1 ? 0.45 : 1, cursor: pageClamped <= 1 ? 'default' : 'pointer' }}>
                      Zurück
                    </button>
                    <span style={{ fontSize:12, color: COLORS.textSecondary, fontVariantNumeric:'tabular-nums' }}>Seite {pageClamped} / {totalPages}</span>
                    <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageClamped >= totalPages}
                      className="lk-btn lk-btn-ghost" style={{ padding:'6px 12px', opacity: pageClamped >= totalPages ? 0.45 : 1, cursor: pageClamped >= totalPages ? 'default' : 'pointer' }}>
                      Weiter
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <LeadsBoard
              leads={filteredLeads}
              onLeadClick={handleLeadClick}
              onLeadStatusChange={handleStatusChange}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </div>
      </div>

      {/* ─── Modals + Overlays ─────────────────────────────────────── */}
      {newLeadOpen && (
        <NewLeadModalWithTeam onClose={() => setNewLeadOpen(false)}
          teamMembers={teamMembers}
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
          onDelete={openDeleteSingle}
        />
      )}
      {deleteModal && (
        <DeleteLeadsModal
          ids={deleteModal.ids}
          leads={leads}
          onClose={() => setDeleteModal(null)}
          onDone={handleDeleteDone}
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
      {tagPicker && (
        <TagPickerPopover
          anchorRect={tagPicker.anchorRect}
          lead={leads.find(l => l.id === tagPicker.leadId)}
          suggestions={allTags}
          onApply={(next) => applyTags(tagPicker.leadId, next)}
          onClose={() => setTagPicker(null)}
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

      {tagManagerOpen && (
        <TagManagerModal
          onClose={() => { setTagManagerOpen(false); refetch?.(); }}
          tags={tagRegistry.tags}
          usedTags={allTags}
          isLoading={tagRegistry.isLoading}
          createTag={tagRegistry.createTag}
          updateTag={tagRegistry.updateTag}
          deleteTag={tagRegistry.deleteTag}
          onPurge={purgeTag}
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
          <div style={iconWrap('#EAF6FC', PRIMARY)}><FileUp size={20} /></div>
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
// ─── Hard-Delete: Schwelle für "LÖSCHEN"-Tippen (Bulk) ───────────────────
const BULK_DELETE_TYPE_THRESHOLD = 5;
const BULK_DELETE_CONFIRM_WORD = 'LÖSCHEN';

// ─── useMarquee — Gummiband-Auswahl über die div-Row-Liste ───────────────
// Ergänzt die bestehende Auswahl (Snapshot bei mousedown). Ignoriert Klicks auf Buttons/Links/Inputs +
// [data-no-row-click]/[data-no-marquee]. Unterdrückt Text-Select während des Ziehens. Scroll-aware
// (getBoundingClientRect in Viewport-Koordinaten). Erst ab 5px Bewegung = Drag → normaler Klick bleibt Klick.
// Der Klick direkt nach dem Drag wird geschluckt (sonst öffnet sich die Detail-Ansicht).
function useMarquee(containerRef, selectedIds, onSelect) {
  const selRef = useRef(selectedIds);
  useEffect(() => { selRef.current = selectedIds; }, [selectedIds]);
  const [rect, setRect] = useState(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isInteractive = (el) => {
      let n = el;
      while (n && n !== container) {
        const t = n.tagName;
        if (t === 'BUTTON' || t === 'A' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' ||
            n.getAttribute?.('role') === 'button' ||
            n.dataset?.noMarquee != null || n.dataset?.noRowClick != null) return true;
        n = n.parentElement;
      }
      return false;
    };
    const onMouseDown = (e) => {
      if (e.button !== 0 || isInteractive(e.target)) return;
      const x0 = e.clientX, y0 = e.clientY;
      const base = new Set(selRef.current);
      let active = false;
      const onMove = (ev) => {
        if (!active) {
          if (Math.abs(ev.clientX - x0) < 5 && Math.abs(ev.clientY - y0) < 5) return;
          active = true;
          document.body.style.userSelect = 'none';
        }
        const minX = Math.min(x0, ev.clientX), maxX = Math.max(x0, ev.clientX);
        const minY = Math.min(y0, ev.clientY), maxY = Math.max(y0, ev.clientY);
        setRect({ minX, minY, maxX, maxY });
        const hit = new Set(base);
        container.querySelectorAll('[data-lead-id]').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.left < maxX && b.right > minX && b.top < maxY && b.bottom > minY) hit.add(el.getAttribute('data-lead-id'));
        });
        onSelect(hit);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        setRect(null);
        if (active) {
          const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); container.removeEventListener('click', swallow, true); };
          container.addEventListener('click', swallow, true);
          setTimeout(() => container.removeEventListener('click', swallow, true), 300);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    container.addEventListener('mousedown', onMouseDown);
    return () => container.removeEventListener('mousedown', onMouseDown);
  }, [containerRef, onSelect]);
  return rect;
}

// ─── DeleteLeadsModal — Hard-Delete-Bestätigung (Einzel + Bulk) + Ergebnis ───
function DeleteLeadsModal({ ids, leads, onClose, onDone }) {
  const isBulk = ids.length >= BULK_DELETE_TYPE_THRESHOLD;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const nameOf = (id) => {
    const l = leads.find((x) => x.id === id);
    if (!l) return 'Kontakt';
    return `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.company || 'Kontakt';
  };
  const canConfirm = !busy && (!isBulk || typed === BULK_DELETE_CONFIRM_WORD);
  const doDelete = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('delete_leads', { p_lead_ids: ids });
    setBusy(false);
    if (error) { setResult({ deleted: 0, blocked: [], errors: ids.length, fatal: error.message }); return; }
    const rows = data || [];
    const deleted = rows.filter((r) => r.status === 'deleted').length;
    const blocked = rows.filter((r) => r.status === 'blocked_open_deal')
      .map((r) => ({ id: r.lead_id, name: nameOf(r.lead_id), count: r.open_deal_count }));
    const errors = rows.filter((r) => r.status === 'error' || r.status === 'not_found').length;
    setResult({ deleted, blocked, errors });
    onDone?.(rows);
  };
  const overlay = { position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 };
  const card = { background: COLORS.surface, borderRadius:16, width:460, maxWidth:'95vw', padding:24, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' };
  const btn = { height:36, padding:'0 16px', borderRadius: RADIUS.md, fontSize:13, fontWeight:600, cursor:'pointer', border:'none' };
  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={card}>
        {!result ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <Trash2 size={20} color="#B91C1C" />
              <strong style={{ fontSize:16, color: COLORS.textPrimary }}>
                {ids.length === 1 ? 'Kontakt endgültig löschen?' : `${ids.length} Kontakte endgültig löschen?`}
              </strong>
            </div>
            <p style={{ fontSize:13, color: COLORS.textSecondary, lineHeight:1.6, margin:'0 0 16px' }}>
              Wird auch aus der <b>LinkedIn-Inbox</b> entfernt (Aufgaben, Aktivitäten und Notizen inklusive).
              LinkedIn-Nachrichten und Projekte bleiben erhalten. <b>Nicht umkehrbar.</b>{' '}
              Kontakte mit einem offenen Deal werden übersprungen (Deal zuerst schließen).
            </p>
            {isBulk && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color: COLORS.textSecondary, display:'block', marginBottom:6 }}>
                  Zum Bestätigen <b>{BULK_DELETE_CONFIRM_WORD}</b> tippen:
                </label>
                <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={BULK_DELETE_CONFIRM_WORD}
                  style={{ width:'100%', height:36, padding:'0 12px', borderRadius: RADIUS.md, border:`1px solid ${COLORS.borderSubtle}`, fontSize:14, boxSizing:'border-box' }} />
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button type="button" style={{ ...btn, background: COLORS.surfaceMuted, color: COLORS.textPrimary }} onClick={onClose} disabled={busy}>Abbrechen</button>
              <button type="button" onClick={doDelete} disabled={!canConfirm}
                style={{ ...btn, background: canConfirm ? '#DC2626' : '#FCA5A5', color:'#fff', cursor: canConfirm ? 'pointer' : 'not-allowed' }}>
                {busy ? 'Lösche…' : (ids.length === 1 ? 'Löschen' : `${ids.length} löschen`)}
              </button>
            </div>
          </>
        ) : (
          <>
            <strong style={{ fontSize:16, color: COLORS.textPrimary, display:'block', marginBottom:12 }}>Ergebnis</strong>
            {result.fatal ? (
              <p style={{ fontSize:13, color:'#B91C1C', margin:'0 0 16px' }}>Fehler: {result.fatal}</p>
            ) : (
              <p style={{ fontSize:13, color: COLORS.textSecondary, lineHeight:1.6, margin:'0 0 12px' }}>
                <b>{result.deleted}</b> gelöscht
                {result.blocked.length > 0 ? <>, <b>{result.blocked.length}</b> wegen offener Deals übersprungen</> : null}
                {result.errors > 0 ? `, ${result.errors} nicht möglich` : ''}.
              </p>
            )}
            {result.blocked.length > 0 && (
              <div style={{ marginBottom:16, maxHeight:180, overflowY:'auto', border:`0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md, padding:8 }}>
                {result.blocked.map((b) => (
                  <div key={b.id} style={{ fontSize:12, color: COLORS.textPrimary, padding:'4px 6px', display:'flex', justifyContent:'space-between', gap:8 }}>
                    <span>{b.name}</span>
                    <span style={{ color:'#B45309', whiteSpace:'nowrap' }}>{b.count} offene(r) Deal(s) — erst schließen</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button type="button" style={{ ...btn, background: COLORS.primary, color:'#fff' }} onClick={onClose}>Schließen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BulkBar ─────────────────────────────────────────────────────────────
function BulkBar({ count, onStage, onOwner, onList, onArchive, onExport, onEdit, onClear, onEnrich, enrichBusy, enrichProgress, onDelete }) {
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
      <button type="button" style={{ ...actionBtn, opacity: enrichBusy ? 0.6 : 1 }} onClick={onEnrich} disabled={enrichBusy}
        title="Ausgewählte Kontakte mit LinkedIn-Daten anreichern (max. 25 pro Durchlauf)">
        {enrichBusy
          ? <><Loader2 size={14} className="lk-spin" /> Reichere an{enrichProgress ? ` ${enrichProgress.done}/${enrichProgress.total}` : ''}…</>
          : <><IcLinkedin size={14} /> Anreichern</>}
      </button>
      <button type="button" style={actionBtn} onClick={onExport}><Download size={14} /> Export</button>
      <button type="button" style={{ ...actionBtn, color:'#B91C1C' }} onClick={onArchive}>
        <Archive size={14} /> Archivieren
      </button>
      <button type="button" style={{ ...actionBtn, color:'#DC2626', borderColor:'#FCA5A5' }} onClick={onDelete}>
        <Trash2 size={14} /> Löschen
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
function SelectableLeadsList({ leads, selectedIds, onToggleSelect, onMarqueeSelect, onLeadClick, onOwnerAdd, onTagAdd, onMenuClick, onUpdate, onToggleFavorite, ownerById, density = 'comfortable' }) {
  const containerRef = useRef(null);
  const marqueeRect = useMarquee(containerRef, selectedIds, onMarqueeSelect);
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
    <div ref={containerRef} style={{ position:'relative', userSelect: marqueeRect ? 'none' : undefined }}>
      {marqueeRect && (
        <div style={{ position:'fixed', left: marqueeRect.minX, top: marqueeRect.minY,
          width: marqueeRect.maxX - marqueeRect.minX, height: marqueeRect.maxY - marqueeRect.minY,
          background:'rgba(10,111,176,0.12)', border:`1px solid ${PRIMARY}`, borderRadius:4,
          pointerEvents:'none', zIndex:900 }} />
      )}
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
                ownerById={ownerById}
                onTagAdd={onTagAdd}
                onMenuClick={onMenuClick}
                onUpdate={onUpdate}
                onToggleFavorite={onToggleFavorite}
                density={density}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectableLeadRow({ lead, selected, onToggle, onLeadClick, onOwnerAdd, ownerById, onTagAdd, onMenuClick, onUpdate, onToggleFavorite, density = 'comfortable' }) {
  const { isMobile } = useResponsive();
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
    <div data-lead-id={lead.id} style={rowStyle} onClick={(e) => {
      if (e.target.closest('[data-no-row-click]')) return;
      onLeadClick(lead.id, lead);
    }}>
      <div data-no-row-click onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{ cursor:'pointer', display:'flex' }}>
        {selected ? <CheckSquare size={18} color={COLORS.primary} /> : <Square size={18} color={COLORS.textTertiary} />}
      </div>
      {onToggleFavorite && (
        <div data-no-row-click
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(lead.id, !lead.is_favorite); }}
          title={lead.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
          style={{ cursor:'pointer', display:'flex', flexShrink:0 }}>
          <Star size={isCompact ? 15 : 17} color={lead.is_favorite ? '#D97706' : '#CBD5E1'} fill={lead.is_favorite ? '#D97706' : 'none'} />
        </div>
      )}
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
              {(lead.tags || []).slice(0, 3).map(t => {
                const tc = tagColor(t);
                return (
                  <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background: tc.bg, color: tc.fg }}>{t}</span>
                );
              })}
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
          // Comfortable: Score read-only — wird per KI-Analyse (analyze-lead)
          // ermittelt, nicht mehr manuell editierbar.
          <div style={{ textAlign:'right', minWidth:55 }}>
            <div style={{ fontSize:10, color: COLORS.textTertiary }}>Score</div>
            <strong style={{ fontSize:14, color: COLORS.textPrimary, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>
              {lead.lead_score ?? 0}
            </strong>
          </div>
        )}
        {!isMobile && onTagAdd && (
          <div data-no-row-click
            onClick={(e) => { e.stopPropagation(); onTagAdd(lead.id, e.currentTarget); }}
            style={{
              width:28, height:28, borderRadius:'50%',
              border:`1px dashed ${COLORS.borderHover}`, color: COLORS.textTertiary,
              display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
            }} title="Tags bearbeiten">
            <Tag size={13} />
          </div>
        )}
        {!isMobile && (() => {
          const owner = lead.owner_id ? (ownerById?.get?.(lead.owner_id)) : null;
          const initials = owner
            ? `${(owner.first_name || '')[0] || ''}${(owner.last_name || '')[0] || ''}`.toUpperCase() || (owner.full_name || '?')[0]?.toUpperCase()
            : null;
          const ownerName = owner ? (owner.full_name || `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || 'Owner') : null;
          return (
            <div data-no-row-click
              onClick={(e) => { e.stopPropagation(); onOwnerAdd(lead.id, e.currentTarget); }}
              style={ owner ? {
                width:28, height:28, borderRadius:'50%',
                background:'#E0E7FF', color: COLORS.primary,
                display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                fontSize:11, fontWeight:600,
              } : {
                width:28, height:28, borderRadius:'50%',
                border:`1px dashed ${COLORS.borderHover}`, color: COLORS.textTertiary,
                display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
              }}
              title={ owner ? `Owner: ${ownerName}` : 'Owner zuweisen' }>
              {owner ? initials : <Plus size={14} />}
            </div>
          );
        })()}
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
            {opt.pill ? (
              <span style={{
                background: opt.pill.bg, color: opt.pill.fg,
                padding:'2px 9px', borderRadius:999, fontSize:12, fontWeight:500,
              }}>{opt.label}</span>
            ) : opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ActionsMenu (3-Punkt) ───────────────────────────────────────────────
function ActionsMenu({ leadId, anchorRect, lead, onClose, onStatusChange, onOpenDetail, onRefresh, onDelete }) {
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
      <button type="button" style={{ ...itemStyle, color:'#DC2626' }} onClick={() => { onClose(); onDelete?.(leadId); }}>
        <Trash2 size={14} /> Löschen
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

// ─── TagPicker-Popover ───────────────────────────────────────────────────
// Dünner Anchor-Container um den TagEditor — dieselbe Tag-UI wie im Drawer
// (Pills + "+Tag"-Freitext, freies Anlegen). onApply persistiert via applyTags
// im Parent; Popover bleibt offen, damit mehrere Tags nacheinander gehen.
function TagPickerPopover({ anchorRect, lead, suggestions, onApply, onClose }) {
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
    left: anchorRect ? Math.max(8, anchorRect.left - 180) : 0,
    width: 280, background: COLORS.surface,
    border: `0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md,
    boxShadow: '0 8px 32px rgba(15,23,42,0.12)', zIndex: 1000, padding: 12,
  };
  return (
    <div ref={ref} style={style}>
      <div style={{ padding:'0 0 8px', fontSize:10, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        Tags
      </div>
      <TagEditor tags={lead?.tags || []} onSave={onApply} suggestions={suggestions} />
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
function NewLeadModalWithTeam({ onClose, onSaved, teamMembers }) {
  const { activeTeamId } = useTeam() || {};
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data?.session?.user?.id || null));
  }, []);
  return <NewLeadModal onClose={onClose} onSaved={onSaved} activeTeamId={activeTeamId} userId={userId} teamMembers={teamMembers} />;
}
function NewLeadModal({ onClose, onSaved, activeTeamId, userId, teamMembers = [] }) {
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
      organization_id: form.organization_id || null,
      job_title: (form.job_title || '').trim() || null,
      linkedin_url: (form.linkedin_url || '').trim() || null,
      status: form.status || 'Lead', user_id: userId,
      // Owner: default = Ersteller, sofern nicht explizit geaendert.
      owner_id: form.owner_id === undefined ? (userId || null) : (form.owner_id || null),
      ...(activeTeamId ? { team_id: activeTeamId } : {}),
    };
    const { error } = await supabase.from('leads').insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved?.();
  };
  return (
    <ModalShell title="Neuer Kontakt" onClose={onClose} footer={
      <>
        <button type="button" className="lk-btn lk-btn-ghost" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" className="lk-btn lk-btn-cta" onClick={submit} disabled={busy}>
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
        <Field label="Unternehmen">
          {/* Autocomplete mit existing Orgs aus organizations-Tabelle plus
              '+ Neu anlegen'-Option. organization_id geht jetzt mit ins
              leads-Payload (FK seit Migration 20260528100900). */}
          <OrganizationPicker
            value={form.organization_id || null}
            valueName={form.company || ''}
            onChange={(orgId, orgName) => {
              setForm(f => ({ ...f, organization_id: orgId || null, company: orgName || '' }));
            }}
            placeholder="Unternehmen suchen oder + neu anlegen…"
          />
        </Field>
        <Field label="Position"><Input value={form.job_title || ''} onChange={e => set('job_title', e.target.value)} /></Field>
      </Row2>
      <Field label="LinkedIn-URL"><Input value={form.linkedin_url || ''} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
      <Row2>
        <Field label="Status">
          <PillSelect value={form.status} onChange={v => set('status', v)} neutral options={[...STATUS_ORDER.map((s) => ({ value: s, label: `${s} · ${STATUS_CONFIG[s]?.sublabel || ''}` }))]} buttonStyle={{ minWidth: 140 }} />
        </Field>
        <Field label="Owner">
          <PillSelect value={form.owner_id === undefined ? (userId || '') : (form.owner_id || '')} onChange={v => set('owner_id', v || null)} neutral options={[{ value: '', label: `— Kein Owner —` }, ...teamMembers.map((m) => ({ value: m.id, label: `
                ${`${m.first_name || ''} ${m.last_name || ''}`.trim() || (m.id ? m.id.slice(0, 8) : '—')}
                ${m.id === userId ? ' (du)' : ''}
              ` }))]} buttonStyle={{ minWidth: 140 }} />
        </Field>
      </Row2>
      {err && <div style={{ color:'#B91C1C', fontSize:12 }}>{err}</div>}
    </ModalShell>
  );
}

// ─── NewListModal ────────────────────────────────────────────────────────
const LIST_COLORS = ['#185FA5', '#DC2626', '#D97706', '#059669', '#003060', '#0EA5E9'];
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
        <button type="button" className="lk-btn lk-btn-ghost" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" className="lk-btn lk-btn-cta" onClick={submit} disabled={busy}>
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
        <button type="button" className="lk-btn lk-btn-ghost" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" className="lk-btn lk-btn-cta" onClick={submit} disabled={busy || !preview}>
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
                <PillSelect value={preview.mapping[h] || ''} onChange={v => setPreview(p => ({ ...p, mapping: { ...p.mapping, [h]: v } }))} neutral options={[...FIELDS.map((f) => ({ value: f.id, label: f.label }))]} buttonStyle={{ minWidth: 140 }} />
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
