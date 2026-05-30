-- Credits Phase 1 — credit_topups (Schema-only, Stripe-Wiring Phase 3)
-- ─────────────────────────────────────────────────────────────────
-- Top-Ups (Credits, Storage, CRM) — diese Tabelle hält die Käufe.
-- Verbrauchs-Logik ist in get_my_credit_budget (Sprint C) abgebildet.
--
-- type-Werte: 'credits' | 'storage_gb' | 'crm_companies' | 'crm_contacts'
-- Credit-Top-Ups: einmalig, verfallen 30 Tage nach Abo-Ende.
-- Storage/CRM-Top-Ups: sticky monatlich (is_recurring=true), kündbar.
--
-- WICHTIG: Wir wechseln auf einen NEUEN Stripe-Account. Stripe-Felder
-- (stripe_payment_intent_id, stripe_invoice_id) bleiben leer bis
-- Phase 3 (Stripe-Wiring). Bestehende stripe_subscriptions-Tabelle (falls
-- vorhanden) referenziert NOCH den ALTEN Stripe-Account — wird in
-- Phase 3 ebenfalls migriert.

BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  purchased_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  amount_remaining numeric NOT NULL CHECK (amount_remaining >= 0),
  price_eur numeric,
  currency text NOT NULL DEFAULT 'eur',
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  status text NOT NULL DEFAULT 'active',
  is_recurring boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_topups
  DROP CONSTRAINT IF EXISTS credit_topups_type_check;
ALTER TABLE public.credit_topups
  ADD CONSTRAINT credit_topups_type_check
  CHECK (type IN ('credits','storage_gb','crm_companies','crm_contacts'));

ALTER TABLE public.credit_topups
  DROP CONSTRAINT IF EXISTS credit_topups_status_check;
ALTER TABLE public.credit_topups
  ADD CONSTRAINT credit_topups_status_check
  CHECK (status IN ('active','exhausted','expired','refunded','cancelled'));

CREATE INDEX IF NOT EXISTS idx_credit_topups_account_active
  ON public.credit_topups (account_id, type)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_credit_topups_account_created
  ON public.credit_topups (account_id, created_at);

-- updated_at-Auto-Trigger
CREATE OR REPLACE FUNCTION public.credit_topups_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_topups_updated_at ON public.credit_topups;
CREATE TRIGGER trg_credit_topups_updated_at
  BEFORE UPDATE ON public.credit_topups
  FOR EACH ROW EXECUTE FUNCTION public.credit_topups_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.credit_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_topups_read_own_team ON public.credit_topups;
CREATE POLICY credit_topups_read_own_team ON public.credit_topups FOR SELECT
USING (
  account_id IN (
    SELECT t.account_id FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS credit_topups_read_admin ON public.credit_topups;
CREATE POLICY credit_topups_read_admin ON public.credit_topups FOR SELECT
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
);

DROP POLICY IF EXISTS credit_topups_write_admin ON public.credit_topups;
CREATE POLICY credit_topups_write_admin ON public.credit_topups FOR ALL
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
) WITH CHECK (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
);

-- Hetzner-Grants
GRANT SELECT                 ON public.credit_topups TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.credit_topups TO service_role; -- Stripe-Webhook in Phase 3
GRANT ALL                    ON public.credit_topups TO postgres;

REVOKE INSERT, UPDATE, DELETE ON public.credit_topups FROM authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
