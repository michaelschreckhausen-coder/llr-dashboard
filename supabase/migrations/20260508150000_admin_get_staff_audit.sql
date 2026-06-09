-- =============================================================================
-- Phase 3 (Frontend-supporting): admin_get_staff_audit RPC
-- =============================================================================
-- Detail-Page (StaffDetail.jsx) braucht Audit-History für einen einzelnen
-- Staff. Diese RPC liefert die Einträge aus admin_audit_log mit
-- target_table='leadesk_staff' und target_id=p_user_id, plus Email-Lookup
-- des handelnden Admin (für UI-Render "Wer hat was gemacht").
--
-- Auth: SECURITY DEFINER + Auth-Gate via is_leadesk_admin_admin(auth.uid()).
-- Wird auf BEIDE Stacks angewendet (Prod + Staging).
--
-- Idempotent: CREATE OR REPLACE.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_staff_audit(p_user_id uuid)
RETURNS TABLE (
  id              uuid,
  admin_user_id   uuid,
  admin_email     text,
  action          text,
  target_table    text,
  target_id       uuid,
  field_name      text,
  before_value    jsonb,
  after_value     jsonb,
  reason          text,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT
    a.id,
    a.admin_user_id,
    u.email AS admin_email,
    a.action,
    a.target_table,
    a.target_id,
    a.field_name,
    a.before_value,
    a.after_value,
    a.reason,
    a.created_at
  FROM public.admin_audit_log a
  LEFT JOIN auth.users u ON u.id = a.admin_user_id
  WHERE a.target_table = 'leadesk_staff'
    AND a.target_id = p_user_id
    AND public.is_leadesk_admin_admin(auth.uid())
  ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_staff_audit(uuid) TO authenticated;

COMMIT;
