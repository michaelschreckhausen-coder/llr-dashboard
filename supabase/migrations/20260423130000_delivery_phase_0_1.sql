-- ============================================================================
-- LEADESK — Schema-Catch-up + Delivery Phase 0 + 1
-- ============================================================================
-- Zielumgebung: Hetzner-Staging (staging-db-01, 178.104.210.216)
-- Aufruf: docker exec -i supabase-db psql -U postgres -d postgres < diese_datei.sql
--
-- Ausgangslage:
--   - pm_projects existiert (+ team_id + is_archived), pm_* Tabellen leer
--   - Schema auf Hetzner weicht vom App-Code-Stand ab (Drift aus alter pg_dump)
--
-- Diese Migration in drei Stufen:
--   A. Schema-Catch-up: App-Code-konformer Stand herstellen
--   B. Phase 0:         Multi-Tenant-Fundament (team_id FK/NOT NULL + Team-RLS)
--   C. Phase 1:         Deal-Integration + Projekt-Lifecycle
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────────────
-- A. SCHEMA-CATCH-UP (Hetzner → App-Code)
-- ───────────────────────────────────────────────────────────────────────────────────

-- A.1  pm_tasks: fehlende Spalten
ALTER TABLE pm_tasks
  ADD COLUMN IF NOT EXISTS cover_color     text,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS tags            text[]  DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS media_urls      text[]  DEFAULT '{}'::text[];

-- A.2  pm_columns: fehlende Spalte
ALTER TABLE pm_columns
  ADD COLUMN IF NOT EXISTS wip_limit integer;

-- A.3  pm_task_assignments: user_id → assignee_id umbenennen
ALTER TABLE pm_task_assignments RENAME COLUMN user_id TO assignee_id;
-- UNIQUE (task_id, user_id) muss neu, FK-Name bleibt (zeigt noch auf auth.users)
ALTER TABLE pm_task_assignments
  DROP CONSTRAINT IF EXISTS pm_task_assignments_task_id_user_id_key;
ALTER TABLE pm_task_assignments
  ADD CONSTRAINT pm_task_assignments_task_assignee_unique
  UNIQUE (task_id, assignee_id);
-- FK-Constraint-Name ist historisch — lassen wir stehen, funktional korrekt.

-- A.4  pm_activity_log: details(jsonb) → detail(text), project_id → nullable
ALTER TABLE pm_activity_log DROP COLUMN IF EXISTS details;
ALTER TABLE pm_activity_log ADD COLUMN IF NOT EXISTS detail text;
-- project_id auf Hetzner ist bereits NULL-bar (keine NOT-NULL-Erzwingung) — ok.

-- A.5  pm_attachments: file_path → url, storage_path dazu
ALTER TABLE pm_attachments RENAME COLUMN file_path TO url;
ALTER TABLE pm_attachments ADD COLUMN IF NOT EXISTS storage_path text;

-- A.6  Korrektur der bestehenden _own-Policy auf pm_columns (nutzt user_id
--      als EXISTS-Filter über pm_projects — bleibt, wird gleich ersetzt)


-- ───────────────────────────────────────────────────────────────────────────────────
-- B. PHASE 0 — Multi-Tenant-Fundament
-- ───────────────────────────────────────────────────────────────────────────────────

-- B.1  team_id auf pm_tasks und pm_columns (auf pm_projects ist sie schon da,
--      aber nullable und ohne FK)
ALTER TABLE pm_tasks   ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE pm_columns ADD COLUMN IF NOT EXISTS team_id uuid;

-- B.2  NOT NULL setzen (geht, weil Tabellen leer)
ALTER TABLE pm_projects ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE pm_tasks    ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE pm_columns  ALTER COLUMN team_id SET NOT NULL;

-- B.3  Foreign Keys auf teams
ALTER TABLE pm_projects
  ADD CONSTRAINT pm_projects_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE pm_tasks
  ADD CONSTRAINT pm_tasks_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE pm_columns
  ADD CONSTRAINT pm_columns_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- B.4  Indexes für RLS-Performance
CREATE INDEX IF NOT EXISTS pm_projects_team_id_idx ON pm_projects(team_id);
CREATE INDEX IF NOT EXISTS pm_tasks_team_id_idx    ON pm_tasks(team_id);
CREATE INDEX IF NOT EXISTS pm_columns_team_id_idx  ON pm_columns(team_id);

