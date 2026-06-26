-- 20260630100800_leadly_audit_before_state.sql
-- Phase 2 B2.3 (Undo): Vorher-Zustand für umkehrbare Update-Aktionen im Audit ablegen.
-- revert_action liest `before` und stellt die geänderten Felder wieder her.

BEGIN;

ALTER TABLE public.leadly_action_audit
  ADD COLUMN IF NOT EXISTS before jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
