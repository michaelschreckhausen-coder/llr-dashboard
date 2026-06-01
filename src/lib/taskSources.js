// src/lib/taskSources.js
//
// Task-Hub: zentrale Quellen-Logik.
//
// Aggregiert "Aufgaben" aus mehreren Domains in einem einheitlichen Shape:
//   - lead_tasks            (CRM, echte editierbare Aufgabe)
//   - content_posts         (Redaktionsplan, assignee_id, status != published)
//   - pm_tasks              (Projektumsetzung, via pm_task_assignments)
//   - deals.expected_close  (Deal-Follow-up, owner_id = uid, naher Closing-Termin)
//   - leads.next_followup   (Lead-Follow-up, owner_id = uid)
//   - ssi_scores            (synthetischer Daily-Reminder wenn heute kein Entry)
//   - linkedin_messages     (Unbeantwortete Conversation — letzte Direction = 'in')
//   - leads(status=Lead)    (Stale-Leads, updated_at > 7d)
//
// Wird genutzt von:
//   - src/hooks/useAllTasks.js         (für /aufgaben Hub-Page)
//   - src/hooks/useDashboardData.js    (für /dashboard Tages-Übersicht)
//
// Design-Entscheidungen:
//   - Nur lead_tasks ist editierbar (toggleDone, delete) — alle anderen sind
//     "virtuelle" Aufgaben mit isVirtual:true. Klick öffnet die Source-Page.
//   - SSI-Daily ist als localStorage-dismissable gebaut (Key SSI_DISMISS_PREFIX +
//     YYYY-MM-DD). loadSsiDailyTask() returnt leeres Array wenn heute dismissed
//     ODER bereits ein ssi_scores-Row für heute existiert.
//   - Team-Scope: Bei aktivem Team wird team_id=activeTeamId gefiltert; im
//     Solo-Pfad created_by/user_id=uid. Konsistent mit Top-Fallstrick #14.

import { supabase } from './supabase';

// ─── Konstanten ─────────────────────────────────────────────────────────────

export const TASK_SOURCES = {
  lead_task: {
    key: 'lead_task',
    label: 'CRM',
    icon: '📋',
    color: '#185FA5',
    bg: '#EFF6FF',
    border: '#BFDBFE',
  },
  content_post: {
    key: 'content_post',
    label: 'Content',
    icon: '✍️',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
  },
  pm_task: {
    key: 'pm_task',
    label: 'Projekt',
    icon: '📦',
    color: '#B45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  deal_followup: {
    key: 'deal_followup',
    label: 'Deal',
    icon: '🤝',
    color: '#7C3AED',
    bg: '#F5F3FF',
    border: '#DDD6FE',
  },
  lead_followup: {
    key: 'lead_followup',
    label: 'Follow-up',
    icon: '👤',
    color: '#0E7490',
    bg: '#ECFEFF',
    border: '#A5F3FC',
  },
  ssi_daily: {
    key: 'ssi_daily',
    label: 'SSI',
    icon: '📊',
    color: '#BE185D',
    bg: '#FDF2F8',
    border: '#FBCFE8',
  },
  linkedin_unanswered: {
    key: 'linkedin_unanswered',
    label: 'LinkedIn',
    icon: '💬',
    color: '#0077B5',
    bg: '#EFF6FF',
    border: '#BFDBFE',
  },
  stale_lead: {
    key: 'stale_lead',
    label: 'Stale Lead',
    icon: '⏳',
    color: '#6B7280',
    bg: '#F9FAFB',
    border: '#E5E7EB',
  },
};

export const SSI_DISMISS_PREFIX = 'leadesk_ssi_dismiss_';

// ─── Helpers ────────────────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().split('T')[0];

const isoDaysAhead = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const leadDisplayName = (l) => {
  if (!l) return null;
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
  return name || l.name || l.company || null;
};

// Priority normalisieren: pm_tasks nutzt 'medium', lead_tasks nutzt 'normal'
const normalizePriority = (p) => {
  if (!p) return 'normal';
  if (p === 'medium' || p === 'normal') return 'normal';
  if (p === 'urgent') return 'high';
  if (['low', 'high'].includes(p)) return p;
  return 'normal';
};

