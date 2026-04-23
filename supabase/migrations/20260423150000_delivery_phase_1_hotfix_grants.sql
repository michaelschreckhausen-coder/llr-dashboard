-- ============================================================================
-- LEADESK — Delivery Phase 1 HOTFIX: Table-Grants auf pm_* wiederherstellen
-- ============================================================================
-- Problem: Nach dem _own→_team Policy-Rebuild (Migration 20260423130000)
--          fehlen der `authenticated` Role die Table-Level GRANTs auf alle pm_*.
--          Folge: PostgREST liefert 403 "permission denied for table pm_projects"
--          obwohl RLS korrekt konfiguriert ist.
--
-- RLS ohne Table-Grants = immer noch gesperrt. GRANTs müssen separat stehen.
-- ============================================================================

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON pm_projects         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_tasks            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_columns          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_labels           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_task_labels      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_checklist_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_comments         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_attachments      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_task_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_project_members  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm_activity_log     TO authenticated;

-- Verifikation
SELECT
  c.relname AS tablename,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS can_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS can_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS can_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS can_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'pm_%'
ORDER BY c.relname;

COMMIT;
