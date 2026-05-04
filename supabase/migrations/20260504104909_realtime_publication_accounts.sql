-- Block 3.6: Realtime-Aktivierung fuer public.accounts
--
-- Discovery (Block-3-6-Discovery):
--   - supabase_realtime publication existiert mit puballtables=false, aber 0 tables
--   - Realtime-Container running healthy (supabase/realtime:v2.76.5, Up 11 days)
--   - accounts.replica_identity = default (PK) — ausreichend fuer UPDATE-Streaming
--     mit refresh()-Pattern (kein full payload mit alten Werten noetig)
--   - RLS-Policies sec-grueen: accounts_owner_select (owner_user_id=auth.uid())
--     + accounts_admin_select (is_leadesk_admin JWT claim) — Realtime nutzt
--     SELECT-Policies fuer Event-Filtering, jeder User sieht nur eigene Updates
--     plus Leadesk-Admin sieht alle.
--
-- Decisions (final, Michael):
--   Q1=accounts only (Folge-Block 3.7 fuer notifications + time_entries)
--   Q2=staging-first, dann Prod-Apply nach 4-Sec-Tests grueen
--   Q3=Manual-Reload-Button bleibt als belt-and-suspenders
--   Q4=Connection-State-Indicator im Frontend
--   Q5=replica_identity default (kein full)
--
-- Sec-Test (durchgefuehrt vor Prod-Apply):
--   Test 1: Owner-A sieht Update auf eigenen Account (Positive)
--   Test 2: Owner-A sieht KEIN Update auf fremden Account (Negative — Filter)
--   Test 3: Owner-B in Inkognito sieht Update auf eigenen Account (Positive)
--   Test 4: Connection-Resilience (DevTools Offline-Toggle, Reconnect)
--
-- Rollback bei Bedarf:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.accounts;

ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;

-- Verifikation: Migration faellt bei Fehler in der Transaktion zurueck
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'accounts'
  ) THEN
    RAISE EXCEPTION 'Migration FAILED: accounts not in supabase_realtime after ADD TABLE';
  END IF;
END $$;
