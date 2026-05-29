// src/pages/Reports.jsx
//
// Neue Reports-Page — 2026-05-29 (Sprint Reports-v2)
//
// Komplett-Refactor der alten 789-Zeilen-Version. Nutzt jetzt:
//   - useReportsData-Hook (parallel-fetch von 6 Tabellen)
//   - CRM-Pipeline-Statuse (Lead/LQL/MQL/MQN/SQL) statt alter deal_stage-Werte
//   - Naming "Kontakte"/"Unternehmen" konsistent
//   - leads.organization_id-FK + lead_activity_feed-View + lead_tasks
//
// Layout:
//   Header (Range-Switcher 7/30/90)
//   ─ Top-KPI-Row (5 klickbare Cards, jeder triggert relevanten Tab)
//   ─ Tab-Bar (7 Tabs)
//   ─ Tab-Content (Section-Render)

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';
import { useReportsData } from '../hooks/useReportsData';
import { STATUS_ORDER, STATUS_CONFIG } from '../lib/leadStyleTokens';
import {
  Users, Flame, TrendingUp, Target, Activity, Calendar, Link as LinkIcon,
  Building2, Sparkles, Download, RefreshCw, CheckCircle2, AlertTriangle,
  Mail, MessageSquare, FileText, Phone,
} from 'lucide-react';

const PRIMARY = 'rgb(49,90,231)';
const COLORS = {
  surface: '#ffffff',
  canvas: '#F8FAFC',
  border: '#E4E7EC',
  borderSubtle: 'rgba(0,0,0,0.06)',
  text1: '#111827',
  text2: '#374151',
  text3: '#6B7280',
  text4: '#9CA3AF',
};

// ─── Deal-Stages-Config ────────────────────────────────────────────────
// CLAUDE.md sagt: stage-Werte sind deutsch in der DB.
// Enthält alle Stages aus Deals.jsx + leads.deal_stage-Legacy.
const DEAL_STAGES = [
  { key: 'interessent',  label: 'Interessent',      prob:  10, color: '#64748B' },
  { key: 'prospect',     label: 'Prospect',         prob:  15, color: '#3B82F6' },
  { key: 'qualifiziert', label: 'Qualifiziert',     prob:  25, color: '#0EA5E9' },
  { key: 'opportunity',  label: 'Gespräch',         prob:  30, color: '#8B5CF6' },
  { key: 'angebot',      label: 'Angebot',          prob:  50, color: '#F59E0B' },
  { key: 'verhandlung',  label: 'Verhandlung',      prob:  70, color: '#F97316' },
  { key: 'gewonnen',     label: 'Gewonnen',         prob: 100, color: '#22C55E' },
  { key: 'verloren',     label: 'Verloren',         prob:   0, color: '#94A3B8' },
];
const DEAL_STAGE_BY_KEY = Object.fromEntries(DEAL_STAGES.map(s => [s.key, s]));
// Stages die NICHT in der aktiven Pipeline zählen (won-Wert separat, lost ignoriert für Pipeline-Volume)
const PIPELINE_DEAD_STAGES = new Set(['verloren', 'kein_deal']);

const INTENT_LABELS = {
  hoch: { label: 'Hoch', color: '#DC2626', bg: '#FEF2F2' },
  mittel: { label: 'Mittel', color: '#D97706', bg: '#FFFBEB' },
  niedrig: { label: 'Niedrig', color: '#059669', bg: '#ECFDF5' },
  unbekannt: { label: 'Unbekannt', color: '#6B7280', bg: '#F3F4F6' },
};

const CONNECTION_LABELS = {
  verbunden:        { label: 'Verbunden',         color: '#059669', bg: '#ECFDF5' },
  pending:          { label: 'Anfrage offen',     color: '#D97706', bg: '#FFFBEB' },
  nicht_verbunden:  { label: 'Nicht verbunden',   color: '#6B7280', bg: '#F3F4F6' },
};

const PRIORITY_LABELS = {
  low:    { label: 'Niedrig', color: '#6B7280', bg: '#F3F4F6' },
  normal: { label: 'Normal',  color: '#185FA5', bg: '#EFF6FF' },
  high:   { label: 'Hoch',    color: '#DC2626', bg: '#FEF2F2' },
};

// Activity-Type → Visual-Group für Aggregation
const ACTIVITY_GROUPS = {
  messaging: ['linkedin_message', 'message', 'email'],
  calls:     ['call', 'meeting'],
  tasks:     ['task_created', 'task_completed'],
  status:    ['field_changed_status', 'field_changed_deal_stage', 'field_changed_lead_score', 'field_changed_owner_id'],
  connection:['connection_requested', 'connection_responded', 'linkedin_connection'],
  notes:     ['note'],
};
const ACTIVITY_GROUP_META = {
  messaging:  { label: 'Nachrichten',  color: '#3C3489', Icon: MessageSquare },
  calls:      { label: 'Calls/Meetings', color: '#0C447C', Icon: Phone },
  tasks:      { label: 'Aufgaben',     color: '#7C2D12', Icon: Target },
  status:     { label: 'Status-Changes', color: '#854F0B', Icon: TrendingUp },
  connection: { label: 'Vernetzungen', color: '#185FA5', Icon: LinkIcon },
  notes:      { label: 'Notizen',      color: '#475569', Icon: FileText },
};

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

