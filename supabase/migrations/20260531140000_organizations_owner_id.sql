-- ════════════════════════════════════════════════════════════════════════════
-- organizations.owner_id — Single-Owner-Pattern analog leads.owner_id
-- 2026-05-31
-- ════════════════════════════════════════════════════════════════════════════
--
-- Konsistenz mit Leads: Unternehmen sollen denselben Owner-Picker-Workflow
-- haben wie Kontakte. organizations hat heute assignee_id (anderer Begriff,
-- inkonsistent benutzt) und created_by/user_id (System-Felder). Neue
-- owner_id-Spalte als kanonisches Single-Owner-Feld — analog zum Leads-
-- Refactor von 2026-05-29 (Owner-Domain Single-Owner-Migration).
--
-- deals.owner_id existiert bereits — kein Migration dafür nötig.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
  ON public.organizations (owner_id)
  WHERE owner_id IS NOT NULL;

COMMENT ON COLUMN public.organizations.owner_id IS
  '2026-05-31 · Single-Owner (auth.users.id). Analog leads.owner_id. assignee_id bleibt als Legacy-Feld bestehen, wird aber vom Owner-Picker-Workflow nicht mehr gepflegt.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name='organizations' AND column_name='owner_id';
--   -- Erwartet: owner_id, uuid, YES
-- ════════════════════════════════════════════════════════════════════════════
