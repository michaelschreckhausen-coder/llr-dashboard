// src/components/leads/ActivityListItem.jsx
//
// Sprint C/3 Phase 2 · Kompakte Activity-Row für den LeadPreviewDrawer.
//
// TODO Refactor-Debt: ACTIVITY_VARIANTS-Map ist hier eine Kopie aus
// LeadDetail.jsx (Z. 90–112). Wenn ein neuer Activity-Type hinzukommt,
// MUSS er an beiden Stellen ergänzt werden. Saubere Lösung wäre ein
// `src/lib/activityVariants.js`-Helper, aber Icon-Refs als JSX-Components
// machen den Extract-Aufwand höher als für Sprint-C/3 sinnvoll.
//
// Layout pro Item: [Icon 26×26 farbig] [Label · Zeit] [Description] [Actor]
//
// Props:
//   item          — Row aus useLeadActivities.items
//                   { source, id, type, timestamp, actor_id, payload, collapsed_count? }
//   actorProfile  — Profile-Object oder null (aus useLeadActivities.profilesById)
//   compact       — boolean (default true für Drawer-Mode)

import {
  CalendarCheck, Phone, TrendingUp, Mail, Send, Link2, FileText, Target,
  CheckCircle2, Link as LinkIcon, Users,
} from 'lucide-react';
import { COLORS } from '../../lib/leadStyleTokens';

const ACTIVITY_VARIANTS = {
  meeting:                  { bg: '#EAF3DE', fg: '#3B6D11', Icon: CalendarCheck, label: 'Meeting' },
  call:                     { bg: '#FAEEDA', fg: '#854F0B', Icon: Phone,         label: 'Anruf' },
  score:                    { bg: '#FAEEDA', fg: '#854F0B', Icon: TrendingUp,    label: 'Score-Update' },
  email:                    { bg: '#E6F1FB', fg: '#0C447C', Icon: Mail,          label: 'E-Mail' },
  message:                  { bg: '#EEEDFE', fg: '#3C3489', Icon: Send,          label: 'Nachricht' },
  linkedin_message:         { bg: '#E6F1FB', fg: '#0C447C', Icon: Send,          label: 'LinkedIn-Nachricht' },
  linkedin_connection:      { bg: '#E6F1FB', fg: '#0C447C', Icon: LinkIcon,      label: 'LinkedIn-Verbindung' },
  connection:               { bg: '#E6F1FB', fg: '#0C447C', Icon: LinkIcon,      label: 'Verbindung' },
  note:                     { bg: '#F1F5F9', fg: '#475569', Icon: FileText,      label: 'Notiz' },
  task:                     { bg: '#FAECE7', fg: '#7C2D12', Icon: Target,        label: 'Aufgabe' },
  field_changed_status:     { bg: '#FAEEDA', fg: '#854F0B', Icon: TrendingUp,    label: 'Status' },
  field_changed_deal_stage: { bg: '#FAEEDA', fg: '#854F0B', Icon: TrendingUp,    label: 'Deal-Stage' },
  field_changed_owner_id:   { bg: '#F1F5F9', fg: '#475569', Icon: Users,         label: 'Owner' },
  field_changed_lead_score: { bg: '#FAEEDA', fg: '#854F0B', Icon: TrendingUp,    label: 'Score' },
  task_created:             { bg: '#FAECE7', fg: '#7C2D12', Icon: Target,        label: 'Aufgabe erstellt' },
  task_completed:           { bg: '#EAF3DE', fg: '#3B6D11', Icon: CheckCircle2,  label: 'Aufgabe erledigt' },
  connection_requested:     { bg: '#E6F1FB', fg: '#0C447C', Icon: Link2,         label: 'Anfrage gesendet' },
  connection_responded:     { bg: '#DCFCE7', fg: '#166534', Icon: Link2,         label: 'Vernetzung beantwortet' },
};

const FALLBACK_VARIANT = { bg: '#F1F5F9', fg: '#475569', Icon: FileText, label: 'Aktivität' };

function variantFor(type) {
  return ACTIVITY_VARIANTS[type] || { ...FALLBACK_VARIANT, label: type || FALLBACK_VARIANT.label };
}

// Relative-Time-Formatter — kompakt für Drawer (vor 5min / vor 3h / vor 2d / 14. Mai).
function formatRelativeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'gerade';
  if (m < 60) return `vor ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `vor ${days}d`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

function actorName(profile) {
  if (!profile) return null;
  return profile.full_name
    || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    || profile.email
    || null;
}

// Description je Activity-Type — kompakt + truncated für Drawer-Layout.
function describeActivity(item) {
  const p = item.payload || {};
  const t = item.type;

  // Field-Changes mit before/after
  if (t === 'field_changed_status' || t === 'field_changed_deal_stage') {
    if (p.old_value && p.new_value) return `${p.old_value} → ${p.new_value}`;
    return p.new_value || '';
  }
  if (t === 'field_changed_lead_score') {
    const collapsed = (item.collapsed_count || 0) > 1 ? ` (${item.collapsed_count}×)` : '';
    if (p.old_value != null && p.new_value != null) return `${p.old_value} → ${p.new_value}${collapsed}`;
    return collapsed.trim();
  }
  if (t === 'field_changed_owner_id') {
    if (p.new_value === null || p.new_value === '') return 'entfernt';
    return p.new_value ? 'gewechselt' : '';
  }

  // Tasks
  if (t === 'task_created' || t === 'task_completed') {
    return p.title || p.task_title || '';
  }

  // Activities (note/meeting/call/email/message) — extrahiere Text-Field
  const text = p.note || p.content || p.body || p.subject || p.summary;
  if (text) {
    return text.length > 70 ? text.slice(0, 70) + '…' : text;
  }

  // Connections / Vernetzungen
  if (t.startsWith('connection_')) {
    if (p.message) return p.message.length > 70 ? p.message.slice(0, 70) + '…' : p.message;
    return '';
  }

  return '';
}

// ─── Styles ──────────────────────────────────────────────────────────────
const itemStyle = {
  display: 'flex',
  gap: 8,
  padding: '8px 0',
};
const itemStyleBordered = {
  ...itemStyle,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
};
const iconWrapStyle = {
  width: 26, height: 26, borderRadius: 6, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const contentStyle = { flex: 1, minWidth: 0 };
const topRowStyle = {
  display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between',
};
const labelStyle = {
  fontSize: 12, fontWeight: 600, color: COLORS.textPrimary,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const timeStyle = {
  fontSize: 11, color: COLORS.textTertiary, flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
};
const descStyle = {
  fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 1.4,
  overflow: 'hidden', textOverflow: 'ellipsis',
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
};
const actorStyle = {
  fontSize: 11, color: COLORS.textTertiary, marginTop: 2,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

export function ActivityListItem({ item, actorProfile, withBorder = true }) {
  const v = variantFor(item.type);
  const Icon = v.Icon;
  const actor = actorName(actorProfile);
  const description = describeActivity(item);

  return (
    <div style={withBorder ? itemStyleBordered : itemStyle}>
      <div style={{ ...iconWrapStyle, background: v.bg, color: v.fg }}>
        <Icon size={13} aria-hidden="true" />
      </div>
      <div style={contentStyle}>
        <div style={topRowStyle}>
          <span style={labelStyle}>{v.label}</span>
          <span style={timeStyle} title={item.timestamp ? new Date(item.timestamp).toLocaleString('de-DE') : ''}>
            {formatRelativeShort(item.timestamp)}
          </span>
        </div>
        {description && <div style={descStyle}>{description}</div>}
        {actor && <div style={actorStyle}>{actor}</div>}
      </div>
    </div>
  );
}
