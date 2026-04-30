-- ================================================================
-- Leadesk: plans-Schema-Harmonisierung
-- ================================================================
--
-- Hintergrund
-- -----------
-- Auf Hetzner-Staging hat sich `plans` weiterentwickelt zu einem
-- Schema mit price_monthly / price_yearly / max_team_members / slug /
-- max_brand_voices / max_ai_generations / max_vernetzungen_per_day.
-- AdminPlans.jsx liest+schreibt nur diese Spalten (Top-Fallstrick #8).
--
-- Hetzner-Prod und Cloud-Prod haben aktuell das alte Schema mit
-- price_eur / seats / daily_limit / sort_order / stripe_price_id.
-- Diese Migration zieht Hetzner-Prod auf den Hetzner-Staging-Stand,
-- damit die nachfolgende plans_modules-Migration und AdminPlans.jsx
-- arbeiten können.
--
-- Idempotent: läuft auf Hetzner-Staging als no-op (Spalten existieren
-- schon), auf Hetzner-Prod ergänzt sie die fehlenden Spalten.
--
-- Apply-Reihenfolge: NACH allen accounts/audit/admin-list-Migrations,
-- VOR 20260502100000_plans_modules.sql.
--
-- Side-Effect: keine. Bestehende Daten bleiben unangetastet, alte
-- Spalten (price_eur, seats, daily_limit) werden NICHT entfernt.
-- ================================================================

BEGIN;

-- Hetzner-Style-Spalten ergänzen
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_monthly numeric DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_yearly numeric DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_team_members integer DEFAULT 1;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_brand_voices integer DEFAULT 1;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_ai_generations integer DEFAULT 100;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_vernetzungen_per_day integer DEFAULT 50;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '{}'::jsonb;

-- Alte Pflichtspalten weichgespült, damit AdminPlans.jsx-Inserts
-- nicht an NOT-NULL-Violations krachen, wenn die alten Felder
-- nicht mehr aktiv geschrieben werden.
ALTER TABLE public.plans ALTER COLUMN daily_limit DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='plans'
      AND column_name='price_eur' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.plans ALTER COLUMN price_eur DROP NOT NULL;
  END IF;
END $$;

-- slug eindeutig (nullable, aber wenn gesetzt dann unique)
CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_unique
  ON public.plans (slug)
  WHERE slug IS NOT NULL;

COMMIT;
