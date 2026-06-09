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
import { X, ExternalLink, Mail, Phone, MapPin, Building2, Briefcase, Target, Clock, Tag as TagIcon, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLead } from '../../hooks/useLead';
import { useLeadActivities } from '../../hooks/useLeadActivities';
import { LeadStatusPath } from './LeadStatusPath';
import { LeadAvatar } from './LeadAvatar';
import { InlineEditField } from './InlineEditField';
import { TagEditor } from './TagEditor';
import { ActivityListItem } from './ActivityListItem';
import { IcLinkedin } from './IcLinkedin';
import { COLORS } from '../../lib/leadStyleTokens';

const PRIMARY = 'rgb(49,90,231)';
export const DRAWER_WIDTH = 400;

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
  }, [leadId]);

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
        </div>
        <button type="button" style={headerActionStyle}
          onClick={() => onNavigateToFullPage?.(leadId)}
          title="Volle Detail-Page öffnen">
          <ExternalLink size={14} /> Volle Page
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
          {/* Pipeline-Stepper */}
          <LeadStatusPath
            currentStatus={lead.status}
            onChange={handleStatusChange}
          />

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

          {/* Footer: zweiter Hinweis Volle Page */}
          <div style={{ ...sectionStyle, borderBottom: 'none', marginTop: 'auto', paddingTop: 16 }}>
            <button type="button"
              style={{
                width: '100%', padding: '10px 14px',
                background: COLORS.surfaceMuted, color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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
