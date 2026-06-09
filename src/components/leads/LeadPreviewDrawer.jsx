// src/components/leads/LeadPreviewDrawer.jsx
//
// Sprint C/3 · Side-Panel-Preview-Drawer für die Leads-Liste.
//
// HubSpot-Triage-Pattern: Click auf eine Lead-Row öffnet ein 400px-Drawer
// rechts mit Quick-View + Quick-Edit. Liste bleibt klickbar — User kann
// durch mehrere Leads switchen ohne Page-Navigation.
//
// Scope (Sprint-C/3 Standard):
//   - Header: Avatar + Name + Job·Company + "Volle Page öffnen"-Link + Close
//   - LeadStatusPath für Status-Switch (Confirm-Flow inkl.)
//   - TagEditor (add/remove)
//   - OwnerInline für Owner-Switch
//   - InlineEdit auf lead_score / next_followup / notes
//   - Aktivitäten-Section als Placeholder "Kommt bald" (Activity-Feed = Sub-Sprint)
//
// State-Sync: useLead-Hook ist gleicher Optimistic-Pattern wie auf LeadDetail.jsx.
// Edits im Drawer sind via Realtime-Subscription sofort auch in der Liste sichtbar
// (useLeads-Hook subscribed auch auf 'leads').
//
// Props:
//   leadId            — uuid | null (null = Drawer zu)
//   teamMembers       — Array für OwnerInline (vom Parent)
//   currentUserId     — String für OwnerInline (vom Parent)
//   onClose           — Drawer schließen
//   onNavigateToFullPage(leadId) — "Volle Page öffnen"-Click

import { useEffect, useCallback, useState } from 'react';
import { X, ExternalLink, Mail, Phone, MapPin, Building2, Briefcase, Target, Clock, Tag as TagIcon, Activity, Plus, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLead } from '../../hooks/useLead';
import { useLeadActivities } from '../../hooks/useLeadActivities';
import { LeadStatusPill } from './LeadStatusPill';
import { StatusPicker } from './StatusPicker';
import { LeadAvatar } from './LeadAvatar';
import { InlineEditField } from './InlineEditField';
import { TagEditor } from './TagEditor';
import { ActivityListItem } from './ActivityListItem';
import { IcLinkedin } from './IcLinkedin';
import { COLORS } from '../../lib/leadStyleTokens';

const PRIMARY = 'rgb(49,90,231)';
export const DRAWER_WIDTH = 400;

// Aufgaben-Typen (analog LeadDetail) für den Inline-Composer.
const DRAWER_TASK_TYPES = [
  { value: 'termin',    label: 'Termin',             icon: '📅' },
  { value: 'telefonat', label: 'Telefonat',          icon: '📞' },
  { value: 'email',     label: 'E-Mail',             icon: '✉️' },
  { value: 'linkedin',  label: 'LinkedIn-Nachricht', icon: '💼' },
  { value: 'notiz',     label: 'Notiz / Follow-up',  icon: '📝' },
  { value: 'aufgabe',   label: 'Aufgabe / Sonstiges',icon: '✅' },
];

