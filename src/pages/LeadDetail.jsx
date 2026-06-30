// src/pages/LeadDetail.jsx
//
// Detail-Seite für einen einzelnen Lead.
// Tabs: Übersicht (existing) + Aktivitäten + Nachrichten + Notizen + Deals — alle
// vom „to be implemented"-Stub auf echte DB-Implementierungen umgestellt.
//
// Schema (existing):
//   activities    (id, lead_id, user_id, type, subject, body, direction, outcome, occurred_at)
//   contact_notes (id, lead_id, user_id, body, created_at)
//   deals         (id, title, value, currency, stage, lead_id, created_at, ...)

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, Users, Star, Sparkles, MoreHorizontal, Send, Mail, Phone, MapPin,
  Plus, Tag, Calendar, Target, Banknote, Workflow, Paperclip, Smile, CalendarCheck,
  TrendingUp, Link as LinkIcon, MessageSquare, FileText, Trash2, ExternalLink, Pencil,
  Building2, Brain, Globe, Link2, Link2Off, Clock, CheckCircle2, Archive, Copy,
  ChevronDown, Briefcase,
} from 'lucide-react';
import { LeadAvatar } from '../components/leads/LeadAvatar';
import { LeadStatusPill } from '../components/leads/LeadStatusPill';
import { IcLinkedin } from '../components/leads/IcLinkedin';
import { InlineEditField } from '../components/leads/InlineEditField';
import { TagEditor } from '../components/leads/TagEditor';
import MultiAssigneePicker from '../components/leads/MultiAssigneePicker';
import { OwnerPicker } from '../components/leads/OwnerPicker';
import { StatusPicker } from '../components/leads/StatusPicker';
import LeadAnalysisCard, { LeadAnalysisEmptyCard } from '../components/leads/LeadAnalysisCard';
import LeadEditModal from '../components/leads/LeadEditModal';
import { DealModal } from './Deals';
import { COLORS, RADIUS } from '../lib/leadStyleTokens';
import { getDisplayName, formatRelativeDate } from '../lib/leadHelpers';
import { useProfiles } from '../hooks/useProfiles';
import { useLead } from '../hooks/useLead';
import { useLeadActivities } from '../hooks/useLeadActivities';
import { useTeam } from '../context/TeamContext';
import { useResponsive } from '../hooks/useResponsive';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'activity', label: 'Aktivitäten', countKey: 'activity_count' },
  { id: 'messages', label: 'Nachrichten', countKey: 'message_count' },
  { id: 'notes', label: 'Notizen', countKey: 'note_count' },
  { id: 'tasks', label: 'Aufgaben', countKey: 'task_count' },
  { id: 'deals', label: 'Deals', countKey: 'deal_count' },
];

