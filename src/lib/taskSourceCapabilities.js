// src/lib/taskSourceCapabilities.js
//
// Pro Task-Source: welche Felder editierbar + Save/Delete-Mutation.
// Wird vom TaskEditModal aufgerufen, der pro Source die richtige
// Form rendert + persistiert.
//
// Konvention für editable[<field>]:
//   true  → Feld editierbar, Save-Mutation schreibt 1:1 auf die DB-Spalte
//   false → Feld read-only oder gar nicht im Modal
//
// Synthetische Quellen (ssi_daily, linkedin_unanswered, stale_lead) haben
// keinen vollen Edit-Flow — Modal zeigt nur Info + Source-Link.

import { supabase } from './supabase';

// Helper: timestamptz aus 'YYYY-MM-DD' machen (Mittag in lokaler Zeit
// damit Date-Boundary nicht ins falsche Datum kippt).
const dateToTimestamptz = (yyyymmdd) => {
  if (!yyyymmdd) return null;
  return new Date(yyyymmdd + 'T09:00:00').toISOString();
};

// pm_tasks priority-Enum: 'low'|'medium'|'high'|'urgent'
// Normalisierung im Hub: 'low'|'normal'|'high'
const toPmPriority = (p) => {
  if (p === 'normal') return 'medium';
  return p || 'medium';
};

