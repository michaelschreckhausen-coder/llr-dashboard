-- 2026-05-27 — Phase H — Sprint C Phase 2 — vernetzungen in Activity-Feed
--
-- Voraussetzungen (alle ✓ nach Phase A-G):
--   - vernetzungen-Schema-Drift auf Staging behoben (Phase D)
--   - View lead_activity_feed existiert seit Sprint C Phase 1
--   - Realtime-Pattern für 3 Source-Tabellen etabliert seit Item 2
--
-- Diese Migration:
--   1) Re-Adds vernetzungen-Branch in lead_activity_feed-View
--      (Sprint C Phase 1 hatte ihn raus weil Staging-Schema nicht passte)
--   2) ADD vernetzungen zur supabase_realtime-Publication
--   3) REPLICA IDENTITY FULL für DELETE-Event-Broadcast
--
-- View liefert 2 Event-Types pro vernetzung:
--   - connection_requested (timestamp = sent_at)
--   - connection_responded (timestamp = responded_at, NOT NULL only)
--
-- Idempotent durch CREATE OR REPLACE VIEW + DO-Block für Publication-Add.

BEGIN;

-- ─── Step 1: View update mit vernetzungen-Branch ───────────────────────────

CREATE OR REPLACE VIEW public.lead_activity_feed AS

-- 1) activities (manuelle Logs)
SELECT
  'activity'::text                       AS source,
  id,
  lead_id,
  type,
  COALESCE(occurred_at, created_at)      AS timestamp,
  user_id                                AS actor_id,
  jsonb_build_object(
    'subject',   subject,
    'body',      body,
    'direction', direction,
    'outcome',   outcome,
    'deal_id',   deal_id,
    'team_id',   team_id
  )                                      AS payload
FROM public.activities
WHERE lead_id IS NOT NULL

UNION ALL

-- 2) lead_field_history (whitelist auf 4 Felder)
SELECT
  'field_history'::text                  AS source,
  id,
  lead_id,
  ('field_changed_' || field_name)::text AS type,
  changed_at                             AS timestamp,
  changed_by                             AS actor_id,
  jsonb_build_object(
    'field_name', field_name,
    'old_value',  old_value,
    'new_value',  new_value,
    'change_source', change_source
  )                                      AS payload
FROM public.lead_field_history
WHERE lead_id IS NOT NULL
  AND field_name IN ('status', 'deal_stage', 'owner_id', 'lead_score')

UNION ALL

-- 3a) lead_tasks — task_created
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

-- 3b) lead_tasks — task_completed
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

-- 4a) vernetzungen — connection_requested (timestamp = sent_at)
SELECT
  'connection'::text                     AS source,
  id,
  lead_id,
  'connection_requested'::text           AS type,
  sent_at                                AS timestamp,
  user_id                                AS actor_id,
  jsonb_build_object(
    'li_name',       li_name,
    'li_company',    li_company,
    'li_url',        li_url,
    'status',        status,
    'generated_msg', generated_msg,
    'final_msg',     final_msg
  )                                      AS payload
FROM public.vernetzungen
WHERE lead_id IS NOT NULL
  AND sent_at IS NOT NULL

UNION ALL

-- 4b) vernetzungen — connection_responded (timestamp = responded_at, NOT NULL only)
SELECT
  'connection'::text                     AS source,
  id,
  lead_id,
  'connection_responded'::text           AS type,
  responded_at                           AS timestamp,
  user_id                                AS actor_id,
  jsonb_build_object(
    'li_name',       li_name,
    'li_company',    li_company,
    'status',        status,
    'rating',        rating,
    'outcome_notes', outcome_notes
  )                                      AS payload
FROM public.vernetzungen
WHERE lead_id IS NOT NULL
  AND responded_at IS NOT NULL;

-- ─── Step 2: GRANT auf View für authenticated ──────────────────────────────

GRANT SELECT ON public.lead_activity_feed TO authenticated;

-- ─── Step 3: vernetzungen zur supabase_realtime Publication ────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='vernetzungen'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vernetzungen;
  END IF;
END $$;

-- ─── Step 4: REPLICA IDENTITY FULL für DELETE-Events ───────────────────────

ALTER TABLE public.vernetzungen REPLICA IDENTITY FULL;

-- ─── Step 5: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  view_exists    boolean;
  pub_vernetz    boolean;
  ident_vernetz  char;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname='public' AND viewname='lead_activity_feed'
  ) INTO view_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='vernetzungen'
  ) INTO pub_vernetz;

  SELECT relreplident FROM pg_class
   WHERE relname='vernetzungen' AND relnamespace='public'::regnamespace
  INTO ident_vernetz;

  IF NOT view_exists    THEN RAISE EXCEPTION 'lead_activity_feed view missing'; END IF;
  IF NOT pub_vernetz    THEN RAISE EXCEPTION 'vernetzungen not in supabase_realtime publication'; END IF;
  IF ident_vernetz != 'f' THEN RAISE EXCEPTION 'vernetzungen.relreplident = % (expected f)', ident_vernetz; END IF;

  RAISE NOTICE 'Phase H verification PASSED — vernetzungen integrated in feed + realtime';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
