-- supabase/migrations/20260501120000_delivery_phase_3_time_tracking.sql
BEGIN;

-- ============================================================================
-- 1. Team-Settings für Time-Tracking (Backdating-Limit, Rounding)
-- ============================================================================
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS time_tracking_max_backdating_days INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS time_tracking_rounding_minutes INTEGER;

COMMENT ON COLUMN teams.time_tracking_max_backdating_days IS
  'Max Tage rückwirkend für manuelle Zeiteinträge. Default 14.';
COMMENT ON COLUMN teams.time_tracking_rounding_minutes IS
  'Rundet ended_at auf nächstes N-Minuten-Vielfaches. NULL = keine Rundung.';

-- ============================================================================
-- 2. Tätigkeitsarten (pro Team)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pm_activity_types (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  color                     TEXT,
  is_billable_default       BOOLEAN NOT NULL DEFAULT true,
  default_hourly_rate_cents INTEGER,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  is_archived               BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, name)
);

CREATE INDEX IF NOT EXISTS pm_activity_types_team_idx
  ON pm_activity_types (team_id) WHERE is_archived = false;

-- ============================================================================
-- 3. pm_time_entries (Kerntabelle, Timer = Entry mit ended_at IS NULL)
--    duration_seconds und entry_date werden im BEFORE-Trigger befüllt
--    (statt GENERATED ALWAYS STORED, damit timezone-abhängige Casts möglich sind)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pm_time_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  task_id            UUID REFERENCES pm_tasks(id) ON DELETE SET NULL,
  activity_type_id   UUID REFERENCES pm_activity_types(id) ON DELETE SET NULL,

  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  duration_seconds   INTEGER,
  entry_date         DATE,

  description        TEXT,
  is_billable        BOOLEAN,
  hourly_rate_cents  INTEGER,
  is_invoiced        BOOLEAN NOT NULL DEFAULT false,
  invoice_id         UUID,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pm_time_entries_duration_check
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_time_entries_one_running_per_user
  ON pm_time_entries (user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS pm_time_entries_user_date_idx
  ON pm_time_entries (user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS pm_time_entries_project_date_idx
  ON pm_time_entries (project_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS pm_time_entries_team_date_idx
  ON pm_time_entries (team_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS pm_time_entries_invoice_pending_idx
  ON pm_time_entries (project_id, is_billable, is_invoiced)
  WHERE is_billable = true AND is_invoiced = false;

-- ============================================================================
-- 4. Trigger: handle_updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS pm_time_entries_updated_at ON pm_time_entries;
CREATE TRIGGER pm_time_entries_updated_at
  BEFORE UPDATE ON pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- 5. Trigger: Backdating + Billability-Hierarchie + Rounding + Default-Rate
--    + Auto-Befüllung von duration_seconds und entry_date
-- ============================================================================
CREATE OR REPLACE FUNCTION pm_time_entries_before_insert_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_backdating_days INTEGER;
  v_rounding_minutes    INTEGER;
  v_task_billable       BOOLEAN;
  v_activity_billable   BOOLEAN;
  v_rounded_seconds     INTEGER;
BEGIN
  SELECT time_tracking_max_backdating_days, time_tracking_rounding_minutes
    INTO v_max_backdating_days, v_rounding_minutes
    FROM teams WHERE id = NEW.team_id;

  -- Backdating-Limit (nur INSERT, sonst sind alte Entries un-editierbar)
  IF TG_OP = 'INSERT'
     AND NEW.started_at < NOW() - (v_max_backdating_days || ' days')::INTERVAL THEN
    RAISE EXCEPTION 'Zeiteinträge dürfen maximal % Tage rückwirkend angelegt werden.',
      v_max_backdating_days USING ERRCODE = 'check_violation';
  END IF;

  -- Billability-Hierarchie: explizit gesetzt > Task > Activity-Type > true
  IF NEW.is_billable IS NULL THEN
    IF NEW.task_id IS NOT NULL THEN
      SELECT is_billable INTO v_task_billable FROM pm_tasks WHERE id = NEW.task_id;
    END IF;
    IF v_task_billable IS NOT NULL THEN
      NEW.is_billable := v_task_billable;
    ELSIF NEW.activity_type_id IS NOT NULL THEN
      SELECT is_billable_default INTO v_activity_billable
        FROM pm_activity_types WHERE id = NEW.activity_type_id;
      NEW.is_billable := COALESCE(v_activity_billable, true);
    ELSE
      NEW.is_billable := true;
    END IF;
  END IF;

  -- Rounding: ended_at auf nächstes N-Minuten-Vielfaches relativ zu started_at
  IF NEW.ended_at IS NOT NULL
     AND v_rounding_minutes IS NOT NULL AND v_rounding_minutes > 0
     AND (TG_OP = 'INSERT' OR OLD.ended_at IS DISTINCT FROM NEW.ended_at) THEN
    v_rounded_seconds := ROUND(
      EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / (v_rounding_minutes * 60.0)
    )::INTEGER * v_rounding_minutes * 60;
    IF v_rounded_seconds < v_rounding_minutes * 60 THEN
      v_rounded_seconds := v_rounding_minutes * 60;
    END IF;
    NEW.ended_at := NEW.started_at + (v_rounded_seconds || ' seconds')::INTERVAL;
  END IF;

  -- Default hourly_rate aus Projekt übernehmen
  IF NEW.hourly_rate_cents IS NULL AND NEW.is_billable = true THEN
    SELECT default_hourly_rate_cents INTO NEW.hourly_rate_cents
      FROM pm_projects WHERE id = NEW.project_id;
  END IF;

  -- Auto-Befüllung: entry_date (Berlin-Tag, DACH-Default)
  NEW.entry_date := (NEW.started_at AT TIME ZONE 'Europe/Berlin')::DATE;

  -- Auto-Befüllung: duration_seconds (NULL solange Timer läuft)
  IF NEW.ended_at IS NULL THEN
    NEW.duration_seconds := NULL;
  ELSE
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_time_entries_before_insert_update_trg ON pm_time_entries;
CREATE TRIGGER pm_time_entries_before_insert_update_trg
  BEFORE INSERT OR UPDATE ON pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION pm_time_entries_before_insert_update();

-- ============================================================================
-- 6. Trigger: Lock nach Rechnungsstellung (blockt auch service_role)
-- ============================================================================
CREATE OR REPLACE FUNCTION pm_time_entries_invoice_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_invoiced = true THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Abgerechnete Zeiteinträge können nicht gelöscht werden (%).', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.is_invoiced = true AND (
         NEW.started_at  IS DISTINCT FROM OLD.started_at  OR
         NEW.ended_at    IS DISTINCT FROM OLD.ended_at    OR
         NEW.project_id  IS DISTINCT FROM OLD.project_id  OR
         NEW.task_id     IS DISTINCT FROM OLD.task_id     OR
         NEW.description IS DISTINCT FROM OLD.description OR
         NEW.is_billable IS DISTINCT FROM OLD.is_billable OR
         NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
       ) THEN
      RAISE EXCEPTION 'Abgerechnete Zeiteinträge sind gesperrt (%). Storno via is_invoiced=false zuerst.', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_time_entries_invoice_lock_update ON pm_time_entries;
CREATE TRIGGER pm_time_entries_invoice_lock_update
  BEFORE UPDATE ON pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION pm_time_entries_invoice_lock();

DROP TRIGGER IF EXISTS pm_time_entries_invoice_lock_delete ON pm_time_entries;
CREATE TRIGGER pm_time_entries_invoice_lock_delete
  BEFORE DELETE ON pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION pm_time_entries_invoice_lock();

-- ============================================================================
-- 7. Default-Activity-Types beim Anlegen eines Teams + One-shot für Bestand
-- ============================================================================
CREATE OR REPLACE FUNCTION pm_seed_default_activity_types()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO pm_activity_types (team_id, name, color, sort_order, is_billable_default) VALUES
    (NEW.id, 'Konzept',     '#8b5cf6', 10, true),
    (NEW.id, 'Design',      '#ec4899', 20, true),
    (NEW.id, 'Entwicklung', '#3b82f6', 30, true),
    (NEW.id, 'Meeting',     '#f59e0b', 40, true),
    (NEW.id, 'Admin',       '#6b7280', 50, false)
  ON CONFLICT (team_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_seed_activity_types ON teams;
CREATE TRIGGER teams_seed_activity_types
  AFTER INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION pm_seed_default_activity_types();

-- One-shot: bestehende Teams ohne Activity-Types nachziehen
INSERT INTO pm_activity_types (team_id, name, color, sort_order, is_billable_default)
SELECT t.id, v.name, v.color, v.sort_order, v.is_billable_default
FROM teams t
CROSS JOIN (VALUES
  ('Konzept',     '#8b5cf6', 10, true),
  ('Design',      '#ec4899', 20, true),
  ('Entwicklung', '#3b82f6', 30, true),
  ('Meeting',     '#f59e0b', 40, true),
  ('Admin',       '#6b7280', 50, false)
) AS v(name, color, sort_order, is_billable_default)
ON CONFLICT (team_id, name) DO NOTHING;

-- ============================================================================
-- 8. Erweiterungen pm_projects + pm_tasks
-- ============================================================================
ALTER TABLE pm_projects
  ADD COLUMN IF NOT EXISTS default_hourly_rate_cents INTEGER,
  ADD COLUMN IF NOT EXISTS budget_hours_total NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS budget_is_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_recurrence_interval TEXT
    CHECK (budget_recurrence_interval IN ('monthly','quarterly','yearly')
           OR budget_recurrence_interval IS NULL);

ALTER TABLE pm_tasks
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_billable BOOLEAN;

-- ============================================================================
-- 9. RLS + Hetzner-Grants (Cross-Table-Subquery-Fallstrick absichern)
-- ============================================================================
ALTER TABLE pm_activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_time_entries   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_activity_types_team" ON pm_activity_types;
CREATE POLICY "pm_activity_types_team" ON pm_activity_types FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "pm_time_entries_team" ON pm_time_entries;
CREATE POLICY "pm_time_entries_team" ON pm_time_entries FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

GRANT ALL    ON pm_activity_types TO authenticated;
GRANT ALL    ON pm_time_entries   TO authenticated;
GRANT SELECT ON team_members      TO authenticated;
GRANT SELECT ON teams             TO authenticated;
GRANT SELECT ON pm_projects       TO authenticated;
GRANT SELECT ON pm_tasks          TO authenticated;

COMMIT;