// ─── Styles ───────────────────────────────────────────────────────────────
const pageStyle = { display:'flex', flexDirection:'column', minHeight:'100vh', background: COLORS.surfaceCanvas, width:'100%', maxWidth:1100, margin:'0 auto' };
const breadcrumbBarStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 28px', background: COLORS.surface, borderBottom:`0.5px solid ${COLORS.borderSubtle}` };
const breadcrumbStyle = { display:'flex', alignItems:'center', gap:6, fontSize:13, color: COLORS.textSecondary };
const iconBtnStyle = { width:34, height:34, border:`0.5px solid ${COLORS.borderSubtle}`, background: COLORS.surface, borderRadius: RADIUS.md, display:'flex', alignItems:'center', justifyContent:'center', color: COLORS.textSecondary, cursor:'pointer' };
const heroStyle = { background: COLORS.surface, borderBottom:`0.5px solid ${COLORS.borderSubtle}`, padding:'20px 28px 18px' };
const heroFlexStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:0 };
const primaryBtnStyle = { height:34, padding:'0 14px', background: COLORS.primary, color: COLORS.primaryFg, border:'none', borderRadius: RADIUS.md, fontSize:13, fontWeight:500, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const secondaryBtnStyle = { ...primaryBtnStyle, background: COLORS.surface, color: COLORS.textPrimary, border:`0.5px solid ${COLORS.borderSubtle}`, fontWeight:400 };
const ghostBtnStyle = { ...secondaryBtnStyle, height:30, padding:'0 12px', fontSize:12 };
const menuItemStyle = { display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', background:'transparent', border:'none', borderRadius: RADIUS.sm, cursor:'pointer', fontSize:13, color: COLORS.textPrimary, textAlign:'left' };
const tabsRowStyle = { display:'flex', gap:28, fontSize:13 };
const tabStyle = { padding:'8px 0 12px', color: COLORS.textSecondary, cursor:'pointer', borderBottom:'2px solid transparent' };
const tabActiveStyle = { ...tabStyle, color: COLORS.textPrimary, fontWeight:500, borderBottom:`2px solid ${COLORS.primary}` };
const tabCountStyle = { fontSize:11, color: COLORS.textTertiary, marginLeft:4 };
const contentStyle = { flex:1, padding:'24px 28px', overflow:'auto' };
// 3-Spalten-Layout (HubSpot-Pattern): links Summary/Properties, Mitte Tabs/Timeline,
// rechts verknuepfte Datensaetze. Phase 1 — Responsive (<1100px stapeln) folgt in Phase 3.
const threeColStyle = { display:'grid', gridTemplateColumns:'250px minmax(0,1fr) 236px', gap:16, padding:'20px 28px 48px', alignItems:'start', flex:1, background: COLORS.surfaceCanvas };
const railColStyle = { display:'flex', flexDirection:'column', gap:14, minWidth:0 };
const centerColStyle = { display:'flex', flexDirection:'column', minWidth:0 };
const railCardStyle = { background: COLORS.surface, borderRadius: RADIUS.lg, border:`0.5px solid ${COLORS.borderSubtle}`, padding:'14px 16px' };
const railHeadStyle = { display:'flex', alignItems:'center', gap:6, marginBottom:10 };
const railTitleStyle = { fontSize:13, fontWeight:500, color: COLORS.textPrimary, flex:1 };
const propLabelStyle = { fontSize:11, color: COLORS.textTertiary, marginTop:12 };
const propValueStyle = { fontSize:13, color: COLORS.textPrimary, wordBreak:'break-word', marginTop:1 };
const cardStyle = { background: COLORS.surface, borderRadius: RADIUS.lg, border:`0.5px solid ${COLORS.borderSubtle}`, padding:'22px 24px', marginBottom:20 };
const sectionLabelStyle = { fontSize:11, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 };
const tagStyle = { background: COLORS.surfaceMuted, color: COLORS.textSecondary, fontSize:11, padding:'3px 10px', borderRadius:999, display:'inline-flex', alignItems:'center', gap:4 };
const metricsGridStyle = { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, padding:'16px 0', borderTop:`0.5px solid ${COLORS.borderSubtle}`, borderBottom:`0.5px solid ${COLORS.borderSubtle}`, marginBottom:18 };
const metricLabelStyle = { fontSize:11, color: COLORS.textTertiary, marginBottom:4, display:'flex', alignItems:'center', gap:4 };
const metricValueStyle = { fontSize:14, fontWeight:500, color: COLORS.textPrimary };
const contactGridStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 32px', marginBottom:20 };
const contactRowStyle = { display:'flex', alignItems:'center', gap:8, fontSize:13 };
const contactLabelStyle = { color: COLORS.textTertiary, minWidth:60 };
const ownersRowStyle = { display:'flex', alignItems:'center', gap:12, paddingTop:16, borderTop:`0.5px solid ${COLORS.borderSubtle}` };
const ownerCellStyle = { textAlign:'center' };
const ownerLabelStyle = { fontSize:10, color: COLORS.textTertiary, marginTop:4 };
const emptyOwnerCircleStyle = { width:36, height:36, borderRadius:'50%', border:`1.5px dashed ${COLORS.borderHover}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto', cursor:'pointer', background:'transparent' };

const dayDividerStyle = { display:'flex', alignItems:'center', gap:10, marginBottom:14, marginTop:8 };
const dayDividerLineStyle = { flex:1, height:'0.5px', background: COLORS.borderSubtle };
const dayDividerLabelStyle = { fontSize:11, color: COLORS.textTertiary, textTransform:'uppercase', letterSpacing:'0.04em' };

const activityItemStyle = { display:'flex', gap:12, paddingBottom:16, alignItems:'flex-start' };
const activityIconStyle = (bg, fg) => ({ width:32, height:32, borderRadius:'50%', background:bg, color:fg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 });
const activityTextStyle = { fontSize:13, color: COLORS.textPrimary, lineHeight:1.5 };
const activityMetaStyle = { fontSize:12, color: COLORS.textTertiary, marginTop:2 };
const quoteBlockStyle = { background: COLORS.surfaceMuted, borderRadius: RADIUS.md, padding:'10px 12px', marginTop:6, fontSize:12, color: COLORS.textSecondary, lineHeight:1.5 };

const inputStyle = { height:36, padding:'0 10px', fontSize:13, border:`0.5px solid ${COLORS.borderSubtle}`, borderRadius: RADIUS.md, background: COLORS.surface, outline:'none', color: COLORS.textPrimary, width:'100%', boxSizing:'border-box' };
const textareaStyle = { ...inputStyle, height:'auto', padding:'10px', resize:'vertical', minHeight:80, fontFamily:'inherit' };

// Activity-Type → Icon + Farben
const ACTIVITY_VARIANTS = {
  meeting:          { bg:'#EAF3DE', fg:'#3B6D11', Icon: CalendarCheck, label:'Meeting' },
  call:             { bg:'#FAEEDA', fg:'#854F0B', Icon: Phone,         label:'Anruf' },
  score:            { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,    label:'Score-Update' },
  email:            { bg:'#E6F1FB', fg:'#0C447C', Icon: Mail,          label:'E-Mail' },
  message:          { bg:'#EEEDFE', fg:'#3C3489', Icon: Send,          label:'Nachricht' },
  linkedin_message: { bg:'#E6F1FB', fg:'#0C447C', Icon: Send,          label:'LinkedIn-Nachricht' },
  linkedin_connection: { bg:'#E6F1FB', fg:'#0C447C', Icon: LinkIcon,   label:'LinkedIn-Verbindung' },
  connection:       { bg:'#E6F1FB', fg:'#0C447C', Icon: LinkIcon,      label:'Verbindung' },
  note:             { bg:'#F1F5F9', fg:'#475569', Icon: FileText,      label:'Notiz' },
  task:             { bg:'#FAECE7', fg:'#7C2D12', Icon: Target,        label:'Aufgabe' },
  // Sprint C unified-feed variants:
  field_changed_status:     { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,  label:'Status geändert' },
  field_changed_deal_stage: { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,  label:'Deal-Stage geändert' },
  field_changed_owner_id:   { bg:'#F1F5F9', fg:'#475569', Icon: Users,       label:'Owner gewechselt' },
  field_changed_lead_score: { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,  label:'Score geändert' },
  task_created:             { bg:'#FAECE7', fg:'#7C2D12', Icon: Target,      label:'Aufgabe erstellt' },
  task_completed:           { bg:'#EAF3DE', fg:'#3B6D11', Icon: CheckCircle2, label:'Aufgabe erledigt' },
  // Sprint C Phase 2 — vernetzungen integriert:
  connection_requested:     { bg:'#E6F1FB', fg:'#0C447C', Icon: Link2,       label:'Vernetzungsanfrage gesendet' },
  connection_responded:     { bg:'#DCFCE7', fg:'#166534', Icon: Link2,       label:'Vernetzung beantwortet' },
};
const MESSAGE_TYPES = new Set(['message', 'linkedin_message', 'email']);

function variantFor(type) {
  return ACTIVITY_VARIANTS[type] || { bg:'#F1F5F9', fg:'#475569', Icon: FileText, label: type || 'Aktivität' };
}

// Fetch profiles für eine Liste von user_ids — separat, weil PostgREST keine
// FK-Beziehung zwischen *.user_id und profiles.id kennt (Hetzner-Schema-Drift).
// Returns Map<userId, profile>.
async function fetchProfilesMap(userIds) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, full_name, email, avatar_url')
    .in('id', uniqueIds);
  return new Map((data || []).map(p => [p.id, p]));
}
function authorName(profile) {
  if (!profile) return null;
  return profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || null;
}

function groupByDay(items, dateField = 'occurred_at') {
  const out = [];
  let lastKey = null;
  for (const it of items) {
    const d = it[dateField] ? new Date(it[dateField]) : null;
    const key = d ? d.toDateString() : 'Ohne Datum';
    if (key !== lastKey) {
      out.push({ kind: 'divider', label: d ? d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) : 'Ohne Datum' });
      lastKey = key;
    }
    out.push({ kind: 'item', data: it });
  }
  return out;
}

// ─── Connection-Status Badge ──────────────────────────────────────────────
// LinkedIn-Vernetzungsstatus (li_connection_status: verbunden | pending |
// nicht_verbunden). Rendert als Pill neben dem Status-Picker im Hero.
const CONNECTION_STATUS_CFG = {
  verbunden:       { bg:'#DCFCE7', fg:'#166534', Icon: Link2,    label:'Vernetzt' },
  pending:         { bg:'#FEF3C7', fg:'#854F0B', Icon: Clock,    label:'Anfrage ausstehend' },
  nicht_verbunden: { bg:'#F1F5F9', fg:'#475569', Icon: Link2Off, label:'Nicht vernetzt' },
};
function ConnectionStatusBadge({ value }) {
  if (!value) return null;
  const cfg = CONNECTION_STATUS_CFG[value] || CONNECTION_STATUS_CFG.nicht_verbunden;
  const Icon = cfg.Icon;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px',
      fontSize:11, fontWeight:500, background: cfg.bg, color: cfg.fg, borderRadius: 999,
    }}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

// ─── Unternehmen-Block ────────────────────────────────────────────────────
// Industry + Company-Size + Website + Adresse aus den company_*-Spalten.
// Read-only in Sprint A — Inline-Edit kann später nachgezogen werden.
function CompanyInfoBlock({ industry, companySize, companyWebsite, companyAddress }) {
  const hasAny = industry || companySize || companyWebsite || companyAddress;
  if (!hasAny) return null;
  const normalizedSite = companyWebsite && /^https?:\/\//i.test(companyWebsite)
    ? companyWebsite
    : (companyWebsite ? `https://${companyWebsite}` : null);
  return (
    <div style={{
      paddingTop: 16, marginTop: 4, marginBottom: 18,
      borderTop: `0.5px solid ${COLORS.borderSubtle}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: 10, fontSize: 12, fontWeight: 500, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing:'0.04em' }}>
        <Building2 size={13} /> Unternehmen
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 32px' }}>
        {industry && (
          <div style={{ fontSize:13 }}>
            <span style={{ color: COLORS.textTertiary, marginRight:6 }}>Branche:</span>
            <span style={{ color: COLORS.textPrimary }}>{industry}</span>
          </div>
        )}
        {companySize && (
          <div style={{ fontSize:13 }}>
            <span style={{ color: COLORS.textTertiary, marginRight:6 }}>Größe:</span>
            <span style={{ color: COLORS.textPrimary }}>{companySize}</span>
          </div>
        )}
        {normalizedSite && (
          <div style={{ fontSize:13, display:'flex', alignItems:'center', gap:5 }}>
            <Globe size={13} color={COLORS.textTertiary} />
            <a href={normalizedSite} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--wl-primary, rgb(49,90,231))', textDecoration:'none' }}>
              {companyWebsite}
            </a>
          </div>
        )}
        {companyAddress && (
          <div style={{ fontSize:13, gridColumn: '1 / -1' }}>
            <span style={{ color: COLORS.textTertiary, marginRight:6 }}>Adresse:</span>
            <span style={{ color: COLORS.textPrimary }}>{companyAddress}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Letzte-Aktivität-Footer ──────────────────────────────────────────────
// Renders last_activity_at + last_action_at als kleiner Footer am Ende der
// Übersicht. Beide optional, beide null-tolerant.
function LastActivityFooter({ lastActivityAt, lastActionAt }) {
  if (!lastActivityAt && !lastActionAt) return null;
  return (
    <div style={{
      paddingTop: 14, marginTop: 4, borderTop: `0.5px solid ${COLORS.borderSubtle}`,
      display:'flex', gap:24, fontSize:12, color: COLORS.textTertiary, flexWrap:'wrap',
    }}>
      {lastActivityAt && (
        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
          <Clock size={12} /> Letzte Aktivität: <span style={{ color: COLORS.textSecondary }}>{formatRelativeDate(lastActivityAt)}</span>
        </span>
      )}
      {lastActionAt && lastActionAt !== lastActivityAt && (
        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
          <Calendar size={12} /> Letzte Aktion: <span style={{ color: COLORS.textSecondary }}>{formatRelativeDate(lastActionAt)}</span>
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function LeadDetail({ lead: leadProp }) {
  const params = useParams();
  const navigate = useNavigate();
  const { isSmall } = useResponsive(); // <1100px → Spalten stapeln
  const [activeTab, setActiveTab] = useState('activity');
  // Bump-Signal: Center-Tabs (Tasks/Deals) melden Mutationen, damit die rechte
  // RelatedRail live refetcht (statt manuellem Reload).
  const [railRefresh, setRailRefresh] = useState(0);
  const bumpRail = useCallback(() => setRailRefresh((k) => k + 1), []);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  // ─── Sparkles KI-Analyse (Backlog #4) ─────────────────────────────────
  // analyzeLoading: Button-Spinner während Edge-Function-Call.
  // analysisOverride: frisches Result aus Edge-Function (überschreibt
  //   lead.ai_last_analysis bis nächster fetchLead-Refresh).
  // analysisDismissed: per-Session Dismiss, persistiert nicht über Reload.
  const [analyzeLoading, setAnalyzeLoading]   = useState(false);
  const [analysisOverride, setAnalysisOverride] = useState(null);
  const [analysisDismissed, setAnalysisDismissed] = useState(false);
  // composerDraft: { channel, subject, body } — wird beim "Im Composer öffnen"-
  // Klick gesetzt + an MessagesTab via initialDraft-Prop weitergegeben.
  const [composerDraft, setComposerDraft] = useState(null);
  // Lead bearbeiten — zentrales Modal (Backlog 'Edit-Modal' 2026-05-26)
  const [editModalOpen, setEditModalOpen] = useState(false);

  const isMock = params.id === 'mock' || params.id === 'demo';
  const { lead: fetchedLead, isLoading, error, updateLead } = useLead(leadProp || isMock ? null : params.id);
  const lead = leadProp || (isMock ? MOCK_LEAD : fetchedLead);
  const { members } = useTeam() || {};

  const handleBack = useCallback(() => navigate('/leads'), [navigate]);
  const handleTabChange = useCallback((id) => setActiveTab(id), []);

  const ownerIds = useMemo(() => (lead?.owner_id ? [lead.owner_id] : []), [lead?.owner_id]);
  const { profilesById } = useProfiles(ownerIds);
  const owner = lead?.owner || (lead?.owner_id ? profilesById.get(lead.owner_id) : null) || null;

  // Mock-Mode: no-op updater, damit die Rails im Demo-Pfad nicht crashen.
  const safeUpdateLead = useCallback(async (patch) => {
    if (isMock || !updateLead) return { data: null };
    return updateLead(patch);
  }, [isMock, updateLead]);

  const toggleFavorite = useCallback(() => {
    if (!lead) return;
    safeUpdateLead({ is_favorite: !lead.is_favorite });
  }, [lead, safeUpdateLead]);

  const openLinkedIn = useCallback(() => {
    if (!lead?.linkedin_url) return;
    const url = /^https?:\/\//i.test(lead.linkedin_url)
      ? lead.linkedin_url
      : `https://${lead.linkedin_url}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [lead?.linkedin_url]);

  const pickStatus = useCallback(async (next) => {
    setStatusOpen(false);
    if (!lead || next === lead.status) return;
    // Top-Fallstrick #1: status separat updaten, NIE bundeln.
    await safeUpdateLead({ status: next });
  }, [lead, safeUpdateLead]);

  const pickOwner = useCallback(async (userId) => {
    setOwnerPickerOpen(false);
    if (!lead) return;
    if ((userId || null) === (lead.owner_id || null)) return;
    await safeUpdateLead({ owner_id: userId });
  }, [lead, safeUpdateLead]);

  // ─── Action-Menü-Handlers (Archivieren / Duplizieren / Löschen) ─────────
  // Confirm-Dialogs via window.confirm — schützt vor versehentlichem Klick.
  // Archive: soft-delete (archived=true), Lead bleibt in DB.
  // Duplicate: INSERT mit kopierten Werten (minus id/timestamps), Navigation
  //   zur neuen Detail-Page.
  // Delete: hard-delete via CASCADE — entfernt auch lead_tasks, activities,
  //   lead_field_history, vernetzungen-Verweise.
  const handleArchive = useCallback(async () => {
    setActionMenuOpen(false);
    if (!lead || isMock) return;
    if (!window.confirm('Lead archivieren? Er taucht in der Liste nicht mehr auf, bleibt aber in der Datenbank.')) return;
    const { error: err } = await supabase
      .from('leads').update({ archived: true, archived_at: new Date().toISOString() }).eq('id', lead.id);
    if (err) { window.alert('Fehler beim Archivieren: ' + err.message); return; }
    navigate('/leads');
  }, [lead, isMock, navigate]);

  // Restore: archived zurücksetzen, Lead bleibt auf der Detail-Page (optimistic
  // via safeUpdateLead — kein navigate, kein toter refetch).
  const handleRestore = useCallback(async () => {
    if (!lead || isMock) return;
    await safeUpdateLead({ archived: false, archived_at: null });
  }, [lead, isMock, safeUpdateLead]);

  const handleDuplicate = useCallback(async () => {
    setActionMenuOpen(false);
    if (!lead || isMock) return;
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (!userId) { window.alert('Nicht eingeloggt.'); return; }
    // Felder kopieren, aber id/timestamps/owner zurücksetzen
    const copy = { ...lead };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    delete copy.created_by;
    delete copy.updated_by;
    copy.user_id = userId;
    copy.name = `${lead.name || 'Lead'} (Kopie)`;
    copy.is_favorite = false;
    copy.archived = false;
    copy.archived_at = null;
    const { data, error: err } = await supabase
      .from('leads').insert(copy).select('id').single();
    if (err) { window.alert('Fehler beim Duplizieren: ' + err.message); return; }
    if (data?.id) navigate(`/leads/${data.id}`);
  }, [lead, isMock, navigate]);

  const handleDelete = useCallback(async () => {
    setActionMenuOpen(false);
    if (!lead || isMock) return;
    if (!window.confirm(`Lead "${getDisplayName(lead)}" endgültig löschen?\n\nAlle verknüpften Aufgaben, Aktivitäten, Notizen und History-Einträge werden mitgelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    const { error: err } = await supabase.from('leads').delete().eq('id', lead.id);
    if (err) { window.alert('Fehler beim Löschen: ' + err.message); return; }
    navigate('/leads');
  }, [lead, isMock, navigate]);

  // ─── Sparkles KI-Analyse (Backlog #4) ─────────────────────────────────────
  // Klick → Edge-Function `analyze-lead` → JSON-Result in
  // leads.ai_last_analysis persistiert + Override-State setzt es für die
  // aktuelle Session sofort sichtbar.
  // Rate-Limit: 1 Analyse / Lead / 24h. handleReanalyze setzt force=true.
  const runAnalyze = useCallback(async (force = false) => {
    if (!lead || isMock) return;
    setAnalyzeLoading(true);
    setAnalysisDismissed(false);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('analyze-lead', {
        body: { lead_id: lead.id, force },
      });
      if (invokeErr) throw invokeErr;
      if (data?.error) throw new Error(data.error);
      setAnalysisOverride(data);
    } catch (e) {
      window.alert('KI-Analyse fehlgeschlagen: ' + (e?.message || String(e)));
    } finally {
      setAnalyzeLoading(false);
    }
  }, [lead, isMock]);

  const handleAnalyze = useCallback(() => runAnalyze(false), [runAnalyze]);
  const handleReanalyze = useCallback(() => {
    // Confirm bei recent analysis (<24h) — User soll explizit force=true wählen
    const lastAt = analysisOverride?.generated_at || lead?.ai_last_analysis_at;
    if (lastAt) {
      const ageMin = Math.round((Date.now() - new Date(lastAt).getTime()) / 60000);
      if (ageMin < 24 * 60) {
        if (!window.confirm(`Letzte Analyse vor ${ageMin < 60 ? ageMin + ' Min' : Math.round(ageMin/60) + 'h'}. Erneut analysieren? (verbraucht Token-Budget)`)) return;
      }
    }
    runAnalyze(true);
  }, [runAnalyze, analysisOverride, lead]);

  // ─── Outreach-Draft an MessagesTab übergeben + auto-tab-switch ────────────
  const handleUseOutreach = useCallback((outreach) => {
    if (!outreach) return;
    setComposerDraft(outreach);
    setActiveTab('messages');
  }, []);

  // Card-Quelle: frisches Override > persisted ai_last_analysis. 24h-Cache
  // ist soft — Card bleibt sichtbar, "Neu"-Button rendert immer.
  const currentAnalysis = analysisOverride || (lead?.ai_last_analysis ?? null);
  const showAnalysisCard = !!currentAnalysis && !analysisDismissed;

  if (isLoading && !lead) return <DetailSkeleton onBack={handleBack} />;
  if (!lead) return <DetailNotFound error={error} onBack={handleBack} />;

  const displayName = getDisplayName(lead);
  const isFav = !!lead.is_favorite;

  return (
    <div style={pageStyle}>
      {/* Breadcrumb */}
      <div style={breadcrumbBarStyle}>
        <div style={breadcrumbStyle}>
          <Users size={15} />
          <span style={{ cursor:'pointer' }} onClick={handleBack}>Kontakte</span>
          <ChevronRight size={14} color={COLORS.textTertiary} />
          <span style={{ color: COLORS.textPrimary }}>{displayName}</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button
            type="button"
            onClick={toggleFavorite}
            style={{
              ...iconBtnStyle,
              ...(isFav ? { color: '#D97706', borderColor: '#D9770633' } : null),
            }}
            aria-label={isFav ? 'Favorit entfernen' : 'Als Favorit markieren'}
            title={isFav ? 'Favorit entfernen' : 'Als Favorit markieren'}
          >
            <Star size={16} fill={isFav ? '#D97706' : 'none'} />
          </button>
          {/* KI-Analyse (Backlog #4): klickt analyze-lead Edge Function, persistiert in
              leads.ai_last_analysis, rendert LeadAnalysisCard cross-Tab über contentStyle. */}
          <button type="button"
            onClick={handleAnalyze} disabled={analyzeLoading}
            style={{ ...iconBtnStyle, ...(analyzeLoading ? { opacity: 0.55, cursor: 'wait' } : null) }}
            aria-label={analyzeLoading ? 'KI-Analyse läuft…' : 'KI-Analyse starten'}
            title={analyzeLoading ? 'KI-Analyse läuft…' : 'KI-Analyse für diesen Lead'}>
            <Sparkles size={16} />
          </button>
          {/* Mehr-Menü (archivieren / duplizieren / löschen) */}
          <div style={{ position: 'relative' }}>
            <button type="button" style={iconBtnStyle}
              onClick={() => setActionMenuOpen(v => !v)}
              aria-label="Mehr Aktionen" title="Mehr Aktionen"
              aria-expanded={actionMenuOpen}>
              <MoreHorizontal size={16} />
            </button>
            {actionMenuOpen && (
              <>
                {/* Backdrop: outside-click schließt das Menü */}
                <div onClick={() => setActionMenuOpen(false)}
                  style={{ position:'fixed', inset:0, zIndex:50 }} />
                <div role="menu" style={{
                  position:'absolute', top:38, right:0, zIndex:51,
                  background: COLORS.surface, border:`0.5px solid ${COLORS.borderSubtle}`,
                  borderRadius: RADIUS.md, boxShadow:'0 8px 24px rgba(0,0,0,0.10)',
                  minWidth: 180, padding: 4,
                }}>
                  <button type="button" onClick={handleDuplicate} style={menuItemStyle}>
                    <Copy size={14} /> Duplizieren
                  </button>
                  <div style={{ height:1, background: COLORS.borderSubtle, margin:'4px 0' }} />
                  <button type="button" onClick={handleDelete} style={{ ...menuItemStyle, color:'#B91C1C' }}>
                    <Trash2 size={14} /> Löschen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <div style={heroStyle}>
        <div style={heroFlexStyle}>
          <div style={{ display:'flex', alignItems:'center', gap:14, flex:1, minWidth:0 }}>
            <LeadAvatar firstName={lead.first_name} lastName={lead.last_name} size="xl" />
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Read-only Display — Edit erfolgt jetzt über LeadEditModal (Click auf 'Bearbeiten').
                  Status ist ein Dropdown (LeadStatusPill + StatusPicker) direkt neben dem Namen,
                  statt des fruehern Chevron-Pipeline-Steppers. */}
              <div style={{ fontSize:18, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:2 }}>CRM · Kontakt</div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.3px', lineHeight:1.2, margin:0, color: displayName ? COLORS.textPrimary : COLORS.textTertiary }}>
                  {displayName || 'Name fehlt'}
                </h1>
                {lead.archived && (
                  <span style={{ fontSize:11, fontWeight:600, color:'#B91C1C', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'2px 8px', display:'inline-flex', alignItems:'center', gap:4 }}>
                    <Archive size={12} /> Archiviert
                  </span>
                )}
                <div style={{ position:'relative' }}>
                  <LeadStatusPill
                    status={lead.status}
                    showDot
                    showSublabel
                    onClick={() => setStatusOpen((v) => !v)}
                  />
                  <StatusPicker
                    open={statusOpen}
                    current={lead.status}
                    onClose={() => setStatusOpen(false)}
                    onPick={pickStatus}
                  />
                </div>
              </div>
              <div style={{ fontSize:13, color: COLORS.textSecondary, marginTop:4, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ color: lead.job_title ? COLORS.textSecondary : COLORS.textTertiary }}>
                  {lead.job_title || 'Position…'}
                </span>
                <span style={{ color: COLORS.textTertiary }}>·</span>
                {/* Bevorzugt die via organization_id verknüpfte Orga (kanonischer
                    Name + Link zum Unternehmensprofil). Fallback auf den
                    denormalisierten leads.company-String, wenn keine Orga verknüpft. */}
                {lead.organization?.id ? (
                  <span
                    onClick={() => navigate(`/organizations/${lead.organization.id}`)}
                    title="Zum Unternehmen"
                    style={{ color: 'var(--wl-primary, rgb(49,90,231))', cursor: 'pointer' }}>
                    {lead.organization.name}
                  </span>
                ) : (
                  <span style={{ color: lead.company ? COLORS.textSecondary : COLORS.textTertiary }}>
                    {lead.company || 'Unternehmen…'}
                  </span>
                )}
                <ConnectionStatusBadge value={lead.li_connection_status} />
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            {lead.linkedin_url && (
              <button type="button" style={secondaryBtnStyle} onClick={openLinkedIn}
                title="LinkedIn-Profil in neuem Tab öffnen">
                <IcLinkedin size={16} /> Profil
              </button>
            )}
            <button type="button" style={secondaryBtnStyle} onClick={() => setEditModalOpen(true)}
              title="Lead bearbeiten">
              <Pencil size={16} /> Bearbeiten
            </button>
            <button type="button" style={primaryBtnStyle} onClick={() => setActiveTab('messages')}>
              <Send size={16} /> Nachricht senden
            </button>
            {lead.archived ? (
              <button type="button" style={secondaryBtnStyle} onClick={handleRestore}
                title="Kontakt wiederherstellen">
                <Archive size={16} /> Wiederherstellen
              </button>
            ) : (
              <button type="button" style={{ ...secondaryBtnStyle, color:'#B91C1C', borderColor:'#FECACA' }} onClick={handleArchive}
                title="Kontakt archivieren">
                <Archive size={16} /> Archivieren
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3-Spalten-Layout: links Summary, Mitte Tabs/Timeline, rechts verknuepfte Datensaetze.
          <1100px (isSmall) → einspaltig gestapelt (Summary → Tabs → Related). */}
      <div style={isSmall ? { ...threeColStyle, gridTemplateColumns: '1fr', padding: '16px 16px 40px' } : threeColStyle}>
        <aside style={railColStyle}>
          <SummaryRail
            lead={lead}
            owner={owner}
            navigate={navigate}
            onOpenOwnerPicker={() => setOwnerPickerOpen(true)}
            updateLead={safeUpdateLead}
          />
        </aside>

        <main style={centerColStyle}>
          <div style={{ ...tabsRowStyle, marginBottom: 18 }}>
            {TABS.map((tab) => {
              const count = tab.countKey ? lead[tab.countKey] : null;
              const isActive = activeTab === tab.id;
              return (
                <div key={tab.id} style={isActive ? tabActiveStyle : tabStyle}
                  onClick={() => handleTabChange(tab.id)} role="tab" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTabChange(tab.id); }}>
                  {tab.label}
                  {count != null && <span style={tabCountStyle}>{count}</span>}
                </div>
              );
            })}
          </div>
          {activeTab === 'activity' && <ActivityTab leadId={lead.id} leadTeamId={lead.team_id} />}
          {activeTab === 'messages' && (
            <MessagesTab
              leadId={lead.id}
              lead={lead}
              initialDraft={composerDraft}
              onDraftConsumed={() => setComposerDraft(null)}
            />
          )}
          {activeTab === 'notes' && <NotesTab leadId={lead.id} leadTeamId={lead.team_id} />}
          {activeTab === 'tasks' && <TasksTab leadId={lead.id} leadTeamId={lead.team_id} onMutated={bumpRail} />}
          {activeTab === 'deals' && <DealsTab lead={lead} leadId={lead.id} navigate={navigate} onMutated={bumpRail} />}
        </main>

        <aside style={railColStyle}>
          <RelatedRail
            lead={lead}
            navigate={navigate}
            refreshKey={railRefresh}
            analysis={analysisDismissed ? null : currentAnalysis}
            analyzeLoading={analyzeLoading}
            onAnalyze={handleAnalyze}
            onReanalyze={handleReanalyze}
            onUseOutreach={handleUseOutreach}
            onJumpTab={handleTabChange}
          />
        </aside>
      </div>

      <OwnerPicker
        open={ownerPickerOpen}
        currentOwnerId={lead.owner_id}
        members={members || []}
        onClose={() => setOwnerPickerOpen(false)}
        onPick={pickOwner}
      />

      <LeadEditModal
        lead={lead}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={safeUpdateLead}
      />
    </div>
  );
}

// ─── SummaryRail (linke Spalte) ─────────────────────────────────────────────
// Properties + Owner + Tags + Kennzahlen, single-column fuer die schmale Spalte.
function SummaryRail({ lead, owner, navigate, onOpenOwnerPicker, updateLead }) {
  const setTags = (next) => updateLead({ tags: Array.isArray(next) ? next : [] });
  const dealValueDisplay = lead.deal_value != null
    ? `${Number(lead.deal_value).toLocaleString('de-DE')} €` : null;
  const ownerName = owner ? (`${owner.first_name || ''} ${owner.last_name || ''}`.trim() || '—') : null;
  return (
    <>
      <div style={railCardStyle}>
        <div style={railHeadStyle}><span style={railTitleStyle}>Über diesen Kontakt</span></div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <ContactRow icon={Mail} label="E-Mail" value={lead.email} linkLike />
          <ContactRow icon={Phone} label="Telefon" value={lead.phone} />
          <ContactRow icon={IcLinkedin} label="LinkedIn" value={lead.linkedin_url} linkLike truncate />
          <ContactRow icon={MapPin} label="Ort" value={lead.location} />
          <ContactRow icon={Workflow} label="Quelle" value={lead.source} />
        </div>
        <div onClick={onOpenOwnerPicker} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onOpenOwnerPicker(); }}
          title="Owner ändern"
          style={{ display:'flex', alignItems:'center', gap:10, marginTop:14, paddingTop:14, borderTop:`0.5px solid ${COLORS.borderSubtle}`, cursor:'pointer' }}>
          {owner
            ? <LeadAvatar firstName={owner.first_name} lastName={owner.last_name} imageUrl={owner.avatar_url} size="md" />
            : <div style={emptyOwnerCircleStyle}><Plus size={14} /></div>}
          <div>
            <div style={{ fontSize:11, color: COLORS.textTertiary }}>Owner</div>
            <div style={{ fontSize:13, color: COLORS.textPrimary }}>{ownerName || 'Zuweisen'}</div>
          </div>
        </div>
        <div style={{ marginTop:14 }}>
          <TagEditor tags={lead.tags || []} onSave={setTags} />
        </div>
      </div>

      <div style={railCardStyle}>
        <div style={railHeadStyle}><span style={railTitleStyle}>Kennzahlen</span></div>
        <div style={propLabelStyle}>Score (KI)</div>
        <div style={propValueStyle}>{lead.lead_score != null && lead.lead_score !== '' ? lead.lead_score : '—'}</div>
        <div style={propLabelStyle}>Nächste Aktion</div>
        <div style={{ ...propValueStyle, color: lead.next_followup ? '#854F0B' : COLORS.textTertiary }}>
          {lead.next_followup ? formatRelativeDate(lead.next_followup) : '—'}
        </div>
        <div style={propLabelStyle}>Deal-Wert</div>
        <div style={propValueStyle}>{dealValueDisplay || '—'}</div>
      </div>

      {(lead.industry || lead.company_size || lead.company_website || lead.company_address) && (
        <div style={railCardStyle}>
          <CompanyInfoBlock
            industry={lead.industry}
            companySize={lead.company_size}
            companyWebsite={lead.company_website}
            companyAddress={lead.company_address}
          />
        </div>
      )}
    </>
  );
}

// ─── RelatedRail (rechte Spalte) ────────────────────────────────────────────
// Verknuepfte Datensaetze: Unternehmen, Deals, Aufgaben, KI-Analyse-Kurzfassung.
function RelatedRail({ lead, navigate, refreshKey, analysis, analyzeLoading, onAnalyze, onReanalyze, onUseOutreach, onJumpTab }) {
  const railAddBtn = { background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary, padding:0, display:'inline-flex' };
  const miniCardStyle = { padding:'8px 10px', borderRadius: RADIUS.md, border:`0.5px solid ${COLORS.borderSubtle}`, marginTop:8, cursor:'pointer' };
  const [deals, setDeals] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);

  useEffect(() => {
    if (!lead.id) return;
    let cancelled = false;
    (async () => {
      const [dRes, tRes] = await Promise.all([
        supabase.from('deals').select('id, title, value, stage').eq('lead_id', lead.id).order('created_at', { ascending:false }).limit(5),
        supabase.from('lead_tasks').select('id, title, due_date, task_type').eq('lead_id', lead.id).eq('status', 'open').order('due_date', { ascending:true, nullsFirst:false }).limit(5),
      ]);
      if (cancelled) return;
      if (!dRes.error) setDeals(dRes.data || []);
      if (!tRes.error) setOpenTasks(tRes.data || []);
    })();
    return () => { cancelled = true; };
  }, [lead.id, refreshKey]);

  const score = analysis?.score?.value;
  const nextAction = typeof analysis?.next_best_action === 'string'
    ? analysis.next_best_action
    : (analysis?.next_best_action?.text || analysis?.next_best_action?.action || null);
  const hasOutreach = !!(analysis?.outreach_draft || analysis?.outreach);

  return (
    <>
      <div style={railCardStyle}>
        <div style={railHeadStyle}><Building2 size={14} color={COLORS.textTertiary} /><span style={railTitleStyle}>Unternehmen</span></div>
        {lead.organization?.id ? (
          <div style={{ fontSize:13, color:'var(--wl-primary, rgb(49,90,231))', cursor:'pointer' }}
            onClick={() => navigate(`/organizations/${lead.organization.id}`)}>{lead.organization.name}</div>
        ) : lead.company ? (
          <div style={{ fontSize:13, color: COLORS.textPrimary }}>{lead.company}</div>
        ) : (
          <div style={{ fontSize:13, color: COLORS.textTertiary }}>Nicht verknüpft</div>
        )}
      </div>

      <div style={railCardStyle}>
        <div style={railHeadStyle}>
          <Banknote size={14} color={COLORS.textTertiary} />
          <span style={railTitleStyle}>Deals{deals.length ? ` (${deals.length})` : ''}</span>
          <button type="button" style={railAddBtn} onClick={() => onJumpTab('deals')} title="Deals öffnen"><Plus size={14} /></button>
        </div>
        {deals.length === 0 ? (
          <div style={{ fontSize:13, color: COLORS.textTertiary }}>Keine Deals</div>
        ) : deals.map(d => {
          const sc = DEAL_STAGE_COLORS[d.stage] || '#94A3B8';
          return (
            <div key={d.id} style={miniCardStyle} onClick={() => navigate(`/deals?open=${d.id}`)} title="Deal öffnen">
              <div style={{ fontSize:12, fontWeight:500, color: COLORS.textPrimary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.title || 'Deal'}</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3, gap:6 }}>
                <span style={{ fontSize:11, fontWeight:600, color: sc }}>{DEAL_STAGE_LABELS[d.stage] || d.stage || '—'}</span>
                {d.value != null && <span style={{ fontSize:11, color: COLORS.textSecondary }}>{Number(d.value).toLocaleString('de-DE')} €</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={railCardStyle}>
        <div style={railHeadStyle}>
          <CalendarCheck size={14} color={COLORS.textTertiary} />
          <span style={railTitleStyle}>Offene Aufgaben{openTasks.length ? ` (${openTasks.length})` : ''}</span>
          <button type="button" style={railAddBtn} onClick={() => onJumpTab('tasks')} title="Aufgaben öffnen"><Plus size={14} /></button>
        </div>
        {openTasks.length === 0 ? (
          <div style={{ fontSize:13, color: COLORS.textTertiary }}>Keine offenen Aufgaben</div>
        ) : openTasks.map(t => {
          const tt = TASK_TYPE_CFG[t.task_type] || TASK_TYPE_CFG.aufgabe;
          return (
            <div key={t.id} style={{ ...miniCardStyle, display:'flex', alignItems:'center', gap:8 }} onClick={() => onJumpTab('tasks')}>
              <span style={{ flexShrink:0 }}>{tt.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color: COLORS.textPrimary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                {t.due_date && <div style={{ fontSize:11, color: COLORS.textTertiary }}>{formatRelativeDate(t.due_date)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={railCardStyle}>
        <div style={railHeadStyle}><Sparkles size={14} color={COLORS.textTertiary} /><span style={railTitleStyle}>KI-Analyse</span></div>
        {analysis ? (
          <>
            {score != null && (<><div style={propLabelStyle}>Score</div><div style={propValueStyle}>{score} / 100</div></>)}
            {lead.ai_buying_intent && (<><div style={propLabelStyle}>Buying-Intent</div><div style={propValueStyle}>{lead.ai_buying_intent}</div></>)}
            {nextAction && (<><div style={propLabelStyle}>Nächste Aktion</div><div style={propValueStyle}>{nextAction}</div></>)}
            <div style={{ display:'flex', gap:6, marginTop:12 }}>
              <button type="button" onClick={onReanalyze} disabled={analyzeLoading}
                style={{ ...ghostBtnStyle, flex:1, justifyContent:'center', opacity: analyzeLoading ? 0.6 : 1 }}>
                <Sparkles size={13} /> {analyzeLoading ? '…' : 'Neu'}
              </button>
              {hasOutreach && onUseOutreach && (
                <button type="button" onClick={onUseOutreach}
                  style={{ ...ghostBtnStyle, flex:1, justifyContent:'center' }}>
                  <Send size={13} /> Entwurf
                </button>
              )}
            </div>
          </>
        ) : (
          <button type="button" onClick={onAnalyze} disabled={analyzeLoading}
            style={{ ...secondaryBtnStyle, width:'100%', justifyContent:'center', opacity: analyzeLoading ? 0.6 : 1 }}>
            <Sparkles size={14} /> {analyzeLoading ? 'Analysiere…' : 'Analysieren'}
          </button>
        )}
      </div>
    </>
  );
}

// ─── ActivityTab ──────────────────────────────────────────────────────────
// Sprint C Phase 1: liest aus lead_activity_feed-View (3 Sources unifiziert).
// Quick-Add schreibt weiterhin direkt nach activities-Tabelle (Single Writer);
// nach Insert wird der Feed via refetch neu geladen.
//
// Items aus dem View haben Shape:
//   { source, id, type, timestamp, actor_id, payload (jsonb) }
function ActivityTab({ leadId, leadTeamId }) {
  const { items, profilesById, isLoading, error: feedError, refetch } = useLeadActivities(leadId);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('note');
  const [newSubject, setNewSubject] = useState('');
  const [localErr, setLocalErr] = useState(null);

  const err = localErr || (feedError ? feedError.message : null);
  const grouped = useMemo(() => groupByDay(items, 'timestamp'), [items]);

  const submit = async () => {
    if (!newSubject.trim()) return;
    setAdding(true); setLocalErr(null);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const { error: insertError } = await supabase.from('activities').insert({
      lead_id: leadId, user_id: userId, type: newType,
      subject: newSubject.trim(), direction: 'outbound',
      occurred_at: new Date().toISOString(),
      ...(leadTeamId ? { team_id: leadTeamId } : {}),
    });
    setAdding(false);
    if (insertError) { setLocalErr(insertError.message); return; }
    setNewSubject('');
    refetch();
  };

  const remove = async (item) => {
    // Nur source='activity'-Items sind direkt löschbar (writable underlying table).
    // task/field_history aus der View müssen über die jeweiligen Tabs entfernt werden.
    if (item.source !== 'activity') {
      setLocalErr(`${variantFor(item.type).label}-Events werden über den jeweiligen Tab verwaltet, nicht hier.`);
      return;
    }
    if (!confirm('Aktivität löschen?')) return;
    const { error: deleteError } = await supabase.from('activities').delete().eq('id', item.id);
    if (deleteError) { setLocalErr(deleteError.message); return; }
    refetch();
  };

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:500 }}>Aktivitätsverlauf</div>
        <span style={{ fontSize:12, color: COLORS.textTertiary }}>
          {isLoading ? 'Lade…' : `${items.length} Einträge`}
        </span>
      </div>

      {/* Quick-Add — schreibt in activities-Tabelle */}
      <div style={{ display:'flex', gap:8, marginBottom:18 }}>
        <select value={newType} onChange={e => setNewType(e.target.value)}
          style={{ ...inputStyle, width: 150, flex: 'none' }}>
          <option value="note">Notiz</option>
          <option value="call">Anruf</option>
          <option value="meeting">Meeting</option>
          <option value="email">E-Mail</option>
          <option value="task">Aufgabe</option>
          <option value="linkedin_message">LinkedIn-Nachricht</option>
          <option value="linkedin_connection">LinkedIn-Verbindung</option>
        </select>
        <input style={{ ...inputStyle, flex:1 }}
          placeholder="Was ist passiert? Kurzbeschreibung…"
          value={newSubject} onChange={e => setNewSubject(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        <button type="button" style={primaryBtnStyle} onClick={submit} disabled={adding || !newSubject.trim()}>
          {adding ? 'Speichere…' : 'Hinzufügen'}
        </button>
      </div>

      {err && <div style={{ color:'#B91C1C', fontSize:12, marginBottom:12 }}>{err}</div>}

      {!isLoading && items.length === 0 && (
        <div style={{ padding:'32px 0', textAlign:'center', color: COLORS.textTertiary, fontSize:13 }}>
          Noch keine Aktivitäten. Häng oben eine an.
        </div>
      )}

      {grouped.map((g, i) => g.kind === 'divider' ? (
        <div key={`d${i}`} style={dayDividerStyle}>
          <div style={dayDividerLineStyle} />
          <span style={dayDividerLabelStyle}>{g.label}</span>
          <div style={dayDividerLineStyle} />
        </div>
      ) : (
        <ActivityRow
          key={`${g.data.source}-${g.data.id}-${g.data.type}`}
          item={g.data}
          author={g.data.actor_id ? authorName(profilesById.get(g.data.actor_id)) : null}
          onDelete={() => remove(g.data)}
        />
      ))}
    </div>
  );
}

function ActivityRow({ item, author, onDelete }) {
  const v = variantFor(item.type);
  const Icon = v.Icon;
  const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '';
  const payload = item.payload || {};

  // Source-spezifische Subject/Body-Extraktion aus payload jsonb
  let subject = payload.subject || payload.title || null;
  let body = payload.body || payload.description || null;
  if (item.source === 'field_history') {
    const oldV = payload.old_value || '—';
    const newV = payload.new_value || '—';
    subject = `${oldV} → ${newV}`;
  }

  // Actor-Render: bei NULL actor_id (z.B. field_history) zeigen wir „System"
  const actorLabel = author || (item.actor_id == null ? 'System' : null);

  return (
    <div style={activityItemStyle}>
      <div style={activityIconStyle(v.bg, v.fg)}><Icon size={16} /></div>
      <div style={{ flex:1 }}>
        <div style={activityTextStyle}>
          <strong style={{ fontWeight:500 }}>{v.label}</strong>
          {subject && <> · {subject}</>}
          {item.collapsed_count > 1 && (
            <span style={{
              marginLeft: 8,
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 999,
              background: '#FAEEDA',
              color: '#854F0B',
              letterSpacing: '.02em',
            }} title={`${item.collapsed_count} Score-Updates in 5min zusammengefasst`}>
              +{item.collapsed_count - 1}
            </span>
          )}
        </div>
        {body && <div style={quoteBlockStyle}>{body}</div>}
        <div style={activityMetaStyle}>
          {time}
          {actorLabel && ` · ${actorLabel}`}
          {payload.direction && ` · ${payload.direction === 'outbound' ? 'ausgehend' : 'eingehend'}`}
          {payload.outcome && ` · ${payload.outcome}`}
        </div>
      </div>
      {/* Nur source='activity' ist direkt löschbar — andere Sources haben eigene Tabs */}
      {item.source === 'activity' && (
        <button type="button" onClick={onDelete}
          style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary, padding:4 }}
          aria-label="Löschen" title="Aktivität löschen">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ─── MessagesTab ──────────────────────────────────────────────────────────
function MessagesTab({ leadId, lead, initialDraft, onDraftConsumed }) {
  const [items, setItems] = useState([]);
  const [profilesById, setProfilesById] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [msgType, setMsgType] = useState('linkedin_message');
  const [msgBody, setMsgBody] = useState('');
  const [err, setErr] = useState(null);

  // Composer-Hydratation aus initialDraft (z.B. LeadAnalysisCard → "Im Composer öffnen").
  // onDraftConsumed räumt den Parent-State wieder leer, damit Tab-Switch nicht erneut
  // hydratiert wenn User die Felder zwischenzeitlich geändert hat.
  useEffect(() => {
    if (!initialDraft) return;
    const channel = initialDraft.channel === 'email' ? 'email' : 'linkedin_message';
    setMsgType(channel);
    const text = initialDraft.subject && channel === 'email'
      ? `Betreff: ${initialDraft.subject}\n\n${initialDraft.body || ''}`
      : (initialDraft.body || '');
    setMsgBody(text);
    if (typeof onDraftConsumed === 'function') onDraftConsumed();
  }, [initialDraft, onDraftConsumed]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('activities')
      .select('id, type, subject, body, direction, outcome, occurred_at, user_id')
      .eq('lead_id', leadId)
      .in('type', Array.from(MESSAGE_TYPES))
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (error) { setErr(error.message); setLoading(false); return; }
    setItems(data || []);
    const map = await fetchProfilesMap((data || []).map(a => a.user_id));
    setProfilesById(map);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!msgBody.trim()) return;
    setComposing(true); setErr(null);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const subject = msgType === 'email' ? 'E-Mail an Lead' : 'LinkedIn-Nachricht';
    const { error } = await supabase.from('activities').insert({
      lead_id: leadId, user_id: userId, type: msgType,
      subject, body: msgBody.trim(), direction: 'outbound',
      occurred_at: new Date().toISOString(),
      ...(lead?.team_id ? { team_id: lead.team_id } : {}),
    });
    setComposing(false);
    if (error) { setErr(error.message); return; }
    setMsgBody('');
    load();
  };

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:500 }}>Nachrichten</div>
        <span style={{ fontSize:12, color: COLORS.textTertiary }}>
          {loading ? 'Lade…' : `${items.length} Nachrichten`}
        </span>
      </div>

      {/* Composer */}
      <div style={{ marginBottom: 22, padding:'14px', background: COLORS.surfaceMuted, borderRadius: RADIUS.md }}>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <select value={msgType} onChange={e => setMsgType(e.target.value)}
            style={{ ...inputStyle, width: 200, flex: 'none' }}>
            <option value="linkedin_message">LinkedIn-Nachricht</option>
            <option value="email">E-Mail</option>
            <option value="message">Sonstige Nachricht</option>
          </select>
          <span style={{ fontSize:12, color: COLORS.textTertiary, alignSelf:'center' }}>
            an {lead?.first_name} {lead?.last_name}
          </span>
        </div>
        <textarea style={textareaStyle}
          placeholder="Nachricht eingeben…"
          value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={4} />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 }}>
          <button type="button" style={primaryBtnStyle} onClick={send} disabled={composing || !msgBody.trim()}>
            <Send size={14} /> {composing ? 'Senden…' : 'Protokollieren'}
          </button>
        </div>
        <div style={{ fontSize:11, color: COLORS.textTertiary, marginTop:6 }}>
          Hinweis: speichert die Nachricht im Activity-Log. Versand muss aktuell separat über LinkedIn / E-Mail-Client erfolgen.
        </div>
      </div>

      {err && <div style={{ color:'#B91C1C', fontSize:12, marginBottom:12 }}>{err}</div>}

      {!loading && items.length === 0 && (
        <div style={{ padding:'32px 0', textAlign:'center', color: COLORS.textTertiary, fontSize:13 }}>
          Noch keine Nachrichten protokolliert.
        </div>
      )}

      {items.map(m => <MessageRow key={m.id} msg={m} author={authorName(profilesById.get(m.user_id))} />)}
    </div>
  );
}

function MessageRow({ msg, author }) {
  const v = variantFor(msg.type);
  const Icon = v.Icon;
  const dt = msg.occurred_at ? new Date(msg.occurred_at) : null;
  const dateStr = dt ? dt.toLocaleString('de-DE', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const isOut = msg.direction !== 'inbound';
  return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems: isOut ? 'flex-end' : 'flex-start',
      marginBottom:14,
    }}>
      <div style={{
        maxWidth: '75%',
        background: isOut ? COLORS.primarySoft : COLORS.surfaceMuted,
        color: isOut ? COLORS.primarySoftFg : COLORS.textPrimary,
        padding:'10px 14px', borderRadius: 12, fontSize:13, lineHeight:1.5,
        whiteSpace:'pre-wrap', wordBreak:'break-word',
      }}>
        {msg.body || msg.subject || '—'}
      </div>
      <div style={{ ...activityMetaStyle, marginTop:4, display:'flex', alignItems:'center', gap:6 }}>
        <Icon size={11} color={v.fg} />
        <span>{v.label}</span>
        {author && <span>· {author}</span>}
        <span>· {dateStr}</span>
      </div>
    </div>
  );
}

// ─── NotesTab ─────────────────────────────────────────────────────────────
function NotesTab({ leadId, leadTeamId }) {
  const { activeTeamId } = useTeam() || {};
  const teamIdForInsert = leadTeamId || activeTeamId || null;
  const [items, setItems] = useState([]);
  const [profilesById, setProfilesById] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [err, setErr] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editBody, setEditBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('contact_notes')
      .select('id, content, is_private, created_at, user_id, team_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setErr(error.message); setLoading(false); return; }
    setItems(data || []);
    const map = await fetchProfilesMap((data || []).map(n => n.user_id));
    setProfilesById(map);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!body.trim()) return;
    setAdding(true); setErr(null);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const payload = {
      lead_id: leadId,
      user_id: userId,
      content: body.trim(),
      is_private: isPrivate,
      ...(teamIdForInsert ? { team_id: teamIdForInsert } : {}),
    };
    const { error } = await supabase.from('contact_notes').insert(payload);
    setAdding(false);
    if (error) { setErr(error.message); return; }
    setBody('');
    setIsPrivate(false);
    load();
  };

  const saveEdit = async (id) => {
    const { error } = await supabase.from('contact_notes').update({ content: editBody.trim() }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setEditId(null); setEditBody('');
    load();
  };

  const remove = async (id) => {
    if (!confirm('Notiz löschen?')) return;
    const { error } = await supabase.from('contact_notes').delete().eq('id', id);
    if (error) { setErr(error.message); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:500 }}>Notizen</div>
        <span style={{ fontSize:12, color: COLORS.textTertiary }}>
          {loading ? 'Lade…' : `${items.length} Notizen`}
        </span>
      </div>

      <div style={{ marginBottom:22 }}>
        <textarea style={textareaStyle}
          placeholder="Neue Notiz…"
          value={body} onChange={e => setBody(e.target.value)} rows={3} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginTop:8 }}>
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color: COLORS.textSecondary, cursor:'pointer' }}>
            <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
            Privat (nur ich sehe sie)
          </label>
          <button type="button" style={primaryBtnStyle} onClick={submit} disabled={adding || !body.trim()}>
            <Plus size={14} /> {adding ? 'Speichere…' : 'Notiz hinzufügen'}
          </button>
        </div>
      </div>

      {err && <div style={{ color:'#B91C1C', fontSize:12, marginBottom:12 }}>{err}</div>}

      {!loading && items.length === 0 && (
        <div style={{ padding:'32px 0', textAlign:'center', color: COLORS.textTertiary, fontSize:13 }}>
          Noch keine Notizen.
        </div>
      )}

      {items.map(n => {
        const author = authorName(profilesById.get(n.user_id));
        const dt = n.created_at ? new Date(n.created_at) : null;
        const dateStr = dt ? dt.toLocaleString('de-DE', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
        const isEditing = editId === n.id;
        return (
          <div key={n.id} style={{ paddingBottom: 14, marginBottom: 14, borderBottom:`0.5px solid ${COLORS.borderSubtle}` }}>
            {isEditing ? (
              <>
                <textarea style={textareaStyle} value={editBody} onChange={e => setEditBody(e.target.value)} rows={3} />
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
                  <button type="button" style={ghostBtnStyle} onClick={() => { setEditId(null); setEditBody(''); }}>Abbrechen</button>
                  <button type="button" style={primaryBtnStyle} onClick={() => saveEdit(n.id)} disabled={!editBody.trim()}>Speichern</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap', color: COLORS.textPrimary }}>{n.content}</div>
                <div style={{ ...activityMetaStyle, marginTop:6, display:'flex', alignItems:'center', gap:8 }}>
                  <span>{author || '—'}</span>
                  <span>· {dateStr}</span>
                  {n.is_private && (
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6, background: COLORS.surfaceMuted, color: COLORS.textTertiary }}>
                      privat
                    </span>
                  )}
                  <span style={{ flex:1 }} />
                  <button type="button" onClick={() => { setEditId(n.id); setEditBody(n.content); }}
                    style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary }} title="Bearbeiten">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => remove(n.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary }} title="Löschen">
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TasksTab ─────────────────────────────────────────────────────────────
// CRUD-Surface für lead_tasks (Schema siehe Migration 20260416000001_staging_schema.sql:357).
//
// RLS (lead_tasks_own): WHERE created_by = auth.uid() OR assigned_to = auth.uid()
// → Tasks sind pro-User-sichtbar, NICHT team-weit. Auf Tab-View kommen also
//   nur eigene + zugewiesene Tasks zurück. Beim Insert wird created_by aus
//   auth.uid() abgeleitet (durch RLS-WITH-CHECK), team_id zusätzlich aus
//   lead.team_id falls vorhanden — analog NotesTab-Pattern für Multi-Tenant.
const PRIORITY_CFG = {
  low:    { label: 'niedrig', bg:'#F1F5F9', fg:'#475569' },
  normal: { label: 'normal',  bg:'#E6F1FB', fg:'#0C447C' },
  high:   { label: 'hoch',    bg:'#FAEEDA', fg:'#854F0B' },
};

// Aufgaben-Typen (Spalte lead_tasks.task_type). 'aufgabe' = Default/Fallback.
const TASK_TYPES = [
  { value: 'termin',    label: 'Termin',             icon: <Calendar size={16} strokeWidth={1.75}/> },
  { value: 'telefonat', label: 'Telefonat',          icon: <Phone size={16} strokeWidth={1.75}/> },
  { value: 'email',     label: 'E-Mail',             icon: '✉️' },
  { value: 'linkedin',  label: 'LinkedIn-Nachricht', icon: <Briefcase size={16} strokeWidth={1.75}/> },
  { value: 'notiz',     label: 'Notiz / Follow-up',  icon: <FileText size={16} strokeWidth={1.75}/> },
  { value: 'aufgabe',   label: 'Aufgabe / Sonstiges',icon: <CheckCircle2 size={16} strokeWidth={1.75}/> },
];
const TASK_TYPE_CFG = Object.fromEntries(TASK_TYPES.map(t => [t.value, t]));

function TasksTab({ leadId, leadTeamId, onMutated }) {
  const { activeTeamId, members } = useTeam() || {};
  const teamIdForInsert = leadTeamId || activeTeamId || null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [taskType, setTaskType] = useState('aufgabe');
  // Multi-Assignee (seit 2026-06-02). Default-Vorbelegung in submit() via uid.
  const [assignedToIds, setAssignedToIds] = useState([]);
  const [currentUid, setCurrentUid] = useState(null);
  const [err, setErr] = useState(null);

  // current user-id fuer Picker-Label "(Ich)"
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUid(data?.user?.id || null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('lead_tasks')
      .select('id, title, description, due_date, priority, task_type, status, completed_at, created_by, assigned_to, created_at, lead_task_assignees(user_id)')
      .eq('lead_id', leadId)
      .order('status', { ascending: true })   // open zuerst (alphab. open < done)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) { setErr(error.message); setLoading(false); return; }
    setItems((data || []).map(t => ({
      ...t,
      assigned_to_ids: (t.lead_task_assignees || []).map(r => r.user_id).filter(Boolean),
    })));
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  // Realtime-Subscription auf lead_tasks für diesen Lead — sync mit
  // /aufgaben-Page + parallelen TasksTab-Instanzen (Multi-Tab + Co-Editing).
  // Pattern analog useLead.js Realtime-Hook.
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`lead-tasks-${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_tasks', filter: `lead_id=eq.${leadId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, load]);

  const submit = async () => {
    if (!title.trim()) return;
    setAdding(true); setErr(null);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (!userId) { setErr('Nicht eingeloggt.'); setAdding(false); return; }
    // Default-Assignee = Creator wenn niemand explizit gewaehlt.
    const finalAssignees = assignedToIds.length > 0 ? assignedToIds : [userId];
    const payload = {
      lead_id: leadId,
      created_by: userId,
      title: title.trim(),
      priority,
      task_type: taskType || 'aufgabe',
      assigned_to: finalAssignees[0] || null,  // Legacy-Mirror
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(teamIdForInsert ? { team_id: teamIdForInsert } : {}),
    };
    const { data: inserted, error } = await supabase.from('lead_tasks').insert(payload).select('id').single();
    if (error) { setAdding(false); setErr(error.message); return; }
    // Junction-Rows
    if (inserted?.id && finalAssignees.length > 0) {
      const rows = finalAssignees.map(aid => ({ task_id: inserted.id, user_id: aid, assigned_by: userId }));
      const { error: assignErr } = await supabase.from('lead_task_assignees').insert(rows);
      if (assignErr) {
        console.warn('[LeadDetail.TasksTab] junction insert failed:', assignErr.message);
        setAdding(false);
        setErr('Aufgabe angelegt, Zuweisung fehlgeschlagen: ' + assignErr.message);
        return;
      }
    }
    setAdding(false);
    setTitle(''); setDueDate(''); setPriority('normal'); setTaskType('aufgabe'); setAssignedToIds([]);
    load();
    onMutated?.();
  };

  const toggleComplete = async (task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    const patch = nextStatus === 'done'
      ? { status: 'done', completed_at: new Date().toISOString() }
      : { status: 'open', completed_at: null };
    // Optimistic
    setItems(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t));
    const { error } = await supabase.from('lead_tasks').update(patch).eq('id', task.id);
    if (error) { setErr(error.message); load(); } else { onMutated?.(); }
  };

  const remove = async (id) => {
    if (!confirm('Aufgabe löschen?')) return;
    const { error } = await supabase.from('lead_tasks').delete().eq('id', id);
    if (error) { setErr(error.message); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    onMutated?.();
  };

  const openCount = items.filter(t => t.status !== 'done').length;

  // ─── Composer-Styles (poliert) ──────────────────────────────────────────
  const composerStyle = {
    background: COLORS.surface, border: `1px solid ${COLORS.borderSubtle}`,
    borderRadius: RADIUS.lg, padding: 14, marginBottom: 24,
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  };
  const titleInputStyle = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 14, fontWeight: 500, color: COLORS.textPrimary,
    padding: '4px 2px', fontFamily: 'inherit',
  };
  const chipStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34,
    padding: '0 10px', border: `1px solid ${COLORS.borderSubtle}`,
    borderRadius: RADIUS.md, background: COLORS.surface,
    fontSize: 13, color: COLORS.textSecondary, boxSizing: 'border-box',
  };
  const bareControlStyle = {
    border: 'none', outline: 'none', background: 'transparent',
    fontSize: 13, color: COLORS.textPrimary, fontFamily: 'inherit', cursor: 'pointer',
  };
  const selectChipWrapStyle = { position: 'relative', display: 'inline-flex', alignItems: 'center' };
  const selectChipStyle = {
    ...chipStyle, color: COLORS.textPrimary, cursor: 'pointer',
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    paddingRight: 28, fontFamily: 'inherit',
  };
  const chevronStyle = { position: 'absolute', right: 9, pointerEvents: 'none', color: COLORS.textTertiary };

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:500 }}>Aufgaben</div>
        <span style={{ fontSize:12, color: COLORS.textTertiary }}>
          {loading ? 'Lade…' : `${openCount} offen · ${items.length} gesamt`}
        </span>
      </div>

      <div style={composerStyle}>
        <input
          type="text"
          style={titleInputStyle}
          placeholder="Neue Aufgabe — z.B. Demo-Call vereinbaren…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) submit(); }}
        />
        <div style={{ height: 1, background: COLORS.borderSubtle, margin: '10px 0 12px' }} />
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {/* Fälligkeit */}
          <label style={chipStyle}>
            <Calendar size={14} color={COLORS.textTertiary} />
            <input type="date" style={{ ...bareControlStyle, width: 120 }}
              value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </label>
          {/* Typ */}
          <div style={selectChipWrapStyle} title="Art der Aufgabe">
            <select style={{ ...selectChipStyle, minWidth: 150 }}
              value={taskType} onChange={e => setTaskType(e.target.value)}>
              {TASK_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
            <ChevronDown size={14} style={chevronStyle} />
          </div>
          {/* Priorität */}
          <div style={selectChipWrapStyle} title="Priorität">
            <select style={{ ...selectChipStyle, minWidth: 120 }}
              value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="low">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="high">Hoch</option>
            </select>
            <ChevronDown size={14} style={chevronStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 12 }} />
          <button type="button"
            style={{ ...primaryBtnStyle, opacity: (adding || !title.trim()) ? 0.5 : 1, cursor: (adding || !title.trim()) ? 'not-allowed' : 'pointer' }}
            onClick={submit} disabled={adding || !title.trim()}>
            <Plus size={15} /> {adding ? 'Speichere…' : 'Aufgabe anlegen'}
          </button>
        </div>
        {/* Multi-Assignee-Picker (seit 2026-06-02). Default: Creator wird beim
            Submit eingesetzt wenn niemand explizit gewaehlt. */}
        {Array.isArray(members) && members.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.borderSubtle}` }}>
            <MultiAssigneePicker
              value={assignedToIds}
              onChange={setAssignedToIds}
              members={members}
              uid={currentUid}
              disabled={adding}
            />
          </div>
        )}
      </div>

      {err && <div style={{ color:'#B91C1C', fontSize:12, marginBottom:12 }}>{err}</div>}

      {!loading && items.length === 0 && (
        <div style={{ padding:'32px 0', textAlign:'center', color: COLORS.textTertiary, fontSize:13 }}>
          Noch keine Aufgaben für diesen Lead.
        </div>
      )}

      {items.map(t => {
        const done = t.status === 'done';
        const prio = PRIORITY_CFG[t.priority] || PRIORITY_CFG.normal;
        const dueLabel = t.due_date ? formatRelativeDate(t.due_date) : null;
        const overdue = !done && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
        return (
          <div key={t.id} style={{
            display:'flex', alignItems:'center', gap:10, padding:'10px 0',
            borderBottom:`0.5px solid ${COLORS.borderSubtle}`,
          }}>
            <input
              type="checkbox"
              checked={done}
              onChange={() => toggleComplete(t)}
              style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              aria-label={done ? 'Aufgabe wiederöffnen' : 'Aufgabe abschließen'}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: done ? COLORS.textTertiary : COLORS.textPrimary,
                textDecoration: done ? 'line-through' : 'none',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>{t.title}</div>
              {(() => { const tt = TASK_TYPE_CFG[t.task_type] || TASK_TYPE_CFG.aufgabe; return (
                <div style={{ display:'flex', gap:8, marginTop:3, fontSize:11, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ padding:'1px 8px', borderRadius:999, background:'#F1F5F9', color:'#475569', fontWeight:500 }}>
                    {tt.icon} {tt.label}
                  </span>
                  {dueLabel && (
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:3,
                      color: overdue ? '#B91C1C' : COLORS.textTertiary,
                      fontWeight: overdue ? 500 : 400,
                    }}>
                      <Calendar size={11} /> {dueLabel}{overdue ? ' · überfällig' : ''}
                    </span>
                  )}
                  {t.priority && t.priority !== 'normal' && (
                    <span style={{
                      padding:'1px 8px', borderRadius: 999,
                      background: prio.bg, color: prio.fg, fontWeight: 500,
                    }}>{prio.label}</span>
                  )}
                </div>
              ); })()}
            </div>
            <button type="button" onClick={() => remove(t.id)}
              style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary, flexShrink: 0 }}
              title="Löschen" aria-label="Aufgabe löschen">
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── DealsTab ─────────────────────────────────────────────────────────────
const DEAL_STAGE_LABELS = {
  kein_deal: 'Kein Deal', prospect: 'Prospect', opportunity: 'Opportunity',
  angebot: 'Angebot', verhandlung: 'Verhandlung', gewonnen: 'Gewonnen', verloren: 'Verloren',
};
const DEAL_STAGE_COLORS = {
  prospect: '#64748B', opportunity: '#185FA5', angebot: '#D97706',
  verhandlung: '#7C3AED', gewonnen: '#059669', verloren: '#B91C1C', kein_deal: '#94A3B8',
};

function DealsTab({ lead, leadId, navigate, onMutated }) {
  const { activeTeamId } = useTeam() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);

  // uid + Team-Members fuer das geteilte DealModal (Owner-Picker, created_by).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null));
  }, []);
  useEffect(() => {
    if (!activeTeamId) { setTeamMembers([]); return; }
    let cancelled = false;
    (async () => {
      const { data: tm } = await supabase.from('team_members').select('user_id').eq('team_id', activeTeamId);
      if (cancelled) return;
      const userIds = [...new Set((tm || []).map(m => m.user_id).filter(Boolean))];
      if (userIds.length === 0) { setTeamMembers([]); return; }
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds);
      if (cancelled) return;
      setTeamMembers((profiles || []).map(p => {
        const parts = (p.full_name || '').trim().split(/\s+/);
        return { id: p.id, first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', full_name: p.full_name || null, avatar_url: p.avatar_url || null };
      }));
    })();
    return () => { cancelled = true; };
  }, [activeTeamId]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, value, currency, stage, created_at, expected_close_date, probability')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    setItems(data || []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:500 }}>Deals</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color: COLORS.textTertiary }}>
            {loading ? 'Lade…' : `${items.length} Deals`}
          </span>
          <button type="button" style={primaryBtnStyle} onClick={() => setOpen(true)}>
            <Plus size={14} /> Neuer Deal
          </button>
        </div>
      </div>

      {err && <div style={{ color:'#B91C1C', fontSize:12, marginBottom:12 }}>{err}</div>}

      {!loading && items.length === 0 && (
        <div style={{ padding:'32px 0', textAlign:'center', color: COLORS.textTertiary, fontSize:13 }}>
          Noch keine Deals für diesen Lead.
        </div>
      )}

      {items.map(d => {
        const stageColor = DEAL_STAGE_COLORS[d.stage] || '#64748B';
        const stageLabel = DEAL_STAGE_LABELS[d.stage] || d.stage || '—';
        return (
          <div key={d.id} style={{
            display:'flex', alignItems:'center', gap:14, padding:'14px 0',
            borderBottom:`0.5px solid ${COLORS.borderSubtle}`,
          }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500, color: COLORS.textPrimary }}>
                {d.title || `Deal ${d.id.slice(0,8)}`}
              </div>
              <div style={{ ...activityMetaStyle, marginTop:4, display:'flex', gap:10 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background: stageColor }} />
                  {stageLabel}
                </span>
                {d.expected_close_date && <span>Close: {new Date(d.expected_close_date).toLocaleDateString('de-DE')}</span>}
                {d.probability != null && <span>· {d.probability}% Wahrscheinlichkeit</span>}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:14, fontWeight:500 }}>
                {d.value != null ? `${(d.value || 0).toLocaleString('de-DE')} ${d.currency || '€'}` : '—'}
              </div>
            </div>
            <button type="button" onClick={() => navigate(`/deals`)}
              style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary }}
              title="In Deals öffnen">
              <ExternalLink size={14} />
            </button>
          </div>
        );
      })}

      {open && (
        <DealModal
          deal={{ lead_id: leadId }}
          leads={lead ? [lead] : []}
          teamMembers={teamMembers}
          teamId={activeTeamId}
          uid={uid}
          onSave={() => { setOpen(false); load(); onMutated?.(); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Shared subcomponents ─────────────────────────────────────────────────
function ContactRow({ icon: Icon, label, value, onSave, type = 'text', placeholder = '—', linkLike, truncate }) {
  // Falls kein onSave übergeben wird, bleibt es Read-only (Backward-Compat).
  const valueStyle = {
    color: linkLike && value ? '#185FA5' : COLORS.textPrimary,
    overflow: truncate ? 'hidden' : 'visible',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  };
  return (
    <div style={contactRowStyle}>
      <Icon size={15} color={COLORS.textTertiary} />
      <span style={contactLabelStyle}>{label}</span>
      <span style={valueStyle}>
        {onSave ? (
          <InlineEditField
            value={value}
            onSave={onSave}
            type={type}
            placeholder={placeholder}
          />
        ) : (value || '—')}
      </span>
    </div>
  );
}

function DetailSkeleton({ onBack }) {
  const skeletonBox = { background:'#F1F5F9', borderRadius:6 };
  return (
    <div style={pageStyle}>
      <div style={breadcrumbBarStyle}>
        <div style={breadcrumbStyle}>
          <Users size={15} />
          <span style={{ cursor:'pointer' }} onClick={onBack}>Kontakte</span>
          <ChevronRight size={14} color={COLORS.textTertiary} />
          <span style={{ ...skeletonBox, width:140, height:14, display:'inline-block' }} />
        </div>
      </div>
      <div style={heroStyle}>
        <div style={{ ...skeletonBox, width:80, height:22, marginBottom:12 }} />
        <div style={heroFlexStyle}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ ...skeletonBox, width:56, height:56, borderRadius:'50%' }} />
            <div>
              <div style={{ ...skeletonBox, width:200, height:26 }} />
              <div style={{ ...skeletonBox, width:160, height:14, marginTop:6 }} />
            </div>
          </div>
        </div>
        <div style={{ ...skeletonBox, width:'60%', height:32, marginTop:8 }} />
      </div>
      <div style={contentStyle}>
        <div style={{ ...cardStyle, height:320 }} />
        <div style={{ ...cardStyle, height:200 }} />
      </div>
    </div>
  );
}

function DetailNotFound({ error, onBack }) {
  return (
    <div style={pageStyle}>
      <div style={breadcrumbBarStyle}>
        <div style={breadcrumbStyle}>
          <Users size={15} />
          <span style={{ cursor:'pointer' }} onClick={onBack}>Kontakte</span>
        </div>
      </div>
      <div style={{
        flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:16, padding:48, textAlign:'center',
      }}>
        <div style={{ fontSize:18, fontWeight:500, color: COLORS.textPrimary }}>Lead nicht gefunden</div>
        {error && <div style={{ fontSize:13, color: COLORS.textTertiary, maxWidth:480 }}>{error.message}</div>}
        <button type="button" onClick={onBack} style={primaryBtnStyle}>← Zurück zu Leads</button>
      </div>
    </div>
  );
}

const MOCK_LEAD = {
  id:'demo', first_name:'Anna', last_name:'Krüger', job_title:'Head of Marketing',
  company:'Rhino GmbH', status:'SQL', lead_score:92, email:'a.krueger@rhino.de',
  phone:'+49 30 5577 0142', linkedin_url:'linkedin.com/in/anna-krueger',
  location:'Berlin, DE', source:'Webinar Mai', deal_value:24000,
  next_followup: new Date().toISOString(),
  notes:'Verantwortet Demand-Gen bei Rhino. Hat im Webinar zu LinkedIn-Outbound aktiv mitdiskutiert. Sucht Lösung für 12 SDRs, Entscheidung bis Ende Q2.',
  tags:['Enterprise','DACH','Webinar-Lead'],
  owner: { id:'1', first_name:'Michael', last_name:'Schreck' },
  activity_count:12, message_count:4, note_count:0, deal_count:1,
};