// ─── Loaders ────────────────────────────────────────────────────────────────

// 1. CRM-Aufgaben (lead_tasks) — echte, editierbare Tasks
export async function loadLeadTasks({ uid, activeTeamId }) {
  let q = supabase
    .from('lead_tasks')
    .select('*, leads(id, first_name, last_name, name, company, avatar_url)');
  if (activeTeamId) {
    q = q.eq('team_id', activeTeamId);
  } else if (uid) {
    q = q.eq('created_by', uid).is('team_id', null);
  } else {
    return [];
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadLeadTasks error:', error.message);
    return [];
  }
  return (data || []).map((t) => {
    const lead = t.leads;
    return {
      id: `lead_task:${t.id}`,
      source: 'lead_task',
      title: t.title,
      description: t.description || null,
      priority: normalizePriority(t.priority),
      due_date: t.due_date || null,
      status: t.status === 'done' ? 'done' : 'open',
      isVirtual: false,
      assigned_to: t.assigned_to || null,
      created_by: t.created_by || null,
      completed_at: t.completed_at || null,
      rawId: t.id,
      href: lead?.id ? `/leads/${lead.id}` : '/aufgaben',
      related: {
        leadId: lead?.id || null,
        leadName: leadDisplayName(lead),
        leadCompany: lead?.company || null,
        leadAvatar: lead?.avatar_url || null,
      },
    };
  });
}

// 2. Redaktionsplan-Posts — virtuell, assigned_to=uid, status nicht published
export async function loadContentPostTasks({ uid, activeTeamId }) {
  if (!uid) return [];
  const VISIBLE_STATUSES = ['idee', 'draft', 'in_review', 'approved'];
  let q = supabase
    .from('content_posts')
    .select('id, title, status, scheduled_at, assignee_id, reviewer_id, workspace, team_id, user_id, created_at')
    .eq('assignee_id', uid)
    .in('status', VISIBLE_STATUSES);
  if (activeTeamId) {
    q = q.eq('team_id', activeTeamId);
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadContentPostTasks error:', error.message);
    return [];
  }
  const STATUS_LABEL = {
    idee:      'Idee festhalten',
    draft:     'Entwurf fertigstellen',
    in_review: 'Im Review',
    approved:  'Freigegeben — einplanen',
  };
  return (data || []).map((p) => ({
    id: `content_post:${p.id}`,
    source: 'content_post',
    title: p.title || '(ohne Titel)',
    description: STATUS_LABEL[p.status] || p.status,
    priority: p.status === 'in_review' || p.status === 'approved' ? 'high' : 'normal',
    due_date: p.scheduled_at ? p.scheduled_at.split('T')[0] : null,
    status: 'open',
    isVirtual: true,
    assigned_to: p.assignee_id,
    created_by: p.user_id,
    rawId: p.id,
    href: `/redaktionsplan?open=${p.id}`,
    related: {
      postId: p.id,
      postWorkspace: p.workspace || null,
      postStatus: p.status,
    },
  }));
}

// 3. Projekt-Tasks (pm_tasks) — virtuell, via pm_task_assignments
//    Filtert NICHT auf "Done"-Spalten — Status-Logik in pm_tasks ist
//    pro Projekt unterschiedlich (Spalten-Namen). Workaround: filter
//    client-side auf Spalten deren Name nicht 'erledigt'/'done'/'fertig' enthält.
export async function loadPmTasks({ uid, activeTeamId }) {
  if (!uid) return [];
  // Schritt 1: alle task_ids holen denen User assigned ist
  const { data: assigns, error: assignErr } = await supabase
    .from('pm_task_assignments')
    .select('task_id')
    .eq('assignee_id', uid);
  if (assignErr) {
    console.warn('[taskSources] loadPmTasks assignments error:', assignErr.message);
    return [];
  }
  const taskIds = (assigns || []).map((a) => a.task_id);
  if (taskIds.length === 0) return [];

  // Schritt 2: Tasks laden mit Project + Column für Done-Filter
  let q = supabase
    .from('pm_tasks')
    .select(`
      id, title, description, priority, due_date, column_id, project_id, team_id, user_id, created_at,
      pm_columns(id, name),
      pm_projects(id, name)
    `)
    .in('id', taskIds);
  if (activeTeamId) {
    q = q.eq('team_id', activeTeamId);
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadPmTasks error:', error.message);
    return [];
  }
  return (data || [])
    .filter((t) => {
      // Done-Spalten ausfiltern (Heuristik: Name enthält erledigt/done/fertig)
      const colName = (t.pm_columns?.name || '').toLowerCase();
      return !/(erledigt|done|fertig|completed|geliefert)/.test(colName);
    })
    .map((t) => ({
      id: `pm_task:${t.id}`,
      source: 'pm_task',
      title: t.title,
      description: t.pm_projects?.name ? `Projekt: ${t.pm_projects.name}` : (t.description || null),
      priority: normalizePriority(t.priority),
      due_date: t.due_date || null,
      status: 'open',
      isVirtual: true,
      assigned_to: uid,
      created_by: t.user_id,
      rawId: t.id,
      href: t.project_id ? `/projekte/${t.project_id}` : '/projekte',
      related: {
        projectId: t.project_id,
        projectName: t.pm_projects?.name || null,
      },
    }));
}

