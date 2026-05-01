-- Accounts/Teams-Refactor Phase 1: Additives Schema-Setup.
-- Legt accounts-Tabelle, FKs und RLS an, ohne bestehende Daten anzufassen.
-- Phase 2 (Daten-Migration) folgt in 20260428201000.
-- Phase 3 (Frontend-Cutover) und Phase 4 (Cleanup) folgen separat.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. accounts-Tabelle
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifikation
  name text NOT NULL,
  billing_email text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Plan & Lizenzierung
  plan_id uuid REFERENCES public.plans(id),
  seat_limit integer NOT NULL DEFAULT 1,
  plan_managed_by text NOT NULL DEFAULT 'leadesk'
    CHECK (plan_managed_by IN ('stripe','leadesk')),

  -- Stripe-Integration
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  trial_ends_at timestamptz,

  -- Lifecycle
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','suspended','canceled')),

  -- Settings & Notes
  settings jsonb DEFAULT '{}'::jsonb,
  notes_internal text,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_owner_user_id ON public.accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON public.accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer_id ON public.accounts(stripe_customer_id);

-- ─────────────────────────────────────────────────────────────
-- 2. teams.account_id als nullable FK (Phase 4 → NOT NULL)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_teams_account_id ON public.teams(account_id);

-- ─────────────────────────────────────────────────────────────
-- 3. user_preferences (für active_team_id-Switching bei N:N)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- 4. RLS auf accounts
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Account-Owner sieht seinen eigenen Account
DROP POLICY IF EXISTS "accounts_owner_select" ON public.accounts;
CREATE POLICY "accounts_owner_select" ON public.accounts FOR SELECT
USING (owner_user_id = auth.uid());

-- Account-Owner kann self-service-Felder ändern (notes_internal NICHT, siehe Trigger §6)
DROP POLICY IF EXISTS "accounts_owner_update" ON public.accounts;
CREATE POLICY "accounts_owner_update" ON public.accounts FOR UPDATE
USING (owner_user_id = auth.uid());

-- Leadesk-Admin: voller Zugriff via JWT-Claim
DROP POLICY IF EXISTS "accounts_admin_all" ON public.accounts;
CREATE POLICY "accounts_admin_all" ON public.accounts FOR ALL
USING (
  coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean,
    false
  ) = true
);

-- INSERT explizit nicht für authenticated — nur via service_role oder Admin

-- ─────────────────────────────────────────────────────────────
-- 5. RLS auf user_preferences
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_prefs_own" ON public.user_preferences;
CREATE POLICY "user_prefs_own" ON public.user_preferences FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 6. Plan-Authority-Trigger
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_plan_change_authority()
RETURNS trigger AS $$
BEGIN
  -- Nur prüfen wenn plan_id oder seat_limit sich ändern
  IF (OLD.plan_id IS DISTINCT FROM NEW.plan_id
      OR OLD.seat_limit IS DISTINCT FROM NEW.seat_limit) THEN
    -- Erlaubt: service_role (Stripe-Webhook) oder leadesk_admin (JWT-Claim)
    IF current_user IN ('service_role', 'postgres') THEN
      RETURN NEW;
    END IF;
    IF coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Plan/Seat-Änderung erfordert service_role oder is_leadesk_admin';
  END IF;

  -- notes_internal Schutz: nur Leadesk-Admin
  IF OLD.notes_internal IS DISTINCT FROM NEW.notes_internal THEN
    IF current_user IN ('service_role', 'postgres') THEN
      RETURN NEW;
    END IF;
    IF coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Änderung von notes_internal erfordert is_leadesk_admin';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_plan_change_authority_trigger ON public.accounts;
CREATE TRIGGER enforce_plan_change_authority_trigger
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_change_authority();

-- ─────────────────────────────────────────────────────────────
-- 7. Grants für authenticated (Hetzner-Fallstrick)
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, UPDATE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. updated_at-Trigger für accounts
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_accounts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_updated_at ON public.accounts;
CREATE TRIGGER accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.update_accounts_updated_at();

COMMIT;