export const SOURCE_CAPABILITIES = {
  // ─── CRM-Aufgaben: voll editierbar ─────────────────────────────────────
  // Multi-Assignee seit 2026-06-02: patch.assigned_to_ids (Array) ist primaer.
  // Dual-Write: lead_tasks.assigned_to bleibt als Legacy-Mirror (= erster
  // Assignee oder NULL) fuer Reports + Konsumenten die noch nicht migriert
  // sind. Patch akzeptiert weiterhin patch.assigned_to (single) als Fallback.
  lead_task: {
    editable: { title: true, description: true, assigned_to: true, due_date: true, priority: true },
    isSynthetic: false,
    canDelete: true,
    sourceLink: (task) => task.related?.leadId ? `/leads/${task.related.leadId}` : null,
    sourceLinkLabel: 'Zum Kontakt',
    async save(task, patch) {
      // ─── 1. Junction-Diff berechnen ──────────────────────────────────
      // patch.assigned_to_ids ist Single-Source-of-Truth (Array).
      // Fallback: patch.assigned_to (single) → Array mit 0 oder 1 Element.
      let nextIds = null;
      if (Array.isArray(patch.assigned_to_ids)) {
        nextIds = patch.assigned_to_ids.filter(Boolean);
      } else if ('assigned_to' in patch) {
        nextIds = patch.assigned_to ? [patch.assigned_to] : [];
      }
      const prevIds = Array.isArray(task.assigned_to_ids) ? task.assigned_to_ids : [];

      // ─── 2. lead_tasks UPDATE (Legacy-Mirror + andere Felder) ────────
      const update = { updated_at: new Date().toISOString() };
      if ('title' in patch)       update.title = patch.title;
      if ('description' in patch) update.description = patch.description;
      if ('due_date' in patch)    update.due_date = patch.due_date || null;
      if ('priority' in patch)    update.priority = patch.priority || 'normal';
      if (nextIds !== null)       update.assigned_to = nextIds[0] || null;

      const { data, error } = await supabase.from('lead_tasks')
        .update(update)
        .eq('id', task.rawId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn('[lead_task.save] update affected 0 rows — likely RLS denial. rawId:', task.rawId, 'patch:', Object.keys(patch));
        throw new Error('Aufgabe konnte nicht aktualisiert werden (Berechtigung fehlt oder Aufgabe wurde geloescht).');
      }

      // ─── 3. Junction-Diff applien ────────────────────────────────────
      if (nextIds !== null) {
        const toAdd    = nextIds.filter(id => !prevIds.includes(id));
        const toRemove = prevIds.filter(id => !nextIds.includes(id));

        // Wer macht den Insert? assigned_by = current user
        const { data: { user } } = await supabase.auth.getUser();
        const assignedBy = user?.id || null;

        if (toRemove.length > 0) {
          const { error: delErr } = await supabase.from('lead_task_assignees')
            .delete()
            .eq('task_id', task.rawId)
            .in('user_id', toRemove);
          if (delErr) throw delErr;
        }

        if (toAdd.length > 0 && assignedBy) {
          const rows = toAdd.map(uid => ({
            task_id: task.rawId,
            user_id: uid,
            assigned_by: assignedBy,
          }));
          const { error: insErr } = await supabase.from('lead_task_assignees')
            .insert(rows);
          if (insErr) throw insErr;
        }
      }
    },
    async delete(task) {
      const { error } = await supabase.from('lead_tasks').delete().eq('id', task.rawId);
      if (error) throw error;
    },
  },

  // ─── Content-Posts: Title/Notes/Assignee/Scheduled-At editierbar ────────
  //     (Priority gibt's nicht in content_posts.)
  content_post: {
    editable: { title: true, description: true, assigned_to: true, due_date: true, priority: false },
    isSynthetic: false,
    canDelete: false,
    descriptionLabel: 'Notiz',
    dueDateLabel: 'Veröffentlichungs-Datum',
    sourceLink: (task) => `/redaktionsplan?open=${task.rawId}`,
    sourceLinkLabel: 'Im Redaktionsplan öffnen',
    async save(task, patch) {
      const update = {};
      if ('title' in patch)       update.title = patch.title;
      if ('description' in patch) update.notes = patch.description;
      if ('assigned_to' in patch) update.assignee_id = patch.assigned_to || null;
      if ('due_date' in patch)    update.scheduled_at = patch.due_date
        ? new Date(patch.due_date + 'T09:00:00').toISOString()
        : null;
      const { error } = await supabase.from('content_posts').update(update).eq('id', task.rawId);
      if (error) throw error;
    },
  },

  // ─── Projekt-Tasks: Title/Description/Due/Priority editierbar ───────────
  //     Assignee-Junction (pm_task_assignments) wäre INSERT/DELETE — out of MVP.
  pm_task: {
    editable: { title: true, description: true, assigned_to: false, due_date: true, priority: true },
    isSynthetic: false,
    canDelete: false,
    sourceLink: (task) => task.related?.projectId ? `/projekte/${task.related.projectId}` : '/projekte',
    sourceLinkLabel: 'Im Projekt öffnen',
    assignedToHint: 'Zuweisung an Mitarbeiter erfolgt im Projekt-Detail.',
    async save(task, patch) {
      const update = { updated_at: new Date().toISOString() };
      if ('title' in patch)       update.title = patch.title;
      if ('description' in patch) update.description = patch.description;
      if ('due_date' in patch)    update.due_date = patch.due_date || null;
      if ('priority' in patch)    update.priority = toPmPriority(patch.priority);
      const { error } = await supabase.from('pm_tasks').update(update).eq('id', task.rawId);
      if (error) throw error;
    },
  },

  // ─── Deal-Follow-up: Owner + Expected-Close-Date editierbar ─────────────
  //     (Title ist Deal-Title — read-only damit Auto-Format ".Deal abschließen:"
  //     nicht überschrieben wird.)
  deal_followup: {
    editable: { title: false, description: false, assigned_to: true, due_date: true, priority: false },
    isSynthetic: false,
    canDelete: false,
    dueDateLabel: 'Abschluss-Termin',
    sourceLink: (task) => `/deals?open=${task.rawId}`,
    sourceLinkLabel: 'Deal öffnen',
    async save(task, patch) {
      const update = {};
      if ('assigned_to' in patch) update.owner_id = patch.assigned_to || null;
      if ('due_date' in patch)    update.expected_close_date = patch.due_date || null;
      if (Object.keys(update).length === 0) return;
      const { error } = await supabase.from('deals').update(update).eq('id', task.rawId);
      if (error) throw error;
    },
  },

  // ─── Lead-Follow-up: Owner + Next-Followup editierbar ───────────────────
  lead_followup: {
    editable: { title: false, description: false, assigned_to: true, due_date: true, priority: false },
    isSynthetic: false,
    canDelete: false,
    dueDateLabel: 'Wieder-Vorlage',
    sourceLink: (task) => task.related?.leadId ? `/leads/${task.related.leadId}` : null,
    sourceLinkLabel: 'Kontakt öffnen',
    async save(task, patch) {
      const update = {};
      if ('assigned_to' in patch) update.owner_id = patch.assigned_to || null;
      if ('due_date' in patch)    update.next_followup = dateToTimestamptz(patch.due_date);
      if (Object.keys(update).length === 0) return;
      const { error } = await supabase.from('leads').update(update).eq('id', task.rawId);
      if (error) throw error;
    },
  },

  // ─── Stale-Lead: Owner editierbar (z.B. neuer Verantwortlicher zum Qualifizieren) ─
  stale_lead: {
    editable: { title: false, description: false, assigned_to: true, due_date: false, priority: false },
    isSynthetic: false,
    canDelete: false,
    sourceLink: (task) => task.related?.leadId ? `/leads/${task.related.leadId}` : null,
    sourceLinkLabel: 'Kontakt öffnen',
    syntheticHint: 'Qualifizieren oder archivieren — Status-Wechsel erfolgt im Kontakt-Profil.',
    async save(task, patch) {
      if (!('assigned_to' in patch)) return;
      const { error } = await supabase.from('leads')
        .update({ owner_id: patch.assigned_to || null })
        .eq('id', task.rawId);
      if (error) throw error;
    },
  },

  // ─── SSI-Daily: rein synthetisch, kein Edit ─────────────────────────────
  ssi_daily: {
    editable: { title: false, description: false, assigned_to: false, due_date: false, priority: false },
    isSynthetic: true,
    canDelete: false,
    sourceLink: () => '/ssi',
    sourceLinkLabel: 'SSI jetzt tracken',
    syntheticHint: 'Diese Aufgabe ist ein Tages-Reminder. Sobald du heute einen SSI-Eintrag erfasst, verschwindet die Karte automatisch.',
  },

  // ─── LinkedIn-Unanswered: synthetisch ───────────────────────────────────
  linkedin_unanswered: {
    editable: { title: false, description: false, assigned_to: false, due_date: false, priority: false },
    isSynthetic: true,
    canDelete: false,
    sourceLink: (task) => task.related?.leadId ? `/messages?lead=${task.related.leadId}` : '/messages',
    sourceLinkLabel: 'Im Posteingang öffnen',
    syntheticHint: 'Die letzte Nachricht in dieser Conversation kam vom Kontakt — Antwort steht aus.',
  },
};

export function getCapabilities(source) {
  return SOURCE_CAPABILITIES[source] || null;
}
