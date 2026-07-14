-- Staff-Impersonation (Weg B, self-signed HS256-Token) — Session-Tracking + can_impersonate-Capability.
-- Die staff-impersonate Edge-Function schreibt hier via service_role. Additive, idempotent.
-- Sicherheits-Design: nur service_role schreibt; Staff liest via is_leadesk_admin-Guard; keine Kunden-Rolle.

BEGIN;

-- ── (1) Capability-Flag im bestehenden leadesk_staff-Flag-Muster (is_admin_admin/app/staging) ──
ALTER TABLE public.leadesk_staff
  ADD COLUMN IF NOT EXISTS can_impersonate boolean NOT NULL DEFAULT false;

-- Owner (michael) initial freischalten; Julian bleibt false (per StaffGrantsToggle-UI schaltbar).
UPDATE public.leadesk_staff SET can_impersonate = true, updated_at = now()
WHERE email = 'michael@leadesk.de';

-- ── (2) Session-Tracking ──
CREATE TABLE IF NOT EXISTS public.staff_impersonation_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          uuid NOT NULL REFERENCES public.leadesk_staff(id),
  target_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_team_id    uuid,
  reason            text NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,            -- harte Gesamt-Obergrenze (60-min-Cap)
  ended_at          timestamptz,
  end_reason        text,                            -- 'manual' | 'expired' | …
  ip                inet,
  user_agent        text
);
CREATE INDEX IF NOT EXISTS idx_staff_imp_sessions_staff  ON public.staff_impersonation_sessions (staff_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_imp_sessions_target ON public.staff_impersonation_sessions (target_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_imp_sessions_active ON public.staff_impersonation_sessions (expires_at) WHERE ended_at IS NULL;

-- ── (3) RLS: nur service_role schreibt; Staff (is_leadesk_admin) liest zur Aufsicht; keine Kunden-Rolle ──
ALTER TABLE public.staff_impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_imp_sessions_admin_read ON public.staff_impersonation_sessions;
CREATE POLICY staff_imp_sessions_admin_read ON public.staff_impersonation_sessions
  FOR SELECT USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

-- Self-Host-GRANT-Falle (CLAUDE.md #3/#12): REVOKE ALL (nicht nur INSERT/UPDATE/DELETE) — Prod hatte breitere
-- Default-Grants (TRUNCATE/REFERENCES/TRIGGER an authenticated). Audit-Tabelle → authenticated NUR SELECT.
REVOKE ALL ON public.staff_impersonation_sessions FROM authenticated;
GRANT  SELECT ON public.staff_impersonation_sessions TO authenticated;   -- RLS-gated (nur is_leadesk_admin)
GRANT  ALL    ON public.staff_impersonation_sessions TO service_role;

COMMIT;
