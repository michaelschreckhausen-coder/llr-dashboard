-- 20260629190000_addons_trial_period_days.sql
-- Free→Paid-Cutover: config-driven Trial pro Addon.
-- create-addon-checkout-session liest addons.trial_period_days und setzt
-- subscription_data.trial_period_days NUR wenn gesetzt (NULL = kein Trial).
-- Additiv + idempotent → safe auf beiden Envs VOR dem Price-Flip (NULL = no-op).
-- MUSS auf Prod existieren bevor die neue EF dort deployed wird (sonst bricht
-- der select auf der Spalte für bestehende Paid-Checkouts wie auralis).

BEGIN;

ALTER TABLE public.addons ADD COLUMN IF NOT EXISTS trial_period_days integer;
COMMENT ON COLUMN public.addons.trial_period_days IS
  'Stripe-Checkout trial_period_days für Pattern-C-Addons (NULL = kein Trial). Gelesen von create-addon-checkout-session.';

COMMIT;

NOTIFY pgrst, 'reload schema';