const fmt = new Intl.NumberFormat('de-DE');
const fmtEUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function exportCsv(rows, filename) {
  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildDailyBuckets(items, dateField, days = 14) {
  const now = Date.now();
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(now - (days - 1 - i) * 86400000);
    return {
      label: `${d.getDate()}.${d.getMonth() + 1}`,
      iso: d.toISOString().slice(0, 10),
      count: 0,
    };
  });
  items.forEach(item => {
    const v = item[dateField];
    if (!v) return;
    const t = new Date(v).getTime();
    const idx = Math.floor((t - (now - days * 86400000)) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx].count++;
  });
  return buckets;
}

function memberName(member) {
  if (!member?.profile) return null;
  return member.profile.full_name
    || `${member.profile.first_name || ''} ${member.profile.last_name || ''}`.trim()
    || member.profile.email
    || null;
}

// ═══════════════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, sub, color = PRIMARY, Icon, onClick, active }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid ${active ? color : COLORS.border}`,
        borderRadius: 14,
        padding: '14px 16px',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: active ? `0 0 0 3px ${color}1a` : 'none',
        font: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      aria-pressed={!!active}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        {Icon && <Icon size={14} color={color} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: COLORS.text3 }}>{sub}</div>}
    </button>
  );
}

function SectionCard({ title, action, children }) {
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 14,
      padding: 18,
      marginBottom: 16,
    }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.text1, margin: 0 }}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function MiniBars({ data = [], color = PRIMARY, height = 80 }) {
  if (!data.length) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.text4, fontSize: 12 }}>Keine Daten</div>;
  }
  const max = Math.max(...data.map(d => d.count || 0), 1);
  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${data.length * 22} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {data.map((d, i) => {
          const h = Math.max(2, ((d.count || 0) / max) * (height - 18));
          return (
            <g key={i}>
              <rect x={i * 22 + 3} y={height - h - 14} width={16} height={h} rx={3} fill={color} opacity={0.85}>
                <title>{`${d.label}: ${d.count}`}</title>
              </rect>
              <text x={i * 22 + 11} y={height - 2} fontSize={9} textAnchor="middle" fill={COLORS.text4}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarRow({ label, count, total, color = PRIMARY, sub }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: COLORS.text2, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: COLORS.text3, fontVariantNumeric: 'tabular-nums' }}>
          <strong style={{ color: COLORS.text1 }}>{fmt.format(count)}</strong>{total > 0 && <> · {pct}%</>}
          {sub && <> · {sub}</>}
        </span>
      </div>
      <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function Donut({ percent = 0, size = 90, color = PRIMARY, label }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(1, Math.max(0, percent / 100));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text1, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(percent)}%
        </div>
        {label && <div style={{ fontSize: 10, color: COLORS.text3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>}
      </div>
    </div>
  );
}

// CRM-Pipeline-Funnel: Lead → LQL → MQL → MQN → SQL mit Conversion-Raten
function CrmFunnel({ leads }) {
  const stages = STATUS_ORDER.map(s => ({
    key: s,
    cfg: STATUS_CONFIG[s],
    count: leads.filter(l => l.status === s).length,
  }));
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        const prevCount = i > 0 ? stages[i - 1].count : null;
        const convRate = prevCount && prevCount > 0 ? Math.round((s.count / prevCount) * 100) : null;
        return (
          <div key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: COLORS.text1, fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.cfg.dot, marginRight: 6, verticalAlign: 1 }} />
                {s.cfg.label} <span style={{ color: COLORS.text3, fontWeight: 400 }}>· {s.cfg.sublabel}</span>
              </span>
              <span style={{ fontSize: 12, color: COLORS.text3, fontVariantNumeric: 'tabular-nums' }}>
                <strong style={{ color: COLORS.text1, fontSize: 13 }}>{s.count}</strong>
                {convRate != null && <span style={{ color: convRate > 50 ? '#059669' : convRate > 0 ? COLORS.text3 : '#DC2626', marginLeft: 6 }}>
                  · {convRate}% von vorher
                </span>}
              </span>
            </div>
            <div style={{ height: 14, background: '#F3F4F6', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                background: s.cfg.dot,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION RENDERERS
// ═══════════════════════════════════════════════════════════════════════

function OverviewSection({ data, range }) {
  const { leads, activities } = data;
  const activityBars = useMemo(() => buildDailyBuckets(activities, 'timestamp', 14), [activities]);
  const newLeadsBars = useMemo(() => buildDailyBuckets(leads, 'created_at', 14), [leads]);
  return (
    <>
      <SectionCard
        title="CRM-Pipeline (Status-Verteilung)"
        action={<button type="button" style={ghostBtnStyle} onClick={() => {
          const rows = [['Status', 'Sublabel', 'Anzahl']];
          STATUS_ORDER.forEach(s => {
            const cfg = STATUS_CONFIG[s];
            const count = leads.filter(l => l.status === s).length;
            rows.push([s, cfg.sublabel, count]);
          });
          exportCsv(rows, `crm-pipeline-${new Date().toISOString().slice(0, 10)}.csv`);
        }}><Download size={12} /> CSV</button>}>
        <CrmFunnel leads={leads} />
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SectionCard title={`Aktivitäten — letzte 14 Tage`}>
          <MiniBars data={activityBars} color={PRIMARY} />
          <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 6, textAlign: 'right' }}>
            {fmt.format(activities.length)} Events insgesamt im Range
          </div>
        </SectionCard>
        <SectionCard title="Neue Kontakte — letzte 14 Tage">
          <MiniBars data={newLeadsBars} color="#059669" />
          <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 6, textAlign: 'right' }}>
            {fmt.format(newLeadsBars.reduce((s, b) => s + b.count, 0))} neue Kontakte
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function PipelineSection({ data }) {
  // Pipeline arbeitet auf der deals-Tabelle (moderne Architektur).
  // leads.deal_stage/deal_value als Legacy-Fallback wenn deals leer.
  const allDeals = data.deals || [];
  const leadsById = new Map((data.leads || []).map(l => [l.id, l]));
  const orgsById = new Map((data.organizations || []).map(o => [o.id, o]));
  const members = data.members || [];

  // Owner-Filter (orthogonal zu allen Pipeline-Stats)
  const [ownerFilter, setOwnerFilter] = useState(null);
  const deals = ownerFilter ? allDeals.filter(d => d.owner_id === ownerFilter) : allDeals;

  const memberName = (uid) => {
    const m = members.find(x => x.user_id === uid);
    return m?.profile?.full_name || m?.profile?.email?.split('@')[0] || uid.slice(0,8);
  };

  const stageStats = DEAL_STAGES.map(s => ({
    ...s,
    count: deals.filter(d => d.stage === s.key).length,
    value: deals.filter(d => d.stage === s.key).reduce((sum, d) => sum + (Number(d.value) || 0), 0),
  }));
  const activeStages = stageStats.filter(s => !['gewonnen', 'verloren'].includes(s.key));
  const pipelineValue = activeStages.reduce((s, st) => s + st.value, 0);
  const wonValue = stageStats.find(s => s.key === 'gewonnen')?.value || 0;
  const won = stageStats.find(s => s.key === 'gewonnen');
  const lost = stageStats.find(s => s.key === 'verloren');
  const closed = (won?.count || 0) + (lost?.count || 0);
  const winRate = closed > 0 ? Math.round(((won?.count || 0) / closed) * 100) : 0;

  // Weighted Pipeline: stage-probability × value für offene Deals
  const weightedPipeline = deals
    .filter(d => !PIPELINE_DEAD_STAGES.has(d.stage) && d.stage !== 'gewonnen')
    .reduce((sum, d) => {
      const cfg = DEAL_STAGE_BY_KEY[d.stage];
      const prob = (Number(d.probability) || cfg?.prob || 0) / 100;
      return sum + (Number(d.value) || 0) * prob;
    }, 0);

  const topDeals = [...deals]
    .filter(d => !PIPELINE_DEAD_STAGES.has(d.stage) && d.stage !== 'gewonnen' && (Number(d.value) || 0) > 0)
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
    .slice(0, 10);
  const totalForBars = Math.max(...stageStats.map(s => s.count), 1);

  const dealLabel = (d) => {
    if (d.title) return d.title;
    const lead = leadsById.get(d.lead_id);
    if (lead) return `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.name || '—';
    const org = orgsById.get(d.organization_id);
    return org?.name || '—';
  };
  const dealOrg = (d) => orgsById.get(d.organization_id)?.name
    || (leadsById.get(d.lead_id)?.company)
    || '—';

  return (
    <>
      {/* Owner-Filter-Bar (sichtbar wenn ≥1 Team-Member geladen ist) */}
      {members.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner-Filter:</span>
          <button type="button" onClick={() => setOwnerFilter(null)}
            style={{ padding: '5px 11px', borderRadius: 99, border: `1.5px solid ${ownerFilter === null ? COLORS.primary : COLORS.border}`, background: ownerFilter === null ? COLORS.primary : '#fff', color: ownerFilter === null ? '#fff' : COLORS.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Alle ({allDeals.length})
          </button>
          {members.map(m => {
            const userId = m.user_id;
            const count = allDeals.filter(d => d.owner_id === userId).length;
            if (count === 0) return null;
            const active = ownerFilter === userId;
            return (
              <button key={userId} type="button" onClick={() => setOwnerFilter(active ? null : userId)}
                style={{ padding: '5px 11px', borderRadius: 99, border: `1.5px solid ${active ? COLORS.primary : COLORS.border}`, background: active ? COLORS.primary : '#fff', color: active ? '#fff' : COLORS.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {memberName(userId)} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title={`Deal-Stages (Anzahl + Wert) · ${deals.length} Deals`}
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Stage', 'Anzahl', 'Pipeline-Wert (EUR)']];
            stageStats.forEach(s => rows.push([s.label, s.count, s.value]));
            exportCsv(rows, `pipeline-stages-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {deals.length === 0 ? (
            <div style={emptyHintStyle}>Keine Deals im aktuellen Team.</div>
          ) : stageStats.map(s => (
            <BarRow key={s.key} label={s.label} count={s.count} total={totalForBars} color={s.color}
              sub={s.value > 0 ? fmtEUR.format(s.value) : null} />
          ))}
        </SectionCard>

        <SectionCard title="Win-Rate & Pipeline">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Donut percent={winRate} color="#22C55E" label="Win" />
            <div style={{ fontSize: 12, color: COLORS.text3, textAlign: 'center', lineHeight: 1.6 }}>
              {won?.count || 0} gewonnen · {lost?.count || 0} verloren<br />
              Pipeline-Wert: <strong style={{ color: COLORS.text1 }}>{fmtEUR.format(pipelineValue)}</strong><br />
              Gewichtet: <strong style={{ color: '#7C3AED' }}>{fmtEUR.format(weightedPipeline)}</strong><br />
              Gewonnen-Wert: <strong style={{ color: '#22C55E' }}>{fmtEUR.format(wonValue)}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Top 10 Deals (aktive Pipeline)"
        action={topDeals.length > 0 && <button type="button" style={ghostBtnStyle} onClick={() => {
          const rows = [['Deal', 'Unternehmen', 'Stage', 'Wahrscheinlichkeit', 'Wert (EUR)']];
          topDeals.forEach(d => rows.push([
            dealLabel(d),
            dealOrg(d),
            DEAL_STAGE_BY_KEY[d.stage]?.label || d.stage,
            (Number(d.probability) || DEAL_STAGE_BY_KEY[d.stage]?.prob || 0),
            Number(d.value) || 0,
          ]));
          exportCsv(rows, `top-deals-${new Date().toISOString().slice(0, 10)}.csv`);
        }}><Download size={12} /> CSV</button>}>
        {topDeals.length === 0 ? (
          <div style={emptyHintStyle}>Keine aktiven Deals im aktuellen Pool.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Deal</th>
                <th style={thStyle}>Unternehmen</th>
                <th style={thStyle}>Stage</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>WSK</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Wert</th>
              </tr>
            </thead>
            <tbody>
              {topDeals.map(d => {
                const stageCfg = DEAL_STAGE_BY_KEY[d.stage];
                const prob = Number(d.probability) || stageCfg?.prob || 0;
                return (
                  <tr key={d.id}>
                    <td style={tdStyle}>{dealLabel(d)}</td>
                    <td style={{ ...tdStyle, color: COLORS.text3 }}>{dealOrg(d)}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: (stageCfg?.color || '#94A3B8') + '22', color: stageCfg?.color || '#475569' }}>
                        {stageCfg?.label || d.stage}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: COLORS.text3, fontVariantNumeric: 'tabular-nums' }}>{prob}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtEUR.format(Number(d.value) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}

function LinkedInSection({ data }) {
  const { leads, ssiScores } = data;
  const connStats = Object.keys(CONNECTION_LABELS).map(key => ({
    key, ...CONNECTION_LABELS[key],
    count: leads.filter(l => (l.li_connection_status || 'nicht_verbunden') === key).length,
  }));
  const totalForConn = leads.length || 1;
  const verbunden = connStats.find(s => s.key === 'verbunden')?.count || 0;
  const connRate = leads.length > 0 ? Math.round((verbunden / leads.length) * 100) : 0;
  const replyStats = leads.reduce((acc, l) => {
    if (l.li_reply_behavior) acc[l.li_reply_behavior] = (acc[l.li_reply_behavior] || 0) + 1;
    return acc;
  }, {});
  const latestSsi = ssiScores.length > 0 ? ssiScores[ssiScores.length - 1] : null;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Verbindungsstatus"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Status', 'Anzahl', 'Prozent']];
            connStats.forEach(s => rows.push([s.label, s.count, totalForConn ? Math.round(s.count / totalForConn * 100) + '%' : '0%']));
            exportCsv(rows, `linkedin-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {connStats.map(s => (
            <BarRow key={s.key} label={s.label} count={s.count} total={totalForConn} color={s.color} />
          ))}
        </SectionCard>
        <SectionCard title="Connection-Rate">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Donut percent={connRate} color="#0C447C" label="Verbunden" />
            <div style={{ fontSize: 12, color: COLORS.text3, textAlign: 'center' }}>
              {verbunden} von {leads.length} Kontakten
            </div>
          </div>
        </SectionCard>
      </div>

      {Object.keys(replyStats).length > 0 && (
        <SectionCard title="Antwortverhalten">
          {Object.entries(replyStats).map(([k, v]) => (
            <BarRow key={k} label={k} count={v} total={verbunden || leads.length} color="#185FA5" />
          ))}
        </SectionCard>
      )}

      {ssiScores.length > 0 && (
        <SectionCard title="SSI-Score-Verlauf">
          {latestSsi && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              <SsiMini label="Brand"         value={latestSsi.build_brand} />
              <SsiMini label="People"        value={latestSsi.find_people} />
              <SsiMini label="Insights"      value={latestSsi.engage_insights} />
              <SsiMini label="Relationships" value={latestSsi.build_relationships} />
            </div>
          )}
          <MiniBars
            data={ssiScores.slice(-30).map(s => ({
              label: new Date(s.recorded_at).getDate() + '.',
              count: s.total_score,
            }))}
            color="#185FA5" height={90}
          />
          <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 6, textAlign: 'right' }}>
            Aktueller SSI: <strong style={{ color: COLORS.text1 }}>{latestSsi?.total_score || '—'}</strong> / 100
          </div>
        </SectionCard>
      )}

      {ssiScores.length === 0 && (
        <SectionCard title="SSI-Score-Verlauf">
          <div style={emptyHintStyle}>Noch keine SSI-Daten erfasst.</div>
        </SectionCard>
      )}
    </>
  );
}

function SsiMini({ label, value }) {
  const pct = Math.round((value / 25) * 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: COLORS.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text1, fontVariantNumeric: 'tabular-nums' }}>{value?.toFixed(1) || '—'}</div>
      <div style={{ height: 4, background: '#F3F4F6', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: '#185FA5' }} />
      </div>
    </div>
  );
}

function ActivitiesTasksSection({ data, members }) {
  const { activities, tasks } = data;
  // Group activities
  const groupCounts = useMemo(() => {
    const out = {};
    Object.keys(ACTIVITY_GROUPS).forEach(g => { out[g] = 0; });
    activities.forEach(a => {
      Object.entries(ACTIVITY_GROUPS).forEach(([g, types]) => {
        if (types.includes(a.type)) out[g]++;
      });
    });
    return out;
  }, [activities]);
  const today = new Date().toISOString().slice(0, 10);
  const openTasks = tasks.filter(t => t.status === 'open');
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < today);
  const todayTasks = openTasks.filter(t => t.due_date === today);
  const doneTasks = tasks.filter(t => t.status === 'done');
  const prioBreakdown = ['low', 'normal', 'high'].map(p => ({
    key: p,
    ...PRIORITY_LABELS[p],
    count: openTasks.filter(t => (t.priority || 'normal') === p).length,
  }));
  // Top-Performer: assigned_to-Counts der offenen Tasks
  const performerCounts = openTasks.reduce((acc, t) => {
    if (t.assigned_to) acc[t.assigned_to] = (acc[t.assigned_to] || 0) + 1;
    return acc;
  }, {});
  const performers = Object.entries(performerCounts)
    .map(([uid, count]) => {
      const m = (members || []).find(mm => mm.user_id === uid);
      return { uid, count, name: memberName(m) || 'Unbekannt' };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const totalForGroups = Math.max(...Object.values(groupCounts), 1);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Aktivitäten nach Typ"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Typ', 'Anzahl']];
            Object.entries(groupCounts).forEach(([g, c]) => rows.push([ACTIVITY_GROUP_META[g].label, c]));
            exportCsv(rows, `activity-types-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {Object.entries(groupCounts).map(([g, count]) => (
            <BarRow key={g} label={ACTIVITY_GROUP_META[g].label} count={count} total={totalForGroups} color={ACTIVITY_GROUP_META[g].color} />
          ))}
        </SectionCard>

        <SectionCard title="Aufgaben-Übersicht">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <MiniStat label="Offen" value={openTasks.length} color={PRIMARY} />
            <MiniStat label="Überfällig" value={overdueTasks.length} color="#DC2626" />
            <MiniStat label="Heute fällig" value={todayTasks.length} color="#D97706" />
            <MiniStat label="Erledigt" value={doneTasks.length} color="#059669" />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.text3, textTransform: 'uppercase', marginBottom: 8 }}>Priorität (offen)</div>
          {prioBreakdown.map(p => (
            <BarRow key={p.key} label={p.label} count={p.count} total={openTasks.length || 1} color={p.color} />
          ))}
        </SectionCard>
      </div>

      {performers.length > 0 && (
        <SectionCard title="Top-Performer (offene Aufgaben pro Team-Mitglied)"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Name', 'Offene Aufgaben']];
            performers.forEach(p => rows.push([p.name, p.count]));
            exportCsv(rows, `performers-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {performers.map(p => (
            <BarRow key={p.uid} label={p.name} count={p.count} total={openTasks.length || 1} color="#7C3AED" />
          ))}
        </SectionCard>
      )}
    </>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: color + '11', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function CrmStatusSection({ data }) {
  const { leads, members } = data;
  // Source-Verteilung
  const sourceCounts = leads.reduce((acc, l) => {
    const k = l.source || '— ohne Source';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const sourceRows = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  // Tag-Cloud (Top 15)
  const tagCounts = {};
  leads.forEach(l => (l.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const maxTagCount = topTags[0]?.[1] || 1;
  // Owner-Performance
  const ownerCounts = leads.reduce((acc, l) => {
    if (l.owner_id) acc[l.owner_id] = (acc[l.owner_id] || 0) + 1;
    return acc;
  }, {});
  const owners = Object.entries(ownerCounts)
    .map(([uid, count]) => {
      const m = (members || []).find(mm => mm.user_id === uid);
      const hot = leads.filter(l => l.owner_id === uid && (l.lead_score || 0) >= 70).length;
      const sql = leads.filter(l => l.owner_id === uid && l.status === 'SQL').length;
      return { uid, count, hot, sql, name: memberName(m) || 'Unbekannt' };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Top 10 Sources"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Source', 'Anzahl']];
            sourceRows.forEach(([s, c]) => rows.push([s, c]));
            exportCsv(rows, `sources-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {sourceRows.length === 0 ? (
            <div style={emptyHintStyle}>Keine Source-Daten</div>
          ) : sourceRows.map(([s, c]) => (
            <BarRow key={s} label={s} count={c} total={leads.length || 1} color="#7C3AED" />
          ))}
        </SectionCard>

        <SectionCard title="Tag-Cloud (Top 20)">
          {topTags.length === 0 ? (
            <div style={emptyHintStyle}>Keine Tags vergeben</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {topTags.map(([tag, count]) => {
                const weight = Math.max(11, 11 + (count / maxTagCount) * 8);
                return (
                  <span key={tag} style={{
                    background: COLORS.canvas, color: COLORS.text2,
                    padding: '4px 10px', borderRadius: 999,
                    fontSize: weight, fontWeight: 500 + Math.round((count / maxTagCount) * 200),
                    border: `1px solid ${COLORS.border}`,
                  }}>{tag} <span style={{ color: COLORS.text4, fontSize: 11 }}>{count}</span></span>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {owners.length > 0 && (
        <SectionCard title="Owner-Performance"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Owner', 'Kontakte gesamt', 'Hot Kontakte (Score ≥ 70)', 'SQL']];
            owners.forEach(o => rows.push([o.name, o.count, o.hot, o.sql]));
            exportCsv(rows, `owner-performance-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Owner</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Kontakte</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hot</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>SQL</th>
              </tr>
            </thead>
            <tbody>
              {owners.map(o => (
                <tr key={o.uid}>
                  <td style={tdStyle}>{o.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.count}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#DC2626' }}>{o.hot}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#059669' }}>{o.sql}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </>
  );
}

function AiSection({ data }) {
  const { leads } = data;
  const intentCounts = Object.keys(INTENT_LABELS).map(key => ({
    key, ...INTENT_LABELS[key],
    count: leads.filter(l => (l.ai_buying_intent || 'unbekannt') === key).length,
  }));
  const needDetected = leads.filter(l => l.ai_need_detected === true).length;
  const analysisLeads = leads.filter(l => l.ai_last_analysis_at).length;
  // Score-Histogram (Bins 0-9, 10-19, ..., 90-100)
  const scoreBins = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}-${i * 10 + 9}`,
    count: 0,
  }));
  leads.forEach(l => {
    const s = l.lead_score || 0;
    const idx = Math.min(9, Math.floor(s / 10));
    scoreBins[idx].count++;
  });
  const recentAnalyses = [...leads]
    .filter(l => l.ai_last_analysis_at)
    .sort((a, b) => new Date(b.ai_last_analysis_at) - new Date(a.ai_last_analysis_at))
    .slice(0, 10);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Buying-Intent-Verteilung"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Intent', 'Anzahl']];
            intentCounts.forEach(i => rows.push([i.label, i.count]));
            exportCsv(rows, `ai-intent-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {intentCounts.map(i => (
            <BarRow key={i.key} label={i.label} count={i.count} total={leads.length || 1} color={i.color} />
          ))}
        </SectionCard>
        <SectionCard title="KI-Analyse-Status">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MiniStat label="Mit Analyse" value={analysisLeads} color={PRIMARY} />
            <MiniStat label="Bedarf erkannt" value={needDetected} color="#059669" />
          </div>
          <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 10 }}>
            {leads.length > 0 ? Math.round((analysisLeads / leads.length) * 100) : 0}% der Kontakte sind KI-analysiert
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Score-Verteilung (Histogram)">
        <MiniBars
          data={scoreBins}
          color={PRIMARY}
          height={100}
        />
        <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 6, textAlign: 'right' }}>
          Hot Kontakte (Score ≥ 70): <strong style={{ color: '#DC2626' }}>{leads.filter(l => (l.lead_score || 0) >= 70).length}</strong>
        </div>
      </SectionCard>

      {recentAnalyses.length > 0 && (
        <SectionCard title="Letzte KI-Analysen">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Kontakt</th>
                <th style={thStyle}>Unternehmen</th>
                <th style={thStyle}>Intent</th>
                <th style={thStyle}>Modell</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Datum</th>
              </tr>
            </thead>
            <tbody>
              {recentAnalyses.map(l => {
                const intent = INTENT_LABELS[l.ai_buying_intent] || INTENT_LABELS.unbekannt;
                return (
                  <tr key={l.id}>
                    <td style={tdStyle}>{`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.name || '—'}</td>
                    <td style={{ ...tdStyle, color: COLORS.text3 }}>{l.company || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: intent.bg, color: intent.color }}>{intent.label}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: COLORS.text3 }}>{l.ai_last_analysis_model || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: COLORS.text3 }}>
                      {new Date(l.ai_last_analysis_at).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
    </>
  );
}

function OrganizationsSection({ data }) {
  const { organizations, leads } = data;
  const orgsByLead = [...organizations]
    .map(o => ({
      ...o,
      leadCount: o.leads?.[0]?.count ?? 0,
      dealCount: o.deals?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.leadCount - a.leadCount);
  const top10 = orgsByLead.slice(0, 10);
  const industryCounts = organizations.reduce((acc, o) => {
    const k = o.industry_slug || '— ohne Branche';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const industries = Object.entries(industryCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const unlinkedLeads = leads.filter(l => l.company && !l.organization_id).length;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <SectionCard title="Top 10 Unternehmen (Kontakt-Anzahl)"
          action={<button type="button" style={ghostBtnStyle} onClick={() => {
            const rows = [['Unternehmen', 'Stadt', 'Branche', 'Kontakte', 'Deals']];
            top10.forEach(o => rows.push([o.name, o.city || '', o.industry_slug || '', o.leadCount, o.dealCount]));
            exportCsv(rows, `top-orgs-${new Date().toISOString().slice(0, 10)}.csv`);
          }}><Download size={12} /> CSV</button>}>
          {top10.length === 0 ? (
            <div style={emptyHintStyle}>Noch keine Unternehmen angelegt</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Unternehmen</th>
                  <th style={thStyle}>Stadt</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Kontakte</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Deals</th>
                </tr>
              </thead>
              <tbody>
                {top10.map(o => (
                  <tr key={o.id}>
                    <td style={tdStyle}>{o.name}</td>
                    <td style={{ ...tdStyle, color: COLORS.text3 }}>{o.city || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.leadCount}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.dealCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Branchen-Verteilung">
          {industries.length === 0 ? (
            <div style={emptyHintStyle}>Keine Branchen-Daten</div>
          ) : industries.map(([k, v]) => (
            <BarRow key={k} label={k} count={v} total={organizations.length || 1} color="#0EA5E9" />
          ))}
        </SectionCard>
      </div>

      <SectionCard title="Daten-Hygiene">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <MiniStat label="Unternehmen gesamt" value={organizations.length} color={PRIMARY} />
          <MiniStat label="Mit Kontakten verlinkt" value={orgsByLead.filter(o => o.leadCount > 0).length} color="#059669" />
          <MiniStat label="Orphan-Kontakte" value={unlinkedLeads} color={unlinkedLeads > 0 ? '#D97706' : '#059669'} />
        </div>
        {unlinkedLeads > 0 && (
          <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 10 }}>
            {unlinkedLeads} Kontakt{unlinkedLeads === 1 ? '' : 'e'} mit company-Text ohne Verlinkung zu einem Unternehmen-Record. Beim nächsten Picker-Edit wird automatisch verlinkt.
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'overview',     label: 'Übersicht',         Icon: TrendingUp },
  { id: 'pipeline',     label: 'Pipeline',          Icon: Target },
  { id: 'linkedin',     label: 'LinkedIn',          Icon: LinkIcon },
  { id: 'activities',   label: 'Aktivitäten',       Icon: Activity },
  { id: 'crm',          label: 'CRM-Status',        Icon: Users },
  { id: 'ai',           label: 'KI',                Icon: Sparkles },
  { id: 'organizations',label: 'Unternehmen',       Icon: Building2 },
];

export default function Reports({ session }) {
  const navigate = useNavigate();
  const { activeTeamId } = useTeam() || {};
  const userId = session?.user?.id;
  const [range, setRange] = useState(30);
  const [tab, setTab] = useState('overview');

  const data = useReportsData({ rangeDays: range, activeTeamId, userId });
  const { leads, activities, tasks, isLoading, refetch, members } = data;

  // ─── KPI-Berechnungen ─────────────────────────────────────────────────
  const totalLeads = leads.length;
  const hotLeads = leads.filter(l => (l.lead_score || 0) >= 70).length;
  // Pipeline-KPIs aus deals-Tabelle (moderne Architektur);
  // leads.deal_stage/deal_value sind Legacy-Felder die für die KPIs
  // bewusst ignoriert werden — sonst Doppelzählung.
  const deals = data.deals || [];
  const pipelineValue = deals
    .filter(d => d.stage && !['verloren', 'kein_deal', 'gewonnen'].includes(d.stage))
    .reduce((s, d) => s + (Number(d.value) || 0), 0);
  const won = deals.filter(d => d.stage === 'gewonnen').length;
  const lost = deals.filter(d => d.stage === 'verloren').length;
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const todayISO = new Date().toISOString().slice(0, 10);
  const openTasksCount = tasks.filter(t => t.status === 'open').length;
  const overdueCount = tasks.filter(t => t.status === 'open' && t.due_date && t.due_date < todayISO).length;

  return (
    <div style={{ background: COLORS.canvas, minHeight: '100vh', padding: '24px 24px 60px' }}>
      <div style={{ width: '100%', margin: '0 auto', maxWidth: 1400 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: COLORS.text1 }}>Reports</h1>
            <div style={{ fontSize: 13, color: COLORS.text3, marginTop: 4 }}>
              Übersicht über Pipeline, Aktivitäten und Performance · Range {range} Tage
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[7, 30, 90].map(d => (
              <button key={d} type="button" onClick={() => setRange(d)}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: range === d ? PRIMARY : COLORS.surface,
                  color: range === d ? '#fff' : COLORS.text2,
                  border: range === d ? `1px solid ${PRIMARY}` : `1px solid ${COLORS.border}`,
                }}>{d} Tage</button>
            ))}
            <button type="button" onClick={refetch} title="Aktualisieren" style={iconBtnStyle}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* KPI-Row — klickbar, jeder Card setzt den passenden Tab */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          <KpiCard label="Kontakte"      value={fmt.format(totalLeads)}   sub="im Pool"          color={PRIMARY}    Icon={Users}       onClick={() => setTab('overview')}  active={tab === 'overview'} />
          <KpiCard label="Hot Kontakte"  value={fmt.format(hotLeads)}     sub="Score ≥ 70"       color="#DC2626"    Icon={Flame}       onClick={() => setTab('ai')}        active={tab === 'ai'} />
          <KpiCard label="Pipeline-Wert" value={fmtEUR.format(pipelineValue)} sub="aktiv"        color="#22C55E"    Icon={Target}      onClick={() => setTab('pipeline')}  active={tab === 'pipeline'} />
          <KpiCard label="Win-Rate"      value={`${winRate}%`}            sub={`${won} won · ${lost} lost`} color="#0C447C" Icon={TrendingUp} onClick={() => setTab('pipeline')}  active={tab === 'pipeline'} />
          <KpiCard label="Offene Tasks"  value={fmt.format(openTasksCount)} sub={overdueCount > 0 ? `${overdueCount} überfällig` : 'alles im Plan'} color="#7C3AED" Icon={CheckCircle2} onClick={() => setTab('activities')} active={tab === 'activities'} />
        </div>

        {/* Tab-Bar */}
        <div style={{
          display: 'flex', gap: 2, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}`, overflowX: 'auto',
        }}>
          {TABS.map(t => {
            const Icon = t.Icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? PRIMARY : COLORS.text3,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? PRIMARY : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: COLORS.text4, fontSize: 14 }}>⏳ Lade Reports-Daten…</div>
        ) : (
          <>
            {tab === 'overview'      && <OverviewSection data={data} range={range} />}
            {tab === 'pipeline'      && <PipelineSection data={data} />}
            {tab === 'linkedin'      && <LinkedInSection data={data} />}
            {tab === 'activities'    && <ActivitiesTasksSection data={data} members={members} />}
            {tab === 'crm'           && <CrmStatusSection data={data} />}
            {tab === 'ai'            && <AiSection data={data} />}
            {tab === 'organizations' && <OrganizationsSection data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared Inline Styles ────────────────────────────────────────────────
const ghostBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  background: COLORS.surface, color: COLORS.text2,
  border: `1px solid ${COLORS.border}`, borderRadius: 6,
  cursor: 'pointer', font: 'inherit',
};
const iconBtnStyle = {
  width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
  color: COLORS.text3, cursor: 'pointer',
};
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = {
  textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700,
  color: COLORS.text3, textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: `1px solid ${COLORS.borderSubtle}`,
};
const tdStyle = {
  padding: '10px', fontSize: 13, color: COLORS.text1,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
};
const emptyHintStyle = {
  fontSize: 13, color: COLORS.text3, textAlign: 'center', padding: '24px 0', fontStyle: 'italic',
};
