-- =============================================================================
-- Phase 1: leadesk_staff-Schema von Staging nach Prod klonen
-- =============================================================================
-- Staging hat dieses Schema seit 2026-05-08 (Step 3 Bootstrap), Prod fehlt's.
-- Diese Migration klont 1:1 + legt Bootstrap-Row für michael@leadesk.de an.
--
-- Idempotent (CREATE IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING).
-- Schreibvorgänge auf leadesk_staff sind RLS-locked (USING false). Inserts/
-- Updates kommen ausschließlich via SECURITY-DEFINER-RPCs (Phase 2).
-- =============================================================================

BEGIN;

-- 1. TABELLE
CREATE TABLE IF NOT EXISTS public.leadesk_staff (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             text NOT NULL UNIQUE,
  full_name         text,
  is_admin_admin    boolean NOT NULL DEFAULT true,
  is_admin_app      boolean NOT NULL DEFAULT true,
  is_admin_staging  boolean NOT NULL DEFAULT true,
  is_active         boolean NOT NULL DEFAULT true,
  invited_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  activated_at      timestamptz,
  deactivated_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. INDEXES (pkey kommt automatisch)
CREATE INDEX IF NOT EXISTS leadesk_staff_active_idx
  ON public.leadesk_staff (is_active) WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS leadesk_staff_email_lower_idx
  ON public.leadesk_staff (lower(email));

-- 3. TRIGGER touch updated_at
CREATE OR REPLACE FUNCTION public.leadesk_staff_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leadesk_staff_touch_updated_at ON public.leadesk_staff;
CREATE TRIGGER leadesk_staff_touch_updated_at
  BEFORE UPDATE ON public.leadesk_staff
  FOR EACH ROW EXECUTE FUNCTION public.leadesk_staff_touch_updated_at();

-- 4. HELPER-RPCs (per-Environment-Admin-Check, identisch zu Staging)
CREATE OR REPLACE FUNCTION public.is_leadesk_admin_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leadesk_staff
    WHERE id = p_user_id AND is_admin_admin = true AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_leadesk_admin_app(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leadesk_staff
    WHERE id = p_user_id AND is_admin_app = true AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_leadesk_admin_staging(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leadesk_staff
    WHERE id = p_user_id AND is_admin_staging = true AND is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_leadesk_admin_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_leadesk_admin_app(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_leadesk_admin_staging(uuid) TO authenticated;

-- 5. RLS-POLICIES
ALTER TABLE public.leadesk_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_no_direct_writes ON public.leadesk_staff;
CREATE POLICY staff_no_direct_writes ON public.leadesk_staff
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS staff_select_self_or_admin ON public.leadesk_staff;
CREATE POLICY staff_select_self_or_admin ON public.leadesk_staff
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_leadesk_admin_admin(auth.uid())
  );

GRANT SELECT ON public.leadesk_staff TO authenticated;

-- 6. BOOTSTRAP-ROW (michael@leadesk.de Prod-User-ID aus Discovery)
INSERT INTO public.leadesk_staff (
  id, email, full_name,
  is_admin_admin, is_admin_app, is_admin_staging,
  is_active, invited_by, invited_at, activated_at
)
VALUES (
  '758b71cf-464f-43c7-bc46-699c141c5db1',
  'michael@leadesk.de',
  'Michael Schreck',
  true, true, true,
  true,
  '758b71cf-464f-43c7-bc46-699c141c5db1',  -- self-invite Bootstrap
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
