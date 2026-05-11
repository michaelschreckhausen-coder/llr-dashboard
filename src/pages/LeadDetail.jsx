// src/pages/LeadDetail.jsx
//
// Detail-Seite für einen einzelnen Lead.
// Top-Down:
//   - Breadcrumb + Action-Icons
//   - Status-Pill
//   - Hero (Avatar + Name + Action-Buttons)
//   - Underline-Tabs
//   - Overview-Karte (Tags, Über, Metriken, Kontakt, Owner)
//   - Activity-Feed
//
// Tabs sind hier State-driven aber rendern immer den Content untereinander
// im "Übersicht"-Tab — die anderen Tabs könntet ihr lazy-mounten.

import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Users,
  Star,
  Sparkles,
  MoreHorizontal,
  Linkedin,
  Send,
  Mail,
  Phone,
  MapPin,
  Plus,
  Tag,
  Calendar,
  Target,
  Banknote,
  Workflow,
  Paperclip,
  Smile,
  CalendarCheck,
  TrendingUp,
  Link as LinkIcon,
} from 'lucide-react';
import { LeadAvatar } from '../components/leads/LeadAvatar';
import { LeadStatusPill } from '../components/leads/LeadStatusPill';
import { COLORS, RADIUS } from '../lib/leadStyleTokens';
import { getDisplayName, formatRelativeDate } from '../lib/leadHelpers';

const TABS = [
  { id: 'overview', label: 'Übersicht', count: null },
  { id: 'activity', label: 'Aktivitäten', countKey: 'activity_count' },
  { id: 'messages', label: 'Nachrichten', countKey: 'message_count' },
  { id: 'notes', label: 'Notizen', countKey: 'note_count' },
  { id: 'deals', label: 'Deals', countKey: 'deal_count' },
];

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  background: COLORS.surfaceCanvas,
};

const breadcrumbBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 28px',
  background: COLORS.surface,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
};

const breadcrumbStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: COLORS.textSecondary,
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

const heroStyle = {
  background: COLORS.surface,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  padding: '20px 28px 0',
};

const heroFlexStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
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

const secondaryBtnStyle = {
  ...primaryBtnStyle,
  background: COLORS.surface,
  color: COLORS.textPrimary,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  fontWeight: 400,
};

const tabsRowStyle = {
  display: 'flex',
  gap: 28,
  fontSize: 13,
};

const tabStyle = {
  padding: '8px 0 12px',
  color: COLORS.textSecondary,
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
};

const tabActiveStyle = {
  ...tabStyle,
  color: COLORS.textPrimary,
  fontWeight: 500,
  borderBottom: `2px solid ${COLORS.primary}`,
};

const tabCountStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  marginLeft: 4,
};

const contentStyle = {
  flex: 1,
  padding: '24px 28px',
  overflow: 'auto',
};

const cardStyle = {
  background: COLORS.surface,
  borderRadius: RADIUS.lg,
  border: `0.5px solid ${COLORS.borderSubtle}`,
  padding: '22px 24px',
  marginBottom: 20,
};

const sectionLabelStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 6,
};

const tagStyle = {
  background: COLORS.surfaceMuted,
  color: COLORS.textSecondary,
  fontSize: 11,
  padding: '3px 10px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const metricsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 12,
  padding: '16px 0',
  borderTop: `0.5px solid ${COLORS.borderSubtle}`,
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  marginBottom: 18,
};

const metricLabelStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  marginBottom: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const metricValueStyle = {
  fontSize: 14,
  fontWeight: 500,
  color: COLORS.textPrimary,
};

const contactGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px 32px',
  marginBottom: 20,
};

const contactRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
};

const contactLabelStyle = {
  color: COLORS.textTertiary,
  minWidth: 60,
};

const ownersRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  paddingTop: 16,
  borderTop: `0.5px solid ${COLORS.borderSubtle}`,
};

