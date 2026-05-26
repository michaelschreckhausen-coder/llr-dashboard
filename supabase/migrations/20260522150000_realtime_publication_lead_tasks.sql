-- 2026-05-22 — Realtime-Publication: lead_tasks ADD TABLE
--
-- Sprint-B-Followup: TasksTab im Lead-Detail + Aufgaben.jsx haben jetzt
-- Realtime-Subscriptions auf public.lead_tasks. Damit Postgres-CDC die
-- INSERT/UPDATE/DELETE-Events tatsächlich an die Realtime-Container streamt,
-- muss die Tabelle in der supabase_realtime-Publication sein.
--
-- Stand vor dieser Migration: puballtables=false, nur public.accounts drin
-- (siehe 20260504155153_realtime_publication_accounts_v2.sql Block 3.6).
--
-- Replica-Identity: lead_tasks hat PK → default-Replica-Identity reicht für
-- UPDATE-Streaming bei refresh()-Pattern (Frontend feuert load() bei
-- jedem Event, kein OLD-Value-Use → kein FULL nötig).
--
-- RLS-Filter greift serverseitig: Realtime-Container respektiert die
-- lead_tasks_own-Policy → User sieht nur Events auf eigenen+assigned Tasks.
--
-- Idempotent durch DO-Block-Check.
-- Apply auf Staging zuerst, dann Prod.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'lead_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tasks;
  END IF;
END $$;

-- Verifikation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'lead_tasks'
  ) THEN
    RAISE EXCEPTION 'Migration FAILED: lead_tasks not in supabase_realtime after ADD TABLE';
  END IF;
END $$;

COMMIT;

-- Optional: PostgREST braucht keine Cache-Refresh — die Publication-Änderung
-- betrifft nur den Realtime-Container, der die Logical-Replication-Stream-Verbindung
-- bei der nächsten Subscription neu evaluiert.
