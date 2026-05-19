-- =============================================================================
-- Marketplace Read-Policy: Leadesk-Admins sehen auch inaktive Add-ons
-- =============================================================================
-- Phase-0-Migration (20260518140000) hatte addons_read_authenticated mit
-- USING (is_active = true) — d.h. die Admin-CRUD-Page in leadesk-admin
-- kann inaktive Add-ons nicht sehen, weil RLS auch für is_leadesk_admin
-- greift.
--
-- Lösung: Policy erweitern um is_leadesk_admin()-Bypass via OR.
-- Endkunden sehen weiterhin nur is_active=true, Leadesk-Staff alles.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY (kein conditional CREATE).
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS addons_read_authenticated ON public.addons;

CREATE POLICY addons_read_authenticated ON public.addons FOR SELECT TO authenticated
  USING (is_active = true OR is_leadesk_admin());

COMMIT;

-- Schema-Cache für PostgREST refreshen
NOTIFY pgrst, 'reload schema';
