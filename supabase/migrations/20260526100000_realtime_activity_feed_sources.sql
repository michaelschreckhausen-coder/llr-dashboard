-- 2026-05-26 — Realtime für Activity-Feed (Sprint-C-Followup)
--
-- Erweitert das Realtime-Setup von lead_tasks (siehe 20260522150000 +
-- 20260526090000) auf die anderen beiden Source-Tabellen des
-- lead_activity_feed-Views: activities + lead_field_history.
--
-- Damit propagieren Notes/Calls/Meetings/Emails (activities) UND
-- Status/Score/Stage/Owner-Changes (lead_field_history) live in den
-- Aktivitäten-Tab im Lead-Detail.
--
-- lead_tasks ist seit den zwei Vor-Migrations bereits live + REPLICA FULL —
-- wird hier nur als Sanity-Re-Check geprüft.
--
-- Idempotent durch DO-Block-EXISTS-Checks.
-- RLS-Filter greift serverseitig: User sieht nur Events auf eigenen Rows.

BEGIN;

-- ─── 1) Publication-Erweiterung ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_field_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_field_history;
  END IF;
END $$;

-- ─── 2) REPLICA IDENTITY FULL ──────────────────────────────────────────────
-- Pflicht damit DELETE-Events durch RLS+Filter-Eval kommen
-- (siehe 20260526090000_lead_tasks_replica_identity_full.sql für Rationale).

ALTER TABLE public.activities         REPLICA IDENTITY FULL;
ALTER TABLE public.lead_field_history REPLICA IDENTITY FULL;

-- ─── 3) Verifikation ───────────────────────────────────────────────────────

DO $$
DECLARE
  pub_act     boolean;
  pub_hist    boolean;
  ident_act   char;
  ident_hist  char;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='activities')         INTO pub_act;
  SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_field_history') INTO pub_hist;
  SELECT relreplident FROM pg_class WHERE relname='activities'         AND relnamespace='public'::regnamespace INTO ident_act;
  SELECT relreplident FROM pg_class WHERE relname='lead_field_history' AND relnamespace='public'::regnamespace INTO ident_hist;

  IF NOT pub_act    THEN RAISE EXCEPTION 'activities not in supabase_realtime publication'; END IF;
  IF NOT pub_hist   THEN RAISE EXCEPTION 'lead_field_history not in supabase_realtime publication'; END IF;
  IF ident_act != 'f'  THEN RAISE EXCEPTION 'activities.relreplident = % (expected f)', ident_act; END IF;
  IF ident_hist != 'f' THEN RAISE EXCEPTION 'lead_field_history.relreplident = % (expected f)', ident_hist; END IF;
END $$;

COMMIT;

-- Optional Verify (kein TX nötig):
-- SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' ORDER BY tablename;
-- SELECT relname, relreplident FROM pg_class WHERE relname IN ('activities','lead_field_history','lead_tasks');