// 4. Deal-Follow-ups (deals mit expected_close_date <= heute+7d)
export async function loadDealFollowupTasks({ uid, activeTeamId }) {
  if (!uid) return [];
  let q = supabase
    .from('deals')
    .select('id, title, value, stage, expected_close_date, owner_id, created_by, lead_id, organization_id, leads(id, first_name, last_name, name, company)')
    .lte('expected_close_date', isoDaysAhead(7))
    .not('stage', 'in', '(gewonnen,verloren,kein_deal)')
    .not('expected_close_date', 'is', null);
  if (activeTeamId) {
    q = q.eq('team_id', activeTeamId);
    // Innerhalb des Teams: nur eigene Deals (owner_id = uid ODER created_by = uid)
    q = q.or(`owner_id.eq.${uid},created_by.eq.${uid}`);
  } else {
    q = q.eq('created_by', uid).is('team_id', null);
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadDealFollowupTasks error:', error.message);
    return [];
  }
  return (data || []).map((d) => {
    const lead = d.leads;
    const leadName = leadDisplayName(lead);
    return {
      id: `deal_followup:${d.id}`,
      source: 'deal_followup',
      title: `Deal abschließen: ${d.title || leadName || 'Unbenannter Deal'}`,
      description: [
        leadName && `Kontakt: ${leadName}`,
        d.value && `Wert: € ${Number(d.value).toLocaleString('de-DE')}`,
        d.stage && `Stage: ${d.stage}`,
      ].filter(Boolean).join(' · '),
      priority: 'high',
      due_date: d.expected_close_date,
      status: 'open',
      isVirtual: true,
      assigned_to: d.owner_id || d.created_by || uid,
      created_by: d.created_by,
      rawId: d.id,
      href: `/deals?open=${d.id}`,
      related: {
        dealId: d.id,
        dealTitle: d.title,
        dealValue: d.value,
        leadId: d.lead_id,
        leadName,
      },
    };
  });
}

// 5. Lead-Follow-ups (leads.next_followup <= heute)
export async function loadLeadFollowupTasks({ uid, activeTeamId }) {
  if (!uid) return [];
  let q = supabase
    .from('leads')
    .select('id, first_name, last_name, name, company, job_title, next_followup, owner_id, avatar_url')
    .lte('next_followup', todayISO())
    .not('next_followup', 'is', null)
    .eq('archived', false);
  if (activeTeamId) {
    q = q.eq('team_id', activeTeamId);
    q = q.or(`owner_id.eq.${uid},user_id.eq.${uid}`);
  } else {
    q = q.eq('user_id', uid).is('team_id', null);
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadLeadFollowupTasks error:', error.message);
    return [];
  }
  return (data || []).map((l) => ({
    id: `lead_followup:${l.id}`,
    source: 'lead_followup',
    title: `Follow-up: ${leadDisplayName(l) || 'Kontakt'}`,
    description: [l.job_title, l.company].filter(Boolean).join(' · ') || null,
    priority: 'normal',
    due_date: l.next_followup,
    status: 'open',
    isVirtual: true,
    assigned_to: l.owner_id || uid,
    created_by: null,
    rawId: l.id,
    href: `/leads/${l.id}`,
    related: {
      leadId: l.id,
      leadName: leadDisplayName(l),
      leadCompany: l.company,
      leadAvatar: l.avatar_url,
    },
  }));
}

