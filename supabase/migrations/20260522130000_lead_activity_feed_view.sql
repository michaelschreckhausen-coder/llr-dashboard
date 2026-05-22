-- 2026-05-22 — Activity-Feed Sprint C Phase 1 — SQL-View lead_activity_feed
--
-- Unifiziert 4 lead-scoped Source-Tabellen zu einem chronologischen Feed:
--   1) activities          (manuelle Logs: notes/calls/meetings/email-manual)
--   2) lead_field_history  (audit, whitelist: status/deal_stage/owner_id/lead_score)
--   3) lead_tasks          (zwei Events pro Task: task_created + task_completed)
--   4) vernetzungen        (zwei Events: connection_requested + connection_responded)
--
-- Out of Phase 1 (deferred):
--   - linkedin_messages: KEIN lead_id-FK, nur recipient_linkedin_url
--   - email_send_log: KEIN lead_id-FK (Tabelle existiert, RLS-hidden, kein
--     Repo-Migration-Schema → vermutlich Hetzner-only)
--   Beide brauchen JOIN-on-URL/Email → Phase 2 wenn die Funktionalität getriggert wird.
--
-- RLS-Vererbung: Views erben RLS der underlying Tabellen automatisch.
-- → Activity-Feed zeigt nur Events die der current_user sieht:
--      activities.user_id = auth.uid()
--      lead_field_history.changed_by = auth.uid()
--      lead_tasks.created_by = auth.uid() OR lead_tasks.assigned_to = auth.uid()
--      vernetzungen.user_id = auth.uid()
--   Team-weite Sichtbarkeit = Phase 2 wenn gebraucht (RLS-Refactor).
--
-- Idempotent durch CREATE OR REPLACE VIEW. Re-Run safe.
-- Apply via:
--   ssh root@<HOST> 'docker exec -i supabase-db psql -U postgres -d postgres' \
--     < supabase/migrations/20260522130000_lead_activity_feed_view.sql

BEGIN;

CREATE OR REPLACE VIEW public.lead_activity_feed AS

-- ─── 1) activities ──────────────────────────────────────────────────────────
-- Manuelle Logs aus dem Aktivitäten-Tab Quick-Add (Notiz/Anruf/Email/Meeting).
-- type bleibt original (note/call/meeting/email/...).
SELECT
  'activity'::text                       AS source,
  id,
  lead_id,
  type,
  COALESCE(occurred_at, created_at)      AS timestamp,
  user_id                                AS actor_id,
  jsonb_build_object(
    'subject',          subject,
    'body',             body,
    'direction',        direction,
    'outcome',          outcome,
    'duration_seconds', duration_seconds,
    'deal_id',          deal_id,
    'team_id',          team_id
  )                                      AS payload
FROM public.activities
WHERE lead_id IS NOT NULL

UNION ALL

-- ─── 2) lead_field_history (WHITELIST) ─────────────────────────────────────
-- Auditierte Status-Wechsel. Whitelist gegen Update-Spam (updated_at etc.).
-- type-Format: 'field_changed_<field_name>' für distinct render-Variants.
-- actor_id ist nullable (NULL = System-Trigger, render mit Sparkles-Icon).
SELECT
  'field_history'::text                  AS source,
  id,
  lead_id,
  ('field_changed_' || field_name)::text AS type,
  changed_at                             AS timestamp,
  changed_by                             AS actor_id,  -- nullable, NULL = system
  jsonb_build_object(
    'field_name',    field_name,
    'old_value',     old_value,
    'new_value',     new_value,
    'change_source', change_source
  )                                      AS payload
FROM public.lead_field_history
WHERE lead_id IS NOT NULL
  AND field_name IN ('status', 'deal_stage', 'owner_id', 'lead_score')

UNION ALL

-- ─── 3a) lead_tasks — task_created ──────────────────────────────────────────
-- Pro Task ein Create-Event (timestamp = created_at).
SELECT
  'task'::text                           AS source,
  id,
  lead_id,
  'task_created'::text                   AS type,
  created_at                             AS timestamp,
  created_by                             AS actor_id,
  jsonb_build_object(
    'title',        title,
    'description',  description,
    'priority',     priority,
    'status',       status,
    'due_date',     due_date,
    'assigned_to',  assigned_to,
    'completed_at', completed_at
  )                                      AS payload
FROM public.lead_tasks
WHERE lead_id IS NOT NULL

UNION ALL

-- ─── 3b) lead_tasks — task_completed ────────────────────────────────────────
-- Wenn Task abgeschlossen wurde, zusätzliches Event (timestamp = completed_at).
-- Gleicher PK wie task_created, aber durch type=task_completed unterscheidbar.
SELECT
  'task'::text                           AS source,
  id,
  lead_id,
  'task_completed'::text                 AS type,
  completed_at                           AS timestamp,
  COALESCE(assigned_to, created_by)      AS actor_id,
  jsonb_build_object(
    'title',        title,
    'priority',     priority,
    'due_date',     due_date,
    'description',  description
  )                                      AS payload
FROM public.lead_tasks
WHERE lead_id IS NOT NULL
  AND completed_at IS NOT NULL

UNION ALL

-- ─── 4a) vernetzungen — connection_requested ────────────────────────────────
-- LinkedIn-Vernetzungsanfrage gesendet (timestamp = sent_at).
SELECT
  'connection'::text                     AS source,
  id,
  lead_id,
  'connection_requested'::text           AS type,
  sent_at                                AS timestamp,
  user_id                                AS actor_id,
  jsonb_build_object(
    'li_name',         li_name,
    'li_company',      li_company,
    'li_url',          li_url,
    'status',          status,
    'generated_msg',   generated_msg,
    'final_msg',       final_msg
  )                                      AS payload
FROM public.vernetzungen
WHERE lead_id IS NOT NULL
  AND sent_at IS NOT NULL

UNION ALL

-- ─── 4b) vernetzungen — connection_responded ────────────────────────────────
-- LinkedIn-Anfrage beantwortet (timestamp = responded_at).
SELECT
  'connection'::text                     AS source,
  id,
  lead_id,
  'connection_responded'::text           AS type,
  responded_at                           AS timestamp,
  user_id                                AS actor_id,
  jsonb_build_object(
    'li_name',         li_name,
    'li_company',      li_company,
    'status',          status,
    'rating',          rating,
    'outcome_notes',   outcome_notes
  )                                      AS payload
FROM public.vernetzungen
WHERE lead_id IS NOT NULL
  AND responded_at IS NOT NULL;

-- Grant-Hygiene (Top-Fallstrick #3): authenticated braucht SELECT explizit.
GRANT SELECT ON public.lead_activity_feed TO authenticated;

-- Hetzner-Self-Host-Convention: Default-Privileges sind via 20260424000000
-- bereits gesetzt, aber Views laufen manchmal außerhalb dieser → explizit.

COMMIT;

-- PostgREST-Schema-Cache reload (sonst 404 auf neuen Views beim ersten REST-Call)
NOTIFY pgrst, 'reload schema';

-- Verify-Hilfsquery (optional bei -e-Ausführung):
-- SELECT source, COUNT(*) FROM public.lead_activity_feed GROUP BY source ORDER BY source;
