-- 20260629250000_affiliate_stripe_connect.sql
-- Affiliate-System Phase 5 — Stripe-Connect-Express-Onboarding.
-- affiliates hat bereits stripe_connect_account_id / _charges_enabled / _payouts_enabled
-- (Phase 1). Hier nur Onboarding-Timestamps + handle_stripe_account_updated-RPC
-- (vom account.updated-Webhook gerufen). Die EF stripe-connect-create-account-link
-- setzt onboarding_started_at + stripe_connect_account_id selbst via service-role.

BEGIN;

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS onboarding_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Vom stripe-subscription-webhook (account.updated) via service-role gerufen.
-- Setzt charges/payouts + markiert onboarding_completed_at beim ERSTEN payouts_enabled=true.
CREATE OR REPLACE FUNCTION public.handle_stripe_account_updated(
  p_account_id text, p_charges_enabled boolean, p_payouts_enabled boolean
) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'Not authorized: handle_stripe_account_updated is service-role-only';
  END IF;

  UPDATE public.affiliates
  SET stripe_connect_charges_enabled = p_charges_enabled,
      stripe_connect_payouts_enabled = p_payouts_enabled,
      onboarding_completed_at = CASE
        WHEN p_payouts_enabled AND onboarding_completed_at IS NULL THEN now()
        ELSE onboarding_completed_at END
  WHERE stripe_connect_account_id = p_account_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_stripe_account_updated(text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.handle_stripe_account_updated(text, boolean, boolean) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