const ownerCellStyle = { textAlign: 'center' };

const ownerLabelStyle = {
  fontSize: 10,
  color: COLORS.textTertiary,
  marginTop: 4,
};

const emptyOwnerCircleStyle = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: `1.5px dashed ${COLORS.borderHover}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto',
  cursor: 'pointer',
  background: 'transparent',
};

// Activity
const noteInputWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  background: COLORS.surfaceMuted,
  borderRadius: RADIUS.md,
  marginBottom: 18,
};

const noteInputStyle = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  fontSize: 13,
  outline: 'none',
  color: COLORS.textPrimary,
};

const dayDividerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 14,
};

const dayDividerLineStyle = {
  flex: 1,
  height: '0.5px',
  background: COLORS.borderSubtle,
};

const dayDividerLabelStyle = {
  fontSize: 11,
  color: COLORS.textTertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const activityItemStyle = {
  display: 'flex',
  gap: 12,
  paddingBottom: 16,
  alignItems: 'flex-start',
};

const activityIconStyle = (bg, fg) => ({
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: bg,
  color: fg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const activityTextStyle = {
  fontSize: 13,
  color: COLORS.textPrimary,
  lineHeight: 1.5,
};

const activityMetaStyle = {
  fontSize: 12,
  color: COLORS.textTertiary,
  marginTop: 2,
};

const quoteBlockStyle = {
  background: COLORS.surfaceMuted,
  borderRadius: RADIUS.md,
  padding: '10px 12px',
  marginTop: 6,
  fontSize: 12,
  color: COLORS.textSecondary,
  lineHeight: 1.5,
};

// Icon-Color-Mapping für Activity-Types
const ACTIVITY_VARIANTS = {
  meeting: { bg: '#EAF3DE', fg: '#3B6D11', Icon: CalendarCheck },
  score: { bg: '#FAEEDA', fg: '#854F0B', Icon: TrendingUp },
  message: { bg: '#EEEDFE', fg: '#3C3489', Icon: Send },
  connection: { bg: '#E6F1FB', fg: '#0C447C', Icon: LinkIcon },
};

function ActivityItem({ type, text, meta, quote }) {
  const variant = ACTIVITY_VARIANTS[type] || ACTIVITY_VARIANTS.message;
  const { Icon } = variant;
  return (
    <div style={activityItemStyle}>
      <div style={activityIconStyle(variant.bg, variant.fg)}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={activityTextStyle}>{text}</div>
        {quote && <div style={quoteBlockStyle}>{quote}</div>}
        {meta && <div style={activityMetaStyle}>{meta}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function LeadDetail({ lead: leadProp }) {
  const params = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  // In Production: useLead(params.id) hook hier rein.
  // Für den Entwurf nehmen wir entweder prop oder Mock-Daten.
  const lead = leadProp || MOCK_LEAD;

  const handleBack = useCallback(() => navigate('/leads'), [navigate]);
  const handleTabChange = useCallback((id) => setActiveTab(id), []);

  const displayName = getDisplayName(lead);
  const owners = lead.owners || [];

  return (
    <div style={pageStyle}>
      {/* Breadcrumb */}
      <div style={breadcrumbBarStyle}>
        <div style={breadcrumbStyle}>
          <Users size={15} />
          <span style={{ cursor: 'pointer' }} onClick={handleBack}>Leads</span>
          <ChevronRight size={14} color={COLORS.textTertiary} />
          <span style={{ color: COLORS.textPrimary }}>{displayName}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={iconBtnStyle} aria-label="Favorit">
            <Star size={16} />
          </button>
          <button type="button" style={iconBtnStyle} aria-label="KI-Analyse">
            <Sparkles size={16} />
          </button>
          <button type="button" style={iconBtnStyle} aria-label="Mehr">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={heroStyle}>
        <div style={{ marginBottom: 12 }}>
          <LeadStatusPill
            status={lead.status}
            showDot
            showSublabel
            onClick={() => {}}
          />
        </div>
        <div style={heroFlexStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <LeadAvatar
              firstName={lead.first_name}
              lastName={lead.last_name}
              size="xl"
            />
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>
                {displayName}
              </h1>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                {lead.position}
                {lead.position && lead.company && ' · '}
                {lead.company}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {lead.linkedin_url && (
              <button type="button" style={secondaryBtnStyle}>
                <Linkedin size={16} />
                Profil
              </button>
            )}
            <button type="button" style={primaryBtnStyle}>
              <Send size={16} />
              Nachricht senden
            </button>
          </div>
        </div>

        <div style={tabsRowStyle}>
          {TABS.map((tab) => {
            const count = tab.countKey ? lead[tab.countKey] : null;
            const isActive = activeTab === tab.id;
            return (
              <div
                key={tab.id}
                style={isActive ? tabActiveStyle : tabStyle}
                onClick={() => handleTabChange(tab.id)}
                role="tab"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTabChange(tab.id);
                }}
              >
                {tab.label}
                {count != null && <span style={tabCountStyle}>{count}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={contentStyle}>
        {activeTab === 'overview' && (
          <>
            {/* Overview-Karte */}
            <div style={cardStyle}>
              {/* Tags */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                {(lead.tags || []).map((tag) => (
                  <span key={tag} style={tagStyle}>
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}
                <span style={{ ...tagStyle, color: COLORS.textTertiary, cursor: 'pointer' }}>
                  <Plus size={12} />
                  Tag
                </span>
              </div>

              {/* Über */}
              {lead.description && (
                <>
                  <div style={sectionLabelStyle}>Über</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
                    {lead.description}
                  </p>
                </>
              )}

              {/* Metriken */}
              <div style={metricsGridStyle}>
                <div>
                  <div style={metricLabelStyle}><Target size={13} />Score</div>
                  <div style={{ ...metricValueStyle, fontSize: 18 }}>{lead.score ?? '—'}</div>
                </div>
                <div>
                  <div style={metricLabelStyle}><Calendar size={13} />Nächste Aktion</div>
                  <div style={{ ...metricValueStyle, color: '#854F0B' }}>
                    {formatRelativeDate(lead.next_action_at)}
                    {lead.next_action_time && ` · ${lead.next_action_time}`}
                  </div>
                </div>
                <div>
                  <div style={metricLabelStyle}><Banknote size={13} />Deal-Wert</div>
                  <div style={metricValueStyle}>
                    {lead.deal_value
                      ? lead.deal_value.toLocaleString('de-DE') + ' €'
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={metricLabelStyle}><Workflow size={13} />Quelle</div>
                  <div style={metricValueStyle}>{lead.source || '—'}</div>
                </div>
              </div>

              {/* Kontakt */}
              <div style={contactGridStyle}>
                <ContactRow icon={Mail} label="E-Mail" value={lead.email} linkLike />
                <ContactRow icon={Phone} label="Telefon" value={lead.phone} />
                <ContactRow icon={Linkedin} label="LinkedIn" value={lead.linkedin_url} linkLike truncate />
                <ContactRow icon={MapPin} label="Ort" value={lead.location} />
              </div>

              {/* Owner */}
              <div style={ownersRowStyle}>
                {owners.map((owner) => (
                  <div key={owner.id} style={ownerCellStyle}>
                    <LeadAvatar
                      firstName={owner.first_name}
                      lastName={owner.last_name}
                      name={owner.name}
                      size="md"
                    />
                    <div style={ownerLabelStyle}>{owner.role || 'Owner'}</div>
                  </div>
                ))}
                <div style={ownerCellStyle}>
                  <button type="button" style={emptyOwnerCircleStyle} aria-label="Owner hinzufügen">
                    <Plus size={14} color={COLORS.textTertiary} />
                  </button>
                  <div style={ownerLabelStyle}>Hinzufügen</div>
                </div>
              </div>
            </div>

            {/* Activity-Karte */}
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>Aktivität</div>
                <span style={{ fontSize: 12, color: COLORS.textTertiary, cursor: 'pointer' }}>
                  Alle anzeigen
                </span>
              </div>

              <div style={noteInputWrapStyle}>
                <LeadAvatar firstName="M" lastName="S" size="sm" />
                <input
                  type="text"
                  style={noteInputStyle}
                  placeholder="Notiz hinzufügen oder @ erwähnen…"
                />
                <Paperclip size={16} color={COLORS.textTertiary} />
                <Smile size={16} color={COLORS.textTertiary} />
              </div>

              <DayDivider label="Heute" />
              <ActivityItem
                type="meeting"
                text={<><strong>{displayName.split(' ')[0]}</strong> hat einen Demo-Termin bestätigt</>}
                meta="Heute, 14:30 · vor 12 Minuten"
              />
              <ActivityItem
                type="score"
                text={<>Lead-Score von <strong>75</strong> auf <strong>{lead.score}</strong> gestiegen</>}
                meta="Heute, 09:14 · KI-Anreicherung"
              />

              <DayDivider label="Gestern" />
              <ActivityItem
                type="message"
                text={<><strong>Michael</strong> hat eine LinkedIn-Nachricht gesendet</>}
                quote="Hi Anna, danke für die spannende Diskussion im Webinar! Lass uns kurz telefonieren — ich glaube wir können euer SDR-Team mit Leadesk gut entlasten…"
                meta="Gestern, 16:42"
              />
              <ActivityItem
                type="connection"
                text="LinkedIn-Vernetzung akzeptiert"
                meta="Gestern, 11:08"
              />
            </div>
          </>
        )}

        {activeTab !== 'overview' && (
          <div style={{ ...cardStyle, textAlign: 'center', color: COLORS.textTertiary }}>
            Tab "{TABS.find((t) => t.id === activeTab)?.label}" — to be implemented
          </div>
        )}
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value, linkLike, truncate }) {
  return (
    <div style={contactRowStyle}>
      <Icon size={15} color={COLORS.textTertiary} />
      <span style={contactLabelStyle}>{label}</span>
      <span
        style={{
          color: linkLike ? '#185FA5' : COLORS.textPrimary,
          overflow: truncate ? 'hidden' : 'visible',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

function DayDivider({ label }) {
  return (
    <div style={dayDividerStyle}>
      <div style={dayDividerLineStyle} />
      <span style={dayDividerLabelStyle}>{label}</span>
      <div style={dayDividerLineStyle} />
    </div>
  );
}

// Demo-Daten, wird durch useLead(params.id) ersetzt
const MOCK_LEAD = {
  id: 'demo',
  first_name: 'Anna',
  last_name: 'Krüger',
  position: 'Head of Marketing',
  company: 'Rhino GmbH',
  status: 'SQL',
  score: 92,
  email: 'a.krueger@rhino.de',
  phone: '+49 30 5577 0142',
  linkedin_url: 'linkedin.com/in/anna-krueger',
  location: 'Berlin, DE',
  source: 'Webinar Mai',
  deal_value: 24000,
  next_action_at: new Date().toISOString(),
  next_action_time: '14:30',
  description:
    'Verantwortet Demand-Gen bei Rhino. Hat im Webinar zu LinkedIn-Outbound aktiv mitdiskutiert. Sucht Lösung für 12 SDRs, Entscheidung bis Ende Q2.',
  tags: ['Enterprise', 'DACH', 'Webinar-Lead'],
  owners: [
    { id: '1', first_name: 'Michael', last_name: 'Schreck', role: 'Owner' },
    { id: '2', first_name: 'Julian', last_name: 'Wolf', role: 'Sales' },
  ],
  activity_count: 12,
  message_count: 4,
  note_count: 0,
  deal_count: 1,
};
