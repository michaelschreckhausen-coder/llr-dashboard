-- 2026-05-27 — Phase D — vernetzungen Schema Harmonize
--
-- Staging hatte 10 Cols (id, user_id, team_id, lead_id, status, message,
-- sent_at, accepted_at, created_at, updated_at).
-- Prod hat 22 Cols (li_*, generated_msg, final_msg, context_notes,
-- responded_at, outcome_notes, rating + 11 weitere).
--
-- Frontend-Impact: Kein Code schreibt direkt auf vernetzungen-Tabelle
-- (Vernetzungen.jsx nutzt connection_queue, lead_activity_feed-View
-- referenziert ggf. vernetzungen aber Phase 1 hatte den Branch entfernt).
-- 0 Rows auf Staging → kein Data-Loss bei DROP/RENAME.
--
-- Strategie:
--   1) ADD 13 missing Cols (li_*, generated_msg, final_msg, context_notes,
--      responded_at, outcome_notes, rating)
--   2) BACKFILL data wenn vorhanden (no-op bei 0 rows)
--   3) DROP 3 Staging-only Cols (message, accepted_at, team_id)
--   4) ALTER status DEFAULT 'draft' (Prod-Wert, war 'pending' auf Staging)
--   5) RLS-Policies harmonize (Prod hat 2 identische Policies own_/owner_)
--
-- Idempotent durch IF NOT EXISTS / IF EXISTS Patterns.

BEGIN;

-- ─── Step 1: ADD 13 missing Cols ───────────────────────────────────────────

ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_name        text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_headline    text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_company     text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_position    text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_location    text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_about       text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_url         text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_avatar_url  text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS li_skills      text[];
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS generated_msg  text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS final_msg      text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS context_notes  text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS responded_at   timestamp with time zone;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS outcome_notes  text;
ALTER TABLE public.vernetzungen ADD COLUMN IF NOT EXISTS rating         integer;

-- ─── Step 2: BACKFILL (no-op bei 0 Staging-rows, aber safe pattern) ────────

DO $$
BEGIN
  -- message → generated_msg (wenn Staging-Col noch existiert)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='message'
  ) THEN
    UPDATE public.vernetzungen
       SET generated_msg = message
     WHERE generated_msg IS NULL AND message IS NOT NULL;
  END IF;

  -- accepted_at → responded_at
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='accepted_at'
  ) THEN
    UPDATE public.vernetzungen
       SET responded_at = accepted_at
     WHERE responded_at IS NULL AND accepted_at IS NOT NULL;
  END IF;
END $$;

-- ─── Step 3: DROP 3 Staging-only Cols ─────────────────────────────────────

ALTER TABLE public.vernetzungen DROP COLUMN IF EXISTS message;
ALTER TABLE public.vernetzungen DROP COLUMN IF EXISTS accepted_at;
ALTER TABLE public.vernetzungen DROP COLUMN IF EXISTS team_id;

-- ─── Step 4: ALTER status DEFAULT 'draft' ──────────────────────────────────

ALTER TABLE public.vernetzungen ALTER COLUMN status SET DEFAULT 'draft'::text;

-- ─── Step 5: RLS-Policies harmonize (Prod-Style: 2 Policies) ───────────────
-- Beide haben identische USING-Clause, Prod hat es einfach doppelt benannt.
-- Wir kopieren das 1:1.

DROP POLICY IF EXISTS vernetzungen_own    ON public.vernetzungen;
DROP POLICY IF EXISTS own_vernetzungen    ON public.vernetzungen;
DROP POLICY IF EXISTS vernetzungen_owner  ON public.vernetzungen;

CREATE POLICY own_vernetzungen ON public.vernetzungen
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY vernetzungen_owner ON public.vernetzungen
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Step 6: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  cnt_cols integer;
  has_message       boolean;
  has_accepted_at   boolean;
  has_team_id       boolean;
  has_li_name       boolean;
  has_generated_msg boolean;
  has_responded_at  boolean;
  policy_count      integer;
BEGIN
  SELECT count(*) INTO cnt_cols FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vernetzungen';

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='message')       INTO has_message;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='accepted_at')   INTO has_accepted_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='team_id')       INTO has_team_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='li_name')       INTO has_li_name;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='generated_msg') INTO has_generated_msg;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vernetzungen' AND column_name='responded_at')  INTO has_responded_at;
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='vernetzungen' INTO policy_count;

  IF has_message      THEN RAISE EXCEPTION 'message col still exists'; END IF;
  IF has_accepted_at  THEN RAISE EXCEPTION 'accepted_at col still exists'; END IF;
  IF has_team_id      THEN RAISE EXCEPTION 'team_id col still exists'; END IF;
  IF NOT has_li_name        THEN RAISE EXCEPTION 'li_name missing'; END IF;
  IF NOT has_generated_msg  THEN RAISE EXCEPTION 'generated_msg missing'; END IF;
  IF NOT has_responded_at   THEN RAISE EXCEPTION 'responded_at missing'; END IF;
  IF policy_count != 2 THEN RAISE EXCEPTION 'expected 2 policies, got %', policy_count; END IF;

  RAISE NOTICE 'Phase D verification PASSED — vernetzungen has % cols', cnt_cols;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
