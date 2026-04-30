-- ================================================================
-- Leadesk: teams + tenants Phase-2-Compat
-- ================================================================
--
-- Hintergrund
-- -----------
-- accounts_phase2_data_migration.sql liest aus teams (und vermutlich
-- tenants) Spalten, die auf Hetzner-Staging existieren, auf Hetzner-Prod
-- aber nie angelegt wurden:
--   - teams.plan_id       (uuid, FK auf plans)   ← Prod hat nur teams.plan (text)
--   - teams.is_active     (boolean)
--   - teams.settings      (jsonb)
--   - tenants.plan_id     (uuid, FK auf plans)   ← Prod hat nur tenants.plan (text)
--
-- Gleiche Story wie bei plans.id text→uuid: Out-of-band-Schema-Änderung
-- auf Staging, die nie ins Repo kam. Diese Compat-Migration zieht den
-- Schema-Stand nach.
--
-- Idempotent via ADD COLUMN IF NOT EXISTS — auf Staging no-op, auf
-- Prod ergänzt sie die fehlenden Spalten.
--
-- Apply-Reihenfolge: NACH 20260428200000_accounts_phase1_additive.sql
-- (braucht plans.id als uuid und accounts-Tabelle), VOR
-- 20260428201000_accounts_phase2_data_migration.sql.
--
-- Frontend-Kompatibilität: Bestehende Spalten teams.plan (text) und
-- tenants.plan (text) bleiben unangetastet. Frontend liest weiter aus
-- diesen text-Spalten. Die neuen plan_id-FK-Spalten sind initial NULL
-- und werden erst durch Phase-4-Cleanup bzw. Plan-Modules-Roll-out aktiv.
-- ================================================================

BEGIN;

-- teams: fehlende Spalten ergänzen
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS plan_id   uuid;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS settings  jsonb   DEFAULT '{}'::jsonb;

-- teams.plan_id FK auf plans(id) — IF NOT EXISTS via DO-Block,
-- weil ADD CONSTRAINT keine eigene Idempotenz hat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='teams'
      AND constraint_name='teams_plan_id_fkey'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;
  END IF;
END $$;

-- tenants: fehlende Spalten ergänzen
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_id uuid;

-- tenants.plan_id FK auf plans(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='tenants'
      AND constraint_name='tenants_plan_id_fkey'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
