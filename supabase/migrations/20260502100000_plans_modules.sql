-- Module-basierte Plan-Freischaltung — Phase 1: Schema-Erweiterung
-- ─────────────────────────────────────────────────────────────────────────────
-- Erweitert public.plans um eine modules[]-Spalte und Trial-Metadaten,
-- damit im Admin-UI Pläne definiert werden können, die nur bestimmte
-- App-Bereiche freischalten (Branding, CRM, LinkedIn, Content, Delivery,
-- Reports).
--
-- Architektur-Annahme: Plan hängt am Account (accounts.plan_id).
-- Modul-Sichtbarkeit eines Users folgt aus dem Plan seines Accounts.
--
-- IDEMPOTENT: kann mehrfach ausgeführt werden.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Spalten ergänzen
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS trial_days integer;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_default_trial boolean NOT NULL DEFAULT false;

-- Constraint: trial_days nur sinnvoll wenn is_trial = true
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_trial_days_only_if_trial;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_trial_days_only_if_trial
  CHECK (
    (is_trial = true AND trial_days IS NOT NULL AND trial_days > 0)
    OR (is_trial = false)
  );

-- Constraint: modules-Werte aus dem festen Modul-Set
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_modules_valid_keys;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_modules_valid_keys
  CHECK (
    modules <@ ARRAY['branding','crm','linkedin','content','delivery','reports']::text[]
  );

-- Unique-Index: maximal ein Default-Trial-Plan
DROP INDEX IF EXISTS plans_only_one_default_trial;
CREATE UNIQUE INDEX plans_only_one_default_trial
  ON public.plans ((true))
  WHERE is_default_trial = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Komfort-Indizes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_plans_modules_gin ON public.plans USING gin (modules);
CREATE INDEX IF NOT EXISTS idx_plans_active     ON public.plans (is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: Pläne sind LESBAR für jeden authenticated User
--    (Admin-UI, Upgrade-Page, Pricing-Anzeige). Schreiben nur via JWT-Admin.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_read_all ON public.plans;
CREATE POLICY plans_read_all ON public.plans FOR SELECT
USING (true);

DROP POLICY IF EXISTS plans_write_admin ON public.plans;
CREATE POLICY plans_write_admin ON public.plans FOR ALL
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
)
WITH CHECK (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
);

-- Hetzner-Self-Host-Grant-Fallstrick
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL    ON public.plans TO service_role;

COMMIT;
