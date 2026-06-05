-- 2026-06-02 — Multi-Assignee fuer lead_tasks + Visibility-Tightening
--
-- Ziel:
--   1. Mehrere Verantwortliche pro Aufgabe (Junction-Tabelle)
--   2. Visibility weg vom team_id-Pfad (Phase G). Aufgabe sichtbar wenn:
--      created_by = uid ODER user ist in lead_task_assignees fuer den Task
--   3. Owner-Override bewusst weg
--
-- Pre-Flight 2026-06-02 (Hetzner-Staging):
--   - 41 lead_tasks, 40 mit assigned_to, 0 Orphans → verlustfreier Backfill
--   - junction_exists = false → Greenfield
--   - lead_tasks REPLICA IDENTITY FULL + in supabase_realtime publication
--   - authenticated + service_role haben volle Grants auf team_members
--
-- Recursion-Fix: Co-Assignee-Check in SECURITY DEFINER-Function ausgelagert
-- (analog Phase G user_in_team). Inline EXISTS auf lead_task_assignees
-- aus einer Policy AUF lead_task_assignees triggert RLS-Re-Eval → infinite
-- recursion. Function bypasst RLS auf dem inneren Read.
--
-- Konsequenzen:
--   - Backfill schreibt 40 Rows (eine pro existing assigned_to)
--   - lead_tasks.assigned_to bleibt als Legacy-Spalte (Dual-Write durch
--     Frontend: erster Assignee = Mirror, NULL bei 0). Cleanup-Drop ist
--     ein separater Sprint.
--   - lead_tasks_own (FOR ALL, Phase G + Migration 20260522100000) wird
--     gedroppt — sonst hebelt sie via OR den Tightening-Effekt aus.
--   - Team-Pfad in tasks_select + tasks_update faellt weg.
--
-- service_role-Grants explizit (CLAUDE.md Top-Fallstrick #12 — Hetzner-
-- ALL-Hotfix deckt nur authenticated, nicht service_role).

BEGIN;

-- ─── 1. Junction-Tabelle ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_task_assignees (
  task_id     uuid NOT NULL REFERENCES public.lead_tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_task_assignees_user
  ON public.lead_task_assignees (user_id);

ALTER TABLE public.lead_task_assignees ENABLE ROW LEVEL SECURITY;

-- REPLICA IDENTITY FULL: Realtime kann RLS-Policy gegen geloeschte Row
-- evaluieren (sonst silent-drop bei DELETE-Events, analog Top-Fallstrick
-- vor Migration 20260526090000).
ALTER TABLE public.lead_task_assignees REPLICA IDENTITY FULL;

-- ─── 2. Co-Assignee-Check als SECURITY DEFINER (Recursion-Fix) ─────────

CREATE OR REPLACE FUNCTION public.is_task_coassignee(
  p_task_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_task_assignees
    WHERE task_id = p_task_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_task_coassignee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_coassignee(uuid, uuid) TO service_role;

-- ─── 3. Backfill aus Legacy lead_tasks.assigned_to ─────────────────────

INSERT INTO public.lead_task_assignees (task_id, user_id, assigned_by)
SELECT id, assigned_to, created_by
FROM public.lead_tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

-- ─── 4. RLS-Policies auf lead_task_assignees ───────────────────────────

-- SELECT: own-row ODER Creator des Tasks ODER Co-Assignee (= jeder, der
-- selbst auf dem Task assigned ist, sieht die anderen Assignees).
-- Letzter Branch via SECURITY DEFINER Function — sonst Recursion.
DROP POLICY IF EXISTS lta_select ON public.lead_task_assignees;
CREATE POLICY lta_select ON public.lead_task_assignees
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lead_tasks t
      WHERE t.id = lead_task_assignees.task_id
        AND t.created_by = auth.uid()
    )
    OR public.is_task_coassignee(lead_task_assignees.task_id)
  );

-- INSERT: Creator des Tasks ODER bestehender Co-Assignee darf weitere
-- hinzufuegen. assigned_by MUSS auth.uid() sein (keine Spoofing).
-- KEIN user_id = auth.uid()-Branch im WITH CHECK → niemand kann sich
-- selbst auf fremde Tasks setzen.
DROP POLICY IF EXISTS lta_insert ON public.lead_task_assignees;
CREATE POLICY lta_insert ON public.lead_task_assignees
  FOR INSERT
  WITH CHECK (
    assigned_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.lead_tasks t
        WHERE t.id = lead_task_assignees.task_id
          AND t.created_by = auth.uid()
      )
      OR public.is_task_coassignee(lead_task_assignees.task_id)
    )
  );

-- DELETE: Creator des Tasks ODER own-row (Self-Removal). Co-Assignees
-- duerfen sich nicht gegenseitig entfernen — konservativ, nur Creator
-- hat volle Kontrolle.
DROP POLICY IF EXISTS lta_delete ON public.lead_task_assignees;
CREATE POLICY lta_delete ON public.lead_task_assignees
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lead_tasks t
      WHERE t.id = lead_task_assignees.task_id
        AND t.created_by = auth.uid()
    )
  );

