-- 2026-05-27 — Phase A — lead_tasks Dead-Col-Drop + activities duration-rename
--
-- Staging-only Drift-Fix gegen Prod-Realität (siehe schema-audit-2026-05-27).
-- Prod ist Source-of-Truth, Staging holt sich auf Prod-Stand.
--
-- 1) lead_tasks.user_id + is_completed sind Dead-Cols auf Staging:
--    - 40/40 Rows haben user_id IS NULL (Frontend schreibt nur created_by)
--    - is_completed wurde durch status = 'done' ersetzt
--    → Drop beide Cols.
--
-- 2) activities.duration_minutes (Staging) ↔ duration_seconds (Prod):
--    - Frontend writes duration_minutes (Staging-Pattern) bisher
--    - Prod hat duration_seconds (canonical)
--    → ADD duration_seconds, BACKFILL = duration_minutes * 60, DROP duration_minutes.
--
-- Idempotent durch IF EXISTS. Pflicht-Smoke: kein 4xx auf lead_tasks-Insert,
-- Activity-Render mit duration-Feld zeigt korrekten Wert.

BEGIN;

-- ─── Step 1: lead_tasks Dead-Col-Drop ──────────────────────────────────────

ALTER TABLE public.lead_tasks DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.lead_tasks DROP COLUMN IF EXISTS is_completed;

-- ─── Step 2: activities duration-Spalte umbenennen ─────────────────────────

-- 2a) duration_seconds anlegen (idempotent)
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- 2b) Backfill aus duration_minutes (nur wenn Quell-Col noch existiert UND new-col noch leer)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activities' AND column_name='duration_minutes'
  ) THEN
    UPDATE public.activities
       SET duration_seconds = duration_minutes * 60
     WHERE duration_minutes IS NOT NULL
       AND duration_seconds IS NULL;
  END IF;
END $$;

-- 2c) duration_minutes droppen
ALTER TABLE public.activities DROP COLUMN IF EXISTS duration_minutes;

-- ─── Step 3: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  has_user_id boolean;
  has_is_completed boolean;
  has_duration_minutes boolean;
  has_duration_seconds boolean;
BEGIN
  -- lead_tasks
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_tasks' AND column_name='user_id') INTO has_user_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_tasks' AND column_name='is_completed') INTO has_is_completed;
  IF has_user_id      THEN RAISE EXCEPTION 'lead_tasks.user_id still exists'; END IF;
  IF has_is_completed THEN RAISE EXCEPTION 'lead_tasks.is_completed still exists'; END IF;

  -- activities
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='activities' AND column_name='duration_minutes') INTO has_duration_minutes;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='activities' AND column_name='duration_seconds') INTO has_duration_seconds;
  IF has_duration_minutes      THEN RAISE EXCEPTION 'activities.duration_minutes still exists'; END IF;
  IF NOT has_duration_seconds  THEN RAISE EXCEPTION 'activities.duration_seconds missing'; END IF;

  RAISE NOTICE 'Phase A verification PASSED';
END $$;

-- ─── Step 4: PostgREST-Cache-Reload (sonst 4xx auf alte/neue Spalten) ──────

COMMIT;

NOTIFY pgrst, 'reload schema';
