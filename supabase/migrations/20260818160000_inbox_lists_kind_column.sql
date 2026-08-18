-- ============================================================================
-- inbox_lists.kind nachtraeglich als Migration festschreiben
-- ----------------------------------------------------------------------------
-- Befund 2026-08-18: die Spalte `kind` ('prospect' | 'connection') existiert auf
-- Prod und wird vom Frontend gelesen (LinkedInInbox trennt die Chips nach Tab:
-- Prospects vs. Verbindungen), es gibt aber KEINE Migration dafuer im Repo —
-- sie wurde per Hand angelegt. Ohne Ledger ist nicht feststellbar, ob Staging
-- sie hat; fehlt sie dort, 400t der inbox_lists-Query und es erscheint KEINE
-- Liste (nicht nur die geteilte).
--
-- Diese Migration ist rein additiv und idempotent: auf Prod ein No-op, auf einer
-- Umgebung ohne die Spalte zieht sie den Stand nach. Kein DROP, kein Datenverlust.
-- Der CHECK wird nur angelegt, wenn er fehlt UND alle Bestandswerte passen.
-- Rollback-Geschwisterdatei: .rollback.sql (nur der CHECK, nie die Spalte).
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

-- ── Pre-Flight (read-only): Spalte da? Welche Werte liegen drin? ────────────
\echo '--- Pre-Flight: existiert inbox_lists.kind? ---'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'inbox_lists' AND column_name = 'kind';

\echo '--- Pre-Flight: Werte-Verteilung (leer = Spalte fehlt) ---'
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='inbox_lists' AND column_name='kind') THEN
    FOR r IN EXECUTE 'SELECT COALESCE(kind, ''<null>'') AS kind, count(*) AS n
                        FROM public.inbox_lists GROUP BY 1 ORDER BY 2 DESC' LOOP
      RAISE NOTICE 'kind=% -> % Zeilen', r.kind, r.n;
    END LOOP;
  ELSE
    RAISE NOTICE 'Spalte kind fehlt — wird angelegt.';
  END IF;
END $$;

-- ── 1) Spalte (additiv, idempotent) ─────────────────────────────────────────
ALTER TABLE public.inbox_lists
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'prospect';

-- Bestandszeilen ohne Wert auf den Default ziehen (falls die Spalte vorher
-- ohne NOT NULL/DEFAULT per Hand angelegt wurde).
UPDATE public.inbox_lists SET kind = 'prospect' WHERE kind IS NULL;

-- ── 2) CHECK nur anlegen, wenn er fehlt und die Daten ihn hergeben ──────────
DO $$
DECLARE v_bad bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.inbox_lists'::regclass AND conname = 'inbox_lists_kind_check') THEN
    RAISE NOTICE 'CHECK inbox_lists_kind_check existiert bereits — nichts zu tun.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_bad FROM public.inbox_lists WHERE kind NOT IN ('prospect','connection');
  IF v_bad > 0 THEN
    RAISE NOTICE 'CHECK NICHT angelegt: % Zeile(n) mit unerwartetem kind — erst klaeren.', v_bad;
    RETURN;
  END IF;
  ALTER TABLE public.inbox_lists
    ADD CONSTRAINT inbox_lists_kind_check CHECK (kind IN ('prospect','connection'));
  RAISE NOTICE 'CHECK inbox_lists_kind_check angelegt.';
END $$;

COMMIT;

-- ── 3) Verifikation ─────────────────────────────────────────────────────────
\echo '--- Verify: Spalte + Default + NOT NULL ---'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='inbox_lists' AND column_name='kind';

\echo '--- Verify: CHECK vorhanden? ---'
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.inbox_lists'::regclass AND conname = 'inbox_lists_kind_check';

NOTIFY pgrst, 'reload schema';
