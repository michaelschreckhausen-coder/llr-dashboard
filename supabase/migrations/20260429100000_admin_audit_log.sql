-- Phase 1.3a: Audit-Log für Leadesk-Admin-Aktionen
-- Tabelle wird via SECURITY-DEFINER-RPC beschrieben (Phase 1.3b),
-- daher KEINE INSERT/UPDATE/DELETE-Policy für authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  field_name text,
  before_value jsonb,
  after_value jsonb,
  reason text NOT NULL CHECK (length(reason) >= 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON admin_audit_log(target_table, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
  ON admin_audit_log(admin_user_id, created_at DESC);

-- Hetzner-Grant-Fallstrick: authenticated braucht SELECT-Grant,
-- sonst Silent-Fail bei RLS-Sub-Queries (siehe CLAUDE.md Fallstricke).
GRANT SELECT ON admin_audit_log TO authenticated;

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Nur Leadesk-Admins lesen
DROP POLICY IF EXISTS audit_admin_select ON admin_audit_log;
CREATE POLICY audit_admin_select ON admin_audit_log
  FOR SELECT
  USING (
    COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false) = true
  );

-- KEINE INSERT/UPDATE/DELETE-Policy: Schreiben nur via SECURITY-DEFINER-RPC.
-- Das schützt vor direkten Manipulationen des Audit-Trails.

-- Defense-in-depth: explizit INSERT/UPDATE/DELETE-Permission entziehen.
-- Auf Hetzner-Staging existiert ein 'GRANT ALL ON ALL TABLES TO authenticated'-Hotfix
-- (siehe CLAUDE.md Fallstricke-Sektion), der diese Permissions implizit setzt.
-- Die SECURITY-DEFINER-RPC ist der einzige zulässige Schreibpfad.
REVOKE INSERT, UPDATE, DELETE ON admin_audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON admin_audit_log FROM anon;

COMMIT;