-- KEIN UPDATE-Policy → Postgres-Default blockt UPDATE. Assignee-Wechsel
-- = DELETE + INSERT (sauber, Audit-Trail bleibt via assigned_at).

-- ─── 5. Grants (service_role explizit, CLAUDE.md #12) ──────────────────

GRANT SELECT, INSERT, DELETE ON public.lead_task_assignees TO authenticated;
GRANT ALL ON public.lead_task_assignees TO service_role;

-- ─── 6. lead_tasks-Policies: Team-Pfad RAUS, Junction REIN ─────────────

-- Legacy FOR-ALL droppen (sonst OR-overrides den Tightening)
DROP POLICY IF EXISTS lead_tasks_own ON public.lead_tasks;

-- tasks_select neu: created_by ODER Junction-Match. Kein Team-Pfad mehr.
-- Junction-Subquery referenziert lead_task_assignees aus einer Policy
-- auf lead_tasks → andere Tabelle, keine Recursion.
DROP POLICY IF EXISTS tasks_select ON public.lead_tasks;
CREATE POLICY tasks_select ON public.lead_tasks
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lead_task_assignees a
      WHERE a.task_id = lead_tasks.id
        AND a.user_id = auth.uid()
    )
  );

-- tasks_update neu: gleiche Bedingung in USING + WITH CHECK. Kein Team-
-- Pfad. (User kann sich selbst aus Junction loeschen und dann hat er
-- keinen Update-Zugriff mehr — das ist gewollt.)
DROP POLICY IF EXISTS tasks_update ON public.lead_tasks;
CREATE POLICY tasks_update ON public.lead_tasks
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lead_task_assignees a
      WHERE a.task_id = lead_tasks.id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lead_task_assignees a
      WHERE a.task_id = lead_tasks.id
        AND a.user_id = auth.uid()
    )
  );

-- tasks_insert + tasks_delete unveraendert (created_by = uid)

-- ─── 7. Realtime-Publication erweitern ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lead_task_assignees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_task_assignees;
  END IF;
END $$;

-- ─── 8. Verifikation ───────────────────────────────────────────────────

DO $$
DECLARE
  junction_rows         integer;
  legacy_assignees      integer;
  lead_tasks_policies   integer;
  junction_policies     integer;
  has_lead_tasks_own    boolean;
  publication_has_junc  boolean;
  replica_full          boolean;
  fn_coassignee         boolean;
BEGIN
  SELECT COUNT(*) INTO junction_rows   FROM public.lead_task_assignees;
  SELECT COUNT(*) INTO legacy_assignees FROM public.lead_tasks WHERE assigned_to IS NOT NULL;

  SELECT COUNT(*) INTO lead_tasks_policies
  FROM pg_policies WHERE schemaname='public' AND tablename='lead_tasks';

  SELECT COUNT(*) INTO junction_policies
  FROM pg_policies WHERE schemaname='public' AND tablename='lead_task_assignees';

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lead_tasks' AND policyname='lead_tasks_own'
  ) INTO has_lead_tasks_own;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_task_assignees'
  ) INTO publication_has_junc;

  SELECT (relreplident = 'f') INTO replica_full
  FROM pg_class WHERE relname='lead_task_assignees';

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'is_task_coassignee' AND n.nspname = 'public' AND p.prosecdef
  ) INTO fn_coassignee;

  IF junction_rows <> legacy_assignees THEN
    RAISE EXCEPTION 'Backfill incomplete: junction=% vs legacy_assignees=%', junction_rows, legacy_assignees;
  END IF;
  IF has_lead_tasks_own THEN
    RAISE EXCEPTION 'lead_tasks_own still present — DROP failed';
  END IF;
  IF lead_tasks_policies <> 4 THEN
    RAISE EXCEPTION 'lead_tasks expected 4 policies (tasks_select/update/insert/delete), got %', lead_tasks_policies;
  END IF;
  IF junction_policies <> 3 THEN
    RAISE EXCEPTION 'lead_task_assignees expected 3 policies (lta_select/insert/delete), got %', junction_policies;
  END IF;
  IF NOT publication_has_junc THEN
    RAISE EXCEPTION 'lead_task_assignees missing from supabase_realtime publication';
  END IF;
  IF NOT replica_full THEN
    RAISE EXCEPTION 'lead_task_assignees REPLICA IDENTITY not FULL';
  END IF;
  IF NOT fn_coassignee THEN
    RAISE EXCEPTION 'is_task_coassignee SECURITY DEFINER function missing';
  END IF;

  RAISE NOTICE 'Multi-Assignee migration OK: % Junction-Rows (= % legacy assignees), % lead_tasks-Policies, % Junction-Policies, Publication+REPLICA+Function OK',
    junction_rows, legacy_assignees, lead_tasks_policies, junction_policies;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