-- B.5  Alte _own-Policies droppen
DROP POLICY IF EXISTS "pm_projects_own"         ON pm_projects;
DROP POLICY IF EXISTS "pm_tasks_own"            ON pm_tasks;
DROP POLICY IF EXISTS "pm_columns_own"          ON pm_columns;
DROP POLICY IF EXISTS "pm_labels_own"           ON pm_labels;
DROP POLICY IF EXISTS "pm_task_labels_own"      ON pm_task_labels;
DROP POLICY IF EXISTS "pm_checklist_items_own"  ON pm_checklist_items;
DROP POLICY IF EXISTS "pm_comments_own"         ON pm_comments;
DROP POLICY IF EXISTS "pm_attachments_own"      ON pm_attachments;
DROP POLICY IF EXISTS "pm_task_assignments_own" ON pm_task_assignments;
DROP POLICY IF EXISTS "pm_project_members_own"  ON pm_project_members;
DROP POLICY IF EXISTS "pm_activity_log_insert"  ON pm_activity_log;
DROP POLICY IF EXISTS "pm_activity_log_select"  ON pm_activity_log;

-- B.6  Neue Team-Scope-Policies

-- Direkt über eigenes team_id
CREATE POLICY "pm_projects_team" ON pm_projects FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "pm_tasks_team" ON pm_tasks FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "pm_columns_team" ON pm_columns FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

-- Kindertabellen über Projekt-Join
CREATE POLICY "pm_labels_team" ON pm_labels FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_projects p
          WHERE p.id = project_id
            AND p.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "pm_project_members_team" ON pm_project_members FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_projects p
          WHERE p.id = project_id
            AND p.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);

-- Kindertabellen über Task-Join
CREATE POLICY "pm_task_labels_team" ON pm_task_labels FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_tasks t
          WHERE t.id = task_id
            AND t.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "pm_checklist_items_team" ON pm_checklist_items FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_tasks t
          WHERE t.id = task_id
            AND t.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "pm_comments_team" ON pm_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_tasks t
          WHERE t.id = task_id
            AND t.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "pm_attachments_team" ON pm_attachments FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_tasks t
          WHERE t.id = task_id
            AND t.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "pm_task_assignments_team" ON pm_task_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_tasks t
          WHERE t.id = task_id
            AND t.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);

-- pm_activity_log: hat project_id direkt
CREATE POLICY "pm_activity_log_team" ON pm_activity_log FOR ALL USING (
  EXISTS (SELECT 1 FROM pm_projects p
          WHERE p.id = project_id
            AND p.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);


-- ───────────────────────────────────────────────────────────────────────────────────
-- C. PHASE 1 — Deal-Integration + Projekt-Lifecycle
-- ───────────────────────────────────────────────────────────────────────────────────

ALTER TABLE pm_projects
  ADD COLUMN IF NOT EXISTS deal_id         uuid REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id         uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status          text DEFAULT 'active' NOT NULL
                           CHECK (status IN ('planning','active','on_hold','completed','archived')),
  ADD COLUMN IF NOT EXISTS start_date      date,
  ADD COLUMN IF NOT EXISTS due_date        date,
  ADD COLUMN IF NOT EXISTS completed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS budget_hours    numeric,
  ADD COLUMN IF NOT EXISTS budget_amount   numeric,
  ADD COLUMN IF NOT EXISTS hourly_rate     numeric,
  ADD COLUMN IF NOT EXISTS currency        char(3) DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS is_billable     boolean DEFAULT true;
-- is_archived existiert bereits (Hetzner hat das)

ALTER TABLE pm_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id    uuid REFERENCES pm_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_billable       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_client_visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS started_at        timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at      timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS pm_projects_deal_id_idx ON pm_projects(deal_id);
CREATE INDEX IF NOT EXISTS pm_projects_lead_id_idx ON pm_projects(lead_id);
CREATE INDEX IF NOT EXISTS pm_projects_status_idx  ON pm_projects(status);
CREATE INDEX IF NOT EXISTS pm_tasks_parent_idx     ON pm_tasks(parent_task_id);

-- Pro Deal nur EIN aktives Projekt (archivierte erlaubt)
CREATE UNIQUE INDEX IF NOT EXISTS pm_projects_deal_active_uniq
  ON pm_projects(deal_id)
  WHERE deal_id IS NOT NULL AND status != 'archived';


-- ───────────────────────────────────────────────────────────────────────────────────
-- VERIFIKATION (sollte in der Ausgabe stehen)
-- ───────────────────────────────────────────────────────────────────────────────────
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'pm_%'
ORDER BY tablename, policyname;

SELECT 'pm_projects' AS tbl, count(*) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='pm_projects'
UNION ALL SELECT 'pm_tasks',   count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pm_tasks'
UNION ALL SELECT 'pm_columns', count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pm_columns';

COMMIT;