// 6. SSI-Daily-Reminder — synthetisch
//    Returnt EINE virtuelle Task wenn:
//      - User hat heute noch keinen ssi_scores-Entry
//      - Karte ist nicht für heute dismissed (localStorage)
//    Sonst leeres Array.
export async function loadSsiDailyTask({ uid }) {
  if (!uid || typeof window === 'undefined') return [];

  const today = todayISO();
  try {
    const dismissed = window.localStorage.getItem(SSI_DISMISS_PREFIX + today);
    if (dismissed === '1') return [];
  } catch { /* localStorage blocked → wir zeigen die Karte */ }

  // Existiert heute schon ein Entry?
  const { data, error } = await supabase
    .from('ssi_scores')
    .select('id, recorded_at')
    .eq('user_id', uid)
    .gte('recorded_at', today)
    .lt('recorded_at', isoDaysAhead(1))
    .limit(1);
  if (error) {
    console.warn('[taskSources] loadSsiDailyTask error:', error.message);
    return [];
  }
  if ((data || []).length > 0) return []; // Heute schon getrackt → keine Aufgabe

  return [{
    id: `ssi_daily:${today}`,
    source: 'ssi_daily',
    title: 'SSI heute tracken',
    description: 'Trag deinen LinkedIn Social Selling Index für heute ein — eine Minute, langfristige Reichweite.',
    priority: 'normal',
    due_date: today,
    status: 'open',
    isVirtual: true,
    assigned_to: uid,
    created_by: null,
    rawId: today, // ISO-Date als Pseudo-ID
    href: '/ssi',
    related: {},
  }];
}

// 7. Unbeantwortete LinkedIn-Nachrichten
//    Heuristik: letzter linkedin_messages-Eintrag pro lead_id hat direction='in'
//    (von Lead an uns) UND ist > 0 Tage alt.
export async function loadLinkedInUnansweredTasks({ uid, activeTeamId }) {
  if (!uid) return [];
  // Wir laden die letzten 200 Messages, gruppieren client-side pro lead_id
  // und filtern auf "letzte Direction = in".
  let q = supabase
    .from('linkedin_messages')
    .select('id, lead_id, direction, content, sent_at, created_at, leads(id, first_name, last_name, name, company, avatar_url, owner_id, user_id, team_id, archived)')
    .not('lead_id', 'is', null)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);
  // RLS scope-t schon — kein expliziter team_id-Filter da linkedin_messages
  // pro Lead an Lead-RLS hängt
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadLinkedInUnansweredTasks error:', error.message);
    return [];
  }

  // Gruppieren: pro lead_id die jüngste Message behalten
  const latestPerLead = new Map();
  for (const m of (data || [])) {
    if (!m.lead_id) continue;
    if (!latestPerLead.has(m.lead_id)) latestPerLead.set(m.lead_id, m);
  }

  const tasks = [];
  for (const m of latestPerLead.values()) {
    // Nur unbeantwortet wenn letzte Message von Lead kam
    if (m.direction !== 'in') continue;
    const lead = m.leads;
    if (!lead || lead.archived) continue;
    // Owner-Filter: nur Leads die mir (uid) gehören
    const ownsLead = lead.owner_id === uid || lead.user_id === uid;
    if (!ownsLead) continue;
    if (activeTeamId && lead.team_id !== activeTeamId) continue;
    if (!activeTeamId && lead.team_id !== null) continue;

    const sentAt = m.sent_at || m.created_at;
    const due = sentAt ? sentAt.split('T')[0] : null;
    const leadName = leadDisplayName(lead);
    tasks.push({
      id: `linkedin_unanswered:${lead.id}`,
      source: 'linkedin_unanswered',
      title: `Antwort offen: ${leadName || 'LinkedIn-Kontakt'}`,
      description: (m.content || '').slice(0, 120) || 'Letzte Nachricht kam vom Kontakt — Reply ausstehend.',
      priority: 'high',
      due_date: due,
      status: 'open',
      isVirtual: true,
      assigned_to: lead.owner_id || lead.user_id || uid,
      created_by: null,
      rawId: m.id,
      href: `/messages?lead=${lead.id}`,
      related: {
        leadId: lead.id,
        leadName,
        leadCompany: lead.company,
        leadAvatar: lead.avatar_url,
      },
    });
  }
  return tasks;
}

