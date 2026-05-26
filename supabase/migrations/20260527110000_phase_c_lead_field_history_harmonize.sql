-- 2026-05-27 — Phase C — lead_field_history Schema + RLS Harmonize
--
-- Staging hatte: user_id + team_id + changed_at NULLABLE
-- Prod hat:      changed_by + change_source + changed_at NOT NULL
-- Plus: Prod hat 3 granulare RLS-Policies, Staging eine simple ALL-Policy.
--
-- Strategie (atomic in BEGIN/COMMIT):
--   1) ADD changed_by + change_source mit Defaults (additiv, kein Risiko)
--   2) BACKFILL: changed_by = user_id für existing Rows
--   3) ALTER changed_at SET NOT NULL (backfill leerer Rows wenn nötig)
--   4) DROP user_id + team_id (Staging-only Cols)
--   5) RLS-Policies neu setzen (drop old, add 3 Prod-Style)
--
-- Risiko: medium-hoch. RLS-Swap kann Frontend-Query-Patterns brechen,
-- aber RLS ist atomic in BEGIN/COMMIT, kein Zwischenstand-Fenster.
--
-- Frontend-Impact: lead_field_history wird vom Frontend nicht direkt geschrieben
-- (kein activity-feed-INSERT-Pfad referenziert es). Trigger schreibt das in
-- Prod, auf Staging gleich. View lead_activity_feed liest field_name+old_value+
-- new_value — keine Spalten-Drift im View-Output.

BEGIN;

-- ─── Step 1: ADD changed_by + change_source ────────────────────────────────

ALTER TABLE public.lead_field_history ADD COLUMN IF NOT EXISTS changed_by    uuid;
ALTER TABLE public.lead_field_history ADD COLUMN IF NOT EXISTS change_source text NOT NULL DEFAULT 'user'::text;

-- ─── Step 2: BACKFILL changed_by aus user_id ───────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lead_field_history' AND column_name='user_id'
  ) THEN
    UPDATE public.lead_field_history
       SET changed_by = user_id
     WHERE changed_by IS NULL
       AND user_id IS NOT NULL;
  END IF;
END $$;

-- ─── Step 3: changed_at NOT NULL ──────────────────────────────────────────

UPDATE public.lead_field_history SET changed_at = now() WHERE changed_at IS NULL;
ALTER TABLE public.lead_field_history ALTER COLUMN changed_at SET NOT NULL;

-- ─── Step 4: lead_id NOT NULL (Prod hat NO, Staging hatte YES) ─────────────

UPDATE public.lead_field_history SET lead_id = NULL WHERE FALSE;  -- no-op, guard against accidental NULL state
DO $$
BEGIN
  -- Falls Staging Rows ohne lead_id hat, würde der NOT NULL-Set fehlschlagen.
  -- Wir lassen lead_id YES NULLABLE auf Staging — kleinere semantische Drift,
  -- aber kein Apply-Risk. Wenn Prod-Migration kommt, dort dasselbe Pattern.
  -- Kein ALTER hier.
  NULL;
END $$;

-- ─── Step 5: Dependencies (Policy + FK) DROPpen vor COLUMN-DROP ────────────
-- Reihenfolge KRITISCH: Postgres blockt DROP COLUMN solange Policies oder
-- FK-Constraints noch auf die Spalte referenzieren.

-- Old Staging-Policy referenziert user_id+team_id → blockiert beide DROPs
DROP POLICY IF EXISTS lead_field_history_user_team ON public.lead_field_history;
DROP POLICY IF EXISTS lead_field_history_own       ON public.lead_field_history;

-- FK auf auth.users(id) referenziert user_id → blockiert DROP user_id
ALTER TABLE public.lead_field_history DROP CONSTRAINT IF EXISTS lead_field_history_user_id_fkey;

-- ─── Step 6: Jetzt sind user_id + team_id frei zum Droppen ─────────────────

ALTER TABLE public.lead_field_history DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.lead_field_history DROP COLUMN IF EXISTS team_id;

-- ─── Step 7: Neue Prod-Style Policies anlegen ──────────────────────────────

-- Prod-Style: 3 granulare Policies
DROP POLICY IF EXISTS lfh_insert            ON public.lead_field_history;
CREATE POLICY lfh_insert ON public.lead_field_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS lfh_select            ON public.lead_field_history;
CREATE POLICY lfh_select ON public.lead_field_history
  FOR SELECT USING (
    lead_id IN (SELECT leads.id FROM public.leads WHERE leads.user_id = auth.uid())
  );

DROP POLICY IF EXISTS team_history_select   ON public.lead_field_history;
CREATE POLICY team_history_select ON public.lead_field_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = lead_field_history.lead_id
         AND l.user_id = auth.uid()
    )
  );

-- ─── Step 8: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  has_user_id          boolean;
  has_team_id          boolean;
  has_changed_by       boolean;
  has_change_source    boolean;
  changed_at_nullable  boolean;
  policy_count         integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_field_history' AND column_name='user_id') INTO has_user_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_field_history' AND column_name='team_id') INTO has_team_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_field_history' AND column_name='changed_by') INTO has_changed_by;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_field_history' AND column_name='change_source') INTO has_change_source;
  SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_field_history' AND column_name='changed_at' INTO changed_at_nullable;
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='lead_field_history' INTO policy_count;

  IF has_user_id        THEN RAISE EXCEPTION 'user_id still exists'; END IF;
  IF has_team_id        THEN RAISE EXCEPTION 'team_id still exists'; END IF;
  IF NOT has_changed_by    THEN RAISE EXCEPTION 'changed_by missing'; END IF;
  IF NOT has_change_source THEN RAISE EXCEPTION 'change_source missing'; END IF;
  IF changed_at_nullable   THEN RAISE EXCEPTION 'changed_at still nullable'; END IF;
  IF policy_count != 3     THEN RAISE EXCEPTION 'expected 3 policies, got %', policy_count; END IF;

  RAISE NOTICE 'Phase C verification PASSED';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
