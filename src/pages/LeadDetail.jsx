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
} from 'lucide-react';
import { LeadAvatar } from '../components/leads/LeadAvatar';
import { LeadStatusPill } from '../components/leads/LeadStatusPill';
import { IcLinkedin } from '../components/leads/IcLinkedin';
import { COLORS, RADIUS } from '../lib/leadStyleTokens';
import { getDisplayName, formatRelativeDate } from '../lib/leadHelpers';
import { useProfiles } from '../hooks/useProfiles';
import { useLead } from '../hooks/useLead';
import { useTeam } from '../context/TeamContext';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'overview', label: 'Übersicht', count: null },
  { id: 'activity', label: 'Aktivitäten', countKey: 'activity_count' },
  { id: 'messages', label: 'Nachrichten', countKey: 'message_count' },
  { id: 'notes', label: 'Notizen', countKey: 'note_count' },
  { id: 'deals', label: 'Deals', countKey: 'deal_count' },
];

// ─── Styles ───────────────────────────────────────────────────────────────
const pageStyle = { display:'flex', flexDirection:'column', minHeight:'100vh', background: COLORS.surfaceCanvas };
const breadcrumbBarStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 28px', background: COLORS.surface, borderBottom:`0.5px solid ${COLORS.borderSubtle}` };
const breadcrumbStyle = { display:'flex', alignItems:'center', gap:6, fontSize:13, color: COLORS.textSecondary };
const iconBtnStyle = { width:34, height:34, border:`0.5px solid ${COLORS.borderSubtle}`, background: COLORS.surface, borderRadius: RADIUS.md, display:'flex', alignItems:'center', justifyContent:'center', color: COLORS.textSecondary, cursor:'pointer' };
const heroStyle = { background: COLORS.surface, borderBottom:`0.5px solid ${COLORS.borderSubtle}`, padding:'20px 28px 0' };
const heroFlexStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 };
const primaryBtnStyle = { height:34, padding:'0 14px', background: COLORS.primary, color: COLORS.primaryFg, border:'none', borderRadius: RADIUS.md, fontSize:13, fontWeight:500, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' };
const secondaryBtnStyle = { ...primaryBtnStyle, background: COLORS.surface, color: COLORS.textPrimary, border:`0.5px solid ${COLORS.borderSubtle}`, fontWeight:400 };
const ghostBtnStyle = { ...secondaryBtnStyle, height:30, padding:'0 12px', fontSize:12 };
const tabsRowStyle = { display:'flex', gap:28, fontSize:13 };
const tabStyle = { padding:'8px 0 12px', color: COLORS.textSecondary, cursor:'pointer', borderBottom:'2px solid transparent' };
const tabActiveStyle = { ...tabStyle, color: COLORS.textPrimary, fontWeight:500, borderBottom:`2px solid ${COLORS.primary}` };
const tabCountStyle = { fontSize:11, color: COLORS.textTertiary, marginLeft:4 };
const contentStyle = { flex:1, padding:'24px 28px', overflow:'auto' };
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

// ─── Main Component ───────────────────────────────────────────────────────
export default function LeadDetail({ lead: leadProp }) {
  const params = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const isMock = params.id === 'mock' || params.id === 'demo';
  const { lead: fetchedLead, isLoading, error } = useLead(leadProp || isMock ? null : params.id);
  const lead = leadProp || (isMock ? MOCK_LEAD : fetchedLead);

  const handleBack = useCallback(() => navigate('/leads'), [navigate]);
  const handleTabChange = useCallback((id) => setActiveTab(id), []);

  const ownerIds = useMemo(() => (lead?.owner_id ? [lead.owner_id] : []), [lead?.owner_id]);
  const { profilesById } = useProfiles(ownerIds);
  const owner = lead?.owner || (lead?.owner_id ? profilesById.get(lead.owner_id) : null) || null;

  if (isLoading && !lead) return <DetailSkeleton onBack={handleBack} />;
  if (!lead) return <DetailNotFound error={error} onBack={handleBack} />;

  const displayName = getDisplayName(lead);

  return (
    <div style={pageStyle}>
      {/* Breadcrumb */}
      <div style={breadcrumbBarStyle}>
        <div style={breadcrumbStyle}>
          <Users size={15} />
          <span style={{ cursor:'pointer' }} onClick={handleBack}>Leads</span>
          <ChevronRight size={14} color={COLORS.textTertiary} />
          <span style={{ color: COLORS.textPrimary }}>{displayName}</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button type="button" style={iconBtnStyle} aria-label="Favorit"><Star size={16} /></button>
          <button type="button" style={iconBtnStyle} aria-label="KI-Analyse"><Sparkles size={16} /></button>
          <button type="button" style={iconBtnStyle} aria-label="Mehr"><MoreHorizontal size={16} /></button>
        </div>
      </div>

      {/* Hero */}
      <div style={heroStyle}>
        <div style={{ marginBottom:12 }}>
          <LeadStatusPill status={lead.status} showDot showSublabel onClick={() => {}} />
        </div>
        <div style={heroFlexStyle}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <LeadAvatar firstName={lead.first_name} lastName={lead.last_name} size="xl" />
            <div>
              <h1 style={{ fontSize:22, fontWeight:500, margin:0 }}>{displayName}</h1>
              <div style={{ fontSize:13, color: COLORS.textSecondary, marginTop:2 }}>
                {lead.job_title}
                {lead.job_title && lead.company && ' · '}
                {lead.company}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {lead.linkedin_url && (
              <button type="button" style={secondaryBtnStyle}>
                <IcLinkedin size={16} /> Profil
              </button>
            )}
            <button type="button" style={primaryBtnStyle} onClick={() => setActiveTab('messages')}>
              <Send size={16} /> Nachricht senden
            </button>
          </div>
        </div>

        <div style={tabsRowStyle}>
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
      </div>

      <div style={contentStyle}>
        {activeTab === 'overview' && <OverviewTab lead={lead} owner={owner} />}
        {activeTab === 'activity' && <ActivityTab leadId={lead.id} />}
        {activeTab === 'messages' && <MessagesTab leadId={lead.id} lead={lead} />}
        {activeTab === 'notes' && <NotesTab leadId={lead.id} leadTeamId={lead.team_id} />}
        {activeTab === 'deals' && <DealsTab leadId={lead.id} navigate={navigate} />}
      </div>
    </div>
  );
}

// ─── OverviewTab (extrahiert aus Original) ───────────────────────────────
function OverviewTab({ lead, owner }) {
  return (
    <>
      <div style={cardStyle}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:18 }}>
          {(lead.tags || []).map((tag) => (
            <span key={tag} style={tagStyle}><Tag size={12} />{tag}</span>
          ))}
          <span style={{ ...tagStyle, color: COLORS.textTertiary, cursor:'pointer' }}>
            <Plus size={12} /> Tag
          </span>
        </div>
        {lead.notes && (
          <>
            <div style={sectionLabelStyle}>Über</div>
            <p style={{ fontSize:14, lineHeight:1.6, margin:'0 0 20px' }}>{lead.notes}</p>
          </>
        )}
        <div style={metricsGridStyle}>
          <div>
            <div style={metricLabelStyle}><Target size={13} />Score</div>
            <div style={{ ...metricValueStyle, fontSize:18 }}>{lead.lead_score ?? lead.score ?? '—'}</div>
          </div>
          <div>
            <div style={metricLabelStyle}><Calendar size={13} />Nächste Aktion</div>
            <div style={{ ...metricValueStyle, color:'#854F0B' }}>{formatRelativeDate(lead.next_followup)}</div>
          </div>
          <div>
            <div style={metricLabelStyle}><Banknote size={13} />Deal-Wert</div>
            <div style={metricValueStyle}>
              {lead.deal_value ? lead.deal_value.toLocaleString('de-DE') + ' €' : '—'}
            </div>
          </div>
          <div>
            <div style={metricLabelStyle}><Workflow size={13} />Quelle</div>
            <div style={metricValueStyle}>{lead.source || '—'}</div>
          </div>
        </div>
        <div style={contactGridStyle}>
          <ContactRow icon={Mail} label="E-Mail" value={lead.email} linkLike />
          <ContactRow icon={Phone} label="Telefon" value={lead.phone} />
          <ContactRow icon={IcLinkedin} label="LinkedIn" value={lead.linkedin_url} linkLike truncate />
          <ContactRow icon={MapPin} label="Ort" value={lead.location} />
        </div>
        <div style={ownersRowStyle}>
          {owner && (
            <div style={ownerCellStyle}>
              <LeadAvatar firstName={owner.first_name} lastName={owner.last_name} size="md" />
              <div style={ownerLabelStyle}>Owner</div>
            </div>
          )}
          <div style={ownerCellStyle}>
            <button type="button" style={emptyOwnerCircleStyle} aria-label="Owner hinzufügen">
              <Plus size={14} color={COLORS.textTertiary} />
            </button>
            <div style={ownerLabelStyle}>{owner ? 'Ändern' : 'Hinzufügen'}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── ActivityTab ──────────────────────────────────────────────────────────
function ActivityTab({ leadId }) {
  const [items, setItems] = useState([]);
  const [profilesById, setProfilesById] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('note');
  const [newSubject, setNewSubject] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      const { data, error } = await supabase
        .from('activities')
        .select('id, type, subject, body, direction, outcome, occurred_at, user_id')
        .eq('lead_id', leadId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) { setErr(error.message); setLoading(false); return; }
      setItems(data || []);
      const map = await fetchProfilesMap((data || []).map(a => a.user_id));
      if (cancelled) return;
      setProfilesById(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const grouped = useMemo(() => groupByDay(items), [items]);

  const submit = async () => {
    if (!newSubject.trim()) return;
    setAdding(true); setErr(null);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const { data, error } = await supabase.from('activities').insert({
      lead_id: leadId, user_id: userId, type: newType,
      subject: newSubject.trim(), direction: 'outbound',
      occurred_at: new Date().toISOString(),
    }).select('id, type, subject, body, direction, outcome, occurred_at, user_id').single();
    setAdding(false);
    if (error) { setErr(error.message); return; }
    setItems(prev => [data, ...prev]);
    if (userId && !profilesById.has(userId)) {
      const map = await fetchProfilesMap([userId]);
      setProfilesById(prev => {
        const next = new Map(prev);
        map.forEach((v, k) => next.set(k, v));
        return next;
      });
    }
    setNewSubject('');
  };

  const remove = async (id) => {
    if (!confirm('Aktivität löschen?')) return;
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) { setErr(error.message); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:500 }}>Aktivitätsverlauf</div>
        <span style={{ fontSize:12, color: COLORS.textTertiary }}>
          {loading ? 'Lade…' : `${items.length} Einträge`}
        </span>
      </div>

      {/* Quick-Add */}
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

      {!loading && items.length === 0 && (
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
        <ActivityRow key={g.data.id} act={g.data} author={authorName(profilesById.get(g.data.user_id))} onDelete={() => remove(g.data.id)} />
      ))}
    </div>
  );
}

