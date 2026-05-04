-- Block 3.6 v2 (Re-Implementation nach Revert PR #32)
--
-- Discovery (Block 3.6 ursprünglich + Block 3.6-Redo Discovery):
--   - supabase_realtime publication existiert mit puballtables=false, 0 tables (post-revert)
--   - Realtime-Container running healthy (supabase/realtime:v2.76.5)
--   - accounts.replica_identity = default (PK) — ausreichend fuer UPDATE-Streaming
--     mit refresh()-Pattern in useEntitlements
--   - RLS-Policies sec-grueen: accounts_owner_select + accounts_admin_select
--     filtern Realtime-Events serverseitig
--
-- Decisions (final, Michael):
--   Q1=accounts only (Folge-Block 3.7 fuer notifications + time_entries)
--   Q2=Variante 2 (active-Flag + try/catch + load-Dep-Fix via ref-Pattern)
--   Q3=Migration neu (sauberer als alte Datei resurrecten)
--   Q4=Connection-Indicator + Manual-Reload-Button bleibt
--   Q5=replica_identity default
--
-- Lifecycle-Bug-Fix gegenueber PR #31:
--   useEntitlements Realtime-useEffect verwendet jetzt:
--   - active-Flag verhindert State-Update nach Unmount
--   - try/catch um channel-Setup UND cleanup
--   - loadRef-Pattern: load NICHT mehr in useEffect-deps,
--     verhindert Multi-Subscribe-Race wenn load neu allokiert wuerde
--
-- Sec-Test-Plan (vor Prod-Apply diesmal):
--   Test 0: App rendert ohne Whitescreen + 0 Console-Errors (NEU, haette Bug gefangen)
--   Test 1: Owner-A sieht Update auf eigenen Account (Positive)
--   Test 2: Owner-A sieht KEIN Update auf fremden Account (Negative — Filter)
--   Test 3: Owner-B in Inkognito sieht Update auf eigenen Account
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
