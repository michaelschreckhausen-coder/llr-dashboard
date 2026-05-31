-- Stripe Phase 3 — plans.stripe_price_id_yearly Column
-- ─────────────────────────────────────────────────────────────────
-- Aktuelle plans.stripe_price_id hält nur den monthly-Price.
-- Setup-Script (setup-stripe-products.sh) hat aber pro Plan 2 Prices
-- angelegt (monthly + yearly, außer Customized = nur monthly).
-- Diese Migration ergänzt eine zweite Spalte für yearly.
--
-- Folge-Step nach Apply: UPDATE plans SET stripe_price_id_yearly = '...'
-- für jeden der 6 yearly-fähigen Plans (Sales/Marketing/All-In/Sales-Team/
-- Marketing-Team/KMU). IDs liegen in stripe-setup-out-*.json.
--
-- Idempotent: IF NOT EXISTS.

BEGIN;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_yearly text;

CREATE INDEX IF NOT EXISTS idx_plans_stripe_price_id_yearly
  ON public.plans (stripe_price_id_yearly)
  WHERE stripe_price_id_yearly IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
