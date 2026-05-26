-- 2026-05-26 — lead_tasks REPLICA IDENTITY FULL für Realtime-DELETE-Events
--
-- Sprint-B-Realtime-Followup: nach Apply der Publication-Migration
-- (20260522150000_realtime_publication_lead_tasks.sql) auf Staging
-- verifiziert:
--   - INSERT-Events: propagieren ✓
--   - UPDATE-Events: propagieren ✓
--   - DELETE-Events: propagieren NICHT ✗ (deleted row stays in UI bis Reload)
--
-- Root-Cause: REPLICA IDENTITY = DEFAULT (Primary Key) sendet bei DELETE nur
-- die PK. Supabase-Realtime kann mit nur der PK weder die RLS-Policy
-- (lead_tasks_own — created_by/assigned_to-Check) noch den Channel-Filter
-- (z.B. team_id=eq.X, lead_id=eq.X) gegen die gelöschte Row evaluieren →
-- Event wird stillschweigend verworfen.
--
-- Fix: REPLICA IDENTITY FULL → Postgres-Logical-Replication-Stream enthält
-- bei DELETE/UPDATE die komplette OLD-Row. Realtime evaluiert RLS+Filter
-- gegen diese OLD-Row und broadcastet korrekt an berechtigte Subscriber.
--
-- Trade-off: +WAL-Size pro UPDATE/DELETE (komplette OLD-Row im Stream
-- statt nur PK). Bei lead_tasks-Volumen (selten >100k Rows) negligible.
--
-- Idempotent: ALTER TABLE REPLICA IDENTITY ist Set-Operation, kein DDL-Diff.

BEGIN;

ALTER TABLE public.lead_tasks REPLICA IDENTITY FULL;

-- Verifikation
DO $$
DECLARE
  current_identity char;
BEGIN
  SELECT relreplident INTO current_identity
  FROM pg_class
  WHERE relname = 'lead_tasks' AND relnamespace = 'public'::regnamespace;

  IF current_identity != 'f' THEN
    RAISE EXCEPTION 'Migration FAILED: lead_tasks.relreplident = % (expected f for FULL)', current_identity;
  END IF;
END $$;

COMMIT;

-- Test-Hilfsquery (optional via -e):
-- SELECT relname, relreplident FROM pg_class WHERE relname = 'lead_tasks';
-- → relreplident sollte 'f' sein (= FULL). 'd' = DEFAULT, 'n' = NOTHING, 'i' = INDEX.