// ─── Styles ──────────────────────────────────────────────────────────────
const drawerStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: DRAWER_WIDTH,
  height: '100vh',
  background: COLORS.surface,
  borderLeft: `1px solid ${COLORS.borderSubtle}`,
  boxShadow: '-4px 0 24px rgba(15,23,42,0.08)',
  overflowY: 'auto',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
};
const headerStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  padding: '16px 18px 12px',
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
  position: 'sticky', top: 0, background: COLORS.surface, zIndex: 1,
};
const headerNameStyle = { fontSize: 15, fontWeight: 600, color: COLORS.textPrimary, margin: 0, lineHeight: 1.2 };
const headerMetaStyle = { fontSize: 12, color: COLORS.textTertiary, marginTop: 3 };
const headerActionStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: COLORS.textTertiary, padding: 4, borderRadius: 6,
  display: 'inline-flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 12,
};
const sectionStyle = {
  padding: '12px 18px',
  borderBottom: `0.5px solid ${COLORS.borderSubtle}`,
};
const sectionLabelStyle = {
  fontSize: 10, fontWeight: 700, color: COLORS.textTertiary,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
};
const kvRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, color: COLORS.textPrimary, padding: '3px 0',
};
const kvIconStyle = { color: COLORS.textTertiary, flexShrink: 0 };
const kvLinkStyle = { color: PRIMARY, textDecoration: 'none' };
const emptyHintStyle = {
  fontSize: 12, color: COLORS.textTertiary, fontStyle: 'italic',
  padding: '12px 0', textAlign: 'center',
};
const ownerRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
  fontSize: 13, color: COLORS.textPrimary,
};
const ownerAvatarStyle = {
  width: 26, height: 26, borderRadius: '50%',
  background: '#E0E7FF', color: PRIMARY, fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const ownerSelectStyle = {
  flex: 1, padding: '6px 8px', fontSize: 12,
  border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6,
  background: COLORS.surface, color: COLORS.textPrimary, cursor: 'pointer',
};

const ACTIVITY_PREVIEW_LIMIT = 5;

export function LeadPreviewDrawer({ leadId, teamMembers, currentUserId, onClose, onNavigateToFullPage, onMutated, tagSuggestions = [] }) {
  const { lead, isLoading, error, updateLead: rawUpdateLead } = useLead(leadId);
  // Wrapper: jede erfolgreiche Mutation meldet sich an den Parent, damit die
  // Liste live refetcht (Tags/Status/Owner erscheinen sofort in der Übersicht).
  // Realtime auf dem Self-Host feuert nicht zuverlässig — daher expliziter Push.
  const updateLead = useCallback(async (patch) => {
    const r = await rawUpdateLead(patch);
    if (!r?.error) onMutated?.();
    return r;
  }, [rawUpdateLead, onMutated]);
  const {
    items: activityItems,
    profilesById: activityProfiles,
    isLoading: activityLoading,
  } = useLeadActivities(leadId);

  // Follow-up = Fälligkeitsdatum der nächsten OFFENEN Aufgabe (früheste due_date,
  // inkl. überfällig). Read-only — wird aus lead_tasks abgeleitet, nicht aus
  // leads.next_followup. Re-Fetch bei Lead-Wechsel + nach eigenen Mutationen.
  const [nextTask, setNextTask] = useState(null);
  const [nextTaskRefresh, setNextTaskRefresh] = useState(0);
  // Status-Dropdown + Inline-Aufgaben-Composer
  const [statusOpen, setStatusOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskType, setTaskType] = useState('aufgabe');
  const [taskBusy, setTaskBusy] = useState(false);
  useEffect(() => {
    if (!leadId) { setNextTask(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error: tErr } = await supabase
        .from('lead_tasks')
        .select('id, title, due_date, task_type')
        .eq('lead_id', leadId)
        .eq('status', 'open')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (tErr) { console.warn('[LeadPreviewDrawer] next task load failed:', tErr.message); return; }
      setNextTask(data || null);
    })();
    return () => { cancelled = true; };
  }, [leadId, nextTaskRefresh]);

  // Escape schließt Drawer (außer ein Modal/Picker hat den Event schon abgegriffen)
  useEffect(() => {
    if (!leadId) return;
    const onEsc = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose?.();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [leadId, onClose]);

  // ─── Callbacks für Inline-Edits ────────────────────────────────────────
  const handleStatusChange = useCallback(async (next) => {
    // CLAUDE.md Top-Fallstrick #1 — status separat, kein Bundle
    await updateLead({ status: next });
  }, [updateLead]);

  const handleTagsSave = useCallback((tags) => updateLead({ tags }), [updateLead]);

  const handleOwnerChange = useCallback((e) => {
    const v = e.target.value;
    updateLead({ owner_id: v || null });
  }, [updateLead]);

  // Inline-Aufgabe direkt aus dem Drawer anlegen (analog TasksTab).
  const handleCreateTask = useCallback(async () => {
    const title = taskTitle.trim();
    if (!title || !leadId || taskBusy) return;
    setTaskBusy(true);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const payload = {
      lead_id: leadId,
      created_by: userId,
      title,
      task_type: taskType || 'aufgabe',
      priority: 'normal',
      assigned_to: userId || null,
      status: 'open',
      ...(taskDue ? { due_date: taskDue } : {}),
      ...(lead?.team_id ? { team_id: lead.team_id } : {}),
    };
    const { data: inserted, error } = await supabase.from('lead_tasks').insert(payload).select('id').single();
    if (error) { setTaskBusy(false); console.warn('[LeadPreviewDrawer] task create failed:', error.message); return; }
    if (inserted?.id && userId) {
      await supabase.from('lead_task_assignees').insert({ task_id: inserted.id, user_id: userId, assigned_by: userId });
    }
    setTaskBusy(false);
    setTaskTitle(''); setTaskDue(''); setTaskType('aufgabe'); setTaskOpen(false);
    setNextTaskRefresh((k) => k + 1);
    onMutated?.();
  }, [taskTitle, taskDue, taskType, taskBusy, leadId, lead?.team_id, onMutated]);

  if (!leadId) return null;

  const displayName = lead
    ? (`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unbenannt')
    : 'Lade…';
  const subtitle = lead
    ? [lead.job_title, lead.organization?.name || lead.company].filter(Boolean).join(' · ')
    : '';

  return (
    <aside style={drawerStyle} aria-label="Lead-Vorschau">
      {/* Header */}
      <div style={headerStyle}>
        {lead ? (
          <LeadAvatar firstName={lead.first_name} lastName={lead.last_name} size="md" />
        ) : (
          <div style={{ width: 36, height: 36 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={headerNameStyle}>{displayName}</h3>
          {subtitle && <div style={headerMetaStyle}>{subtitle}</div>}
          {lead && (
            <div style={{ position: 'relative', marginTop: 8 }}>
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
                onPick={(s) => { setStatusOpen(false); handleStatusChange(s); }}
              />
            </div>
          )}
        </div>
        <button type="button" style={headerActionStyle}
          onClick={() => onNavigateToFullPage?.(leadId)}
          title="Volle Detail-Page öffnen" aria-label="Volle Detail-Page öffnen">
          <ExternalLink size={16} />
        </button>
        <button type="button" style={headerActionStyle}
          onClick={onClose} title="Schließen" aria-label="Drawer schließen">
          <X size={18} />
        </button>
      </div>

      {/* Loading / Error / Not-Found */}
      {isLoading && !lead && (
        <div style={{ padding: 24, textAlign: 'center', color: COLORS.textTertiary, fontSize: 13 }}>
          ⏳ Lade Lead…
        </div>
      )}
      {error && (
        <div style={{ padding: 24, textAlign: 'center', color: '#B91C1C', fontSize: 13 }}>
          Fehler: {error.message}
        </div>
      )}
      {!isLoading && !lead && !error && (
        <div style={{ padding: 24, textAlign: 'center', color: COLORS.textTertiary, fontSize: 13 }}>
          Lead nicht gefunden.
        </div>
      )}

      {lead && (
        <>
          {/* Quick-Actions */}
          <div style={{ ...sectionStyle, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              lead.email && { key: 'mail', icon: Mail, label: 'E-Mail', href: `mailto:${lead.email}` },
              lead.phone && { key: 'call', icon: Phone, label: 'Anruf', href: `tel:${lead.phone}` },
              lead.linkedin_url && { key: 'li', icon: IcLinkedin, label: 'LinkedIn', href: /^https?:\/\//i.test(lead.linkedin_url) ? lead.linkedin_url : `https://${lead.linkedin_url}`, external: true },
              { key: 'task', icon: Plus, label: 'Aufgabe', onClick: () => setTaskOpen((v) => !v), active: taskOpen },
            ].filter(Boolean).map((a) => {
              const circle = (
                <span style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: a.active ? PRIMARY : '#EEF2FF', color: a.active ? '#fff' : PRIMARY,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}><a.icon size={17} /></span>
              );
              const label = <span style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 4 }}>{a.label}</span>;
              const wrap = { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 52, textDecoration: 'none', border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', padding: 0 };
              return a.href ? (
                <a key={a.key} href={a.href} style={wrap} title={a.label}
                  {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {circle}{label}
                </a>
              ) : (
                <button key={a.key} type="button" style={wrap} onClick={a.onClick} title={a.label}>
                  {circle}{label}
                </button>
              );
            })}
          </div>

          {/* Inline-Aufgaben-Composer */}
          {taskOpen && (
            <div style={{ ...sectionStyle, background: COLORS.surfaceMuted }}>
              <input
                autoFocus
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && taskTitle.trim()) handleCreateTask(); }}
                placeholder="Neue Aufgabe — z.B. Demo-Call vereinbaren…"
                style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: COLORS.surface, color: COLORS.textPrimary, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, height: 32, padding: '0 8px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, background: COLORS.surface }}>
                  <Calendar size={13} color={COLORS.textTertiary} />
                  <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: COLORS.textPrimary, fontFamily: 'inherit', width: '100%' }} />
                </label>
                <select value={taskType} onChange={(e) => setTaskType(e.target.value)}
                  style={{ flex: 1, height: 32, padding: '0 8px', fontSize: 12, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, background: COLORS.surface, color: COLORS.textPrimary, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {DRAWER_TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" onClick={() => setTaskOpen(false)}
                  style={{ padding: '7px 12px', fontSize: 12, fontWeight: 500, background: COLORS.surface, color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, cursor: 'pointer', font: 'inherit' }}>
                  Abbrechen
                </button>
                <button type="button" onClick={handleCreateTask} disabled={!taskTitle.trim() || taskBusy}
                  style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: (!taskTitle.trim() || taskBusy) ? 'not-allowed' : 'pointer', opacity: (!taskTitle.trim() || taskBusy) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, font: 'inherit' }}>
                  <Plus size={13} /> {taskBusy ? 'Speichere…' : 'Anlegen'}
                </button>
              </div>
            </div>
          )}

          {/* Kontakt-Felder */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>Kontakt</div>
            {lead.email && (
              <div style={kvRowStyle}>
                <Mail size={14} style={kvIconStyle} />
                <a href={`mailto:${lead.email}`} style={kvLinkStyle}>{lead.email}</a>
              </div>
            )}
            {lead.phone && (
              <div style={kvRowStyle}>
                <Phone size={14} style={kvIconStyle} />
                <a href={`tel:${lead.phone}`} style={kvLinkStyle}>{lead.phone}</a>
              </div>
            )}
            {lead.linkedin_url && (
              <div style={kvRowStyle}>
                <IcLinkedin size={14} />
                <a href={/^https?:\/\//i.test(lead.linkedin_url) ? lead.linkedin_url : `https://${lead.linkedin_url}`}
                   target="_blank" rel="noopener noreferrer" style={kvLinkStyle}>
                  LinkedIn-Profil
                </a>
              </div>
            )}
            {lead.location && (
              <div style={kvRowStyle}>
                <MapPin size={14} style={kvIconStyle} />
                <span>{lead.location}</span>
              </div>
            )}
            {!lead.email && !lead.phone && !lead.linkedin_url && !lead.location && (
              <div style={emptyHintStyle}>Keine Kontakt-Daten</div>
            )}
          </div>

          {/* Tags */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}><TagIcon size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Tags</div>
            <TagEditor tags={lead.tags || []} onSave={handleTagsSave} suggestions={tagSuggestions} />
          </div>

          {/* Owner */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>Owner</div>
            <div style={ownerRowStyle}>
              {(() => {
                const owner = (teamMembers || []).find(m => m.id === lead.owner_id);
                const initials = owner
                  ? `${(owner.first_name || '?')[0]}${(owner.last_name || '')[0] || ''}`.toUpperCase()
                  : '—';
                return <div style={ownerAvatarStyle}>{initials}</div>;
              })()}
              <select value={lead.owner_id || ''} onChange={handleOwnerChange} style={ownerSelectStyle}>
                <option value="">— Kein Owner —</option>
                {(teamMembers || []).map(m => (
                  <option key={m.id} value={m.id}>
                    {`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.id.slice(0, 8)}
                    {m.id === currentUserId ? ' (du)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Score + Followup grid */}
          <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={sectionLabelStyle}><Target size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Score</div>
              {/* Read-only: Score wird per KI-Analyse (analyze-lead) ermittelt,
                  nicht manuell gesetzt. */}
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.textPrimary }}>
                {lead.lead_score != null && lead.lead_score !== ''
                  ? lead.lead_score
                  : <span style={{ color: COLORS.textTertiary }}>—</span>}
              </div>
            </div>
            <div>
              <div style={sectionLabelStyle}><Clock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Follow-up</div>
              {/* Read-only: Datum der nächsten offenen Aufgabe (nicht editierbar). */}
              {nextTask?.due_date ? (
                <div style={{ fontSize: 13, color: COLORS.textPrimary }}
                  title={nextTask.title || 'Nächste Aufgabe'}>
                  {new Date(nextTask.due_date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {nextTask.task_type && nextTask.task_type !== 'aufgabe' && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.textSecondary }}>
                      · {({ termin: 'Termin', telefonat: 'Telefonat', email: 'E-Mail', linkedin: 'LinkedIn', notiz: 'Notiz' })[nextTask.task_type] || ''}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: COLORS.textTertiary }}>—</div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>Notizen</div>
            <InlineEditField
              value={lead.notes}
              multiline
              placeholder="Notiz hinzufügen…"
              emptyLabel="Notiz hinzufügen…"
              onSave={(v) => updateLead({ notes: v || null })}
              style={{ fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.5 }}
            />
          </div>

          {/* Activity-Preview — Top-N aus useLeadActivities */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>
              <Activity size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              Aktivitäten
              {activityItems.length > 0 && (
                <span style={{ marginLeft: 6, color: COLORS.textTertiary, fontWeight: 500 }}>
                  · {Math.min(activityItems.length, ACTIVITY_PREVIEW_LIMIT)} von {activityItems.length}
                </span>
              )}
            </div>
            {activityLoading && activityItems.length === 0 && (
              <div style={emptyHintStyle}>Lade Aktivitäten…</div>
            )}
            {!activityLoading && activityItems.length === 0 && (
              <div style={emptyHintStyle}>Noch keine Aktivitäten</div>
            )}
            {activityItems.slice(0, ACTIVITY_PREVIEW_LIMIT).map((item, idx, arr) => (
              <ActivityListItem
                key={`${item.source}-${item.id}`}
                item={item}
                actorProfile={item.actor_id ? activityProfiles.get(item.actor_id) : null}
                withBorder={idx < arr.length - 1}
              />
            ))}
            {activityItems.length > ACTIVITY_PREVIEW_LIMIT && (
              <button type="button"
                style={{ ...headerActionStyle, color: PRIMARY, marginTop: 8, padding: '6px 0' }}
                onClick={() => onNavigateToFullPage?.(leadId)}>
                Alle {activityItems.length} Aktivitäten anzeigen →
              </button>
            )}
          </div>

          {/* Footer: Volle Page öffnen */}
          <div style={{ ...sectionStyle, borderBottom: 'none', marginTop: 'auto', paddingTop: 16 }}>
            <button type="button"
              style={{
                padding: '7px 14px',
                background: PRIMARY, color: '#fff',
                border: 'none', borderRadius: 8,
                fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                font: 'inherit',
              }}
              onClick={() => onNavigateToFullPage?.(leadId)}>
              <ExternalLink size={14} /> Volle Detail-Page öffnen
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