// 8. Stale Leads — Status 'Lead' > 7d kein Update
export async function loadStaleLeadTasks({ uid, activeTeamId }) {
  if (!uid) return [];
  const cutoff = isoDaysAgo(7);
  let q = supabase
    .from('leads')
    .select('id, first_name, last_name, name, company, job_title, status, updated_at, owner_id, avatar_url')
    .eq('status', 'Lead')
    .lt('updated_at', cutoff)
    .eq('archived', false)
    .limit(50);
  if (activeTeamId) {
    q = q.eq('team_id', activeTeamId);
    q = q.or(`owner_id.eq.${uid},user_id.eq.${uid}`);
  } else {
    q = q.eq('user_id', uid).is('team_id', null);
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[taskSources] loadStaleLeadTasks error:', error.message);
    return [];
  }
  return (data || []).map((l) => {
    const daysStale = Math.round((Date.now() - new Date(l.updated_at).getTime()) / 86400000);
    return {
      id: `stale_lead:${l.id}`,
      source: 'stale_lead',
      title: `Qualifizieren: ${leadDisplayName(l) || 'Kontakt'}`,
      description: `Seit ${daysStale} Tagen unverändert. Qualifizieren oder archivieren?`,
      priority: 'low',
      due_date: null, // Keine harte Fälligkeit
      status: 'open',
      isVirtual: true,
      assigned_to: l.owner_id || uid,
      created_by: null,
      rawId: l.id,
      href: `/leads/${l.id}`,
      related: {
        leadId: l.id,
        leadName: leadDisplayName(l),
        leadCompany: l.company,
        leadAvatar: l.avatar_url,
      },
    };
  });
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

// Lädt alle aktivierten Quellen parallel und gibt ein normalized array zurück.
// `enabledSources` ist ein Set/Array von Source-Keys (z.B. ['lead_task','content_post',...])
// — Default: alle.
export async function loadAllTaskSources({ uid, activeTeamId, enabledSources = null }) {
  const enabled = enabledSources ? new Set(enabledSources) : null;
  const should = (key) => !enabled || enabled.has(key);

  const promises = [];
  if (should('lead_task'))           promises.push(['lead_task', loadLeadTasks({ uid, activeTeamId })]);
  if (should('content_post'))        promises.push(['content_post', loadContentPostTasks({ uid, activeTeamId })]);
  if (should('pm_task'))             promises.push(['pm_task', loadPmTasks({ uid, activeTeamId })]);
  if (should('deal_followup'))       promises.push(['deal_followup', loadDealFollowupTasks({ uid, activeTeamId })]);
  if (should('lead_followup'))       promises.push(['lead_followup', loadLeadFollowupTasks({ uid, activeTeamId })]);
  if (should('ssi_daily'))           promises.push(['ssi_daily', loadSsiDailyTask({ uid })]);
  if (should('linkedin_unanswered')) promises.push(['linkedin_unanswered', loadLinkedInUnansweredTasks({ uid, activeTeamId })]);
  if (should('stale_lead'))          promises.push(['stale_lead', loadStaleLeadTasks({ uid, activeTeamId })]);

  const settled = await Promise.allSettled(promises.map(([, p]) => p));
  const merged = [];
  settled.forEach((res, i) => {
    const [name] = promises[i];
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      merged.push(...res.value);
    } else if (res.status === 'rejected') {
      console.warn(`[taskSources] ${name} rejected:`, res.reason);
    }
  });
  return merged;
}

// SSI-Daily für heute dismissen (localStorage)
export function dismissSsiToday() {
  try {
    window.localStorage.setItem(SSI_DISMISS_PREFIX + todayISO(), '1');
  } catch { /* noop */ }
}
