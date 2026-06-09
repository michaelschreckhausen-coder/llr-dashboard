-- Stripe Phase 3 — credit_topup_offers Lookup-Tabelle
-- ─────────────────────────────────────────────────────────────────
-- Definiert die kaufbaren Top-Up-Pakete für /marketplace.
-- Type-Mapping matched credit_topups.type:
--   'credits'        — one-shot Stripe-Payment (mode='payment')
--   'storage_gb'     — recurring Stripe-Subscription (sticky monthly)
--   'crm_companies'  — recurring (sticky monthly)
--   'crm_contacts'   — recurring (sticky monthly)
--
-- Stripe-IDs (stripe_product_id, stripe_price_id) sind NULL bis Michael die
-- Products im neuen Stripe-Account anlegt + per UPDATE setzt.
--
-- RLS: read-all für authenticated, write nur Leadesk-Admin.
-- Frontend liest direct via supabase.from('credit_topup_offers').select() —
-- keine RPC nötig.

BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_topup_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('credits','storage_gb','crm_companies','crm_contacts')),
  amount numeric NOT NULL CHECK (amount > 0),
  price_eur numeric NOT NULL CHECK (price_eur >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  stripe_product_id text,
  stripe_price_id text,
  is_recurring boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  label text NOT NULL,
  short_description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_topup_offers_type_active
  ON public.credit_topup_offers (type, is_active);

-- updated_at-Auto-Trigger
CREATE OR REPLACE FUNCTION public.credit_topup_offers_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_credit_topup_offers_updated_at ON public.credit_topup_offers;
CREATE TRIGGER trg_credit_topup_offers_updated_at
  BEFORE UPDATE ON public.credit_topup_offers
  FOR EACH ROW EXECUTE FUNCTION public.credit_topup_offers_set_updated_at();

-- RLS
ALTER TABLE public.credit_topup_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_topup_offers_read_all ON public.credit_topup_offers;
CREATE POLICY credit_topup_offers_read_all ON public.credit_topup_offers FOR SELECT USING (true);

DROP POLICY IF EXISTS credit_topup_offers_write_admin ON public.credit_topup_offers;
CREATE POLICY credit_topup_offers_write_admin ON public.credit_topup_offers FOR ALL
USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true)
WITH CHECK (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true);

GRANT SELECT ON public.credit_topup_offers TO authenticated;
GRANT SELECT ON public.credit_topup_offers TO service_role;
GRANT ALL    ON public.credit_topup_offers TO postgres;

-- Seed: Credits-Top-Ups (one-shot, mode='payment')
INSERT INTO public.credit_topup_offers (slug, type, amount, price_eur, is_recurring, label, short_description, sort_order) VALUES
  ('credits-1k',  'credits', 1000,  9,   false, '+1.000 Credits',  'Etwa 30 LinkedIn-Posts oder 90 KI-Bilder', 10),
  ('credits-5k',  'credits', 5000,  39,  false, '+5.000 Credits',  'Etwa 150 LinkedIn-Posts oder 450 KI-Bilder', 20),
  ('credits-20k', 'credits', 20000, 149, false, '+20.000 Credits', 'Großes Kampagnen-Paket — 7,45 € / 1.000 Credits', 30),
  ('credits-50k', 'credits', 50000, 329, false, '+50.000 Credits', 'Bestes Volumen-Preis — 6,58 € / 1.000 Credits', 40)
ON CONFLICT (slug) DO NOTHING;

-- Seed: Storage-Top-Ups (recurring, mode='subscription')
INSERT INTO public.credit_topup_offers (slug, type, amount, price_eur, is_recurring, label, short_description, sort_order) VALUES
  ('storage-10gb',  'storage_gb', 10,  5,  true, '+10 GB Speicher',  'Monatlich · ca. 2.000 KI-Bilder zusätzlich', 110),
  ('storage-50gb',  'storage_gb', 50,  19, true, '+50 GB Speicher',  'Monatlich · für intensive Content-Produktion', 120),
  ('storage-200gb', 'storage_gb', 200, 59, true, '+200 GB Speicher', 'Monatlich · für Power-User mit Video-Material', 130)
ON CONFLICT (slug) DO NOTHING;

-- Seed: CRM-Limits-Top-Ups (recurring)
INSERT INTO public.credit_topup_offers (slug, type, amount, price_eur, is_recurring, label, short_description, sort_order) VALUES
  ('crm-companies-100', 'crm_companies', 100, 5,  true, '+100 Unternehmen', 'Monatlich · für Sales-Lizenzen, die mehr Accounts brauchen', 210),
  ('crm-contacts-500',  'crm_contacts',  500, 10, true, '+500 Kontakte',    'Monatlich · für Sales-Lizenzen, die mehr Kontakte brauchen', 220)
ON CONFLICT (slug) DO NOTHING;

-- Verifikation
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.credit_topup_offers;
  IF v_count != 9 THEN
    RAISE EXCEPTION 'Migration FAILED: expected 9 topup offers, got %', v_count;
  END IF;
  RAISE NOTICE 'Migration OK: 9 credit_topup_offers seeded (4 credits + 3 storage + 2 crm)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