function ActivityRow({ act, author, onDelete }) {
  const v = variantFor(act.type);
  const Icon = v.Icon;
  const time = act.occurred_at ? new Date(act.occurred_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '';
  return (
    <div style={activityItemStyle}>
      <div style={activityIconStyle(v.bg, v.fg)}><Icon size={16} /></div>
      <div style={{ flex:1 }}>
        <div style={activityTextStyle}>
          <strong style={{ fontWeight:500 }}>{v.label}</strong>
          {act.subject && <> · {act.subject}</>}
        </div>
        {act.body && <div style={quoteBlockStyle}>{act.body}</div>}
        <div style={activityMetaStyle}>
          {time}
          {author && ` · ${author}`}
          {act.direction && ` · ${act.direction === 'outbound' ? 'ausgehend' : 'eingehend'}`}
          {act.outcome && ` · ${act.outcome}`}
        </div>
      </div>
      <button type="button" onClick={onDelete}
        style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary, padding:4 }}
        aria-label="Löschen" title="Aktivität löschen">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── MessagesTab ──────────────────────────────────────────────────────────
function MessagesTab({ leadId, lead }) {
  const [items, setItems] = useState([]);
  const [profilesById, setProfilesById] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [msgType, setMsgType] = useState('linkedin_message');
  const [msgBody, setMsgBody] = useState('');
  const [err, setErr] = useState(null);

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

// ─── DealsTab ─────────────────────────────────────────────────────────────
const DEAL_STAGE_LABELS = {
  kein_deal: 'Kein Deal', prospect: 'Prospect', opportunity: 'Opportunity',
  angebot: 'Angebot', verhandlung: 'Verhandlung', gewonnen: 'Gewonnen', verloren: 'Verloren',
};
const DEAL_STAGE_COLORS = {
  prospect: '#64748B', opportunity: '#185FA5', angebot: '#D97706',
  verhandlung: '#7C3AED', gewonnen: '#059669', verloren: '#B91C1C', kein_deal: '#94A3B8',
};

function DealsTab({ leadId, navigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, value, currency, stage, created_at, expected_close, probability')
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
                {d.expected_close && <span>Close: {new Date(d.expected_close).toLocaleDateString('de-DE')}</span>}
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

      {open && <NewDealModal leadId={leadId} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function NewDealModal({ leadId, onClose, onSaved }) {
  const [form, setForm] = useState({ title:'', value:'', currency:'EUR', stage:'prospect', expected_close:'', probability: 50 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title.trim()) { setErr('Titel erforderlich.'); return; }
    setBusy(true); setErr(null);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const payload = {
      lead_id: leadId, user_id: userId,
      title: form.title.trim(),
      value: form.value ? parseFloat(form.value) : null,
      currency: form.currency || 'EUR',
      stage: form.stage || 'prospect',
      expected_close: form.expected_close || null,
      probability: form.probability != null ? parseInt(form.probability, 10) : 50,
    };
    const { error } = await supabase.from('deals').insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved?.();
  };

  const overlay = { position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
  const modal = { background: COLORS.surface, borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width:480, maxWidth:'95vw' };
  const header = { padding:'18px 22px', borderBottom:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', justifyContent:'space-between', alignItems:'center' };
  const body = { padding:'18px 22px', display:'grid', gap:12 };
  const footer = { padding:'14px 22px', borderTop:`0.5px solid ${COLORS.borderSubtle}`, display:'flex', justifyContent:'flex-end', gap:8 };
  const labelSt = { fontSize:11, fontWeight:600, color: COLORS.textSecondary, textTransform:'uppercase', letterSpacing:'0.08em' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize:16, fontWeight:600 }}>Neuer Deal</div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: COLORS.textTertiary }}>✕</button>
        </div>
        <div style={body}>
          <div style={{ display:'grid', gap:6 }}>
            <span style={labelSt}>Titel</span>
            <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ display:'grid', gap:6 }}>
              <span style={labelSt}>Wert</span>
              <input style={inputStyle} type="number" value={form.value} onChange={e => set('value', e.target.value)} />
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <span style={labelSt}>Währung</span>
              <select style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="CHF">CHF</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ display:'grid', gap:6 }}>
              <span style={labelSt}>Stage</span>
              <select style={inputStyle} value={form.stage} onChange={e => set('stage', e.target.value)}>
                {Object.entries(DEAL_STAGE_LABELS).map(([id, lbl]) => (
                  <option key={id} value={id}>{lbl}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <span style={labelSt}>Wahrscheinlichkeit (%)</span>
              <input style={inputStyle} type="number" min={0} max={100} value={form.probability} onChange={e => set('probability', e.target.value)} />
            </div>
          </div>
          <div style={{ display:'grid', gap:6 }}>
            <span style={labelSt}>Expected Close</span>
            <input style={inputStyle} type="date" value={form.expected_close} onChange={e => set('expected_close', e.target.value)} />
          </div>
          {err && <div style={{ color:'#B91C1C', fontSize:12 }}>{err}</div>}
        </div>
        <div style={footer}>
          <button type="button" style={ghostBtnStyle} onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="button" style={primaryBtnStyle} onClick={submit} disabled={busy}>
            {busy ? 'Speichere…' : 'Deal anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared subcomponents ─────────────────────────────────────────────────
function ContactRow({ icon: Icon, label, value, linkLike, truncate }) {
  return (
    <div style={contactRowStyle}>
      <Icon size={15} color={COLORS.textTertiary} />
      <span style={contactLabelStyle}>{label}</span>
      <span style={{
        color: linkLike ? '#185FA5' : COLORS.textPrimary,
        overflow: truncate ? 'hidden' : 'visible',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value || '—'}
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
          <span style={{ cursor:'pointer' }} onClick={onBack}>Leads</span>
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
          <span style={{ cursor:'pointer' }} onClick={onBack}>Leads</span>
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
